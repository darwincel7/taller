import { supabase } from './supabase';
import { FinancialKPIs } from '../types';

export const financialMetricsService = {
  /**
   * Generates the core financial KPIs for a given date range.
   * If no range is given, defaults to current month vs previous month.
   */
  async getMetrics(startDate?: string, endDate?: string): Promise<FinancialKPIs> {
    const rawData = await this.fetchRawFinancialData(startDate, endDate);
    
    // Core KPIs to calculate
    let ventasNetas = 0;
    let costoVenta = 0;
    let gastosOperativos = 0;
    let flujoEfectivo = 0;
    let deduccionesVenta = 0;
    
    // 1. Process Sales from v_sales_unified
    // This is the new source of truth for metrics
    if (rawData.unifiedSales) {
        rawData.unifiedSales.forEach((s: any) => {
            const amount = Number(s.gross_amount);
            const cost = Number(s.cost_amount);
            
            if (s.source_type === 'WORKSHOP_REFUND') {
                deduccionesVenta += Math.abs(amount);
                ventasNetas -= Math.abs(amount);
                // Refunds subtract from flow too (assuming they are cash/card, not credit)
                flujoEfectivo -= Math.abs(amount);
            } else {
                ventasNetas += amount;
                costoVenta += cost;
                // Currently v_sales_unified doesn't specify payment method
                // We assume sales contribute to flow unless we join with payments
                // For simplicity in Dashboard vs Cashflow, we'll refine this if needed
                flujoEfectivo += amount;
            }
        });
    }

    // 2. Process accounting transactions for Expenses and extra Income (exclude those already in sales)
    rawData.transactions.forEach((t: any) => {
      const amount = Number(t.amount);

      if (amount < 0) {
        // Gasto / Compra / Egreso
        gastosOperativos += Math.abs(amount);
        flujoEfectivo -= Math.abs(amount);
      } else {
        // Ingreso extra (no POS, no Taller)
        const desc = t.description?.toLowerCase() || '';
        const isAlreadyInUnified = 
          t.order_id != null || 
          t.source === 'STORE' ||
          desc.includes('pago orden') || 
          desc.includes('venta producto') || 
          desc.includes('abono a crédito');

        if (!isAlreadyInUnified) {
          ventasNetas += amount;
          flujoEfectivo += amount;
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

    // 1. Fetch payments
    const { data: rawPayments } = await supabase.rpc('get_payments_flat');
    
    // Load related orders to get partsCost
    const orderIds = Array.from(new Set((rawPayments || []).map((p: any) => p.order_id).filter(Boolean)));
    const orderCostsMap: Record<string, { partsCost: number, expenses: any }> = {};
    
    // Chunk order queries if necessary, here we assume it's under reasonable limits for a dashboard or we just query them all. 
    // To be safe with large queries, we can split them or ensure it's filtered if there's too many, 
    // but the get_payments_flat without dates might be large anyway. We'll chunk to 500 max per query if needed,
    // or just run one query. Let's run chunks of 500 just in case.
    for (let i = 0; i < orderIds.length; i += 500) {
        const chunk = orderIds.slice(i, i + 500);
        const { data: orders } = await supabase.from('orders').select('id, partsCost, expenses').in('id', chunk);
        if (orders) {
            orders.forEach(o => {
                orderCostsMap[o.id] = { partsCost: o.partsCost, expenses: o.expenses };
            });
        }
    }
    
    const payments = (rawPayments || []).map((p: any) => ({
        ...p,
        orders: p.order_id ? orderCostsMap[p.order_id] : undefined
    }));
    
    // 2. Fetch accounting transactions
    const { data: transactions } = await supabase.from('accounting_transactions').select('*, accounting_categories(name)').eq('status', 'COMPLETED');
    
    // 3. Fetch Credits (CxC)
    const { data: credits } = await supabase.from('client_credits').select('*');

    // 4. Fetch Inventory
    const { data: inventory } = await supabase
      .from('inventory_parts')
      .select('id, stock, price, cost, status, deleted_at')
      .is('deleted_at', null)
      .neq('status', 'archived');

    // 5. Fetch Unified Sales View
    const { data: unifiedSales, error: salesError } = await supabase
      .from('v_sales_unified')
      .select('*')
      .gte('created_at', startDate || '2000-01-01')
      .lte('created_at', endDate || new Date().toISOString());

    if (salesError) {
        console.warn("Error fetching v_sales_unified:", salesError);
    }

    // Filter by date if needed
    let filteredPayments = payments || [];
    let filteredTransactions = transactions || [];
    
    if (startDate) {
      const [sy, sm, sd] = startDate.split('T')[0].split('-');
      const startLocal = new Date(Number(sy), Number(sm) - 1, Number(sd), 0, 0, 0);
      
      filteredPayments = filteredPayments.filter((p: any) => {
        const val = p.created_at ? Number(p.created_at) : p.date;
        return new Date(val) >= startLocal;
      });
      filteredTransactions = filteredTransactions.filter((t: any) => {
        const [ty, tm, td] = t.transaction_date.split('T')[0].split('-');
        return new Date(Number(ty), Number(tm) - 1, Number(td), 0, 0, 0) >= startLocal;
      });
    }
    if (endDate) {
      const [ey, em, ed] = endDate.split('T')[0].split('-');
      const endLocal = new Date(Number(ey), Number(em) - 1, Number(ed), 23, 59, 59, 999);
      
      filteredPayments = filteredPayments.filter((p: any) => {
        const val = p.created_at ? Number(p.created_at) : p.date;
        return new Date(val) <= endLocal;
      });
      filteredTransactions = filteredTransactions.filter((t: any) => {
        const [ty, tm, td] = t.transaction_date.split('T')[0].split('-');
        return new Date(Number(ty), Number(tm) - 1, Number(td), 23, 59, 59, 999) <= endLocal;
      });
    }

    return {
      payments: filteredPayments,
      transactions: filteredTransactions,
      credits: credits || [],
      inventory: inventory || [],
      unifiedSales: unifiedSales || []
    };
  },

  async getCashflow(startDate?: string, endDate?: string): Promise<any[]> {
    // Force fetching at least 6 months of data for the cashflow chart
    const now = new Date();
    const sixMonthsAgoDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const sixMonthsAgoStr = `${sixMonthsAgoDate.getFullYear()}-${String(sixMonthsAgoDate.getMonth() + 1).padStart(2, '0')}-01`;
    
    let effectiveStartDate = startDate;
    if (!effectiveStartDate || new Date(effectiveStartDate) > sixMonthsAgoDate) {
        effectiveStartDate = sixMonthsAgoStr; // Always fetch at least 6 months
    }

    const rawData = await this.fetchRawFinancialData(effectiveStartDate, endDate);
    const monthlyData: { [key: string]: { income: number, expenses: number, purchases: number } } = {};

    rawData.payments.forEach((p: any) => {
      let d = new Date();
      if (p.created_at) {
          d = new Date(Number(p.created_at));
      } else if (p.date) {
          d = new Date(p.date); // fallback
      }

      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { income: 0, expenses: 0, purchases: 0 };
      }
      if (p.is_refund) {
          monthlyData[monthKey].expenses += Math.abs(p.amount);
      } else {
          // CREDIT shouldn't add to cashflow, but maybe to Income? Depending on old logic, cashflow counted all non-refund positive as income. 
          // Let's exclude CREDIT from cash flow OR include it in sales?
          // Real cash flow: only non credit. But previously getCashflow queried accounting_transactions which only had paid values.
          if (p.method !== 'CREDIT') {
              monthlyData[monthKey].income += p.amount;
          }
      }
    });

    rawData.transactions.forEach((t: any) => {
      const isPosDuplicate = 
          t.order_id != null || 
          (t.description?.toLowerCase() || '').includes('pago orden') || 
          (t.description?.toLowerCase() || '').includes('venta producto') || 
          (t.description?.toLowerCase() || '').includes('abono a crédito');
      
      if (!isPosDuplicate) {
        const dateParts = t.transaction_date.split('-');
        const monthKey = `${dateParts[0]}-${dateParts[1]}`;
        
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { income: 0, expenses: 0, purchases: 0 };
        }

        const amount = Number(t.amount);
        const isPurchase = t.accounting_categories?.name?.toLowerCase() === 'compras';

        if (amount > 0) {
          monthlyData[monthKey].income += amount;
        } else if (isPurchase) {
          monthlyData[monthKey].purchases += Math.abs(amount);
        } else {
          monthlyData[monthKey].expenses += Math.abs(amount);
        }
      }
    });

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
          const categoryName = t.accounting_categories?.name || 'Sin Categoría';
          if (categoryName.toLowerCase() !== 'compras') {
            distribution[categoryName] = (distribution[categoryName] || 0) + Math.abs(amount);
          }
        }
      }
    });
    
    // Refunds also count towards expenses for this distribution? No, usually kept separate or under 'Devoluciones'
    let refunds = 0;
    rawData.payments.forEach((p: any) => {
        if (p.is_refund) {
            refunds += Math.abs(p.amount);
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
