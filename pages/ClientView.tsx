
import React, { useState } from 'react';
import { useOrders } from '../contexts/OrderContext';
import { Search, User, Calendar, AlertCircle, DollarSign, History, Barcode, Loader2 } from 'lucide-react';
import { StatusTimeline } from '../components/StatusTimeline';
import { Chatbot } from '../components/Chatbot';

export const ClientView: React.FC = () => {
  const { fetchOrderById } = useOrders();
  const [searchId, setSearchId] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchId.trim()) return;

    setIsLoading(true);
    setError('');
    setResult(null);

    // LOGIC: Clean input but DO NOT FORCE 'INV-' prefix.
    // If user types "105", we want to search for readable_id = 105.
    const term = searchId.trim(); 

    try {
        const order = await fetchOrderById(term);
        
        if (order) {
            setResult(order);
        } else {
            setError(`No encontramos una orden con el número "${term}". Verifique e intente nuevamente.`);
        }
    } catch (err) {
        setError('Ocurrió un error al buscar. Intente más tarde.');
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-12">
        
        {/* Header */}
        <div className="text-center mb-10">
           <h1 className="text-3xl md:text-4xl font-extrabold text-slate-800 mb-2 tracking-tight">Darwin's Taller</h1>
           <p className="text-lg text-slate-500">Consulta el estado de tu reparación.</p>
        </div>

        {/* Search Box */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6 md:p-8 mb-10">
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
               <input 
                 type="text" 
                 placeholder="Número de Orden (ej. 105)"
                 className="w-full pl-12 pr-4 py-3.5 text-lg border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition bg-slate-50"
                 value={searchId}
                 onChange={(e) => setSearchId(e.target.value)}
               />
            </div>
            <button 
              type="submit" 
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-3.5 px-8 rounded-xl transition shadow-lg shadow-blue-200/50 flex items-center justify-center gap-2"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Consultar'}
            </button>
          </form>

          {error && (
            <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-xl flex items-center gap-2 border border-red-100 animate-pulse">
               <AlertCircle className="w-5 h-5" />
               {error}
            </div>
          )}
        </div>

        {/* Result Card */}
        {result && (
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden animate-fade-in-up">
             {/* Card Header */}
             <div className="bg-white border-b border-slate-100 p-6 flex justify-between items-center">
                <div>
                   <h2 className="text-2xl font-bold text-slate-800">Orden #{result.readable_id || result.id}</h2>
                   <p className="text-slate-500 text-sm font-medium">{result.deviceModel}</p>
                </div>
                {/* Cost Display in Header */}
                <div className="flex flex-col items-end">
                    <span className="text-xs text-slate-400 uppercase font-bold mb-1">Total Estimado</span>
                    <div className="bg-red-50 text-red-600 px-3 py-1 rounded-lg font-bold text-lg flex items-center border border-red-100">
                        <DollarSign className="w-4 h-4 mr-0.5" />
                        {result.estimatedCost.toFixed(2)}
                    </div>
                </div>
             </div>

             <div className="p-6 md:p-8">
                {/* Visual Status */}
                <div className="mb-8 bg-slate-50 p-4 rounded-xl border border-slate-100">
                   <StatusTimeline currentStatus={result.status} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   <div className="space-y-6">
                      <div className="flex items-start gap-3">
                         <User className="w-5 h-5 text-blue-500 mt-1" />
                         <div>
                            <p className="text-sm text-slate-400 font-medium">Cliente</p>
                            <p className="text-slate-800 font-medium">{result.customer.name}</p>
                         </div>
                      </div>
                      <div className="flex items-start gap-3">
                         <Calendar className="w-5 h-5 text-blue-500 mt-1" />
                         <div>
                            <p className="text-sm text-slate-400 font-medium">Fecha de Ingreso</p>
                            <p className="text-slate-800 font-medium">
                                {new Date(result.createdAt).toLocaleDateString()}
                            </p>
                         </div>
                      </div>
                      
                      {result.imei && (
                        <div className="flex items-start gap-3">
                            <Barcode className="w-5 h-5 text-blue-500 mt-1" />
                            <div>
                                <p className="text-sm text-slate-400 font-medium">IMEI</p>
                                <p className="text-slate-800 font-mono">{result.imei}</p>
                            </div>
                        </div>
                      )}
                   </div>

                   <div className="space-y-4">
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-slate-400" /> Reporte
                        </h4>
                        <div className="space-y-2">
                             <div>
                                <span className="text-xs font-bold text-slate-400 uppercase">Falla:</span>
                                <p className="text-slate-600 text-sm">{result.deviceIssue}</p>
                             </div>
                             {result.deviceCondition && (
                                <div>
                                    <span className="text-xs font-bold text-slate-400 uppercase">Estado Físico:</span>
                                    <p className="text-slate-600 text-sm">{result.deviceCondition}</p>
                                </div>
                             )}
                        </div>
                      </div>
                      
                      {result.technicianNotes && (
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                          <h4 className="font-bold text-blue-800 mb-2 text-sm">Nota del Técnico</h4>
                          <p className="text-blue-700 text-sm italic">"{result.technicianNotes}"</p>
                        </div>
                      )}
                   </div>
                </div>

                {/* History Section */}
                <div className="mt-8 pt-6 border-t border-slate-100">
                    <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <History className="w-5 h-5 text-slate-500" /> Historial de Cambios
                    </h4>
                    <div className="space-y-0">
                        {result.history.map((log: any, idx: number) => (
                            <div key={idx} className="flex gap-4 pb-4 last:pb-0 relative group">
                                {/* Vertical Line */}
                                {idx !== result.history.length - 1 && (
                                    <div className="absolute left-[9px] top-6 bottom-0 w-0.5 bg-slate-200 group-last:hidden"></div>
                                )}
                                
                                <div className="mt-1 w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                                    <div className="w-2 h-2 rounded-full bg-slate-500"></div>
                                </div>
                                
                                <div>
                                    <p className="text-sm font-semibold text-slate-700">{log.status}</p>
                                    <p className="text-xs text-slate-400 mb-1">{new Date(log.date).toLocaleString()}</p>
                                    <p className="text-sm text-slate-600 bg-slate-50 inline-block px-2 py-1 rounded border border-slate-100">{log.note}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
             </div>
          </div>
        )}

      </div>
      <Chatbot />
    </div>
  );
};
