import React, { useState, useMemo } from 'react';
import { useInventory } from '../../contexts/InventoryContext';
import { useAuth } from '../../contexts/AuthContext';
import { parseInventoryCategory, TransactionStatus, ExpenseDestination } from '../../types';
import { ShoppingCart, Plus, CheckCircle, Clock, FileText, Download, UploadCloud, BrainCircuit, RefreshCw, ChevronDown, ChevronRight, ChevronUp } from 'lucide-react';
import { accountingService } from '../../services/accountingService';
import { toast } from 'sonner';
import { AIReceiptScanner } from './AIReceiptScanner';

export const StorePurchasesTab = () => {
  const { inventory, addInventoryPart, updateInventoryPart } = useInventory();
  const { currentUser } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'LIST'|'PROVIDERS'>('LIST');
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    amount: 0,
    providerId: '',
    isCredit: false,
    paymentMethod: 'CASH' as import('../../types').PaymentMethod,
    creditPaid: false,
    receiptUrl: '',
    date: new Date().toISOString().split('T')[0]
  });

  const attributes = useMemo(() => {
    return inventory.filter(p => parseInventoryCategory(p.category).type === 'STORE_ATTRIBUTE');
  }, [inventory]);

  const providers = attributes.filter(a => (parseInventoryCategory(a.category) as any).subType === 'PROVIDER');

  const purchases = useMemo(() => {
    return inventory.filter(p => parseInventoryCategory(p.category).type === 'STORE_PURCHASE').sort((a,b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    });
  }, [inventory]);

  const registerAccountingExpense = async (title: string, amount: number, method: import('../../types').PaymentMethod = 'CASH', customDate?: string) => {
    try {
       const categories = await accountingService.getCategories();
       let catId = categories.find(c => c.name.toLowerCase().includes('inventario') || c.name.toLowerCase().includes('mercancía'))?.id;
       if (!catId) {
          const newCat = await accountingService.addCategory('Compra de Inventario Tienda', 'EXPENSE');
          if (newCat) catId = newCat.id;
       }
       if (catId) {
          const transactionDate = customDate || new Date().toISOString().split('T')[0];
          await accountingService.addTransaction({
             amount: -Math.abs(amount), // Expense is negative
             description: `Compra Tienda: ${title}`,
             transaction_date: transactionDate,
             created_at: new Date(transactionDate + 'T12:00:00Z').toISOString(),
             created_by: currentUser?.id || 'system',
             status: TransactionStatus.COMPLETED,
             category_id: catId,
             expense_destination: ExpenseDestination.STORE,
             source: 'STORE',
             branch: currentUser?.branch || 'T4',
             method: method
          });
       }
    } catch(err) {
       console.warn("Error recording accounting expense:", err);
    }
  };

  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.providerId || formData.amount <= 0 || !formData.date) {
      return toast.error("Llena todos los campos correctamente");
    }

    try {
      const newPart = await addInventoryPart({
        name: formData.title,
        stock: 0,
        cost: formData.amount,
        price: 0,
        category: JSON.stringify({
          type: 'STORE_PURCHASE',
          providerId: formData.providerId,
          isCredit: formData.isCredit,
          creditPaid: formData.creditPaid,
          usedAmount: 0,
          receiptUrl: formData.receiptUrl
        })
      });
      
      if (newPart && formData.date) {
        await updateInventoryPart(newPart.id, { created_at: new Date(formData.date + 'T12:00:00Z').toISOString() });
      }
      
      // Reflect expense if it's paid right away
      if (!formData.isCredit || formData.creditPaid) {
          await registerAccountingExpense(formData.title, formData.amount, formData.paymentMethod, formData.date);
      }
      
      toast.success("Gasto de compra registrado en inventario y contabilidad");
      setIsModalOpen(false);
    } catch (e) {
      toast.error("Error al registrar compra");
    }
  };

  const handlePayCredit = async (id: string, currentCategory: any, cost: number, title: string) => {
    const methodStr = prompt("¿Método de pago para saldar esta deuda? (Escribe 'CASH' para efectivo, 'TRANSFER' para transferencia)", "CASH");
    if (!methodStr) return;
    const method = methodStr.toUpperCase() === 'TRANSFER' ? 'TRANSFER' : 'CASH';

    if (confirm("¿Marcar este crédito como pagado usando " + method + " (se generará un gasto)?")) {
       await updateInventoryPart(id, {
          category: JSON.stringify({
            ...currentCategory,
            creditPaid: true
          })
       });
       await registerAccountingExpense(title, cost, method, new Date().toISOString().split('T')[0]);
       toast.success("Deuda saldada y gasto de contabilidad registrado.");
    }
  };

  const syncOldPurchases = async () => {
    if (!confirm("¿Deseas buscar las compras antiguas que no estén en contabilidad y registrarlas?")) return;
    toast.loading("Buscando compras antiguas...", { id: 'sync' });
    try {
      const txs = await accountingService.getTransactions();
      let added = 0;
      for (const p of purchases) {
          const desc = `Compra Tienda: ${p.name}`;
          const desc2 = `Compra: ${p.name}`;
          const exists = txs.find((t: any) => t.description === desc || t.description === desc2 || t.description.includes(p.name));
          if (!exists) {
              const cat = parseInventoryCategory(p.category) as any;
              if (!cat.isCredit || cat.creditPaid) {
                  const pDate = p.created_at ? p.created_at.split('T')[0] : new Date().toISOString().split('T')[0];
                  await registerAccountingExpense(p.name, p.cost, 'CASH', pDate);
                  added++;
              }
          }
      }
      toast.success(`Se agregaron ${added} compras antiguas a los gastos.`, { id: 'sync' });
    } catch (e) {
      toast.error("Error sincronizando", { id: 'sync' });
    }
  };

  const pendingDebtsByProvider = useMemo(() => {
    return providers.map(provider => {
      const providerPurchases = purchases.filter(p => {
         const cat = parseInventoryCategory(p.category) as any;
         return cat.providerId === provider.id && cat.isCredit && !cat.creditPaid;
      });
      const totalOwed = providerPurchases.reduce((acc, p) => acc + Math.abs(p.cost), 0);
      return { provider, purchases: providerPurchases, totalOwed };
    }).filter(p => p.totalOwed > 0).sort((a,b) => b.totalOwed - a.totalOwed);
  }, [providers, purchases]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
            Historial de Compras
          </h2>
          <p className="text-slate-500 font-medium">Registra compras a proveedores para luego asignar unidades y artículos a ellas.</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="flex flex-wrap items-center gap-3 justify-end">
            <button 
              onClick={syncOldPurchases}
              className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-4 py-4 rounded-2xl shadow-sm flex items-center gap-2 font-bold transition-transform hover:-translate-y-1 text-sm whitespace-nowrap"
            >
              <RefreshCw className="w-4 h-4" /> Sincronizar Antiguas
            </button>
            <button 
              onClick={() => setIsScannerOpen(!isScannerOpen)}
              className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-4 rounded-2xl shadow-xl shadow-slate-200 flex items-center gap-3 font-bold transition-transform hover:-translate-y-1 whitespace-nowrap"
            >
              <BrainCircuit className="w-5 h-5 text-indigo-400" /> Escáner AI
            </button>
            <button 
              onClick={() => { setFormData({ title: '', amount: 0, providerId: '', paymentMethod: 'CASH', isCredit: false, creditPaid: false, receiptUrl: '', date: new Date().toISOString().split('T')[0] }); setIsModalOpen(true); }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-4 rounded-2xl shadow-xl shadow-emerald-200 flex items-center gap-3 font-bold transition-transform hover:-translate-y-1 whitespace-nowrap"
            >
              <Plus className="w-5 h-5" /> Nueva Compra
            </button>
          </div>
          
          <div className="bg-slate-200/50 p-1 rounded-xl inline-flex">
            <button 
              onClick={() => setViewMode('LIST')}
              className={`px-4 py-2 font-bold text-sm rounded-lg transition-all ${viewMode === 'LIST' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Historial Completo
            </button>
            <button 
              onClick={() => setViewMode('PROVIDERS')}
              className={`px-4 py-2 font-bold text-sm rounded-lg transition-all flex items-center gap-2 ${viewMode === 'PROVIDERS' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Cuentas por Pagar
              {pendingDebtsByProvider.length > 0 && <span className="bg-amber-100 text-amber-700 w-5 h-5 rounded-full flex items-center justify-center text-[10px]">{pendingDebtsByProvider.length}</span>}
            </button>
          </div>
        </div>
      </div>

      {isScannerOpen && (
         <div className="mb-4">
             <AIReceiptScanner onClose={() => setIsScannerOpen(false)} />
         </div>
      )}

      <div className="grid gap-4">
        {viewMode === 'LIST' ? (
          <>
            {purchases.map(purchase => {
              const cat = parseInventoryCategory(purchase.category) as any;
              const provider = providers.find(p => p.id === cat.providerId);
              const isPending = cat.isCredit && !cat.creditPaid;
              const availableToAssign = purchase.cost - (cat.usedAmount || 0);
              
              return (
                <div key={purchase.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-md transition-shadow">
                   <div className="flex items-center gap-5">
                     <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg ${isPending ? 'bg-amber-500 shadow-amber-200' : 'bg-emerald-500 shadow-emerald-200'}`}>
                       {isPending ? <Clock className="w-7 h-7" /> : <CheckCircle className="w-7 h-7" />}
                     </div>
                     <div>
                       <h3 className="font-extrabold text-slate-800 text-xl tracking-tight">{purchase.name}</h3>
                       <p className="text-slate-500 font-medium flex-wrap flex items-center gap-2 mt-1">
                         <ShoppingCart className="w-4 h-4" /> Proveedor: <span className="text-slate-700 font-bold">{provider?.name || 'Desconocido'}</span>
                         <span className="text-slate-300">•</span>
                         <span className="text-slate-500 font-bold">{purchase.created_at ? new Date(purchase.created_at).toLocaleDateString() : 'Sin fecha'}</span>
                       </p>
                     </div>
                   </div>

                   <div className="flex items-center gap-8 bg-slate-50 p-4 rounded-2xl">
                     <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Total Compra</p>
                        <p className="font-black text-slate-800 text-lg">${purchase.cost.toLocaleString()}</p>
                     </div>
                     <div className="w-px h-8 bg-slate-200"></div>
                     <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Usado / Asignado</p>
                        <p className="font-black text-blue-600 text-lg">${(cat.usedAmount || 0).toLocaleString()}</p>
                     </div>
                     <div className="w-px h-8 bg-slate-200"></div>
                     <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Estado Pago</p>
                        {isPending ? (
                          <button onClick={() => handlePayCredit(purchase.id, cat, purchase.cost, purchase.name)} className="bg-amber-100 text-amber-700 px-3 py-1 rounded-lg text-xs font-bold hover:bg-amber-200 transition-colors mt-1">A Crédito (Pagar)</button>
                        ) : (
                          <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-lg text-xs font-bold mt-1 inline-block">Pagado</span>
                        )}
                     </div>
                   </div>
                </div>
              )
            })}
            {purchases.length === 0 && (
              <div className="text-center p-12 bg-white rounded-3xl border border-slate-200">
                 <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                 <p className="text-lg font-bold text-slate-600">No hay compras registradas</p>
              </div>
            )}
          </>
        ) : (
          <>
            {pendingDebtsByProvider.length === 0 ? (
              <div className="text-center p-12 bg-white rounded-3xl border border-slate-200">
                 <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
                 <p className="text-xl font-black text-emerald-700">¡Todo al día!</p>
                 <p className="text-lg font-medium text-slate-500 mt-2">No hay cuentas por pagar a ningún proveedor.</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {pendingDebtsByProvider.map(({ provider, purchases: providerPurchases, totalOwed }) => {
                  const isExpanded = expandedProvider === provider.id;
                  
                  return (
                    <div key={provider.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                      <div 
                        className="p-6 cursor-pointer flex justify-between items-center bg-slate-50"
                        onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center">
                            <Clock className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="font-extrabold text-slate-800 text-xl">{provider.name}</h3>
                            <p className="text-slate-500 font-bold text-sm mt-1">{providerPurchases.length} compras pendientes</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Total a Pagar</p>
                            <p className="font-black text-rose-600 text-2xl">${totalOwed.toLocaleString()}</p>
                          </div>
                          <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm text-slate-400">
                            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                          </div>
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className="p-4 border-t border-slate-200 bg-white">
                          <div className="space-y-3">
                            {providerPurchases.map(purchase => {
                              const cat = parseInventoryCategory(purchase.category) as any;
                              return (
                                <div key={purchase.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                                  <div>
                                    <p className="font-bold text-slate-800">{purchase.name}</p>
                                    <p className="text-xs font-bold text-slate-500 mt-1">{purchase.created_at ? new Date(purchase.created_at).toLocaleDateString() : 'Sin fecha'}</p>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <p className="font-black text-slate-800">${Math.abs(purchase.cost).toLocaleString()}</p>
                                    <button onClick={(e) => { e.stopPropagation(); handlePayCredit(purchase.id, cat, purchase.cost, purchase.name); }} className="bg-amber-100 text-amber-700 px-4 py-2 rounded-xl text-xs font-bold hover:bg-amber-200 transition-colors whitespace-nowrap hidden sm:block">Abonar / Pagar</button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl p-8" onClick={e => e.stopPropagation()}>
            <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">Registrar Compra</h2>
            <form onSubmit={handleCreatePurchase} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Descripción (Lote / Factura)</label>
                <input required autoFocus value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Ej. Lote iPhones Miami" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Proveedor</label>
                <select required value={formData.providerId} onChange={e => setFormData({...formData, providerId: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">Selecciona proveedor...</option>
                  {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Monto Total Invertido</label>
                <input type="number" required min="1" value={formData.amount || ''} onChange={e => setFormData({...formData, amount: Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-emerald-700 outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Fecha de Compra</label>
                <input type="date" required value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div className="pt-2 flex items-center gap-3">
                 <input type="checkbox" id="isCredit" checked={formData.isCredit} onChange={e => setFormData({...formData, isCredit: e.target.checked})} className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500" />
                 <label htmlFor="isCredit" className="font-bold text-slate-700 cursor-pointer">Compra a Crédito (Por pagar)</label>
              </div>
              {!formData.isCredit && (
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mt-4 mb-2">Método de Pago</label>
                    <div className="grid grid-cols-2 gap-2">
                       <label className={"flex items-center justify-center p-3 rounded-xl border-2 font-bold cursor-pointer transition-colors " + (formData.paymentMethod === 'CASH' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200')}>
                          <input type="radio" name="paymentMethod" value="CASH" checked={formData.paymentMethod === 'CASH'} onChange={() => setFormData({...formData, paymentMethod: 'CASH'})} className="hidden" />
                          Efectivo
                       </label>
                       <label className={"flex items-center justify-center p-3 rounded-xl border-2 font-bold cursor-pointer transition-colors " + (formData.paymentMethod === 'TRANSFER' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200')}>
                          <input type="radio" name="paymentMethod" value="TRANSFER" checked={formData.paymentMethod === 'TRANSFER'} onChange={() => setFormData({...formData, paymentMethod: 'TRANSFER'})} className="hidden" />
                          Transferencia
                       </label>
                    </div>
                  </div>
              )}
              <div className="flex gap-3 pt-6 mt-6 border-t border-slate-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200">Cancelar</button>
                <button type="submit" className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-200">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

