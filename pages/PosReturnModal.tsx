import React, { useState } from 'react';
import { Search, Loader2, X, RefreshCw, AlertTriangle, ArrowLeft, Package } from 'lucide-react';
import { supabase } from '../services/supabase';

interface PosReturnModalProps {
  onClose: () => void;
  onAddReturnItem: (productName: string, amountToRefund: number, partCost: number, originalOrderId: string, readableId: string, expenseId?: string, partId?: string) => void;
}

export const PosReturnModal: React.FC<PosReturnModalProps> = ({ onClose, onAddReturnItem }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchTerm.trim()) return;

    setLoading(true);
    try {
      const term = searchTerm.trim();
      const isNumeric = /^\d+$/.test(term);
      
      let query = supabase.from('orders').select('*').order('createdAt', { ascending: false }).limit(20);
      
      if (isNumeric) {
        if (term.length <= 9) {
          query = query.or(`readable_id.eq.${term},id.ilike.%${term}%,imei.ilike.%${term}%,customer->>phone.ilike.%${term}%,devicePassword.ilike.%${term}%`);
        } else {
          query = query.or(`id.ilike.%${term}%,imei.ilike.%${term}%,customer->>phone.ilike.%${term}%`);
        }
      } else {
        query = query.or(`id.ilike.%${term}%,customer->>name.ilike.%${term}%,customer->>phone.ilike.%${term}%,deviceModel.ilike.%${term}%,deviceIssue.ilike.%${term}%,imei.ilike.%${term}%,devicePassword.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setOrders(data || []);
      setSelectedOrder(null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            {selectedOrder ? (
              <button 
                onClick={() => setSelectedOrder(null)} 
                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors"
                title="Volver a los resultados"
              >
                <ArrowLeft className="w-5 h-5 text-slate-500" />
              </button>
            ) : (
              <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/50 rounded-full flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
            )}
            <div>
              <h2 className="text-xl font-black text-slate-800 dark:text-white">
                {selectedOrder ? `Factura #${selectedOrder.readable_id || selectedOrder.id.slice(-6)}` : 'Buscar Factura para Devolución'}
              </h2>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {selectedOrder ? selectedOrder.customer?.name : 'Ingresa el número de factura o cliente'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-full text-slate-600 dark:text-slate-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {!selectedOrder ? (
          <>
            {/* Search */}
            <form onSubmit={handleSearch} className="p-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text"
                    autoFocus
                    placeholder="Ej. 6054, Juan Perez, iPhone 13, Pantalla, INV-123..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl font-medium text-slate-800 dark:text-white outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all text-lg"
                  />
                </div>
                <button 
                  type="submit" 
                  disabled={loading || !searchTerm.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 rounded-xl font-bold flex items-center gap-2 transition-colors"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin"/> : 'Buscar'}
                </button>
              </div>
            </form>

            {/* Results */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 dark:bg-slate-900/50 min-h-[300px]">
              {loading ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin mb-4" />
                  <p className="font-medium text-sm">Buscando facturas...</p>
                </div>
              ) : orders.length === 0 && searchTerm ? (
                 <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                  <AlertTriangle className="w-12 h-12 mb-4 opacity-20" />
                  <p className="font-bold text-lg">No se encontraron resultados</p>
                  <p className="text-sm">Verifica el número e intenta nuevamente.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {orders.map(order => (
                    <div 
                      key={order.id} 
                      onClick={() => setSelectedOrder(order)}
                      className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 font-bold group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                          {order.orderType === 'STORE' || order.orderType === 'PART_ONLY' ? <Package className="w-6 h-6"/> : <RefreshCw className="w-6 h-6"/>}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 dark:text-white text-lg flex items-center gap-2">
                            #{order.readable_id || order.id.slice(-6)}
                            <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 px-2 py-0.5 rounded-lg uppercase tracking-wider">
                              {order.orderType === 'PART_ONLY' ? 'Venta POS' : 'Reparación'}
                            </span>
                          </p>
                          <p className="text-sm font-medium text-slate-500">{order.customer?.name || 'Cliente sin nombre'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-slate-800 dark:text-white text-lg">${(order.finalPrice || order.totalAmount || 0).toLocaleString()}</p>
                        <p className="text-xs text-slate-400 font-medium">{new Date(order.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col">
            <div className="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-300 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800/50 mb-6 flex items-start gap-3">
               <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5"/>
               <div className="text-sm">
                 <p className="font-bold mb-1">Selecciona los artículos a devolver</p>
                 <p className="opacity-90 leading-relaxed">Haz clic en "Devolver" en los artículos que el cliente desea retornar. El sistema los añadirá automáticamente al carrito con valor negativo para su reembolso o cambio.</p>
               </div>
            </div>

            <div className="space-y-4 flex-1">
              {/* Product Expenses (if it's a sale) */}
              {selectedOrder.expenses && Array.isArray(selectedOrder.expenses) && selectedOrder.expenses.length > 0 ? (
                <>
                  <h3 className="font-bold text-slate-800 dark:text-white text-sm uppercase tracking-wider mb-2">Artículos Facturados</h3>
                  {selectedOrder.expenses.map((expense: any) => (
                    <div key={expense.id} className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                       <div>
                         <p className="font-bold text-slate-800 dark:text-white">{expense.description}</p>
                         <p className="text-sm font-medium text-slate-500">Valor Pagado: <span className="text-slate-800 dark:text-slate-300 font-bold">${(expense.cost || 0).toLocaleString()}</span></p>
                       </div>
                       <button 
                         onClick={() => {
                           onAddReturnItem(
                             expense.description || 'Artículo',
                             expense.cost || 0,
                             expense.partCost || 0,
                             selectedOrder.id,
                             selectedOrder.readable_id?.toString() || selectedOrder.id.slice(-6),
                             expense.id,
                             expense.partId
                           );
                           onClose();
                         }}
                         className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-4 py-2 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors sm:w-auto w-full"
                       >
                         <RefreshCw className="w-4 h-4"/> 
                         Devolver
                       </button>
                    </div>
                  ))}
                </>
              ) : (
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 text-center">
                   <Package className="w-10 h-10 text-slate-300 mx-auto mb-3"/>
                   <p className="font-bold text-slate-700 dark:text-slate-200 mb-1">Sin detalles de artículos</p>
                   <p className="text-sm text-slate-500 mb-6">Esta factura es un servicio u orden de reparación sin artículos listados, o es un formato antiguo. Igualmente, puedes devolver un monto manual equivalente al total.</p>
                   
                   <div className="border-t border-slate-100 dark:border-slate-700 pt-6">
                     <p className="font-medium text-slate-500 text-sm mb-2">Total Pagado en Orden: <span className="font-bold text-slate-800 dark:text-white">${(selectedOrder.finalPrice || selectedOrder.totalAmount || 0).toLocaleString()}</span></p>
                     <button
                        onClick={() => {
                           onAddReturnItem(
                             `Devolución general en Orden #${selectedOrder.readable_id || selectedOrder.id.slice(-6)}`,
                             (selectedOrder.finalPrice || selectedOrder.totalAmount || 0),
                             0,
                             selectedOrder.id,
                             selectedOrder.readable_id?.toString() || selectedOrder.id.slice(-6)
                           );
                           onClose();
                         }}
                         className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-6 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors mx-auto"
                     >
                       <RefreshCw className="w-4 h-4"/>
                       Devolver Total Completo
                     </button>
                   </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
