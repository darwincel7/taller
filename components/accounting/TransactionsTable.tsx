import React, { useState, useEffect } from 'react';
import { Search, Filter, Download, ArrowUpRight, ArrowDownLeft, Eye, Trash2, Edit, X, Calendar, User, Tag, Store, Wrench, Image as ImageIcon, Loader2, CheckCircle } from 'lucide-react';
import { AccountingTransaction, TransactionStatus, ActionType, UserRole } from '../../types';
import { auditService } from '../../services/auditService';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { accountingService } from '../../services/accountingService';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useDebounce } from '../../hooks/useDebounce';
import { supabase } from '../../services/supabase';
import { EditTransactionModal } from './EditTransactionModal';

const parseSafeDate = (dateStr?: string | null) => {
  if (!dateStr) return new Date();
  if (dateStr.includes('T')) {
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }
  const parsed = new Date(`${dateStr}T00:00:00`);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
};

interface TransactionsTableProps {
  transactions?: AccountingTransaction[]; // Optional now as we fetch internally for pagination
}

export const TransactionsTable: React.FC<TransactionsTableProps> = () => {
  const { users, currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 500);
  const [selectedTransaction, setSelectedTransaction] = useState<AccountingTransaction | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<AccountingTransaction | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 20;
  
  // Filters
  const [filterType, setFilterType] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
  const [filterSource, setFilterSource] = useState<'ALL' | 'MANUAL' | 'ORDER' | 'STORE'>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Fetch transactions with pagination and search
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['transactions', page, debouncedSearch, filterType, filterSource, startDate, endDate],
    queryFn: async () => {
        const rawTransactions = await accountingService.getTransactions({
            limit: pageSize,
            offset: page * pageSize,
            search: debouncedSearch,
            type: filterType === 'ALL' ? undefined : filterType,
            source: filterSource === 'ALL' ? undefined : filterSource,
            excludeStatus: TransactionStatus.PENDING,
            startDate: startDate || undefined,
            endDate: endDate || undefined
        });

        // Also fetch from v_sales_unified if filter allows it
        let salesData: any[] = [];
        if (filterSource === 'ALL' || filterSource === 'STORE' || filterSource === 'ORDER') {
            if (filterType === 'ALL' || filterType === 'INCOME' || filterType === 'EXPENSE') {
                let salesQuery = supabase.from('v_sales_unified').select('*');
                
                if (filterSource === 'STORE') salesQuery = salesQuery.eq('source_type', 'POS');
                if (filterSource === 'ORDER') salesQuery = salesQuery.like('source_type', 'WORKSHOP%');
                
                if (filterType === 'INCOME') salesQuery = salesQuery.eq('is_refund', false);
                if (filterType === 'EXPENSE') salesQuery = salesQuery.eq('is_refund', true);

                if (startDate) salesQuery = salesQuery.gte('created_at', startDate);
                if (endDate) salesQuery = salesQuery.lte('created_at', endDate + 'T23:59:59.999Z');
                
                // We fetch a batch and sort them in memory
                const { data: sales, error } = await salesQuery.order('created_at', { ascending: false }).limit(200);
                
                if (!error && sales) {
                    salesData = sales.map(s => {
                        const amtRAW = Number(s.gross_amount) || 0;
                        const amt = s.is_refund ? -Math.abs(amtRAW) : Math.abs(amtRAW);
                        return {
                            id: s.source_id,
                            transaction_date: s.created_at,
                            created_at: s.created_at,
                            description: s.description || 'Venta POS',
                            amount: amt,
                            source: s.source_type === 'POS' ? 'STORE' : (s.source_type?.includes('WORKSHOP') ? 'ORDER' : s.source_type),
                            status: TransactionStatus.COMPLETED,
                            category_id: null,
                            accounting_categories: { name: 'Ventas de Tienda' },
                            invoice_number: s.readable_id || null,
                            user_id: s.user_id,
                            vendor: null,
                            is_duplicate: false
                        };
                    });
                }
            }
        }

        if (debouncedSearch) {
            const s = debouncedSearch.toLowerCase();
            salesData = salesData.filter(x => 
                x.description.toLowerCase().includes(s) || 
                (x.invoice_number && x.invoice_number.toString().toLowerCase().includes(s))
            );
        }

        // Merge and sort
        const merged = [...rawTransactions, ...salesData];
        merged.sort((a, b) => parseSafeDate(b.transaction_date).getTime() - parseSafeDate(a.transaction_date).getTime());
        
        // Paginate the merged array manually since we combined two sources
        // Note: For true deep pagination, this isn't perfect, but covers recent history well.
        return merged.slice(page * pageSize, (page + 1) * pageSize);
    },
    keepPreviousData: true
  } as any);

  const transactions = (data as AccountingTransaction[]) || [];

  const consolidateMutation = useMutation({
    mutationFn: async (transaction: AccountingTransaction) => {
      if (!window.confirm(`¿Está seguro de consolidar esta transacción?`)) {
        throw new Error('Cancelado por el usuario');
      }
      
      await accountingService.updateTransaction(transaction.id, { status: TransactionStatus.COMPLETED });
      return transaction.id;
    },
    onSuccess: (_, transaction) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['cashflow'] });
      setSelectedTransaction(null);
      
      // Record audit log
      if (currentUser) {
        auditService.recordLog(
          currentUser,
          ActionType.TRANSACTION_EDITED,
          `Consolidó transacción: ${transaction.id}`,
          undefined,
          'TRANSACTION',
          transaction.id
        );
      }
    },
    onError: (error: any) => {
      if (error.message !== 'Cancelado por el usuario') {
        alert("Error al consolidar la transacción: " + error.message);
      }
    }
  });
  const deleteMutation = useMutation({
    mutationFn: async (transaction: AccountingTransaction) => {
      // If it's an order transaction, we should also remove it from the order
      if (transaction.source === 'ORDER' && transaction.order_id) {
        // We need to fetch the order first to get its current expenses
        const { data: orderData, error: orderError } = await supabase
          .from('orders')
          .select('expenses')
          .eq('id', transaction.order_id)
          .single();
          
        if (!orderError && orderData && orderData.expenses) {
          // Try to find the matching expense in the order
          // The description in accounting has the order ID prefixed, so we need to match carefully
          // Or we can just match by amount and approximate description
          const expenses = orderData.expenses as any[];
          
          // The accounting description is like "[Orden #123456] Repuesto X"
          // We want to find "Repuesto X"
          const cleanDesc = transaction.description.replace(/\[Orden #[^\]]+\]\s*/, '');
          
          const expenseIndex = expenses.findIndex(e => 
            e.amount === Math.abs(transaction.amount) && 
            (transaction.description.includes(e.description) || e.description.includes(cleanDesc))
          );
          
          if (expenseIndex >= 0) {
            const expenseToRemove = expenses[expenseIndex];
            const newExpenses = [...expenses];
            newExpenses.splice(expenseIndex, 1);
            
            // Update the order
            await supabase
              .from('orders')
              .update({ expenses: newExpenses })
              .eq('id', transaction.order_id);
              
            // Return to floating expenses (gastos en espera) ONLY if it was originally a floating expense
            if (expenseToRemove.isExternal) {
                const originalInvoiceNumber = expenseToRemove.invoiceNumber ? expenseToRemove.invoiceNumber.split('-DUP-')[0] : null;
                await supabase.from('floating_expenses').insert([{
                  description: expenseToRemove.description,
                  amount: expenseToRemove.amount,
                  receipt_url: expenseToRemove.receiptUrl || null,
                  shared_receipt_id: expenseToRemove.sharedReceiptId || null,
                  created_by: currentUser?.id || null,
                  branch_id: currentUser?.branch || 'T4',
                  approval_status: 'APPROVED',
                  closing_id: transaction.closing_id || null,
                  created_at: transaction.created_at || new Date().toISOString(),
                  invoice_number: originalInvoiceNumber,
                  vendor: expenseToRemove.vendor || null,
                  is_duplicate: expenseToRemove.is_duplicate || false
                }]);
            }
          }
        }
      }
      
      // Delete the transaction
      await accountingService.deleteTransaction(transaction.id);
      return transaction.id;
    },
    onSuccess: (_, transaction) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setSelectedTransaction(null);
      
      // Record audit log
      if (currentUser) {
        auditService.recordLog(
          currentUser,
          ActionType.TRANSACTION_DELETED,
          `Transacción eliminada`,
          undefined,
          'TRANSACTION',
          transaction.id
        );
      }
    }
  });

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            Historial de Transacciones
            {isFetching && <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />}
        </h3>
        
        <div className="flex flex-wrap gap-2 w-full md:w-auto items-center">
          {/* Filters */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1">
            <Calendar className="w-3 h-3 text-slate-400" />
            <input 
              type="date" 
              className="bg-transparent text-xs font-bold text-slate-600 outline-none w-28"
              value={startDate}
              onChange={e => { setStartDate(e.target.value); setPage(0); }}
              title="Fecha Inicio"
            />
            <span className="text-slate-300 text-xs">-</span>
            <input 
              type="date" 
              className="bg-transparent text-xs font-bold text-slate-600 outline-none w-28"
              value={endDate}
              onChange={e => { setEndDate(e.target.value); setPage(0); }}
              title="Fecha Fin"
            />
            {(startDate || endDate) && (
              <button 
                onClick={() => { setStartDate(''); setEndDate(''); setPage(0); }}
                className="p-1 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                title="Limpiar fechas"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <select 
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 outline-none"
            value={filterType}
            onChange={e => { setFilterType(e.target.value as any); setPage(0); }}
          >
            <option value="ALL">Todos los Tipos</option>
            <option value="INCOME">Ingresos</option>
            <option value="EXPENSE">Gastos</option>
          </select>

          <select 
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 outline-none"
            value={filterSource}
            onChange={e => { setFilterSource(e.target.value as any); setPage(0); }}
          >
            <option value="ALL">Todos los Orígenes</option>
            <option value="MANUAL">Manual</option>
            <option value="ORDER">Órdenes</option>
            <option value="STORE">Tienda</option>
          </select>

          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar por monto, proveedor, OCR..." 
              className="w-full pl-8 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
            />
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto min-h-[300px]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50 text-xs uppercase tracking-wider text-slate-500 font-bold border-b border-slate-100">
              <th className="px-6 py-4">Fecha</th>
              <th className="px-6 py-4">Descripción</th>
              <th className="px-6 py-4">Agregado por</th>
              <th className="px-6 py-4">Categoría</th>
              <th className="px-6 py-4">Origen</th>
              <th className="px-6 py-4 text-right">Monto</th>
              {currentUser?.email?.toLowerCase() === 'daruingmejia@gmail.com' && (
                <th className="px-6 py-4 text-right">Acciones</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {transactions.map((t) => (
              <tr 
                key={t.id} 
                onClick={() => setSelectedTransaction(t)}
                className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
              >
                <td className="px-6 py-4 text-sm text-slate-500 font-mono">
                  <div className="flex flex-col">
                    <span>{format(parseSafeDate(t.transaction_date), 'dd MMM yyyy', { locale: es })}</span>
                    {t.created_at && (
                      <span className="text-[10px] text-slate-400 mt-0.5">
                        {format(parseSafeDate(t.created_at), 'hh:mm a')}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-lg ${t.amount > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                      {t.amount > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
                    </div>
                    <div>
                        <span className="font-bold text-slate-700 text-sm truncate max-w-[200px] block">{t.description}</span>
                        {t.readable_id && <span className="text-[10px] font-bold text-slate-400 block mt-0.5">Ref: #{t.readable_id}</span>}
                        {t.receipt_url && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-indigo-500 font-medium mt-0.5">
                                <ImageIcon className="w-3 h-3" /> {t.shared_receipt_id ? 'Factura Compartida' : 'Recibo adjunto'}
                            </span>
                        )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600 font-medium">
                  {users.find(u => u.id === t.created_by)?.name || 'Desconocido'}
                </td>
                <td className="px-6 py-4">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-600 border border-slate-200">
                    {/* @ts-ignore */}
                    {t.category_name || (t.category_id ? t.category_id.slice(0, 8) : 'General')}
                  </span>
                </td>
                <td className="px-6 py-4">
                   {t.source === 'ORDER' && <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100"><Wrench className="w-3 h-3"/> TALLER</span>}
                   {t.source === 'STORE' && <span className="flex items-center gap-1 text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-100"><Store className="w-3 h-3"/> TIENDA</span>}
                   {(!t.source || t.source === 'MANUAL') && <span className="text-[10px] font-bold text-slate-400">MANUAL</span>}
                </td>
                <td className={`px-6 py-4 text-right font-black text-sm ${t.amount > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {t.amount > 0 ? '+' : ''}{t.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                </td>
                {currentUser?.email?.toLowerCase() === 'daruingmejia@gmail.com' && (
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTransaction(t);
                      }}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Editar transacción"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        
        {transactions.length === 0 && !isLoading && (
            <div className="p-12 text-center text-slate-400 text-sm">
              No se encontraron transacciones.
            </div>
        )}
      </div>

      {/* Pagination Controls */}
      <div className="p-4 border-t border-slate-100 flex justify-between items-center bg-slate-50/50">
        <button 
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg disabled:opacity-50 hover:bg-slate-50 transition"
        >
            Anterior
        </button>
        <span className="text-xs font-medium text-slate-500">Página {page + 1}</span>
        <button 
            onClick={() => setPage(p => p + 1)}
            disabled={transactions.length < pageSize}
            className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg disabled:opacity-50 hover:bg-slate-50 transition"
        >
            Siguiente
        </button>
      </div>

      {/* DRILL DOWN MODAL */}
      <AnimatePresence>
        {selectedTransaction && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedTransaction(null)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, x: 20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95, x: 20 }}
              className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 overflow-y-auto border-l border-slate-100"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h2 className="text-xl font-black text-slate-800">Detalle de Transacción</h2>
                <button onClick={() => setSelectedTransaction(null)} className="p-2 hover:bg-slate-200 rounded-full transition">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="text-center py-6 bg-slate-50 rounded-2xl border border-slate-100">
                   <p className="text-sm text-slate-500 font-bold uppercase mb-1">Monto Total</p>
                   <h1 className={`text-4xl font-black ${selectedTransaction.amount > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                     {selectedTransaction.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                   </h1>
                   {selectedTransaction.readable_id && (
                       <p className="text-xs font-bold text-slate-400 mt-2">Ref: #{selectedTransaction.readable_id}</p>
                   )}
                   <div className="flex flex-wrap gap-2 mt-3 justify-center">
                       <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${selectedTransaction.status === TransactionStatus.PENDING ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                          {selectedTransaction.status === TransactionStatus.PENDING ? '⏳ Pendiente' : '✅ Consolidado'}
                       </div>
                       {selectedTransaction.shared_receipt_id && (
                           <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
                               <ImageIcon className="w-3 h-3" /> Factura Compartida
                           </div>
                       )}
                   </div>
                </div>

                {/* RECEIPT IMAGE SECTION - LAZY LOADED */}
                {selectedTransaction.receipt_url && (
                    <div className="bg-slate-900 rounded-xl overflow-hidden shadow-lg relative group">
                        <img 
                            src={selectedTransaction.receipt_url} 
                            alt="Recibo" 
                            className="w-full h-auto max-h-64 object-contain bg-black/50"
                            loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                            <a 
                                href={selectedTransaction.receipt_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="px-4 py-2 bg-white text-slate-900 rounded-lg font-bold text-sm flex items-center gap-2 hover:scale-105 transition"
                            >
                                <Eye className="w-4 h-4" /> Ver Original
                            </a>
                        </div>
                    </div>
                )}

                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="bg-slate-100 p-2 rounded-lg"><Calendar className="w-5 h-5 text-slate-500"/></div>
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase">Fecha</p>
                      <p className="font-medium text-slate-700">
                        {format(parseSafeDate(selectedTransaction.transaction_date), 'PPP', { locale: es })}
                        {selectedTransaction.created_at && (
                          <span className="text-xs text-slate-400 ml-2">
                            {format(parseSafeDate(selectedTransaction.created_at), 'hh:mm a')}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="bg-slate-100 p-2 rounded-lg"><Tag className="w-5 h-5 text-slate-500"/></div>
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase">Categoría</p>
                      <p className="font-medium text-slate-700">
                        {/* @ts-ignore */}
                        {selectedTransaction.category_name || 'General'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="bg-slate-100 p-2 rounded-lg"><User className="w-5 h-5 text-slate-500"/></div>
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase">Agregado por</p>
                      <p className="font-medium text-slate-700">{users.find(u => u.id === selectedTransaction.created_by)?.name || 'Desconocido'}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="bg-slate-100 p-2 rounded-lg"><User className="w-5 h-5 text-slate-500"/></div>
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase">Proveedor / Beneficiario</p>
                      <p className="font-medium text-slate-700">{selectedTransaction.vendor || 'N/A'}</p>
                    </div>
                  </div>
                  
                  {/* Show OCR Text if available (for debugging or transparency) */}
                  {selectedTransaction.search_text && (
                      <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Datos Detectados (IA)</p>
                          <p className="text-xs text-slate-500 line-clamp-3 italic">
                              {selectedTransaction.search_text}
                          </p>
                      </div>
                  )}

                  {selectedTransaction.source === 'ORDER' && selectedTransaction.order_id && (
                    <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                         <span className="text-xs font-bold text-blue-600 uppercase flex items-center gap-1"><Wrench className="w-3 h-3"/> Origen: Orden de Taller</span>
                      </div>
                      <p className="text-sm text-blue-800 mb-3">{selectedTransaction.description}</p>
                      <Link 
                        to={`/orders/${selectedTransaction.order_id}`}
                        className="block w-full py-2 bg-blue-600 text-white text-center rounded-lg font-bold text-sm hover:bg-blue-700 transition"
                      >
                        Ver Orden Original
                      </Link>
                    </div>
                  )}
                </div>

                <div className="pt-6 border-t border-slate-100 flex gap-3">
                  {currentUser?.email?.toLowerCase() === 'daruingmejia@gmail.com' && (
                    <button 
                      onClick={() => {
                        setEditingTransaction(selectedTransaction);
                        setSelectedTransaction(null);
                      }}
                      className="flex-1 py-3 bg-blue-50 text-blue-600 rounded-xl font-bold hover:bg-blue-100 transition flex items-center justify-center gap-2"
                    >
                      <Edit className="w-4 h-4" /> Editar
                    </button>
                  )}
                  {selectedTransaction.status === TransactionStatus.PENDING && currentUser?.role !== UserRole.CASHIER && (
                    <button 
                      onClick={() => consolidateMutation.mutate(selectedTransaction)}
                      className="flex-1 py-3 bg-emerald-50 text-emerald-600 rounded-xl font-bold hover:bg-emerald-100 transition flex items-center justify-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" /> Consolidar
                    </button>
                  )}
                  {currentUser?.role !== UserRole.CASHIER && (
                    <button 
                      onClick={() => deleteMutation.mutate(selectedTransaction)}
                      className="flex-1 py-3 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" /> Eliminar
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <EditTransactionModal 
        isOpen={!!editingTransaction}
        onClose={() => setEditingTransaction(null)}
        transaction={editingTransaction}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['transactions'] });
          queryClient.invalidateQueries({ queryKey: ['kpis'] });
          queryClient.invalidateQueries({ queryKey: ['cashflow'] });
        }}
      />
    </div>
  );
};
