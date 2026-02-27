import React, { useState } from 'react';
import { Expense, RepairOrder, OrderType, InventoryPart } from '../types';
import { DollarSign, Trash2, Plus, Package, TrendingUp, Edit2, X, Save as SaveIcon, Scissors, Check } from 'lucide-react';
import { useOrders } from '../contexts/OrderContext';
import { useInventory } from '../contexts/InventoryContext';

interface OrderFinancialsProps {
  order: RepairOrder;
  expensesList: Expense[];
  setExpensesList: (list: Expense[]) => void;
  canViewAccounting: boolean;
  handleUpdate: (auditReason?: string) => void;
  finalPriceInput: string;
  setFinalPriceInput: (val: string) => void;
  isSaving: boolean;
  onAddExpense: (desc: string, amount: number) => Promise<void>;
  onRemoveExpense: (id: string) => Promise<void>;
  onEditExpense: (id: string, newDesc: string, newAmount: number) => Promise<void>;
  canEdit: boolean;
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
  onRemoveExpense,
  onEditExpense,
  canEdit,
  onPermissionError
}) => {
  const { updateOrderDetails, showNotification } = useOrders();
  const { inventory, updateInventoryPart } = useInventory();
  
  // State for adding/editing
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  
  const [showInventorySelect, setShowInventorySelect] = useState(false);

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

  const handleSelectPart = async (part: InventoryPart) => {
      if (!canEdit) {
          triggerError();
          setShowInventorySelect(false);
          return;
      }

      // PREGUNTA: Unidad o Parcial
      const useMode = prompt(
          `¿Cómo utilizar "${part.name}"?\n\n` +
          `1. Unidad Completa (Descuenta 1 del stock)\n` +
          `2. Parcial / Dividir (Extrae valor del costo)\n\n` +
          `Escribe 1 o 2:`, 
          "1"
      );

      if (useMode === '2') {
          // LOGICA PARCIAL (DIVIDIR)
          const amountStr = prompt(
              `Costo total de la pieza: $${part.cost}\n\n` +
              `¿Qué valor monetario ($) vas a utilizar para esta orden?`
          );
          
          if (!amountStr) return;
          const amount = parseFloat(amountStr);
          
          if (isNaN(amount) || amount <= 0 || amount > part.cost) {
              alert("Monto inválido. Debe ser mayor a 0 y menor o igual al costo de la pieza.");
              return;
          }

          // Actualizamos el costo del item en inventario (restando lo usado)
          const newCost = part.cost - amount;
          await updateInventoryPart(part.id, { cost: newCost });
          
          // Agregamos el gasto a la orden
          onAddExpense(`Parte de ${part.name}`, amount);
          setShowInventorySelect(false);
          showNotification('success', `Repuesto particionado. Nuevo valor en inventario: $${newCost}`);

      } else if (useMode === '1') {
          // LOGICA ESTANDAR (Unidad completa)
          if (part.stock > 0) {
              await updateInventoryPart(part.id, { stock: part.stock - 1 });
              onAddExpense(part.name, part.cost); 
              setShowInventorySelect(false);
          } else {
              alert("No hay stock de esta pieza.");
          }
      }
  };

  const handleStoreFinancialUpdate = async () => {
      if (!canEdit) {
          triggerError();
          return;
      }
      const pCost = parseFloat(purchaseCostInput) || 0;
      const tPrice = parseFloat(targetPriceInput) || 0;
      await updateOrderDetails(order.id, { purchaseCost: pCost, targetPrice: tPrice });
  };

  const handleClientPriceBlur = () => {
      if (!canEdit) {
          triggerError();
          return;
      }
      
      // CHECK IF PRICE CHANGED
      const newPrice = parseFloat(finalPriceInput);
      const currentPrice = order.finalPrice > 0 ? order.finalPrice : order.estimatedCost;
      
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

  const currentTotalExpenses = expensesList.reduce((sum, item) => sum + item.amount, 0);
  
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

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm h-full flex flex-col">
        
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

        {/* --- INVENTORY SELECTOR --- */}
        {showInventorySelect && (
            <div className="mb-3 p-2 bg-slate-50 border border-blue-100 rounded-lg max-h-32 overflow-y-auto animate-in slide-in-from-top-2 shadow-inner">
                <div className="space-y-1">
                    {inventory.map(part => (
                        <button 
                            key={part.id}
                            type="button"
                            onClick={() => handleSelectPart(part)}
                            className="w-full text-left text-[10px] p-1.5 hover:bg-white rounded flex justify-between items-center border border-transparent hover:border-slate-200 transition-all group"
                        >
                            <span className="font-medium text-slate-700">{part.name}</span>
                            <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-500 bg-white px-1 py-0.5 rounded border border-slate-200">${part.cost}</span>
                                <Scissors className="w-3 h-3 text-slate-300 group-hover:text-blue-400" />
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        )}
        
        {/* --- EXPENSE LIST --- */}
        <div className="mb-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1"><Package className="w-3 h-3"/> HISTORIAL</p>
            
            <div className="space-y-2">
                {expensesList.length === 0 ? (
                    <div className="p-3 text-center text-slate-300 text-xs italic bg-slate-50 rounded border border-slate-100">
                        Sin gastos registrados.
                    </div>
                ) : (
                    expensesList.map(exp => (
                        <div key={exp.id} className="flex justify-between items-center p-2 hover:bg-slate-50 rounded border border-transparent hover:border-slate-100 transition group">
                            <div className="flex items-start gap-2">
                                <div className="bg-slate-100 p-1.5 rounded text-slate-400">
                                    <Package className="w-3 h-3" />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-slate-700 leading-tight">{exp.description}</p>
                                    <p className="text-[10px] text-slate-400">{new Date(exp.date).toLocaleDateString()}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {canViewAccounting && (
                                    <span className="font-bold text-red-600 bg-red-50 px-2 py-1 rounded text-xs border border-red-100">
                                        -${exp.amount.toLocaleString()}
                                    </span>
                                )}
                                {canEdit && (
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={(e) => startEdit(e, exp)} className="text-slate-400 hover:text-blue-500"><Edit2 className="w-3 h-3"/></button>
                                        <button onClick={() => onRemoveExpense(exp.id)} className="text-slate-400 hover:text-red-500"><X className="w-3 h-3"/></button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>

        {/* TOTAL GASTOS ROW */}
        {canViewAccounting && (
            <div className="flex justify-between items-center bg-slate-50 p-2 rounded mb-4 border border-slate-100">
                <span className="text-[10px] font-bold text-slate-500 uppercase">TOTAL GASTOS</span>
                <span className="font-bold text-slate-800 text-sm">-${currentTotalExpenses.toLocaleString()}</span>
            </div>
        )}

        {/* --- ADD EXPENSE INPUTS --- */}
        {canEdit && (
            <div className="flex gap-2 mb-6">
                <input 
                    placeholder="Descripción..."
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
                                readOnly={!canEdit}
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
                            readOnly={!canEdit}
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
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">PRECIO SERVICIO TOTAL</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 font-bold text-lg">$</span>
                            <input 
                                type="number"
                                className="w-full pl-6 p-2 border border-blue-200 rounded text-xl font-black text-blue-600 bg-white focus:ring-2 focus:ring-blue-100 outline-none transition"
                                value={finalPriceInput}
                                onChange={e => setFinalPriceInput(e.target.value)}
                                onBlur={handleClientPriceBlur} 
                                readOnly={!canEdit}
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
    </div>
  );
};