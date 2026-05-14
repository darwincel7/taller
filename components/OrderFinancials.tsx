import React, { useState } from 'react';
import { Expense, RepairOrder, OrderType, InventoryPart, LogType, ActionType } from '../types';
import { DollarSign, Trash2, Plus, Package, TrendingUp, Edit2, X, Save as SaveIcon, Scissors, Check, FileText, Download, Camera, Maximize2 } from 'lucide-react';
import { useOrders } from '../contexts/OrderContext';
import { useInventory } from '../contexts/InventoryContext';
import { useAuth } from '../contexts/AuthContext';
import { auditService } from '../services/auditService';
import { InventoryUsageModal } from './modals/InventoryUsageModal';
import { InventorySelectorModal } from './modals/InventorySelectorModal';
import { AddExpenseModal } from './orders/AddExpenseModal';
import { FloatingExpensesModal } from './orders/FloatingExpensesModal';
import { supabase } from '../services/supabase';

interface OrderFinancialsProps {
  order: RepairOrder;
  expensesList: Expense[];
  setExpensesList: (list: Expense[]) => void;
  canViewAccounting: boolean;
  handleUpdate: (auditReason?: string) => void;
  finalPriceInput: string;
  setFinalPriceInput: (val: string) => void;
  isSaving: boolean;
  onAddExpense: (desc: string, amount: number, receiptUrl?: string, sharedReceiptId?: string, readableId?: number, isExternal?: boolean, closingId?: string, createdAt?: string, invoiceNumber?: string, vendor?: string, isDuplicate?: boolean, createdBy?: string, isInventory?: boolean, branchId?: string) => Promise<void>;
  onAddExpenses?: (expensesToAdd: {desc: string, amount: number, receiptUrl?: string, sharedReceiptId?: string, readableId?: number, isExternal?: boolean, closingId?: string, createdAt?: string, invoiceNumber?: string, vendor?: string, isDuplicate?: boolean, createdBy?: string, isInventory?: boolean, branchId?: string}[]) => Promise<void>;
  onRemoveExpense: (id: string) => Promise<void>;
  onEditExpense: (id: string, newDesc: string, newAmount: number) => Promise<void>;
  canEdit: boolean;
  canEditPrice?: boolean;
  onPermissionError?: () => void;
}

