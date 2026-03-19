import { supabase } from './supabase';
import { AccountingTransaction, AccountingCategory, CashflowData, ExpenseDistribution, FinancialKPIs, TransactionStatus } from '../types';

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
      if (filters.excludeStatus) query = query.neq('status', filters.excludeStatus);
      if (filters.source) query = query.eq('source', filters.source);
      if (filters.approvalStatus) {
        query = query.eq('approval_status', filters.approvalStatus);
      } else {
        // Only show APPROVED or legacy (null) transactions in the main accounting view
        // PENDING and REJECTED are handled in the Cash Register Approvals tab
        query = query.or('approval_status.eq.APPROVED,approval_status.is.null');
      }
      
      // SMART SEARCH
      if (filters.search) {
        const searchStr = filters.search.trim();
        const searchNum = Number(searchStr);
        if (searchStr && !isNaN(searchNum)) {
          // If it's a number, search amount as well (positive or negative)
          query = query.or(`description.ilike.%${filters.search}%,vendor.ilike.%${filters.search}%,search_text.ilike.%${filters.search}%,amount.eq.${searchNum},amount.eq.-${searchNum}`);
        } else {
          // Search in search_text column (which includes OCR data) OR fallback to description/vendor
          query = query.or(`description.ilike.%${filters.search}%,vendor.ilike.%${filters.search}%,search_text.ilike.%${filters.search}%`);
        }
      }

      // PAGINATION
      if (filters.limit) query = query.limit(filters.limit);
      if (filters.offset) query = query.range(filters.offset, filters.offset + filters.limit - 1);
    } else {
      // Default filter if no filters provided
      query = query.or('approval_status.eq.APPROVED,approval_status.is.null');
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
        status: TransactionStatus.CONSOLIDATED,
        source: 'MANUAL',
        ...transaction,
        receipt_url: receiptUrl,
        shared_receipt_id: transaction.shared_receipt_id,
        search_text: searchText,
        is_duplicate: transaction.is_duplicate || false
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

  checkDuplicateInvoice: async (invoiceNumber: string): Promise<boolean> => {
    if (!supabase || !invoiceNumber) return false;
    
    // Check in accounting_transactions
    const { data: transData, error: transError } = await supabase
      .from('accounting_transactions')
      .select('id')
      .eq('invoice_number', invoiceNumber)
      .limit(1);
      
    if (transData && transData.length > 0) return true;
    
    // Check in floating_expenses
    const { data: floatData, error: floatError } = await supabase
      .from('floating_expenses')
      .select('id')
      .eq('invoice_number', invoiceNumber)
      .limit(1);
      
    if (floatData && floatData.length > 0) return true;
    
    return false;
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

  updateTransactionByOrderExpense: async (orderId: string, oldDescription: string, oldAmount: number, newDescription: string, newAmount: number): Promise<void> => {
    if (!supabase) return;
    
    const { data, error: fetchError } = await supabase
      .from('accounting_transactions')
      .select('id')
      .eq('order_id', orderId)
      .eq('description', oldDescription)
      .eq('amount', -Math.abs(oldAmount))
      .limit(1);
      
    if (fetchError) {
      console.error('Error fetching transaction to update:', fetchError);
      return;
    }
    
    if (data && data.length > 0) {
      const { error: updateError } = await supabase
        .from('accounting_transactions')
        .update({
          description: newDescription,
          amount: -Math.abs(newAmount)
        })
        .eq('id', data[0].id);
        
      if (updateError) {
        console.error('Error updating transaction:', updateError);
        throw updateError;
      }
    }
  },

  deleteTransactionByOrderExpense: async (orderId: string, description: string, amount: number): Promise<AccountingTransaction | null> => {
    if (!supabase) return null;
    
    // Find the transaction that matches the order_id, description, and amount
    // The amount in accounting_transactions is negative for expenses
    const { data, error: fetchError } = await supabase
      .from('accounting_transactions')
      .select('*')
      .eq('order_id', orderId)
      .eq('description', description)
      .eq('amount', -Math.abs(amount))
      .limit(1);
      
    if (fetchError) {
      console.error('Error fetching transaction to delete:', fetchError);
      return null;
    }
    
    if (data && data.length > 0) {
      const { error: deleteError } = await supabase
        .from('accounting_transactions')
        .delete()
        .eq('id', data[0].id);
        
      if (deleteError) {
        console.error('Error deleting transaction:', deleteError);
        throw deleteError;
      }
      return data[0] as AccountingTransaction;
    }
    return null;
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
    if (!supabase) return { current_income: 0, current_expenses: 0, current_purchases: 0, net_profit: 0, prev_income: 0, prev_expenses: 0, prev_purchases: 0, growth_income: 0 };
    
    const now = new Date();
    
    // Clean way to get start of previous month string
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const startOfPrevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
    
    const { data: transactions, error } = await supabase
      .from('accounting_transactions')
      .select('amount, transaction_date, accounting_categories(name)')
      .eq('status', 'COMPLETED')
      .gte('transaction_date', startOfPrevMonthStr);

    if (error || !transactions) {
      return { current_income: 0, current_expenses: 0, current_purchases: 0, net_profit: 0, prev_income: 0, prev_expenses: 0, prev_purchases: 0, growth_income: 0 };
    }

    let curr_inc = 0, curr_exp = 0, curr_pur = 0;
    let prev_inc = 0, prev_exp = 0, prev_pur = 0;

    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    transactions.forEach((t: any) => {
      const dateParts = t.transaction_date.split('-');
      const monthKey = `${dateParts[0]}-${dateParts[1]}`;
      const isCurrentMonth = monthKey === currentMonthStr;
      const amount = Number(t.amount);
      const isPurchase = t.accounting_categories?.name?.toLowerCase() === 'compras';

      if (isCurrentMonth) {
        if (amount > 0) curr_inc += amount;
        else if (isPurchase) curr_pur += Math.abs(amount);
        else curr_exp += Math.abs(amount);
      } else {
        if (amount > 0) prev_inc += amount;
        else if (isPurchase) prev_pur += Math.abs(amount);
        else prev_exp += Math.abs(amount);
      }
    });

    const growth_income = prev_inc > 0 ? ((curr_inc - prev_inc) / prev_inc) * 100 : 0;
    const net_profit = curr_inc - curr_exp; // Beneficio Operativo (sin contar compras de inventario)

    return {
      current_income: curr_inc,
      current_expenses: curr_exp,
      current_purchases: curr_pur,
      net_profit: net_profit,
      prev_income: prev_inc,
      prev_expenses: prev_exp,
      prev_purchases: prev_pur,
      growth_income: growth_income
    };
  },

  getCashflow: async (): Promise<CashflowData[]> => {
    if (!supabase) return [];
    
    const now = new Date();
    const sixMonthsAgoDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const sixMonthsAgo = `${sixMonthsAgoDate.getFullYear()}-${String(sixMonthsAgoDate.getMonth() + 1).padStart(2, '0')}-01`;
    
    const { data: transactions, error } = await supabase
      .from('accounting_transactions')
      .select('amount, transaction_date, accounting_categories(name)')
      .eq('status', 'COMPLETED')
      .gte('transaction_date', sixMonthsAgo);

    if (error || !transactions) return [];

    const monthlyData: { [key: string]: { income: number, expenses: number, purchases: number } } = {};

    transactions.forEach((t: any) => {
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
    });

    const result: CashflowData[] = [];
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

  getExpenseDistribution: async (): Promise<ExpenseDistribution[]> => {
    if (!supabase) return [];
    
    const now = new Date();
    const startOfCurrentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    
    const { data: transactions, error } = await supabase
      .from('accounting_transactions')
      .select('amount, accounting_categories(name)')
      .eq('status', 'COMPLETED')
      .lt('amount', 0)
      .gte('transaction_date', startOfCurrentMonth);

    if (error || !transactions) return [];

    const distribution: { [key: string]: number } = {};

    transactions.forEach((t: any) => {
      const categoryName = t.accounting_categories?.name || 'Sin Categoría';
      if (categoryName.toLowerCase() !== 'compras') {
        distribution[categoryName] = (distribution[categoryName] || 0) + Math.abs(Number(t.amount));
      }
    });

    return Object.entries(distribution)
      .map(([category_name, total_amount]) => ({ category_name, total_amount }))
      .sort((a, b) => b.total_amount - a.total_amount);
  }
};
