import { supabase } from './supabase';

export interface UnifiedFinancialEvent {
    id: string; // unique string
    date: string; // ISO format
    type: 'INCOME' | 'EXPENSE';
    source: 'POS' | 'WORKSHOP_REVENUE' | 'WORKSHOP_REFUND' | 'EXPENSE' | 'MANUAL' | 'STORE';
    description: string;
    amount: number;
    user_name: string;
    category?: string;
    metadata?: any;
    original_transaction_id?: string;
    source_table: 'v_sales_unified' | 'cash_movements' | 'accounting_transactions';
    status: string;
}

export const financialEventsService = {
  getEvents: async (filters?: {
      limit?: number;
      offset?: number;
      search?: string;
      startDate?: string;
      endDate?: string;
  }): Promise<UnifiedFinancialEvent[]> => {
    if (!supabase) return [];
    
    // We fetch from v_sales_unified and accounting_transactions
    // since cash_movements is usually ledger detail for sales/refunds.
    
    let salesQuery = supabase.from('v_sales_unified').select('*');
    let accQuery = supabase.from('accounting_transactions').select('*, accounting_categories(name)').eq('status', 'COMPLETED');

    if (filters?.startDate) {
        salesQuery = salesQuery.gte('created_at', filters.startDate);
        accQuery = accQuery.gte('transaction_date', filters.startDate.split('T')[0]);
    }
    if (filters?.endDate) {
        salesQuery = salesQuery.lte('created_at', filters.endDate + 'T23:59:59.999Z');
        accQuery = accQuery.lte('transaction_date', filters.endDate.split('T')[0]);
    }

    const [salesProm, accProm] = await Promise.all([
        salesQuery.order('created_at', { ascending: false }).limit(600),
        accQuery.order('transaction_date', { ascending: false }).limit(600)
    ]);

    const sales = salesProm.data || [];
    const acc = accProm.data || [];

    const events: UnifiedFinancialEvent[] = [];

    // Map sales
    sales.forEach(s => {
        const amt = Number(s.gross_amount) || 0;
        events.push({
            id: 'S_' + s.source_id,
            date: s.created_at,
            type: s.is_refund ? 'EXPENSE' : 'INCOME',
            source: s.source_type || 'POS', // POS, WORKSHOP, etc
            description: s.description || 'Ingreso de Venta',
            amount: Math.abs(amt), // Store absolute
            user_name: s.user_id || 'System',
            source_table: 'v_sales_unified',
            status: s.status,
            metadata: { readable_id: s.readable_id }
        });
    });

    // Map accounting transactions (ignoring STORE since it's redundant to POS, keeping logic from dashboard)
    acc.forEach(a => {
        const desc = a.description?.toLowerCase() || '';
        const isSalesRedundant = a.source === 'STORE' || desc.includes('venta pos directa');
        
        if (!isSalesRedundant) {
            events.push({
                id: 'A_' + a.id,
                date: a.transaction_date,
                type: a.type as 'INCOME' | 'EXPENSE',
                source: a.source as any,
                description: a.description || '',
                amount: Math.abs(Number(a.amount) || 0),
                user_name: 'Sys', // Accounting doesn't track created_by name natively often
                category: a.accounting_categories?.name,
                original_transaction_id: a.id,
                source_table: 'accounting_transactions',
                status: a.status
            });
        }
    });

    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Apply text search
    let filtered = events;
    if (filters?.search) {
        const s = filters.search.toLowerCase();
        filtered = filtered.filter(e => e.description.toLowerCase().includes(s) || e.id.toLowerCase().includes(s));
    }

    // Apply pagination
    const offset = filters?.offset || 0;
    const limit = filters?.limit || 20;
    
    return filtered.slice(offset, offset + limit);
  }
};
