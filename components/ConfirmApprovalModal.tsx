import React, { useState } from 'react';

interface ConfirmApprovalModalProps {
    defaultAmount: string | number;
    onConfirm: (amount: string, instructions: string) => void;
    onCancel: () => void;
}

export const ConfirmApprovalModal: React.FC<ConfirmApprovalModalProps> = ({ defaultAmount, onConfirm, onCancel }) => {
    const [amount, setAmount] = useState(defaultAmount.toString());
    const [instructions, setInstructions] = useState('');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in" onClick={onCancel}>
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-200" onClick={e => e.stopPropagation()}>
                <h3 className="font-black text-slate-800 text-lg mb-1">Confirmar Aprobación</h3>
                <p className="text-xs text-slate-500 mb-4 font-medium">Verifica el monto final acordado y añade instrucciones.</p>
                
                <div className="space-y-4">
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Monto Final ($)</label>
                        <input 
                            type="number" 
                            value={amount} 
                            onChange={e => setAmount(e.target.value)}
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-lg text-slate-800 outline-none focus:ring-2 focus:ring-green-200 transition"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Instrucciones / Notas</label>
                        <textarea 
                            value={instructions} 
                            onChange={e => setInstructions(e.target.value)}
                            placeholder="Ej: Cliente pide guardar repuestos viejos..."
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-200 transition resize-none h-24"
                        />
                    </div>
                    
                    <div className="flex gap-3 pt-2">
                        <button onClick={onCancel} className="flex-1 py-3 bg-white border border-slate-200 text-slate-500 font-bold rounded-xl hover:bg-slate-50 transition text-xs uppercase">Cancelar</button>
                        <button onClick={() => onConfirm(amount, instructions)} className="flex-[2] py-3 bg-green-600 text-white font-bold rounded-xl shadow-lg hover:bg-green-700 transition text-xs uppercase active:scale-95">Confirmar</button>
                    </div>
                </div>
            </div>
        </div>
    );
};
