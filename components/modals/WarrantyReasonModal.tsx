import React, { useState } from 'react';
import { X, ShieldAlert, AlertTriangle, Tag } from 'lucide-react';

interface WarrantyReasonModalProps {
    type: 'WARRANTY' | 'QUALITY';
    onConfirm: (reason: string) => void;
    onCancel: () => void;
}

export const WarrantyReasonModal: React.FC<WarrantyReasonModalProps> = ({ type, onConfirm, onCancel }) => {
    const [reason, setReason] = useState('');
    
    const isWarranty = type === 'WARRANTY';
    const title = isWarranty ? 'Reingreso por Garantía' : 'Revisión de Calidad';
    const subtitle = isWarranty ? 'El equipo regresó por una falla recurrente' : 'El equipo no pasó el control de calidad';
    const Icon = isWarranty ? ShieldAlert : AlertTriangle;
    
    const colorStyles = isWarranty ? {
        borderLeft: 'bg-amber-500',
        iconBg: 'bg-amber-50',
        iconText: 'text-amber-600',
        iconBorder: 'border-amber-100',
        tagActive: 'bg-amber-600 text-white border-amber-600 shadow-md',
        focusBorder: 'focus:border-amber-400 focus:ring-amber-50',
        btnActive: 'bg-amber-600 hover:bg-amber-700'
    } : {
        borderLeft: 'bg-purple-500',
        iconBg: 'bg-purple-50',
        iconText: 'text-purple-600',
        iconBorder: 'border-purple-100',
        tagActive: 'bg-purple-600 text-white border-purple-600 shadow-md',
        focusBorder: 'focus:border-purple-400 focus:ring-purple-50',
        btnActive: 'bg-purple-600 hover:bg-purple-700'
    };
    
    const commonReasons = isWarranty ? [
        "Falla recurrente",
        "Pieza defectuosa instalada",
        "Problema de ensamblaje",
        "Cliente reporta misma falla",
        "Daño colateral durante reparación"
    ] : [
        "Pantalla mal pegada",
        "Botones no responden bien",
        "Cámaras con polvo/manchas",
        "Batería no retiene carga",
        "Tornillos faltantes"
    ];

    const canConfirm = reason.trim().length > 3;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onCancel}>
            <div 
                className="bg-slate-50 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden relative animate-in zoom-in-95 duration-300 border border-white/20 ring-1 ring-black/5" 
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-white p-6 border-b border-slate-100 flex justify-between items-center relative overflow-hidden">
                    <div className={`absolute top-0 left-0 w-1 h-full ${colorStyles.borderLeft}`}></div>
                    <div className="flex items-center gap-3 relative z-10">
                        <div className={`${colorStyles.iconBg} p-2.5 rounded-2xl ${colorStyles.iconText} shadow-sm border ${colorStyles.iconBorder}`}>
                            <Icon className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-800 tracking-tight leading-none mb-1">{title}</h3>
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{subtitle}</p>
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
                            <Tag className="w-3 h-3"/> Motivos Comunes
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {commonReasons.map((r) => (
                                <button 
                                    key={r}
                                    onClick={() => setReason(r)}
                                    className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all active:scale-95 ${reason === r ? colorStyles.tagActive : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'}`}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Detalle / Razón */}
                    <div className="relative group">
                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1.5 block ml-1">Razón Detallada (Obligatorio)</label>
                        <textarea 
                            className={`w-full bg-white border-2 border-slate-200 rounded-2xl p-4 text-slate-700 font-medium ${colorStyles.focusBorder} focus:ring-4 outline-none transition-all resize-none shadow-sm placeholder:text-slate-300 text-sm`}
                            placeholder={`Explica detalladamente por qué el equipo reingresa por ${isWarranty ? 'garantía' : 'calidad'}...`}
                            rows={4}
                            value={reason} 
                            onChange={e => setReason(e.target.value)}
                            autoFocus
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="bg-slate-100 p-4 border-t border-slate-200 flex justify-end gap-3">
                    <button 
                        onClick={onCancel}
                        className="px-5 py-2.5 rounded-xl font-bold text-sm text-slate-500 hover:bg-slate-200 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={() => canConfirm && onConfirm(reason)}
                        disabled={!canConfirm}
                        className={`px-6 py-2.5 rounded-xl font-black text-sm text-white shadow-md transition-all flex items-center gap-2 ${canConfirm ? `${colorStyles.btnActive} hover:shadow-lg active:scale-95` : 'bg-slate-300 cursor-not-allowed'}`}
                    >
                        <Icon className="w-4 h-4" />
                        Crear Orden
                    </button>
                </div>
            </div>
        </div>
    );
};
