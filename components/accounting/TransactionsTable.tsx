import React, { useState, useEffect } from 'react';
import { Search, Filter, Download, ArrowUpRight, ArrowDownLeft, Eye, Trash2, Edit, X, Calendar, User, Tag, Store, Wrench, Image as ImageIcon, Loader2 } from 'lucide-react';
import { AccountingTransaction } from '../../types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { accountingService } from '../../services/accountingService';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useDebounce } from '../../hooks/useDebounce';

interface TransactionsTableProps {
  transactions?: AccountingTransaction[]; // Optional now as we fetch internally for pagination
}

export const TransactionsTable: React.FC<TransactionsTableProps> = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 500);
  const [selectedTransaction, setSelectedTransaction] = useState<AccountingTransaction | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 20;
  
  // Filters
  const [filterType, setFilterType] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
  const [filterSource, setFilterSource] = useState<'ALL' | 'MANUAL' | 'ORDER' | 'STORE'>('ALL');

  // Fetch transactions with pagination and search
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['transactions', page, debouncedSearch, filterType, filterSource],
    queryFn: () => accountingService.getTransactions({
        limit: pageSize,
        offset: page * pageSize,
        search: debouncedSearch,
        type: filterType === 'ALL' ? undefined : filterType,
        source: filterSource === 'ALL' ? undefined : filterSource
    }),
    keepPreviousData: true
  } as any);

  const transactions = (data as AccountingTransaction[]) || [];

  const deleteMutation = useMutation({
    mutationFn: accountingService.deleteTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setSelectedTransaction(null);
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
              <th className="px-6 py-4">Categoría</th>
              <th className="px-6 py-4">Origen</th>
              <th className="px-6 py-4 text-right">Monto</th>
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
                  {format(new Date(t.transaction_date), 'dd MMM', { locale: es })}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-lg ${t.amount > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                      {t.amount > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
                    </div>
                    <div>
                        <span className="font-bold text-slate-700 text-sm truncate max-w-[200px] block">{t.description}</span>
                        {t.receipt_url && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-indigo-500 font-medium mt-0.5">
                                <ImageIcon className="w-3 h-3" /> Recibo adjunto
                            </span>
                        )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-600 border border-slate-200">
                    {/* @ts-ignore */}
                    {t.category_name || t.category_id.slice(0, 8)}
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
                   <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold mt-3 ${selectedTransaction.status === 'PENDING' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                      {selectedTransaction.status === 'PENDING' ? '⏳ Pendiente' : '✅ Consolidado'}
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
                      <p className="font-medium text-slate-700">{format(new Date(selectedTransaction.transaction_date), 'PPP', { locale: es })}</p>
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
                  <button 
                    onClick={() => deleteMutation.mutate(selectedTransaction.id)}
                    className="flex-1 py-3 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" /> Eliminar
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
