import React, { useState } from 'react';
import { BrainCircuit, X, Play, Loader2, CheckCircle, AlertOctagon } from 'lucide-react';

export const AITestModal = ({ onClose }: { onClose: () => void }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<'IDLE' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [log, setLog] = useState('');

  const handleTest = async () => {
    setLoading(true);
    setResult('IDLE');
    setLog('Iniciando prueba de conexión con Gemini AI...');
    
    try {
        const response = await fetch('/api/gemini/generateContent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "gemini-2.5-flash",
                contents: [{ role: "user", parts: [{ text: "Responde únicamente con la palabra: OK. Esto es una prueba de conectividad." }] }]
            })
        });
        
        const data = await response.json();
        
        if (data.error || data.fault) {
             setResult('ERROR');
             setLog(prev => prev + '\n\n❌ ERROR DE CONEXIÓN:\n' + JSON.stringify(data.fault || data.error));
        } else if (data.text && data.text.trim().toUpperCase().includes('OK')) {
            setResult('SUCCESS');
            setLog(prev => prev + '\n\nRespuesta recibida: ' + data.text + '\n✅ La Inteligencia Artificial está funcionando correctamente.');
        } else {
            setResult('WARNING' as any);
            setLog(prev => prev + '\n\nRespuesta inusual recibida: ' + JSON.stringify(data) + '\n⚠️ La IA respondió, pero no con el formato esperado.');
        }
    } catch (e: any) {
        setResult('ERROR');
        setLog(prev => prev + '\n\n❌ ERROR DE RED:\n' + e.message + '\n\nVerifica que la clave API esté configurada y el servicio no esté caído.');
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center">
              <BrainCircuit className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h3 className="font-bold text-slate-800 dark:text-white">Diagnóstico AI (Solo SuperAdmin)</h3>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 flex flex-col gap-6">
            <p className="text-sm text-slate-600 dark:text-slate-300">
                Esta herramienta permite verificar la conectividad con el servicio de IA de Gemini y rectificar si el servicio está respondiendo adecuadamente.
            </p>

            <button
                onClick={handleTest}
                disabled={loading}
                className="w-full relative py-3 rounded-xl bg-indigo-600 hover:bg-slate-900 dark:hover:bg-indigo-500 text-white font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
            >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                {loading ? 'Ejecutando Prueba...' : 'Iniciar Prueba de IA'}
            </button>

            {result !== 'IDLE' && (
                <div className={`p-4 rounded-xl border ${result === 'SUCCESS' ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300' : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-500/30 text-red-800 dark:text-red-300'} flex items-start gap-3`}>
                    {result === 'SUCCESS' ? <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" /> : <AlertOctagon className="w-5 h-5 shrink-0 mt-0.5" />}
                    <div className="flex-1">
                        <h4 className="font-bold mb-1">{result === 'SUCCESS' ? 'Prueba Exitosa' : 'Prueba Fallida'}</h4>
                        <pre className="text-[10px] whitespace-pre-wrap font-mono uppercase bg-white/50 dark:bg-black/20 p-2 rounded-lg mt-2 overflow-auto max-h-32">
                            {log}
                        </pre>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
