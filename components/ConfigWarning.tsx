import React, { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export const ConfigWarning = () => {
  const [missingVars, setMissingVars] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch('/api/config-status')
      .then(res => res.json())
      .then(data => {
        if (!data.ok && data.missing_vars) {
          setMissingVars(data.missing_vars);
        }
      })
      .catch(err => console.error("Error fetching config status:", err));
  }, []);

  if (missingVars.length === 0 || dismissed) return null;

  return (
    <div className="bg-red-600 text-white p-3 flex items-start justify-between gap-4 z-50 sticky top-0 shadow-lg">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="font-bold">Advertencia del Servidor</h4>
          <p className="text-sm opacity-90 mt-1">
            Faltan variables críticas en el backend: <strong>{missingVars.join(', ')}</strong>.
            Algunas funcionalidades fallarán. Configúralas en Replit/Render/Panel de Control y reinicia el servidor.
          </p>
        </div>
      </div>
      <button onClick={() => setDismissed(true)} className="p-1 hover:bg-white/20 rounded transition">
        <X className="w-5 h-5" />
      </button>
    </div>
  );
};
