
import React, { useState, useEffect } from 'react';
import { CheckCircle2, DollarSign, Loader2, Printer, PlusCircle, Trash2, CreditCard, Banknote, Building, AlertTriangle, AlertCircle, Wallet, RotateCcw, Lock, PiggyBank } from 'lucide-react';
import { PaymentMethod, Payment, UserRole } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface DeliveryModalProps {
  finalPriceInput: string;
  setFinalPriceInput: (val: string) => void;
  alreadyPaid: number; 
  onConfirm: (payments: Payment[], printWindow?: Window | null) => void; // Update Prop
  onCancel: () => void;
  isSaving: boolean;
  isReturn?: boolean;
  isDeposit?: boolean;
}

export const DeliveryModal: React.FC<DeliveryModalProps> = ({ finalPriceInput, setFinalPriceInput, alreadyPaid, onConfirm, onCancel, isSaving, isReturn = false, isDeposit = false }) => {
  const { currentUser } = useAuth();
  
  const isAdmin = currentUser?.role === UserRole.ADMIN;

  const totalOrderPrice = parseFloat(finalPriceInput) || 0;
  const initialRemaining = totalOrderPrice - alreadyPaid;
  
  const [payments, setPayments] = useState<{ amount: string, method: PaymentMethod, isRefund?: boolean }[]>([]);

  useEffect(() => {
      if (isDeposit) {
          if (initialRemaining > 0) {
              setPayments([{ amount: '', method: 'CASH', isRefund: false }]);
          } else {
              setPayments([]);
          }
      } else {
          if (Math.abs(initialRemaining) < 0.01) {
              setPayments([]);
          } else if (initialRemaining > 0) {
              setPayments([{ amount: initialRemaining.toString(), method: 'CASH', isRefund: false }]);
          } else {
              setPayments([{ amount: Math.abs(initialRemaining).toString(), method: 'CASH', isRefund: true }]);
          }
      }
  }, [totalOrderPrice, alreadyPaid, isDeposit]);

  const totalAllocated = payments.reduce((sum, p) => {
      const val = parseFloat(p.amount) || 0;
      return sum + (p.isRefund ? -val : val);
  }, 0);
  
  const remainingDiff = totalOrderPrice - (alreadyPaid + totalAllocated);
  const isBalanced = isDeposit ? true : Math.abs(remainingDiff) < 0.01;
  const isOverpaying = isDeposit && remainingDiff < 0;

  const handleAddLine = () => {
      setPayments([...payments, { amount: '', method: 'CASH', isRefund: false }]);
  };

  const handleRemoveLine = (index: number) => {
      const newP = [...payments];
      newP.splice(index, 1);
      setPayments(newP);
  };

  const handleUpdateLine = (index: number, field: 'amount' | 'method' | 'isRefund', value: any) => {
      const newP = [...payments];
      newP[index] = { ...newP[index], [field]: value };
      setPayments(newP);
  };

  const handleConfirm = () => {
      if (!isDeposit && !isBalanced) return;
      if (totalAllocated === 0 && isDeposit) {
          alert("Ingresa un monto para el abono.");
          return;
      }
      
      const formattedPayments: Payment[] = payments.map(p => ({
          id: crypto.randomUUID(),
          amount: (parseFloat(p.amount) || 0) * (p.isRefund ? -1 : 1), 
          method: p.method,
          date: Date.now(),
          cashierId: currentUser?.id || 'unknown',
          cashierName: currentUser?.name || 'Cajero',
          isRefund: p.isRefund,
          notes: p.isRefund ? 'Devolución de dinero al cliente' : (isDeposit ? 'Abono / Anticipo' : (p.method === 'CREDIT' ? 'Cuenta por Cobrar' : 'Pago final'))
      }));

      // FIX: OPEN WINDOW HERE (SYNCHRONOUSLY) TO PREVENT BLOCKING
      const printWindow = window.open('', '_blank');
      if (printWindow) {
          printWindow.document.write(`
            <html>
                <head><title>Generando...</title></head>
                <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
                    <h1>Generando Factura...</h1>
                    <p>Por favor espere mientras se guarda la transacción.</p>
                </body>
            </html>
          `);
      }

      onConfirm(formattedPayments, printWindow);
  };

  let headerColor = 'bg-green-600';
  let headerIcon = <CheckCircle2 className="w-8 h-8" />;
  let title = 'Finalizar Entrega';
  let subtitle = 'Verifique montos y registre el cobro.';
  let buttonText = 'CONFIRMAR ENTREGA';

  if (isReturn) {
      headerColor = 'bg-red-600';
      headerIcon = <RotateCcw className="w-8 h-8"/>;
      title = 'Procesar Devolución';
      subtitle = 'Ajuste de cuentas y retorno.';
      buttonText = 'CONFIRMAR DEVOLUCIÓN';
  } else if (isDeposit) {
      headerColor = 'bg-blue-600';
      headerIcon = <PiggyBank className="w-8 h-8"/>;
      title = 'Registrar Abono';
      subtitle = 'El equipo permanecerá en taller.';
      buttonText = 'GUARDAR ABONO';
  }

  return (
    <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in zoom-in duration-200"
        onClick={onCancel}
    >
        <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
        >
            <div className={`${headerColor} p-6 text-white text-center shrink-0`}>
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    {headerIcon}
                </div>
                <h2 className="text-2xl font-bold">{title}</h2>
                <p className="opacity-90">{subtitle}</p>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
                {/* SUMMARY BOX */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 space-y-3">
                    <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                        <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                            {isDeposit ? 'Costo Total (Estimado)' : 'Costo Final (Servicio)'}
                            {!isAdmin && <Lock className="w-3 h-3 text-slate-400" />}
                        </span>
                        <div className="flex items-center">
                            <span className="text-slate-400 mr-1">$</span>
                            <input 
                                className={`text-lg font-bold bg-white text-slate-900 text-right w-24 p-1 rounded border border-slate-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 ${(!isAdmin || isDeposit) ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
                                value={finalPriceInput}
                                onChange={e => setFinalPriceInput(e.target.value)}
                                disabled={isReturn || isDeposit || !isAdmin} 
                            />
                        </div>
                    </div>
                    
                    <div className="flex justify-between items-center text-slate-600">
                        <span className="text-xs font-bold uppercase flex items-center gap-1"><Wallet className="w-3 h-3"/> Abonado Anteriormente</span>
                        <span className="font-mono font-bold">${alreadyPaid.toLocaleString()}</span>
                    </div>

                    {/* DYNAMIC BALANCE DISPLAY */}
                    <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-800 uppercase">
                                {isDeposit ? 'Deuda Actual' : 'Balance Pendiente'}
                            </span>
                            {isDeposit && totalAllocated > 0 && (
                                <span className="text-[10px] font-bold text-green-600 animate-pulse">
                                    Nuevo Pendiente: ${(initialRemaining - totalAllocated).toLocaleString()}
                                </span>
                            )}
                        </div>
                        <span className={`text-xl font-black ${initialRemaining < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                            ${initialRemaining.toLocaleString()}
                        </span>
                    </div>
                </div>

                {/* PAYMENTS INPUT */}
                <div className="space-y-3 mb-4">
                    <p className="text-xs font-bold text-slate-500 uppercase mb-2">
                        {isDeposit ? 'Monto a Abonar' : 'Transacciones de Cierre'}
                    </p>
                    
                    {!isDeposit && payments.length === 0 && (
                        <div className="text-center p-4 bg-green-50 text-green-700 rounded-lg text-sm font-bold border border-green-200">
                            ¡Cuenta Saldada! No se requiere pago ni devolución.
                        </div>
                    )}

                    {payments.map((p, idx) => (
                        <div key={idx} className="flex gap-2 items-center animate-in slide-in-from-left-2">
                            <div className="flex flex-col w-24">
                                <span className={`text-[10px] font-bold text-center uppercase rounded-t px-1 ${p.isRefund ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                    {p.isRefund ? 'Devolución' : (isDeposit ? 'Abono' : 'Cobro')}
                                </span>
                                <select 
                                    className="p-2 border border-slate-200 rounded-b bg-white text-xs font-bold text-slate-700 outline-none"
                                    value={p.isRefund ? 'REFUND' : 'CHARGE'}
                                    onChange={e => handleUpdateLine(idx, 'isRefund', e.target.value === 'REFUND')}
                                    disabled={isDeposit} // In deposit mode, only Charges allowed
                                >
                                    <option value="CHARGE">{isDeposit ? 'Abonar (+)' : 'Cobrar (+)'}</option>
                                    {!isDeposit && <option value="REFUND">Devolver (-)</option>}
                                </select>
                            </div>
                            
                            <select 
                                className="p-3 border border-slate-200 rounded-lg bg-white text-sm font-bold text-slate-700 outline-none w-32"
                                value={p.method}
                                onChange={e => handleUpdateLine(idx, 'method', e.target.value)}
                            >
                                <option value="CASH">Efectivo</option>
                                <option value="TRANSFER">Transf.</option>
                                <option value="CARD">Tarjeta</option>
                                <option value="CREDIT">Crédito (Deuda)</option>
                            </select>
                            
                            <div className="relative flex-1">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10">$</span>
                                <input 
                                    type="number"
                                    className="w-full pl-6 p-3 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 bg-white outline-none focus:ring-2 focus:ring-blue-100"
                                    value={p.amount}
                                    placeholder="0.00"
                                    onChange={e => handleUpdateLine(idx, 'amount', e.target.value)}
                                    autoFocus={idx === 0}
                                />
                            </div>
                            
                            <button onClick={() => handleRemoveLine(idx)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                                <Trash2 className="w-5 h-5"/>
                            </button>
                        </div>
                    ))}
                    
                    <button 
                        onClick={handleAddLine} 
                        className="w-full py-2 border-2 border-dashed border-slate-200 rounded-lg text-slate-500 text-sm font-bold hover:bg-slate-50 hover:border-slate-300 transition flex items-center justify-center gap-2"
                    >
                        <PlusCircle className="w-4 h-4" /> Agregar transacción
                    </button>
                </div>

                {/* WARNINGS */}
                {!isDeposit && !isBalanced && (
                    <div className="bg-red-50 p-3 rounded-lg flex items-center gap-2 text-xs text-red-700 font-bold border border-red-100 mb-4">
                        <AlertTriangle className="w-4 h-4"/>
                        {remainingDiff > 0 
                            ? `Faltan $${Math.abs(remainingDiff).toFixed(2)} para cuadrar.` 
                            : `Exceso de $${Math.abs(remainingDiff).toFixed(2)}. Verifique montos.`
                        }
                    </div>
                )}
                
                {isDeposit && isOverpaying && (
                    <div className="bg-yellow-50 p-3 rounded-lg flex items-center gap-2 text-xs text-yellow-700 font-bold border border-yellow-200 mb-4">
                        <AlertTriangle className="w-4 h-4"/>
                        El abono supera la deuda actual. Se generará saldo a favor.
                    </div>
                )}
            </div>

            <div className="p-6 pt-0 space-y-3 shrink-0">
                <button 
                    onClick={handleConfirm} 
                    disabled={isSaving || (!isDeposit && !isBalanced)} 
                    className={`w-full text-white font-bold py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 transition transform active:scale-95 disabled:bg-slate-300 disabled:shadow-none ${headerColor} hover:opacity-90`}
                >
                    {isSaving ? <Loader2 className="animate-spin" /> : <Printer />} 
                    {buttonText}
                </button>
                <button onClick={onCancel} disabled={isSaving} className="w-full bg-white text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-50 border border-slate-200 transition">
                    Cancelar
                </button>
            </div>
        </div>
    </div>
  );
};
