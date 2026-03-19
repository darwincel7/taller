
import React from 'react';

interface ExternalRepairModalProps {
    onClose: () => void;
    onConfirm: (workshop: string, reason: string) => void;
}

export const ExternalRepairModal: React.FC<ExternalRepairModalProps> = ({ onClose, onConfirm }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
        <div className="bg-white rounded-lg p-6 max-w-sm w-full" onClick={e=>e.stopPropagation()}>
            <h3 className="font-bold mb-4">Envío Externo</h3>
            <div className="space-y-2">
                <button onClick={()=>onConfirm("BRENY NIZAO", "Reparación Externa")} className="bg-purple-600 text-white p-3 rounded w-full font-bold text-sm hover:bg-purple-700 transition">BRENI NIZAO</button>
                <button onClick={()=>onConfirm("JUNIOR BARON", "Reparación Externa")} className="bg-indigo-600 text-white p-3 rounded w-full font-bold text-sm hover:bg-indigo-700 transition">JUNIOR BARON</button>
            </div>
            <button onClick={onClose} className="mt-4 text-slate-500 text-xs w-full text-center hover:underline">Cancelar</button>
        </div>
    </div>
);
