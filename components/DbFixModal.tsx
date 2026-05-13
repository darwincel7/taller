import React from 'react';
import { Database, X, AlertTriangle } from 'lucide-react';

export const DbFixModal = ({ onClose }: { onClose: () => void }) => {
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-500" />
            <h2 className="font-bold text-slate-800 dark:text-white">Actualización de Base de Datos</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1 text-slate-700 dark:text-slate-300">
          <div className="bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800/30 dark:text-amber-300 p-4 rounded-xl mb-6 text-sm">
            <h3 className="font-bold flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4"/> 
              Importante: Migraciones Separadas
            </h3>
            <p className="mb-2">El código SQL para arreglar la base de datos ya no se proporciona por aquí para evitar parches manuales.</p>
            <p>Por favor ejecuta las migraciones formales en tu base de datos de Supabase, que se encuentran en el archivo:</p>
            <pre className="mt-2 text-xs bg-black/10 p-2 rounded">
              supabase/migrations/2026_05_13_v35_security_finance_cleanup.sql
            </pre>
          </div>
        </div>
        
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end bg-slate-50 dark:bg-slate-900/50">
          <button onClick={onClose} className="px-6 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-700 transition">
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
