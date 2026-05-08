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
        
        // Check if it's an ID search like "g-5284", "G-5284", "g5284", "g 5284"
        const idMatch = searchStr.match(/^[a-zA-Z][-\s]?(\d+)$/);
        
        if (idMatch) {
          const idNum = Number(idMatch[1]);
          query = query.or(`description.ilike.%${filters.search}%,vendor.ilike.%${filters.search}%,search_text.ilike.%${filters.search}%,readable_id.eq.${idNum}`);
        } else if (searchStr && !isNaN(searchNum)) {
          // If it's a number, search amount as well (positive or negative) and readable_id
          query = query.or(`description.ilike.%${filters.search}%,vendor.ilike.%${filters.search}%,search_text.ilike.%${filters.search}%,amount.eq.${searchNum},amount.eq.-${searchNum},readable_id.eq.${searchNum}`);
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
      console.warn('Error fetching transactions:', error);
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
      console.warn("Upload error:", error);
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

    let finalInvoiceNumber = transaction.invoice_number;
    if (transaction.is_duplicate && finalInvoiceNumber) {
        // Strip any existing -DUP- suffix to avoid chaining them
        const baseInvoiceNumber = finalInvoiceNumber.split('-DUP-')[0];
        // Append a unique suffix to bypass the unique constraint on (vendor, invoice_number)
        finalInvoiceNumber = `${baseInvoiceNumber}-DUP-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    }

    const finalTransaction = {
        status: TransactionStatus.CONSOLIDATED,
        source: 'MANUAL',
        ...transaction,
        invoice_number: finalInvoiceNumber,
        receipt_url: receiptUrl,
        shared_receipt_id: transaction.shared_receipt_id,
        search_text: searchText,
        is_duplicate: transaction.is_duplicate || false
    };

    // If no category_id is provided, try to find a default one
    if (!finalTransaction.category_id) {
        const categories = await accountingService.getCategories();
        const type = (finalTransaction.amount || 0) > 0 ? 'INCOME' : 'EXPENSE';
        const defaultCat = categories.find(c => c.type === type);
        if (defaultCat) {
            finalTransaction.category_id = defaultCat.id;
        }
    }

    const { data, error } = await supabase
      .from('accounting_transactions')
      .insert([finalTransaction])
      .select()
      .single();

    if (error) {
      console.warn('Supabase Error:', error);
      if (error.code === '23505') {
        throw new Error('DUPLICATE_INVOICE');
      }
      throw error;
    }
    return data;
  },

  checkDuplicateInvoice: async (invoiceNumber: string, vendor: string): Promise<boolean> => {
    if (!supabase || (!invoiceNumber && !vendor)) return false;
    
    // Check in accounting_transactions
    let transQuery = supabase.from('accounting_transactions').select('id').limit(1);
    if (invoiceNumber) transQuery = transQuery.eq('invoice_number', invoiceNumber);
    if (vendor) transQuery = transQuery.ilike('vendor', vendor);
    
    const { data: transData, error: transError } = await transQuery;
      
    if (transData && transData.length > 0) return true;
    
    // Check in floating_expenses
    let floatQuery = supabase.from('floating_expenses').select('id').limit(1);
    if (invoiceNumber) floatQuery = floatQuery.eq('invoice_number', invoiceNumber);
    if (vendor) floatQuery = floatQuery.ilike('vendor', vendor);
    
    const { data: floatData, error: floatError } = await floatQuery;
      
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
      console.warn('Error fetching transaction to update:', fetchError);
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
        console.warn('Error updating transaction:', updateError);
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
      console.warn('Error fetching transaction to delete:', fetchError);
      return null;
    }
    
    if (data && data.length > 0) {
      const { error: deleteError } = await supabase
        .from('accounting_transactions')
        .delete()
        .eq('id', data[0].id);
        
      if (deleteError) {
        console.warn('Error deleting transaction:', deleteError);
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
  getKPIs: async (filters?: { startDate?: string, endDate?: string }): Promise<FinancialKPIs> => {
    const { financialMetricsService } = await import('./FinancialMetricsService');
    const result = await financialMetricsService.getMetrics(filters?.startDate, filters?.endDate);
    
    // Fallback for missing/undefined values to maintain compatibility
    return {
      current_income: result.current_income || 0,
      current_expenses: result.current_expenses || 0,
      current_purchases: result.current_purchases || 0,
      net_profit: result.net_profit || 0,
      prev_income: result.prev_income || 0,
      prev_expenses: result.prev_expenses || 0,
      prev_purchases: result.prev_purchases || 0,
      growth_income: result.growth_income || 0,
      
      ventasNetas: result.ventasNetas || 0,
      costoVenta: result.costoVenta || 0,
      margenBruto: result.margenBruto || 0,
      margenBrutoPorcentaje: result.margenBrutoPorcentaje || 0,
      gastosOperativos: result.gastosOperativos || 0,
      utilidadOperativa: result.utilidadOperativa || 0,
      utilidadNeta: result.utilidadNeta || 0,
      flujoEfectivo: result.flujoEfectivo || 0,
      puntoEquilibrio: result.puntoEquilibrio || 0,
      capitalTrabajo: result.capitalTrabajo || 0,
      rotacionInventario: result.rotacionInventario || 0,
      ticketPromedio: result.ticketPromedio || 0,
      cuentasPorCobrar: result.cuentasPorCobrar || 0,
      cuentasPorPagar: result.cuentasPorPagar || 0,
      endeudamiento: result.endeudamiento || 0,
      roi: result.roi || 0,
      rentabilidadTaller: result.rentabilidadTaller || 0
    };
  },

  getCashflow: async (filters?: { startDate?: string, endDate?: string }): Promise<CashflowData[]> => {
    const { financialMetricsService } = await import('./FinancialMetricsService');
    return await financialMetricsService.getCashflow(filters?.startDate, filters?.endDate);
  },

  getExpenseDistribution: async (filters?: { startDate?: string, endDate?: string }): Promise<ExpenseDistribution[]> => {
    const { financialMetricsService } = await import('./FinancialMetricsService');
    return await financialMetricsService.getExpenseDistribution(filters?.startDate, filters?.endDate);
  }
};
