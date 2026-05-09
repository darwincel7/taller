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
            const amount = Number(s.gross_amount) || 0;
            const cost = Number(s.cost_amount) || 0;
            
            if (s.is_refund) {
                deduccionesVenta += Math.abs(amount);
                ventasNetas -= Math.abs(amount);
            } else {
                ventasNetas += amount;
                costoVenta += cost;
            }
        });
    }

    // 2. Process cash_movements for Real Cash Flow
    if (rawData.cashMovements) {
        rawData.cashMovements.forEach((cm: any) => {
            const amount = Number(cm.amount) || 0;
            // Only non-credit inbound is cash positive
            if (cm.type === 'IN') {
                if (!['CREDIT', 'EXCHANGE', 'CAMBIAZO'].includes(cm.method)) {
                    flujoEfectivo += amount;
                }
            } else if (cm.type === 'OUT') {
                flujoEfectivo -= Math.abs(amount);
            }
        });
    }

    // 3. Process accounting transactions for Expenses and extra Income (exclude those already in sales)
    rawData.transactions.forEach((t: any) => {
      const amount = Number(t.amount);

      if (amount < 0) {
        // Gasto / Compra / Egreso
        gastosOperativos += Math.abs(amount);
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

    // 1. Fetch cash movements
    const { data: rawCashMovements } = await supabase.from('cash_movements').select('*').in('status', ['COMPLETED', 'PAID', 'active']);
    const cashMovements = rawCashMovements || [];
    
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

  async getCashflow(startDate?: string, endDate?: string): Promise<any[]> {
    const now = new Date();
    const sixMonthsAgoDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const sixMonthsAgoStr = `${sixMonthsAgoDate.getFullYear()}-${String(sixMonthsAgoDate.getMonth() + 1).padStart(2, '0')}-01`;
    
    let effectiveStartDate = startDate;
    if (!effectiveStartDate || new Date(effectiveStartDate) > sixMonthsAgoDate) {
        effectiveStartDate = sixMonthsAgoStr;
    }

    const rawData = await this.fetchRawFinancialData(effectiveStartDate, endDate);
    const monthlyData: { [key: string]: { income: number, expenses: number, purchases: number } } = {};

    rawData.cashMovements.forEach((cm: any) => {
      let d = new Date();
      const val = cm.created_at || cm.date;
      if (val) {
          d = typeof val === 'string' && val.includes('T') ? new Date(val) : new Date(Number(val));
      }

      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { income: 0, expenses: 0, purchases: 0 };
      }
      
      const amount = Number(cm.amount) || 0;
      if (cm.type === 'IN') {
          if (!['CREDIT', 'EXCHANGE', 'CAMBIAZO'].includes(cm.method)) {
              monthlyData[monthKey].income += amount;
          }
      } else if (cm.type === 'OUT') {
          monthlyData[monthKey].expenses += Math.abs(amount);
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
