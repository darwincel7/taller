
import React, { useState } from 'react';
import { X, Reply, Tag, ArrowRight, DollarSign } from 'lucide-react';

interface UnrepairableModalProps {
    onConfirm: (reason: string, fee: number) => void;
    onCancel: () => void;
}

export const UnrepairableModal: React.FC<UnrepairableModalProps> = ({ onConfirm, onCancel }) => {
    const [reason, setReason] = useState(''); 
    const [fee, setFee] = useState('');
    
    const commonReasons = [
        "Irreparable (Placa base)",
        "No hay repuesto disponible",
        "Costo muy elevado",
        "Cliente no aceptó precio",
        "Cliente retiró equipo"
    ];

    const isFeeValid = fee.trim() !== '' && !isNaN(parseFloat(fee)) && parseFloat(fee) >= 0;
    const canConfirm = reason.trim() !== '' && isFeeValid;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onCancel}>
            <div 
                className="bg-slate-50 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden relative animate-in zoom-in-95 duration-300 border border-white/20 ring-1 ring-black/5" 
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-white p-6 border-b border-slate-100 flex justify-between items-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                    <div className="flex items-center gap-3 relative z-10">
                        <div className="bg-red-50 p-2.5 rounded-2xl text-red-600 shadow-sm border border-red-100">
                            <Reply className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-800 tracking-tight leading-none mb-1">Solicitar Devolución</h3>
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Proceso de salida sin reparación</p>
                        </div>
                    </div>
                    <button onClick={onCancel} className="p-2 text-slate-300 hover:text-slate-500 hover:bg-slate-100 rounded-full transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">
                    
                    {/* Quick Tags */}
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1">
                            <Tag className="w-3 h-3"/> Motivos Rápidos
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {commonReasons.map((r) => (
                                <button 
                                    key={r}
                                    onClick={() => setReason(r)}
                                    className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all active:scale-95 ${reason === r ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600'}`}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Detalle / Razón */}
                    <div className="relative group">
                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1.5 block ml-1">Detalle / Razón</label>
                        <textarea 
                            className="w-full bg-white border-2 border-slate-200 rounded-2xl p-4 text-slate-700 font-medium focus:border-red-400 focus:ring-4 focus:ring-red-50 outline-none transition-all resize-none shadow-sm placeholder:text-slate-300 text-sm" 
                            placeholder="Escribe aquí por qué se devuelve el equipo..." 
                            rows={3}
                            value={reason} 
                            onChange={e => setReason(e.target.value)}
                            autoFocus
                        />
                    </div>

                    {/* Fee Input */}
                    <div>
                        <label className="text-[12px] font-black text-slate-700 uppercase mb-2 block ml-1">Monto a Cobrar por Revisión/Diagnóstico</label>
                        <div className="relative group">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-slate-100 text-slate-500 p-2 rounded-xl">
                                <DollarSign className="w-6 h-6 text-slate-700" />
                            </div>
                            <input 
                                type="number" 
                                className="w-full bg-white border-2 border-slate-300 rounded-2xl pl-16 pr-4 py-4 font-black text-3xl text-slate-800 outline-none focus:border-red-500 focus:ring-4 focus:ring-red-50 transition-all shadow-sm placeholder:text-slate-300" 
                                placeholder="0.00" 
                                value={fee} 
                                onChange={e => setFee(e.target.value)}
                            />
                        </div>
                        <p className="text-[11px] font-medium text-slate-500 mt-2 ml-1">
                            * Es <strong>obligatorio</strong> indicar el monto a cobrar. Si no se cobra nada, ingrese <strong>0</strong>.
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-white border-t border-slate-100 flex gap-3">
                    <button 
                        onClick={onCancel} 
                        className="flex-1 py-4 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-colors text-xs uppercase tracking-wide"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={() => onConfirm(reason, parseFloat(fee))} 
                        disabled={!canConfirm}
                        className="flex-[2] bg-gradient-to-r from-red-600 to-red-500 text-white py-4 rounded-xl font-bold shadow-lg shadow-red-200 hover:shadow-xl hover:from-red-500 hover:to-red-400 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm uppercase tracking-wide"
                    >
                        Confirmar Devolución <ArrowRight className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    );
};
