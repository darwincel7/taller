import { supabase } from './supabase';
import { AccountingTransaction, AccountingCategory, CashflowData, ExpenseDistribution, FinancialKPIs } from '../types';

export const accountingService = {
  // --- TRANSACTIONS ---
  getTransactions: async (filters?: any): Promise<AccountingTransaction[]> => {
    if (!supabase) return [];
    
    let query = supabase
      .from('accounting_transactions')
      .select('*, accounting_categories(name)')
      .order('transaction_date', { ascending: false });

    if (filters) {
      if (filters.startDate) query = query.gte('transaction_date', filters.startDate);
      if (filters.endDate) query = query.lte('transaction_date', filters.endDate);
      if (filters.type) {
        if (filters.type === 'INCOME') query = query.gt('amount', 0);
        if (filters.type === 'EXPENSE') query = query.lt('amount', 0);
      }
      if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.source) query = query.eq('source', filters.source);
      
      // SMART SEARCH
      if (filters.search) {
        // Search in search_text column (which includes OCR data) OR fallback to description/vendor
        query = query.or(`description.ilike.%${filters.search}%,vendor.ilike.%${filters.search}%,search_text.ilike.%${filters.search}%`);
      }

      // PAGINATION
      if (filters.limit) query = query.limit(filters.limit);
      if (filters.offset) query = query.range(filters.offset, filters.offset + filters.limit - 1);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching transactions:', error);
      return [];
    }
    
    return data.map((t: any) => ({
      ...t,
      category_name: t.accounting_categories?.name
    }));
  },

  uploadReceipt: async (file: File): Promise<string | null> => {
    if (!supabase) return null;
    const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '')}`;
    const { data, error } = await supabase.storage
      .from('receipts')
      .upload(fileName, file);

    if (error) {
      console.error("Upload error:", error);
      return null;
    }
    
    const { data: publicData } = supabase.storage.from('receipts').getPublicUrl(fileName);
    return publicData.publicUrl;
  },

  addTransaction: async (transaction: Partial<AccountingTransaction>, file?: File): Promise<AccountingTransaction | null> => {
    if (!supabase) return null;
    
    let receiptUrl = transaction.receipt_url;
    
    // Upload file if present
    if (file) {
        const url = await accountingService.uploadReceipt(file);
        if (url) receiptUrl = url;
    }

    // Construct search text for "Smart Search"
    // Combine vendor, description, amount, and any OCR text provided in search_text
    const searchText = `
        ${transaction.vendor || ''} 
        ${transaction.description || ''} 
        ${transaction.amount || ''} 
        ${transaction.transaction_date || ''} 
        ${transaction.search_text || ''}
    `.toLowerCase();

    const finalTransaction = {
        status: 'CONSOLIDATED',
        source: 'MANUAL',
        ...transaction,
        receipt_url: receiptUrl,
        search_text: searchText
    };

    const { data, error } = await supabase
      .from('accounting_transactions')
      .insert([finalTransaction])
      .select()
      .single();

    if (error) {
      console.error('Supabase Error:', error);
      if (error.code === '23505') {
        throw new Error('DUPLICATE_INVOICE');
      }
      throw error;
    }
    return data;
  },

  updateTransaction: async (id: string, updates: Partial<AccountingTransaction>): Promise<void> => {
    if (!supabase) return;
    const { error } = await supabase
      .from('accounting_transactions')
      .update(updates)
      .eq('id', id);
      
    if (error) throw error;
  },

  deleteTransaction: async (id: string): Promise<void> => {
    if (!supabase) return;
    const { error } = await supabase
      .from('accounting_transactions')
      .delete()
      .eq('id', id);
      
    if (error) throw error;
  },

  // --- CATEGORIES ---
  getCategories: async (): Promise<AccountingCategory[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('accounting_categories')
      .select('*')
      .order('name');
      
    if (error) return [];
    return data as AccountingCategory[];
  },

  addCategory: async (name: string, type: 'INCOME' | 'EXPENSE'): Promise<AccountingCategory | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('accounting_categories')
      .insert([{ name, type }])
      .select()
      .single();
      
    if (error) throw error;
    return data;
  },

  // --- HELPERS ---
  getCategoryIdByName: async (name: string): Promise<string | null> => {
    if (!supabase) return null;
    // Try exact match first
    let { data, error } = await supabase
      .from('accounting_categories')
      .select('id')
      .ilike('name', name)
      .single();
      
    if (data) return data.id;

    // If not found, try to find a default or create it? 
    // For now, return null.
    return null;
  },

  // --- DASHBOARD DATA (Using RPCs created in accounting_module.sql) ---
  getKPIs: async (): Promise<FinancialKPIs> => {
    if (!supabase) return { current_income: 0, current_expenses: 0, net_profit: 0, prev_income: 0, prev_expenses: 0, growth_income: 0 };
    
    const { data, error } = await supabase.rpc('get_financial_kpis');
    if (error || !data || data.length === 0) return { current_income: 0, current_expenses: 0, net_profit: 0, prev_income: 0, prev_expenses: 0, growth_income: 0 };
    
    return data[0];
  },

  getCashflow: async (): Promise<CashflowData[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase.rpc('get_cashflow_summary');
    if (error) return [];
    return data;
  },

  getExpenseDistribution: async (): Promise<ExpenseDistribution[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase.rpc('get_expense_distribution');
    if (error) return [];
    return data;
  }
};
