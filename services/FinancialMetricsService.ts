import { supabase } from './supabase';
import { FinancialKPIs } from '../types';

export const financialMetricsService = {
  getCashDirection(cm: any) {
    const mov = cm.event_type || cm.movement_type;
    if (!mov) return 'NEUTRAL';
    if (['SALE_IN', 'CREDIT_IN', 'INITIAL_CASH', 'TRANSFER_IN', 'IN', 'SALE'].includes(mov)) return 'IN';
    if (['REFUND_OUT', 'EXPENSE_OUT', 'CASH_OUT', 'OUT', 'EXPENSE', 'REFUND', 'COGS'].includes(mov)) return 'OUT';
    return 'NEUTRAL';
  },

  /**
   * Generates the core financial KPIs for a given date range.
   */
  async getMetrics(startDate?: string, endDate?: string): Promise<FinancialKPIs> {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    // Convert to timestamptz for the RPC if provided
    let p_start_date = startDate;
    let p_end_date = endDate;
    if (startDate && startDate.length <= 10) p_start_date = `${startDate}T00:00:00.000Z`;
    if (endDate && endDate.length <= 10) p_end_date = `${endDate}T23:59:59.999Z`;

    // Try new RPC V31
    const { data: v31Data, error: v31Error } = await supabase.rpc('get_financial_dashboard_v31', {
      p_start_date: p_start_date || new Date(2000, 0, 1).toISOString(),
      p_end_date: p_end_date || new Date(2100, 0, 1).toISOString()
    });

    if (!v31Error && v31Data) {
      // Consume V31 logic
      const kpis = v31Data.kpis;
      return {
        // Legacy compat fields
        current_income: kpis.ventasNetas,
        current_expenses: kpis.gastosOperativos,
        current_purchases: kpis.comprasInventario,
        net_profit: kpis.utilidadNeta || kpis.utilidadOperativa,
        prev_income: 0,
        prev_expenses: 0,
        prev_purchases: 0,
        growth_income: 0,

        // V31 precise fields
        ventasNetas: kpis.ventasNetas,
        costoVenta: kpis.costoVenta,
        margenBruto: kpis.utilidadBruta,
        margenBrutoPorcentaje: kpis.ventasNetas > 0 ? (kpis.utilidadBruta / kpis.ventasNetas) * 100 : 0,
        gastosOperativos: kpis.gastosOperativos,
        utilidadOperativa: kpis.utilidadOperativa,
        utilidadNeta: kpis.utilidadOperativa,
        flujoEfectivo: kpis.flujoEfectivo,
        puntoEquilibrio: (kpis.ventasNetas > 0 && (kpis.utilidadBruta / kpis.ventasNetas) > 0) ? (kpis.gastosOperativos / (kpis.utilidadBruta / kpis.ventasNetas)) : 0,
        capitalTrabajo: kpis.flujoEfectivo + kpis.cuentasPorCobrar + kpis.valorCambiazo,
        rotacionInventario: 0,
        ticketPromedio: 0, // This needs event count, let's just keep 0 or compute it if needed
        cuentasPorCobrar: kpis.cuentasPorCobrar,
        cuentasPorPagar: 0, // Pending feature
        endeudamiento: 0,
        roi: 0,
        rentabilidadTaller: 0,
        // Extras
        valorCambiazo: kpis.valorCambiazo,
        egresosTotales: kpis.egresosTotales
      } as any;
    }

    // Fallback if RPC doesn't exist yet
    console.warn("V31 RPC not found or error, falling back to FE logic:", v31Error);
    return this.fallbackGetMetrics(startDate, endDate);
  },

  async fallbackGetMetrics(startDate?: string, endDate?: string): Promise<FinancialKPIs> {
    const rawData = await this.fetchRawFinancialData(startDate, endDate);
    
    // Core KPIs to calculate
    let ventasNetas = 0;
    let costoVenta = 0;
    let gastosOperativos = 0;
    let flujoEfectivo = 0;
    let deduccionesVenta = 0;
    
    // 1. Process Sales from v_sales_unified
    if (rawData.unifiedSales) {
        rawData.unifiedSales.forEach((s: any) => {
            const amount = Number(s.gross_amount) || 0;
            const cost = Number(s.cost_amount) || 0;
            const cashEffect = Number(s.cash_effect_amount) || 0;
            
            // Add real cash to flujoEfectivo
            flujoEfectivo += cashEffect;

            if (s.is_refund) {
                deduccionesVenta += Math.abs(amount);
                ventasNetas -= Math.abs(amount);
            } else {
                ventasNetas += amount;
                costoVenta += cost;
            }
        });
    }

    // 2. Process cash_movements for Real Cash Flow is DEPRECATED
    // We now have all the real cash movements from sales inside unifiedSales 

    // 3. Process accounting transactions for Expenses and extra Income (exclude those already in sales)
    rawData.transactions.forEach((t: any) => {
      const amount = Number(t.amount) || 0;

      // Every transaction affects real cash
      flujoEfectivo += amount;

      if (amount < 0) {
        // Gasto / Compra / Egreso
        // Only ignore it if it's explicitly linked to an order
        const isAlreadyInUnified = t.order_id != null;
        if (!isAlreadyInUnified) {
            gastosOperativos += Math.abs(amount);
        }
      } else {
        // Ingreso extra (no POS, no Taller)
        const desc = t.description?.toLowerCase() || '';
        const isAlreadyInUnified = 
          t.order_id != null || 
          t.source === 'STORE' || // Legacy POS sales were positive STORE source
          desc.includes('pago orden') || 
          desc.includes('venta producto') || 
          desc.includes('abono a crédito');

        if (!isAlreadyInUnified) {
          ventasNetas += amount;
        }
      }
    });

    // 3. Margin calculations
    const margenBruto = ventasNetas - costoVenta;
    const margenBrutoPorcentaje = ventasNetas > 0 ? (margenBruto / ventasNetas) * 100 : 0;
    const utilidadOperativa = margenBruto - gastosOperativos;
    const utilidadNeta = utilidadOperativa; // Pending taxes/interests if any

    // Punto de equilibrio = Gastos / Margen Bruto %
    let puntoEquilibrio = 0;
    if (margenBrutoPorcentaje > 0) {
      puntoEquilibrio = gastosOperativos / (margenBrutoPorcentaje / 100);
    }

    // Capital de trabajo: Caja + CxC + Inventario - CxP
    // Caja = total de efectivo, here we just use flujoEfectivo as proxy or 0 for now.
    // CxC: Fetch from client_credits
    let cuentasPorCobrar = 0;
    rawData.credits.forEach((c: any) => {
      if (c.status !== 'PAID') {
        cuentasPorCobrar += c.amount;
      }
    });

    // Inventario valorizado
    let valorInventario = 0;
    rawData.inventory.forEach((i: any) => {
      valorInventario += (i.cost || 0) * (i.stock || 0);
    });

    // Ticket promedio
    // Using count of unique entries in unifiedSales
    const countVentas = rawData.unifiedSales?.length || 0;
    const ticketPromedio = countVentas > 0 ? ventasNetas / countVentas : 0;

    const capitalTrabajo = flujoEfectivo + cuentasPorCobrar + valorInventario; // We don't have CxP right now
    
    // Rentabilidad de taller
    let rentabilidadTaller = 0; 
    
    return {
      current_income: ventasNetas, // Map for backwards compat
      current_expenses: gastosOperativos,
      current_purchases: 0,
      net_profit: utilidadNeta,
      prev_income: 0,
      prev_expenses: 0,
      prev_purchases: 0,
      growth_income: 0,

      ventasNetas,
      costoVenta,
      margenBruto,
      margenBrutoPorcentaje,
      gastosOperativos,
      utilidadOperativa,
      utilidadNeta,
      flujoEfectivo,
      puntoEquilibrio,
      capitalTrabajo,
      rotacionInventario: 0, // Need average inventory formula
      ticketPromedio,
      cuentasPorCobrar,
      cuentasPorPagar: 0,
      endeudamiento: 0,
      roi: 0,
      rentabilidadTaller
    };
  },

  async fetchRawFinancialData(startDate?: string, endDate?: string) {
    if (!supabase) throw new Error('Supabase client not initialized');

    let cashQuery = supabase.from('cash_movements').select('*').order('created_at', { ascending: false });
    let accQuery = supabase.from('accounting_transactions').select('*, accounting_categories(name)').eq('status', 'COMPLETED').order('transaction_date', { ascending: false });
    let salesQuery = supabase.from('v_sales_unified').select('*').order('created_at', { ascending: false });

    if (startDate) {
        cashQuery = cashQuery.gte('created_at', startDate);
        accQuery = accQuery.gte('transaction_date', startDate.split('T')[0]);
        salesQuery = salesQuery.gte('created_at', startDate);
    }
    
    if (endDate) {
        cashQuery = cashQuery.lte('created_at', endDate);
        accQuery = accQuery.lte('transaction_date', endDate.split('T')[0]);
        salesQuery = salesQuery.lte('created_at', endDate);
    }

    // 1. Fetch cash movements with pagination
    let cashMovements: any[] = [];
    let hasMoreCash = true;
    let pageCash = 0;
    while (hasMoreCash) {
        const { data: pageData, error: pageError } = await cashQuery.range(pageCash * 1000, (pageCash + 1) * 1000 - 1);
        if (pageError) {
             console.warn("Error fetching cash_movements page:", pageError);
             break;
        }
        if (pageData && pageData.length > 0) {
            cashMovements = [...cashMovements, ...pageData];
            if (pageData.length < 1000) hasMoreCash = false;
            else pageCash++;
        } else {
            hasMoreCash = false;
        }
    }
    
    // 2. Fetch accounting transactions with pagination
    let transactions: any[] = [];
    let hasMore = true;
    let page = 0;
    while (hasMore) {
        const { data: pageData, error: pageError } = await accQuery.range(page * 1000, (page + 1) * 1000 - 1);
        if (pageError) {
             console.warn("Error fetching accounting_transactions page:", pageError);
             break;
        }
        if (pageData && pageData.length > 0) {
            transactions = [...transactions, ...pageData];
            if (pageData.length < 1000) {
                hasMore = false; // Last page
            } else {
                page++;
            }
        } else {
            hasMore = false;
        }
    }
    
    // 3. Fetch Credits (CxC)
    const { data: credits } = await supabase.from('client_credits').select('*').limit(5000);

    // 4. Fetch Inventory
    const { data: rawInventory } = await supabase
      .from('inventory_parts')
      .select('id, stock, price, cost, status, deleted_at')
      .limit(10000);
    const inventory = (rawInventory || []).filter(i => !i.deleted_at && i.status !== 'archived');

    // 5. Fetch Unified Sales View with pagination
    let unifiedSales: any[] = [];
    hasMore = true;
    page = 0;
    while (hasMore) {
        const { data: pageData, error: salesError } = await salesQuery.range(page * 1000, (page + 1) * 1000 - 1);
        if (salesError) {
             console.warn("Error fetching v_sales_unified page:", salesError);
             break;
        }
        if (pageData && pageData.length > 0) {
            unifiedSales = [...unifiedSales, ...pageData];
            if (pageData.length < 1000) {
                hasMore = false;
            } else {
                page++;
            }
        } else {
            hasMore = false;
        }
    }

    // Filter by date if needed (Keep existing JS filtering as fallback/precision)
    let filteredCashMovements = cashMovements || [];
    let filteredTransactions = transactions || [];
    
    if (startDate) {
      const [sy, sm, sd] = startDate.split('T')[0].split('-');
      const startLocal = new Date(Number(sy), Number(sm) - 1, Number(sd), 0, 0, 0);
      
      filteredCashMovements = filteredCashMovements.filter((p: any) => {
        const val = p.created_at || p.date;
        const d = typeof val === 'string' && val.includes('T') ? new Date(val) : new Date(Number(val));
        return d >= startLocal;
      });
      filteredTransactions = filteredTransactions.filter((t: any) => {
        const [ty, tm, td] = t.transaction_date.split('T')[0].split('-');
        return new Date(Number(ty), Number(tm) - 1, Number(td), 0, 0, 0) >= startLocal;
      });
    }
    if (endDate) {
      const [ey, em, ed] = endDate.split('T')[0].split('-');
      const endLocal = new Date(Number(ey), Number(em) - 1, Number(ed), 23, 59, 59, 999);
      
      filteredCashMovements = filteredCashMovements.filter((p: any) => {
        const val = p.created_at || p.date;
        const d = typeof val === 'string' && val.includes('T') ? new Date(val) : new Date(Number(val));
        return d <= endLocal;
      });
      filteredTransactions = filteredTransactions.filter((t: any) => {
        const [ty, tm, td] = t.transaction_date.split('T')[0].split('-');
        return new Date(Number(ty), Number(tm) - 1, Number(td), 23, 59, 59, 999) <= endLocal;
      });
    }

    return {
      cashMovements: filteredCashMovements,
      transactions: filteredTransactions,
      credits: credits || [],
      inventory: inventory || [],
      unifiedSales: unifiedSales || []
    };
  },

  async getRawV31Data(startDate?: string, endDate?: string) {
    if (!supabase) return null;
    let p_start_date = startDate;
    let p_end_date = endDate;
    if (startDate && startDate.length <= 10) p_start_date = `${startDate}T00:00:00.000Z`;
    if (endDate && endDate.length <= 10) p_end_date = `${endDate}T23:59:59.999Z`;

    const { data: v31Data, error } = await supabase.rpc('get_financial_dashboard_v31', {
      p_start_date: p_start_date || new Date(2000, 0, 1).toISOString(),
      p_end_date: p_end_date || new Date(2100, 0, 1).toISOString()
    });
    
    if (!error && v31Data) return v31Data;
    return null;
  },

  async getCashflow(startDate?: string, endDate?: string): Promise<any[]> {
    const now = new Date();
    const sixMonthsAgoDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const sixMonthsAgoStr = `${sixMonthsAgoDate.getFullYear()}-${String(sixMonthsAgoDate.getMonth() + 1).padStart(2, '0')}-01`;
    
    let effectiveStartDate = startDate;
    if (!effectiveStartDate || new Date(effectiveStartDate) > sixMonthsAgoDate) {
        effectiveStartDate = sixMonthsAgoStr;
    }

    // Try V31
    const v31Data = await this.getRawV31Data(effectiveStartDate, endDate);
    const monthlyData: { [key: string]: { income: number, expenses: number, purchases: number } } = {};

    if (v31Data && v31Data.events) {
      v31Data.events.forEach((val: any) => {
        if (!val.event_date) return;
        let d = new Date(val.event_date);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { income: 0, expenses: 0, purchases: 0 };
        }

        // Cash flow is only is_cash
        if (val.is_cash && val.source_table === 'cash_movements') {
           const type = val.event_type;
           if (type.includes('_IN') || type === 'INITIAL_CASH') {
              monthlyData[monthKey].income += Number(val.amount) || 0;
           } else if (type.includes('_OUT')) {
              monthlyData[monthKey].expenses += Math.abs(Number(val.amount) || 0);
           }
        }
      });
    } else {
       // Fallback logic
       const rawData = await this.fetchRawFinancialData(effectiveStartDate, endDate);
       rawData.unifiedSales.forEach((s: any) => {
         let d = new Date();
         const val = s.created_at || s.createdAt;
         if (val) {
             d = typeof val === 'string' && val.includes('T') ? new Date(val) : new Date(Number(val));
         }

         const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
         if (!monthlyData[monthKey]) {
           monthlyData[monthKey] = { income: 0, expenses: 0, purchases: 0 };
         }
         
         const cashEffect = Number(s.cash_effect_amount) || 0;
         if (cashEffect > 0) {
             monthlyData[monthKey].income += cashEffect;
         } else if (cashEffect < 0) {
             monthlyData[monthKey].expenses += Math.abs(cashEffect);
         }
       });

       rawData.transactions.forEach((t: any) => {
         const dateParts = t.transaction_date.split('-');
         if (!dateParts || dateParts.length < 2) return;
         const monthKey = `${dateParts[0]}-${dateParts[1]}`;
         
         if (!monthlyData[monthKey]) {
           monthlyData[monthKey] = { income: 0, expenses: 0, purchases: 0 };
         }

         const amount = Number(t.amount) || 0;
         const categoryName = t.accounting_categories?.name?.toLowerCase();
         const isPurchase = categoryName === 'compras' || categoryName === 'inventario' || categoryName === 'compra de inventario tienda';

         // All transactions represent real cash movement
         if (amount > 0) {
           monthlyData[monthKey].income += amount;
         } else if (isPurchase) {
           monthlyData[monthKey].purchases += Math.abs(amount);
         } else {
           monthlyData[monthKey].expenses += Math.abs(amount);
         }
       });
    }

    const result: any[] = [];
    
    // Always return the last 6 months for the chart
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthName = d.toLocaleString('es-ES', { month: 'short' }).toUpperCase();
      
      result.push({
        month: monthName,
        income: monthlyData[monthKey]?.income || 0,
        expenses: monthlyData[monthKey]?.expenses || 0,
        purchases: monthlyData[monthKey]?.purchases || 0,
      });
    }

    return result;
  },

  async getExpenseDistribution(startDate?: string, endDate?: string): Promise<any[]> {
    const v31Data = await this.getRawV31Data(startDate, endDate);
    if (v31Data && v31Data.expenses_distribution) {
      return v31Data.expenses_distribution;
    }

    // Fallback logic
    const rawData = await this.fetchRawFinancialData(startDate, endDate);
    const distribution: { [key: string]: number } = {};

    rawData.transactions.forEach((t: any) => {
      const amount = Number(t.amount);
      if (amount < 0) {
        const isPosDuplicate = 
          t.order_id != null || 
          (t.description?.toLowerCase() || '').includes('pago orden') || 
          (t.description?.toLowerCase() || '').includes('venta producto') || 
          (t.description?.toLowerCase() || '').includes('abono a crédito');
        
        if (!isPosDuplicate) {
          const categoryName = t.accounting_categories?.name || 'Varios';
          const catLower = categoryName.toLowerCase();
          if (catLower !== 'compras' && catLower !== 'inventario' && catLower !== 'compra de inventario tienda') {
            distribution[categoryName] = (distribution[categoryName] || 0) + Math.abs(amount);
          }
        }
      }
    });
    
    // Refunds also count towards expenses for this distribution? No, usually kept separate or under 'Devoluciones'
    let refunds = 0;
    rawData.unifiedSales.forEach((s: any) => {
        if (s.is_refund) {
            refunds += Math.abs(Number(s.gross_amount) || 0);
        }
    });

    if (refunds > 0) {
        distribution['Devoluciones'] = (distribution['Devoluciones'] || 0) + refunds;
    }

    return Object.entries(distribution)
      .map(([category_name, total_amount]) => ({ category_name, total_amount }))
      .sort((a, b) => b.total_amount - a.total_amount);
  }
};
