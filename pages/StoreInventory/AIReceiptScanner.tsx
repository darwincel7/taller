import React, { useState } from 'react';
import { useInventory } from '../../contexts/InventoryContext';
import { Camera, RefreshCw, Plus, X, ArrowRight, BrainCircuit } from 'lucide-react';
import { toast } from 'sonner';

export const AIReceiptScanner = ({ onClose }: { onClose?: () => void }) => {
   const [scannedItems, setScannedItems] = useState<any[]>([]);
   const [isScanning, setIsScanning] = useState(false);

   const mockScan = () => {
       setIsScanning(true);
       setTimeout(() => {
           setScannedItems([
               { id: Date.now(), name: 'Samsung Galaxy S24 Ultra', imei: '358189083812831', cost: 950, price: 1200 },
               { id: Date.now() + 1, name: 'Funda Silicona S24', cost: 5, price: 25 },
           ]);
           setIsScanning(false);
           toast.success("AI: Recibo procesado exitosamente");
       }, 2000);
   };

   return (
       <div className="bg-white rounded-3xl p-8 border border-slate-200">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
               <div className="bg-indigo-100 text-indigo-600 p-2 rounded-xl">
                 <BrainCircuit className="w-6 h-6" />
               </div>
               AI Escáner de Facturas
            </h2>
            {onClose && <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl"><X className="w-6 h-6"/></button>}
          </div>

          <div className="grid md:grid-cols-2 gap-8">
              <div>
                  <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-[2rem] h-64 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-colors group">
                     {isScanning ? (
                        <>
                          <RefreshCw className="w-10 h-10 text-indigo-500 mb-3 animate-spin"/>
                          <p className="font-bold text-slate-600">Procesando imagen con IA...</p>
                        </>
                     ) : (
                        <div className="text-center" onClick={mockScan}>
                           <Camera className="w-12 h-12 text-slate-300 mb-4 mx-auto group-hover:text-indigo-500 transition-colors" />
                           <p className="font-black text-slate-700 text-lg">Sube o toma foto de tu recibo</p>
                           <p className="text-sm font-medium text-slate-500 mt-1">Nuestra IA completará los detalles y precios.</p>
                        </div>
                     )}
                  </div>
              </div>

              <div>
                  <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">Resultados Temporales ({scannedItems.length})</h3>
                  {scannedItems.length === 0 ? (
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 text-center text-slate-400">
                          Esperando escaneo...
                      </div>
                  ) : (
                      <div className="space-y-3">
                          {scannedItems.map((item, idx) => (
                              <div key={idx} className="bg-white border border-slate-200 p-4 rounded-xl flex justify-between items-center">
                                  <div>
                                      <p className="font-bold text-slate-800">{item.name}</p>
                                      {item.imei && <p className="text-xs font-mono text-slate-500">IMEI: {item.imei}</p>}
                                  </div>
                                  <div className="text-right">
                                      <p className="font-black text-emerald-600">${item.price}</p>
                                      <p className="text-[10px] text-slate-400 font-bold uppercase">Costo: ${item.cost}</p>
                                  </div>
                              </div>
                          ))}
                          <div className="pt-4 flex gap-3">
                             <button onClick={() => setScannedItems([])} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold flex-1">Descartar</button>
                             <button onClick={() => {toast.info('Funcionalidad en desarrollo para exportar items'); setScannedItems([])}} className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold flex-1 flex items-center justify-center gap-2">
                                Procesar <ArrowRight className="w-4 h-4"/>
                             </button>
                          </div>
                      </div>
                  )}
              </div>
          </div>
       </div>
   )
}
