
import React, { useState } from 'react';
import { ShoppingBag } from 'lucide-react';

interface RequestPartModalProps {
    onClose: () => void;
    onConfirm: (partName: string) => void;
}

export const RequestPartModal: React.FC<RequestPartModalProps> = ({ onClose, onConfirm }) => {
    const [partName, setPartName] = useState('');
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95" onClick={e=>e.stopPropagation()}>
                <div className="flex items-center gap-3 mb-4 text-slate-800">
                    <div className="bg-blue-50 p-2 rounded-lg text-blue-600"><ShoppingBag className="w-6 h-6"/></div>
                    <h3 className="font-black text-xl">Solicitar Pieza</h3>
                </div>
                
                <div className="mb-4">
                    <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Nombre de la Pieza / Repuesto</label>
                    <input 
                        autoFocus
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 text-slate-800"
                        placeholder="Ej: Pantalla iPhone 11, Batería..."
                        value={partName}
                        onChange={e => setPartName(e.target.value)}
                    />
                </div>

                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition">Cancelar</button>
                    <button 
                        onClick={() => onConfirm(partName)}
                        disabled={!partName.trim()}
                        className="flex-[2] bg-blue-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Solicitar
                    </button>
                </div>
            </div>
        </div>
    );
};
