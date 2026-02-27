
import React, { useState } from 'react';
import { MessageSquare, AlertTriangle, DollarSign, Wrench } from 'lucide-react';

interface ProposalModalProps {
  onConfirm: (estimate: string, note?: string, type?: 'MONETARY' | 'ACTION') => void;
  onCancel: () => void;
}

export const ProposalModal: React.FC<ProposalModalProps> = ({ onConfirm, onCancel }) => {
  const [activeTab, setActiveTab] = useState<'MONETARY' | 'ACTION'>('MONETARY');
  const [estimate, setEstimate] = useState('');
  const [note, setNote] = useState('');

  const handleConfirm = () => {
      // If Action type, estimate is irrelevant (send "0" or empty)
      const finalEstimate = activeTab === 'MONETARY' ? estimate : '';
      onConfirm(finalEstimate, note, activeTab);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in zoom-in" onClick={onCancel}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
        
        <div className="flex items-center gap-3 text-orange-600 dark:text-orange-400 mb-6 border-b border-orange-100 dark:border-orange-900 pb-2">
          <MessageSquare className="w-6 h-6" />
          <h3 className="text-lg font-bold">Solicitar Aprobación</h3>
        </div>

        {/* TABS */}
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-4">
            <button 
                onClick={() => setActiveTab('MONETARY')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'MONETARY' ? 'bg-white dark:bg-slate-700 shadow text-green-700 dark:text-green-400' : 'text-slate-500'}`}
            >
                <DollarSign className="w-3 h-3"/> Presupuesto
            </button>
            <button 
                onClick={() => setActiveTab('ACTION')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'ACTION' ? 'bg-white dark:bg-slate-700 shadow text-red-600 dark:text-red-400' : 'text-slate-500'}`}
            >
                <AlertTriangle className="w-3 h-3"/> Autorización
            </button>
        </div>

        <div className="space-y-4 mb-6">
            {activeTab === 'MONETARY' ? (
                <div className="animate-in fade-in slide-in-from-left-2">
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Monto Estimado ($)</label>
                    <input 
                        type="number" 
                        autoFocus
                        className="w-full border border-green-200 dark:border-green-900 rounded-xl p-3 text-xl font-bold focus:ring-2 focus:ring-green-200 outline-none bg-green-50 dark:bg-slate-800 dark:text-green-400 text-slate-900" 
                        placeholder="0.00" 
                        value={estimate} 
                        onChange={e => setEstimate(e.target.value)} 
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Indica el costo aproximado de la reparación.</p>
                </div>
            ) : (
                <div className="animate-in fade-in slide-in-from-right-2">
                    <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg mb-2 text-red-700 dark:text-red-300 text-xs font-medium border border-red-100 dark:border-red-900/50">
                        Solicita permiso para acciones riesgosas (ej. borrar datos, abrir pantalla curva) o cambios sin costo.
                    </div>
                </div>
            )}

            <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
                    {activeTab === 'MONETARY' ? 'Nota / Detalle' : 'Acción a Autorizar'}
                </label>
                <textarea 
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-orange-200 outline-none bg-white dark:bg-slate-800 dark:text-white" 
                    rows={3} 
                    placeholder={activeTab === 'MONETARY' ? "Ej. Cambio de pantalla original..." : "Ej. Riesgo de muerte súbita al reparar..."}
                    value={note} 
                    onChange={e => setNote(e.target.value)} 
                />
            </div>
        </div>

        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 font-bold text-slate-600 dark:text-slate-400 rounded-xl hover:bg-slate-200 transition">
              Cancelar
          </button>
          <button 
            onClick={handleConfirm} 
            disabled={(activeTab === 'MONETARY' && !estimate) || !note.trim()} 
            className="flex-1 py-3 bg-orange-500 text-white font-bold rounded-xl shadow-lg hover:bg-orange-600 disabled:opacity-50 transition"
          >
            Enviar Solicitud
          </button>
        </div>
      </div>
    </div>
  );
};
