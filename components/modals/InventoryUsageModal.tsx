import React, { useState } from 'react';
import { Package, Scissors, DollarSign, X, Check } from 'lucide-react';
import { InventoryPart } from '../../types';

interface InventoryUsageModalProps {
  part: InventoryPart;
  onConfirm: (mode: 'UNIT' | 'FRACTION', amount?: number) => void;
  onCancel: () => void;
}

export const InventoryUsageModal: React.FC<InventoryUsageModalProps> = ({ part, onConfirm, onCancel }) => {
  const [mode, setMode] = useState<'UNIT' | 'FRACTION' | null>(null);
  const [fractionAmount, setFractionAmount] = useState('');

  const handleConfirm = () => {
    if (mode === 'UNIT') {
      onConfirm('UNIT');
    } else if (mode === 'FRACTION') {
      const val = parseFloat(fractionAmount);
      if (isNaN(val) || val <= 0 || val > part.cost) {
        alert("Monto inválido. Debe ser mayor a 0 y menor o igual al costo de la pieza.");
        return;
      }
      onConfirm('FRACTION', val);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onCancel}>
      <div 
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-bold text-slate-700 flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-500" />
            Usar Inventario
          </h3>
          <button onClick={onCancel} className="p-1 hover:bg-slate-200 rounded-full transition"><X className="w-5 h-5 text-slate-400"/></button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          <div className="text-center">
            <p className="text-sm text-slate-500 mb-1">Pieza seleccionada:</p>
            <h4 className="text-lg font-black text-slate-800">{part.name}</h4>
            <div className="flex justify-center gap-4 mt-2 text-xs font-bold text-slate-400">
              <span>Stock: {part.stock}</span>
              <span>Costo: ${part.cost}</span>
            </div>
          </div>

          {!mode ? (
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => setMode('UNIT')}
                className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50 transition group"
              >
                <div className="bg-slate-100 p-3 rounded-full group-hover:bg-blue-200 transition">
                  <Package className="w-6 h-6 text-slate-500 group-hover:text-blue-600" />
                </div>
                <span className="text-xs font-bold text-slate-600 group-hover:text-blue-700">UNIDAD COMPLETA</span>
                <span className="text-[10px] text-slate-400 text-center leading-tight">Descuenta 1 del stock físico.</span>
              </button>

              <button 
                onClick={() => setMode('FRACTION')}
                className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-slate-100 hover:border-purple-500 hover:bg-purple-50 transition group"
              >
                <div className="bg-slate-100 p-3 rounded-full group-hover:bg-purple-200 transition">
                  <Scissors className="w-6 h-6 text-slate-500 group-hover:text-purple-600" />
                </div>
                <span className="text-xs font-bold text-slate-600 group-hover:text-purple-700">FRACCIÓN / PARCIAL</span>
                <span className="text-[10px] text-slate-400 text-center leading-tight">Extrae solo una parte del costo.</span>
              </button>
            </div>
          ) : (
            <div className="animate-in slide-in-from-right-4 duration-200">
              {mode === 'UNIT' ? (
                <div className="text-center space-y-4">
                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-blue-800 text-sm font-medium">
                    Se descontará <b>1 unidad</b> del inventario y se agregará un gasto de <b>${part.cost}</b> a la orden.
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 text-purple-800 text-xs font-medium mb-4">
                    Ingresa el valor monetario que vas a utilizar de esta pieza. El costo restante quedará en inventario.
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Monto a utilizar ($)</label>
                    <div className="relative">
                      <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input 
                        type="number" 
                        autoFocus
                        className="w-full pl-9 p-3 border-2 border-slate-200 rounded-xl font-bold text-lg outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-50 transition"
                        placeholder="0.00"
                        value={fractionAmount}
                        onChange={e => setFractionAmount(e.target.value)}
                      />
                    </div>
                    <p className="text-[10px] text-right mt-1 text-slate-400">Máximo disponible: ${part.cost}</p>
                  </div>
                </div>
              )}

              <div className="flex gap-2 mt-6">
                <button onClick={() => setMode(null)} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition text-xs uppercase">Atrás</button>
                <button 
                  onClick={handleConfirm}
                  className={`flex-[2] py-3 text-white font-bold rounded-xl shadow-lg transition text-xs uppercase flex items-center justify-center gap-2 ${mode === 'UNIT' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200' : 'bg-purple-600 hover:bg-purple-700 shadow-purple-200'}`}
                >
                  <Check className="w-4 h-4" /> Confirmar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
