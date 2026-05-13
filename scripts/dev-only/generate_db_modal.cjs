const fs = require('fs');

const sql = fs.readFileSync('supabase/migrations/20260510_pos_checkout_v24.sql', 'utf8');

const componentTemplate = `import React, { useState } from 'react';
import { Database, Copy, X } from 'lucide-react';

export const DbFixModal = ({ onClose }: { onClose: () => void }) => {
  const [copied, setCopied] = useState(false);

  // We embed the raw SQL text without template literals inside to avoid escaping hell
  const FULL_SQL = {____SQL____};

  const copySql = () => {
    navigator.clipboard.writeText(FULL_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-500" />
            <h2 className="font-bold text-slate-800 dark:text-white">Migración SQL V24 Requerida</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1">
          <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 p-4 rounded-xl mb-6 text-sm">
            <strong>Instrucciones V24:</strong> Copia este código SQL y ejecútalo en el <strong>SQL Editor de Supabase</strong> para habilitar y reparar las funciones requeridas para el POS (inv. updated_at, cambiazo, etc).
          </div>

          <div className="relative group">
            <button 
              onClick={copySql}
              className="absolute top-4 right-4 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition text-xs font-bold shadow-lg z-10"
            >
              {copied ? '¡COPIADO!' : <><Copy className="w-4 h-4"/> COPIAR SQL</>}
            </button>
            <pre className="bg-slate-950 text-green-400 p-6 rounded-xl overflow-x-auto text-xs font-mono border border-slate-800 max-h-[400px]">
              {FULL_SQL}
            </pre>
          </div>
        </div>
        
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end bg-slate-50 dark:bg-slate-900/50">
          <button onClick={onClose} className="px-6 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-700 transition">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
`;

const component = componentTemplate.replace('{____SQL____}', () => JSON.stringify(sql));
fs.writeFileSync('components/DbFixModal.tsx', component);
console.log('Done rendering DbFixModal V24');