export const OrderFinancials: React.FC<OrderFinancialsProps> = ({
  order,
  expensesList,
  canViewAccounting,
  handleUpdate,
  finalPriceInput,
  setFinalPriceInput,
  isSaving,
  onAddExpense,
  onAddExpenses,
  onRemoveExpense,
  onEditExpense,
  canEdit,
  canEditPrice = canEdit,
  onPermissionError
}) => {
  const { updateOrderDetails, showNotification, recordOrderLog } = useOrders();
  const { inventory, updateInventoryPart } = useInventory();
  const { currentUser } = useAuth();
  
  // State for adding/editing
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  
  const [showInventorySelect, setShowInventorySelect] = useState(false);
  const [selectedPart, setSelectedPart] = useState<InventoryPart | null>(null);
  
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [showFloatingExpensesModal, setShowFloatingExpensesModal] = useState(false);
  const [floatingCount, setFloatingCount] = useState(0);
  const [selectedExpenseForModal, setSelectedExpenseForModal] = useState<Expense | null>(null);
  const [showFullImage, setShowFullImage] = useState<string | null>(null);

  // Fetch floating expenses count
  React.useEffect(() => {
      const fetchFloatingCount = async () => {
          const { count, error } = await supabase
              .from('floating_expenses')
              .select('*', { count: 'exact', head: true })
              .neq('description', 'RECEIPT_UPLOAD_TRIGGER')
              .eq('approval_status', 'APPROVED')
              .eq('branch_id', order.currentBranch || 'T4');
          
          if (!error && count !== null) {
              setFloatingCount(count);
          }
      };
      fetchFloatingCount();
  }, [order.currentBranch]);

  // Local state for Store Stock specific fields
  const [purchaseCostInput, setPurchaseCostInput] = useState(() => {
      const val = order.purchaseCost ?? order.estimatedCost ?? 0;
      return isNaN(val) ? '0' : val.toString();
  });
  const [targetPriceInput, setTargetPriceInput] = useState(() => {
      const val = order.targetPrice ?? 0;
      return isNaN(val) ? '0' : val.toString();
  });

  const triggerError = () => {
      if (onPermissionError) onPermissionError();
      else showNotification('error', 'ACCESO DENEGADO');
  };

  const handleSubmitExpense = () => {
      if (!canEdit) {
          triggerError();
          return;
      }
      const amount = parseFloat(expenseAmount);
      if (!expenseDesc || isNaN(amount) || amount <= 0) return;

      if (editingExpenseId) {
          onEditExpense(editingExpenseId, expenseDesc, amount);
          setEditingExpenseId(null);
      } else {
          onAddExpense(expenseDesc, amount);
      }
      
      setExpenseDesc('');
      setExpenseAmount('');
  };

  const startEdit = (e: React.MouseEvent, exp: Expense) => {
      e.stopPropagation();
      if (!canEdit) {
          triggerError();
          return;
      }
      setEditingExpenseId(exp.id);
      setExpenseDesc(exp.description);
      setExpenseAmount(exp.amount.toString());
  };

  const cancelEdit = () => {
      setEditingExpenseId(null);
      setExpenseDesc('');
      setExpenseAmount('');
  };

  const handleAddSimpleExpense = async (desc: string, amount: number, receiptUrl: string, invoiceNumber?: string, vendor?: string, isDuplicate?: boolean) => {
      await onAddExpense(desc, amount, receiptUrl, undefined, undefined, undefined, undefined, undefined, invoiceNumber, vendor, isDuplicate);
      showNotification('success', 'Gasto registrado con factura.');
  };

  const handleAddMultipleExpense = async (
      currentOrderExpenses: { desc: string; amount: number }[],
      floatingExpenses: { desc: string; amount: number }[],
      receiptUrl: string,
      sharedReceiptId: string,
      invoiceNumber?: string,
      vendor?: string,
      isDuplicate?: boolean
  ) => {
      // 1. Add to current order
      if (currentOrderExpenses.length > 0) {
          if (onAddExpenses) {
              const expensesToAdd = currentOrderExpenses.map((exp, index) => ({
                  desc: exp.desc,
                  amount: exp.amount,
                  receiptUrl,
                  sharedReceiptId,
                  invoiceNumber,
                  vendor,
                  isDuplicate: isDuplicate || index > 0
              }));
              await onAddExpenses(expensesToAdd);
          } else {
              for (let i = 0; i < currentOrderExpenses.length; i++) {
                  const exp = currentOrderExpenses[i];
                  await onAddExpense(exp.desc, exp.amount, receiptUrl, sharedReceiptId, undefined, undefined, undefined, undefined, invoiceNumber, vendor, isDuplicate || i > 0);
              }
          }
      }

      // 2. Add to floating expenses
      if (floatingExpenses.length > 0) {
          let savedCount = 0;
          let errors: string[] = [];
          
          for (let i = 0; i < floatingExpenses.length; i++) {
              const exp = floatingExpenses[i];
              try {
                  const floatingData = {
                      description: exp.desc,
                      amount: exp.amount,
                      receipt_url: receiptUrl || null,
                      shared_receipt_id: sharedReceiptId || null,
                      created_by: currentUser?.id || null,
                      branch_id: order.currentBranch || 'T4',
                      invoice_number: invoiceNumber || null,
                      vendor: vendor || null,
                      is_duplicate: isDuplicate || currentOrderExpenses.length > 0 || i > 0
                  };

                  const { error } = await supabase.from('floating_expenses').insert([floatingData]);
                  if (error) throw error;
                  
                  if (currentUser) {
                      await auditService.recordLog(
                          { id: currentUser.id, name: currentUser.name },
                          'CREATE_EXPENSE',
                          `Creó gasto flotante (desde Factura Compartida): ${exp.desc} (${exp.amount})`,
                          undefined,
                          'TRANSACTION',
                          sharedReceiptId
                      );
                  }
                  savedCount++;
              } catch (err: any) {
                  console.warn("Error inserting floating expense:", err);
                  errors.push(`${exp.desc}: ${err.message || 'Error desconocido'}`);
              }
          }
          
          if (errors.length > 0) {
              alert(`Se guardaron ${savedCount} de ${floatingExpenses.length} gastos flotantes.\nErrores:\n${errors.join('\n')}`);
          } else {
              alert(`Se guardaron correctamente los ${savedCount} gastos flotantes.`);
          }
      }

      if (currentOrderExpenses.length > 0 && floatingExpenses.length === 0) {
          // The alert is already handled by onAddExpenses
      }
  };

  const handleSelectPart = (part: InventoryPart) => {
      if (!canEdit) {
          triggerError();
          setShowInventorySelect(false);
          return;
      }
      setSelectedPart(part);
      setShowInventorySelect(false);
  };

  const confirmInventoryUsage = async (mode: 'UNIT' | 'FRACTION', amount?: number) => {
      if (!selectedPart) return;

      const { data: userData } = await supabase.auth.getUser();
      const userName = userData.user?.user_metadata?.name || userData.user?.email || 'Sistema';

      if (mode === 'FRACTION' && amount) {
          // LOGICA PARCIAL (DIVIDIR)
          const newCost = selectedPart.cost - amount;
          await updateInventoryPart(selectedPart.id, { cost: newCost });
          
          await supabase.from('audit_logs').insert([{
              action: 'INVENTORY_EXTRACTION',
              details: `[INV_ID: ${selectedPart.id}] Extracción Fraccionada: $${amount} de ${selectedPart.name} para Orden #${order.readable_id || order.id.slice(-4)}`,
              user_id: userData.user?.id,
              user_name: userName,
              order_id: order.id,
              created_at: Date.now()
          }]);

          onAddExpense(`Parte de ${selectedPart.name}`, amount, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, true);
          showNotification('success', `Repuesto particionado. Nuevo valor en inventario: $${newCost}`);

      } else if (mode === 'UNIT') {
          // LOGICA ESTANDAR (Unidad completa)
          if (selectedPart.stock > 0) {
              const { data: userData } = await supabase.auth.getUser();
              const userName = userData.user?.user_metadata?.name || 'Sistema';
              
              // Usar la RPC oficial para descontar stock con trazabilidad
              const { error: consumeErr } = await supabase.rpc('consume_inventory_item', {
                  p_item_id: selectedPart.id,
                  p_quantity: 1,
                  p_source_type: 'ORDER',
                  p_source_id: order.id,
                  p_reason: `Extracción para Orden #${order.readable_id || order.id.slice(0, 8)}`,
                  p_user_id: userData.user?.id || currentUser?.id || null
              });

              if (consumeErr) {
                  showNotification('error', `Error al descontar inventario: ${consumeErr.message}`);
                  return;
              }
              
              // audit_logs is already covered by the RPC, but we can keep it if we want extra details,
              // or drop it. We'll drop the manual audit_logs insert as consume_inventory_item handles it and inventory_movements.

              onAddExpense(selectedPart.name, selectedPart.cost, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, true); 
          } else {
              alert("No hay stock de esta pieza.");
          }
      }
      setSelectedPart(null);
  };

  const handleStoreFinancialUpdate = async () => {
      if (!canEditPrice) {
          triggerError();
          return;
      }
      const pCost = parseFloat(purchaseCostInput) || 0;
      const tPrice = parseFloat(targetPriceInput) || 0;
      
      const oldPCost = order.purchaseCost || 0;
      const oldTPrice = order.targetPrice || 0;
      
      await updateOrderDetails(order.id, { purchaseCost: pCost, targetPrice: tPrice });
      
      if (pCost !== oldPCost) {
          await recordOrderLog(
              order.id, 
              ActionType.COST_UPDATED, 
              `📉 COSTO COMPRA ACTUALIZADO: $${oldPCost} ➔ $${pCost}`, 
              { oldPCost, newPCost: pCost }, 
              LogType.INFO, 
              currentUser?.name
          );
      }
      
      if (tPrice !== oldTPrice) {
          await recordOrderLog(
              order.id, 
              ActionType.TARGET_PRICE_UPDATED, 
              `📈 PRECIO VENTA OBJETIVO ACTUALIZADO: $${oldTPrice} ➔ $${tPrice}`, 
              { oldTPrice, newTPrice: tPrice }, 
              LogType.INFO, 
              currentUser?.name
          );
      }
  };

  const handleClientPriceBlur = () => {
      if (!canEditPrice) {
          triggerError();
          return;
      }
      
      // CHECK IF PRICE CHANGED
      const newPrice = parseFloat(finalPriceInput);
      const currentPrice = order.totalAmount ?? (order.finalPrice !== undefined && order.finalPrice > 0 ? order.finalPrice : order.estimatedCost);
      
      if (!isNaN(newPrice) && newPrice !== currentPrice) {
          const reason = window.prompt("⚠️ AUDITORÍA REQUERIDA:\n\nEstá modificando el precio final de la orden.\nPor favor, ingrese el motivo del cambio (Error, Descuento, etc):");
          
          if (!reason || reason.trim().length < 3) {
              alert("Modificación cancelada. Se requiere un motivo válido.");
              setFinalPriceInput(currentPrice.toString()); // Revert
              return;
          }
          
          handleUpdate(reason);
      } else {
          handleUpdate();
      }
  };

  const currentTotalExpenses = expensesList.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) + (order.partsCost || 0);
  
  // Logic for CLIENT REPAIR
  const totalToCharge = parseFloat(finalPriceInput) || 0;
  const currentProfit = totalToCharge - currentTotalExpenses;
  
  // Logic for Payments (Deposits)
  const totalPaid = (order.payments || []).reduce((sum, p) => sum + p.amount, 0);
  const remainingBalance = totalToCharge - totalPaid;
  
  // Logic for STORE STOCK (RECIBIDOS)
  const purchaseCost = parseFloat(purchaseCostInput) || 0;
  const totalInvestment = purchaseCost + currentTotalExpenses;
  const targetPrice = parseFloat(targetPriceInput) || 0;
  const projectedMargin = targetPrice - totalInvestment;

  const getExpenseAddedBy = (exp: Expense) => {
      if (exp.addedBy) return exp.addedBy;
      
      // Fallback to history logs for older expenses
      const log = order.history?.find(h => 
          (h.action_type === 'EXPENSE_ADDED' || h.action_type === 'EXPENSE_ASSIGNED') && 
          h.metadata?.description === exp.description && 
          h.metadata?.amount === exp.amount
      );
      
      if (log) return log.technician;
      
      const fallbackLog = order.history?.find(h => 
          h.note?.includes(`GASTO AGREGADO: ${exp.description}`) ||
          h.note?.includes(`Gasto en espera asignado: ${exp.description}`)
      );
      
      return fallbackLog?.technician;
  };

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm h-full flex flex-col relative">
        
        {/* --- MODAL INVENTORY --- */}
        {selectedPart && (
            <InventoryUsageModal 
                part={selectedPart}
                onConfirm={confirmInventoryUsage}
                onCancel={() => setSelectedPart(null)}
            />
        )}

        {/* --- HEADER --- */}
        <div className="flex justify-between items-center mb-4">
            <h4 className="font-bold text-slate-700 flex items-center gap-2 text-xs uppercase">
                <DollarSign className="w-4 h-4 text-red-500 bg-red-100 rounded-full p-0.5"/> 
                GASTOS Y REPUESTOS
            </h4>
            <button 
                type="button" 
                onClick={() => setShowInventorySelect(!showInventorySelect)}
                className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded flex items-center gap-1 hover:bg-blue-100 font-bold transition"
            >
                <Package className="w-3 h-3" /> Usar Inventario
            </button>
        </div>

        {/* TOTAL GASTOS ROW */}
        {canViewAccounting && (
            <div className="flex justify-between items-center bg-slate-50 p-2 rounded mb-4 border border-slate-100">
                <span className="text-[10px] font-bold text-slate-500 uppercase">TOTAL GASTOS</span>
                <span className="font-bold text-slate-800 text-sm">-${currentTotalExpenses.toLocaleString()}</span>
            </div>
        )}

        {/* --- INVENTORY SELECTOR MODAL --- */}
        {showInventorySelect && (
            <InventorySelectorModal
                inventory={inventory}
                onSelect={(part) => {
                    handleSelectPart(part);
                    setShowInventorySelect(false);
                }}
                onClose={() => setShowInventorySelect(false)}
            />
        )}
        
        {/* --- EXPENSE LIST --- */}
        <div className="flex-1 overflow-y-auto min-h-0 mb-2 pr-1 custom-scrollbar">
            <div className="space-y-1">
                {expensesList.length === 0 ? (
                    <div className="p-2 text-center text-slate-300 text-[10px] italic bg-slate-50 rounded border border-slate-100">
                        Sin gastos registrados.
                    </div>
                ) : (
                    expensesList.map(exp => (
                        <div 
                            key={exp.id} 
                            onClick={() => setSelectedExpenseForModal(exp)}
                            className="flex justify-between items-center p-1.5 hover:bg-slate-50 rounded border border-transparent hover:border-slate-100 transition group cursor-pointer"
                        >
                            <div className="flex items-center gap-2">
                                <div className="bg-slate-100 p-1 rounded text-slate-400">
                                    <Package className="w-3 h-3" />
                                </div>
                                <div className="flex flex-col">
                                    <p className="text-[11px] font-bold text-slate-700 leading-tight flex items-center gap-1">
                                        {exp.readable_id && <span className="text-slate-400 font-medium">#{exp.readable_id}</span>}
                                        {exp.description}
                                        {exp.receiptUrl && (
                                            <span title={exp.sharedReceiptId ? "Ver Factura Compartida" : "Ver Factura"} className="text-blue-500">
                                                <FileText className="w-3 h-3" />
                                            </span>
                                        )}
                                    </p>
                                    {exp.invoiceNumber && (
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[9px] text-slate-500 font-medium">
                                                Factura: {exp.invoiceNumber}
                                            </span>
                                            {exp.is_duplicate && (
                                                <span className="bg-amber-100 text-amber-700 px-1 py-0.5 rounded-[4px] text-[8px] font-black uppercase tracking-tighter border border-amber-200 leading-none">
                                                    DUPLICADA
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    {getExpenseAddedBy(exp) && (
                                        <span className="text-[9px] text-slate-400 font-medium">
                                            Por: {getExpenseAddedBy(exp)}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {canViewAccounting && (
                                    <span className="font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded text-[10px] border border-red-100">
                                        -${exp.amount.toLocaleString()}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>

        {/* --- ADD EXPENSE INPUTS --- */}
        {canEdit && (
            <div className="flex flex-col gap-2 mb-6">
                <div className="flex gap-2">
                    <button 
                        type="button" 
                        onClick={() => setShowAddExpenseModal(true)} 
                        disabled={isSaving}
                        className="flex-1 bg-blue-600 text-white p-2 rounded-lg flex items-center justify-center gap-2 hover:bg-blue-700 transition shadow-sm font-bold text-xs"
                    >
                        <Camera className="w-4 h-4"/> Agregar gasto externo
                    </button>
                    <button 
                        type="button" 
                        onClick={() => setShowFloatingExpensesModal(true)} 
                        disabled={isSaving}
                        className="flex-1 bg-amber-50 text-amber-600 border border-amber-200 p-2 rounded-lg flex items-center justify-center gap-2 hover:bg-amber-100 transition shadow-sm font-bold text-xs relative"
                    >
                        <Download className="w-4 h-4"/> 
                        Gastos Flotantes
                        {floatingCount > 0 && (
                            <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center animate-bounce shadow-lg border border-white">
                                {floatingCount}
                            </span>
                        )}
                    </button>
                </div>
                
                <div className="flex gap-2 mt-2">
                    <input 
                        placeholder="Gasto rápido sin factura..."
                        className="flex-1 p-2 text-xs border border-slate-200 rounded outline-none focus:border-slate-400 transition bg-white text-slate-900 placeholder:text-slate-400 font-medium"
                        value={expenseDesc}
                        onChange={e => setExpenseDesc(e.target.value)}
                    />
                    <input 
                        type="number" 
                        placeholder="0.00" 
                        className="w-20 p-2 text-xs border border-slate-200 rounded outline-none focus:border-slate-400 transition text-right bg-white text-slate-900 placeholder:text-slate-400 font-bold"
                        value={expenseAmount}
                        onChange={e => setExpenseAmount(e.target.value)}
                    />
                    <button 
                        type="button" 
                        onClick={handleSubmitExpense} 
                        disabled={isSaving}
                        className="bg-slate-900 text-white w-9 h-9 rounded flex items-center justify-center hover:bg-black transition shadow-sm disabled:opacity-50"
                    >
                        {editingExpenseId ? <SaveIcon className="w-4 h-4"/> : <Plus className="w-4 h-4"/>}
                    </button>
                    {editingExpenseId && (
                        <button type="button" onClick={cancelEdit} className="bg-slate-200 text-slate-500 w-9 h-9 rounded flex items-center justify-center hover:bg-slate-300"><X className="w-4 h-4"/></button>
                    )}
                </div>
            </div>
        )}

        {/* --- MODALS --- */}
        {showAddExpenseModal && (
            <AddExpenseModal 
                onClose={() => setShowAddExpenseModal(false)}
                onAddSimple={handleAddSimpleExpense}
                onAddMultiple={handleAddMultipleExpense}
            />
        )}
        {showFloatingExpensesModal && (
            <FloatingExpensesModal 
                onClose={() => setShowFloatingExpensesModal(false)}
                onAssign={async (floatingExp) => {
                    await onAddExpense(floatingExp.description, floatingExp.amount, floatingExp.receipt_url, floatingExp.shared_receipt_id, floatingExp.readable_id, true, floatingExp.closing_id, floatingExp.created_at, floatingExp.invoice_number, floatingExp.vendor, floatingExp.is_duplicate, floatingExp.created_by, false, floatingExp.branch_id);
                    if (recordOrderLog) {
                        await recordOrderLog(
                            order.id,
                            'EXPENSE_ASSIGNED' as ActionType,
                            `📥 Gasto en espera asignado: ${floatingExp.description} ($${floatingExp.amount})`,
                            null,
                            LogType.INFO,
                            currentUser?.name || 'Usuario'
                        );
                    }
                    // The modal will handle deleting the floating expense after calling onAssign
                }}
            />
        )}
        {selectedExpenseForModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setSelectedExpenseForModal(null)}>
                <div 
                    className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden relative animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]" 
                    onClick={e => e.stopPropagation()}
                >
                    <div className="bg-slate-50 p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-100 p-2.5 rounded-2xl text-blue-600">
                                <FileText className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-slate-800 tracking-tight leading-none mb-1">Detalle del Gasto</h3>
                                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Información y comprobante</p>
                            </div>
                        </div>
                        <button onClick={() => setSelectedExpenseForModal(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-6 overflow-y-auto flex-1 space-y-6">
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Descripción</p>
                                <p className="text-sm font-bold text-slate-800">
                                    {selectedExpenseForModal.description}
                                    {selectedExpenseForModal.readable_id && (
                                        <span className="ml-2 text-xs font-bold text-slate-400">Ref: #{selectedExpenseForModal.readable_id}</span>
                                    )}
                                </p>
                            </div>
                            {selectedExpenseForModal.invoiceNumber && (
                                <div className="border-t border-slate-200 pt-3">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Número de Factura</p>
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-bold text-slate-700">{selectedExpenseForModal.invoiceNumber}</p>
                                        {selectedExpenseForModal.is_duplicate && (
                                            <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter border border-amber-200">
                                                DUPLICADA
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                            <div className="flex justify-between items-center border-t border-slate-200 pt-3">
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Fecha</p>
                                    <p className="text-xs font-medium text-slate-600">{new Date(selectedExpenseForModal.date).toLocaleString()}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Monto</p>
                                    <p className="text-lg font-black text-red-600">${selectedExpenseForModal.amount.toLocaleString()}</p>
                                </div>
                            </div>
                            
                            {canEdit && (
                                <div className="border-t border-slate-200 pt-3 flex justify-end gap-2">
                                    <button 
                                        onClick={() => {
                                            startEdit({ stopPropagation: () => {} } as any, selectedExpenseForModal);
                                            setSelectedExpenseForModal(null);
                                        }}
                                        className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1"
                                    >
                                        <Edit2 className="w-3 h-3" /> Editar Gasto
                                    </button>
                                    <button 
                                        onClick={() => {
                                            onRemoveExpense(selectedExpenseForModal.id);
                                            setSelectedExpenseForModal(null);
                                        }}
                                        className="text-xs font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors flex items-center gap-1"
                                    >
                                        <X className="w-3 h-3" /> Eliminar Gasto
                                    </button>
                                </div>
                            )}
                        </div>

                        {selectedExpenseForModal.receiptUrl ? (
                            <div className="space-y-2">
                                <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                                    <Camera className="w-3 h-3"/> Comprobante / Factura
                                    {selectedExpenseForModal.sharedReceiptId && (
                                        <span className="ml-2 bg-blue-100 text-blue-600 px-2 py-0.5 rounded text-[9px]">Factura Compartida</span>
                                    )}
                                </p>
                                <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50 relative group">
                                    <img 
                                        src={selectedExpenseForModal.receiptUrl} 
                                        alt="Comprobante" 
                                        className="w-full h-auto object-contain max-h-[400px] cursor-zoom-in hover:opacity-90 transition-opacity"
                                        referrerPolicy="no-referrer"
                                        onClick={() => setShowFullImage(selectedExpenseForModal.receiptUrl!)}
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                        <div className="bg-black/50 text-white px-4 py-2 rounded-full flex items-center gap-2 backdrop-blur-sm">
                                            <Maximize2 className="w-4 h-4" />
                                            <span>Click para ampliar</span>
                                        </div>
                                    </div>
                                    <a 
                                        href={selectedExpenseForModal.receiptUrl} 
                                        target="_blank" 
                                        rel="noreferrer"
                                        className="absolute bottom-4 right-4 bg-slate-900/80 text-white px-4 py-2 rounded-xl text-xs font-bold backdrop-blur-sm hover:bg-black transition-colors flex items-center gap-2 opacity-0 group-hover:opacity-100 pointer-events-auto"
                                    >
                                        <Download className="w-4 h-4"/> Abrir Original
                                    </a>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-slate-50 border border-slate-200 border-dashed rounded-2xl p-8 text-center flex flex-col items-center justify-center text-slate-400">
                                <FileText className="w-12 h-12 mb-3 opacity-20" />
                                <p className="text-sm font-bold">Sin comprobante</p>
                                <p className="text-xs mt-1">Este gasto se registró sin imagen adjunta.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* --- RESUMEN FINANCIERO SECTION --- */}
        <div className="mt-auto">
            <h4 className="font-bold text-slate-700 text-[10px] uppercase mb-3 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> RESUMEN FINANCIERO
            </h4>
            
            {order.orderType === OrderType.STORE ? (
                // STORE VIEW
                <div className="space-y-3">
                    {canViewAccounting && (
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">RECIBIDO EN</label>
                            <input 
                                type="number"
                                className="w-full p-2 border border-slate-200 rounded text-sm font-bold text-slate-700 bg-white"
                                value={purchaseCostInput}
                                onChange={e => setPurchaseCostInput(e.target.value)}
                                onBlur={handleStoreFinancialUpdate}
                                readOnly={!canEditPrice}
                            />
                        </div>
                    )}
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">PRECIO VENTA OBJETIVO</label>
                        <input 
                            type="number"
                            className="w-full p-2 border border-blue-200 rounded text-lg font-black text-blue-600 bg-blue-50 focus:bg-white focus:ring-2 focus:ring-blue-100 transition outline-none"
                            value={targetPriceInput}
                            onChange={e => setTargetPriceInput(e.target.value)}
                            onBlur={handleStoreFinancialUpdate}
                            readOnly={!canEditPrice}
                        />
                    </div>
                    {canViewAccounting && (
                        <div className="bg-slate-100 p-3 rounded text-right">
                            <p className="text-[10px] font-bold text-slate-500 uppercase">MARGEN ESTIMADO</p>
                            <p className={`text-lg font-black ${projectedMargin >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                ${projectedMargin.toLocaleString()}
                            </p>
                        </div>
                    )}
                </div>
            ) : (
                // CLIENT VIEW
                <div className="space-y-3">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">PRECIO A COBRAR</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 font-bold text-lg">$</span>
                            <input 
                                type="number"
                                className="w-full pl-6 p-2 border border-blue-200 rounded text-xl font-black text-blue-600 bg-white focus:ring-2 focus:ring-blue-100 outline-none transition"
                                value={finalPriceInput}
                                onChange={e => setFinalPriceInput(e.target.value)}
                                onBlur={handleClientPriceBlur} 
                                readOnly={!canEditPrice}
                            />
                        </div>
                    </div>
                    
                    <div className="flex justify-between items-center text-xs border-t border-slate-100 pt-2">
                        <span className="text-slate-500">Abonado / Depósito:</span>
                        <span className="font-mono text-slate-700">-${totalPaid.toLocaleString()}</span>
                    </div>

                    <div className="flex justify-between items-center text-sm pt-1">
                        <span className="font-bold text-slate-700 uppercase">PENDIENTE DE COBRO:</span>
                        <span className={`font-black ${remainingBalance > 0 ? 'text-green-600' : 'text-slate-400'}`}>
                            ${remainingBalance.toLocaleString()}
                        </span>
                    </div>

                    {canViewAccounting && (
                        <div className="bg-slate-100 p-3 rounded text-right mt-2">
                            <p className="text-[9px] font-bold text-slate-500 uppercase">GANANCIA NETA (EST.)</p>
                            <p className={`text-lg font-black ${currentProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                ${currentProfit.toLocaleString()}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* Full Image Modal */}
        {showFullImage && (
            <div 
                className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200"
                onClick={() => setShowFullImage(null)}
            >
                <button 
                    onClick={() => setShowFullImage(null)}
                    className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
                >
                    <X className="w-8 h-8" />
                </button>
                
                <div className="max-w-5xl max-h-full flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
                    <img 
                        src={showFullImage} 
                        alt="Factura Full" 
                        className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
                    />
                    <div className="flex gap-4">
                        <a 
                            href={showFullImage} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="bg-white text-slate-900 px-6 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-100 transition-colors"
                        >
                            <Maximize2 className="w-5 h-5" />
                            Abrir en nueva pestaña
                        </a>
                        <button 
                            onClick={() => setShowFullImage(null)}
                            className="bg-white/20 text-white px-6 py-2 rounded-xl font-bold hover:bg-white/30 transition-colors"
                        >
                            Cerrar
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};