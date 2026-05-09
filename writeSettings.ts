import fs from 'fs';

const content = `import React, { useState, useEffect } from 'react';
import { MessageSquare, RefreshCw, LogOut, CheckCircle2, AlertCircle, Loader2, AlertTriangle, Eye, ShieldAlert, X } from 'lucide-react';
import { fetchWithAuth } from '../lib/fetchWithAuth';

export const WhatsAppSettings: React.FC = () => {
  const [status, setStatus] = useState<'connecting' | 'open' | 'close'>('close');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);

  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditFilter, setAuditFilter] = useState<'all' | 'saved' | 'ignored' | 'error' | 'decryption_error'>('all');
  const [showRawModal, setShowRawModal] = useState<any | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetchWithAuth('/api/whatsapp/status');
      if (!res.ok) throw new Error(\`HTTP error! status: \${res.status}\`);
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        if (data && typeof data.status === 'string') {
          setStatus(data.status);
          setQrCode(data.qr);
        }
      } catch (e) {
        console.warn('Error parsing WhatsApp status JSON:', e);
      }
    } catch (error) {
      console.warn('Error fetching WhatsApp status:', error);
    } finally {
      setIsInitialLoad(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetchWithAuth('/api/whatsapp/audit?limit=50');
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setAuditLogs(data.data);
      }
    } catch (error) {
      console.warn('Error fetching audit logs', error);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchAuditLogs();
    
    const interval = setInterval(() => {
      if (status !== 'open') {
        fetchStatus();
      }
      fetchAuditLogs();
    }, 5000);
    return () => clearInterval(interval);
  }, [status]);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const res = await fetchWithAuth('/api/whatsapp/connect', { method: 'POST' });
      if (!res.ok) throw new Error(\`HTTP error! status: \${res.status}\`);
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        if (data && typeof data.status === 'string') {
          setStatus(data.status);
          setQrCode(data.qr);
        }
      } catch (e) {
        console.warn('Error parsing WhatsApp connect JSON:', e);
      }
    } catch (error) {
      console.warn('Error connecting to WhatsApp:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleReconnect = async () => {
    setIsConnecting(true);
    try {
      const res = await fetchWithAuth('/api/whatsapp/reconnect', { method: 'POST' });
      if (!res.ok) throw new Error(\`HTTP error! status: \${res.status}\`);
    } catch (error) {
      console.warn('Error reconnecting to WhatsApp:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleLogout = async () => {
    setIsConnecting(true);
    try {
      const res = await fetchWithAuth('/api/whatsapp/logout', { method: 'POST' });
      if (!res.ok) throw new Error(\`HTTP error! status: \${res.status}\`);
      setStatus('close');
      setQrCode(null);
    } catch (error) {
      console.warn('Error logging out from WhatsApp:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleRepairSession = async () => {
    if (!window.confirm("Esto cerrara la sesion actual, borrara whatsapp_auth y pedira QR nuevo. Antes cierra otras sesiones vinculadas desde el telefono.")) {
      return;
    }
    setIsRepairing(true);
    try {
      const res = await fetchWithAuth('/api/whatsapp/repair-session', { method: 'POST' });
      if (!res.ok) throw new Error('Error al reparar sesion');
      setStatus('close');
      setQrCode(null);
      setTimeout(() => fetchStatus(), 2000);
    } catch (e: any) {
      console.warn('Error repairing session', e);
      alert('Hubo un error al reparar: ' + e.message);
    } finally {
      setIsRepairing(false);
    }
  };

  const hasDecryptionError = auditLogs.some(log => log.reason_to_ignore === 'decryption_error');

  const filteredLogs = auditLogs.filter(log => {
      if (auditFilter === 'all') return true;
      if (auditFilter === 'decryption_error') return log.reason_to_ignore === 'decryption_error';
      return log.action === auditFilter;
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-green-500" />
            Conexión WhatsApp
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Vincula el número del negocio para enviar notificaciones automáticas a los clientes.
          </p>
        </div>
      </div>

      {hasDecryptionError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex gap-3 text-red-800 dark:text-red-300">
          <ShieldAlert className="w-6 h-6 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-bold">Advertencia Crítica</p>
            <p>Mensaje recibido por WhatsApp, pero Baileys no pudo descifrarlo. Requiere reparar sesion.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm flex flex-col justify-center">
          {isInitialLoad && status === 'close' && !qrCode ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
              <p className="text-slate-500 dark:text-slate-400">Cargando estado de conexión...</p>
            </div>
          ) : status === 'open' ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
              <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-2">
                <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">¡WhatsApp Conectado!</h2>
              <p className="text-slate-500 dark:text-slate-400 max-w-md">
                El sistema está listo para enviar notificaciones automáticas a los clientes cuando sus equipos estén listos.
              </p>
              <div className="flex flex-wrap gap-4 justify-center mt-6">
                <button
                  onClick={handleReconnect}
                  disabled={isConnecting || isRepairing}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                  {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Reconectar
                </button>
                <button
                  onClick={handleRepairSession}
                  disabled={isConnecting || isRepairing}
                  className="flex items-center gap-2 px-6 py-2.5 bg-orange-50 text-orange-600 hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:hover:bg-orange-900/40 rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                  {isRepairing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                  Reparar sesión WhatsApp
                </button>
                <button
                  onClick={handleLogout}
                  disabled={isConnecting || isRepairing}
                  className="flex items-center gap-2 px-6 py-2.5 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                  {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                  Desconectar Dispositivo
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row items-center gap-8">
              <div className="flex-1 space-y-6">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Instrucciones de Vinculación</h2>
                <ol className="space-y-4 text-slate-600 dark:text-slate-300">
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm">1</span>
                    <p>Abre WhatsApp en el teléfono del negocio.</p>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm">2</span>
                    <p>Toca el menú y selecciona <strong>Dispositivos vinculados</strong>.</p>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm">3</span>
                    <p>Apunta la cámara de tu teléfono a la pantalla para escanear el código QR.</p>
                  </li>
                </ol>
                
                {!qrCode && status !== 'connecting' && (
                  <div className="space-y-3">
                    <button
                      onClick={handleReconnect}
                      disabled={isConnecting}
                      className="flex w-full items-center justify-center gap-2 px-6 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-medium transition-colors disabled:opacity-50"
                    >
                      {isConnecting ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                      Reconectar sin borrar sesión
                    </button>
                    <button
                      onClick={handleConnect}
                      disabled={isConnecting}
                      className="flex w-full items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                    >
                      {isConnecting ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                      Generar nuevo QR
                    </button>
                  </div>
                )}
              </div>
              
              <div className="flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                {qrCode ? (
                  <div className="space-y-4 text-center">
                    <div className="bg-white p-4 rounded-xl shadow-sm inline-block">
                      <img src={qrCode} alt="WhatsApp QR Code" className="w-64 h-64" />
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Esperando escaneo...
                    </p>
                  </div>
                ) : status === 'connecting' || isConnecting ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                    <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
                    <p className="text-slate-500 dark:text-slate-400 font-medium">Generando código QR...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center space-y-4 opacity-50">
                    <MessageSquare className="w-16 h-16 text-slate-400" />
                    <p className="text-slate-500 dark:text-slate-400 font-medium">Haz clic en "Generar Código QR"</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col h-[500px]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Diagnóstico WhatsApp
            </h2>
            <select
              title="Filtro de diagnóstico"
              className="bg-slate-50 dark:bg-slate-800 border-none text-sm rounded-lg py-1 px-2 focus:ring-0"
              value={auditFilter}
              onChange={(e: any) => setAuditFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="saved">Guardados (saved)</option>
              <option value="ignored">Ignorados (ignored)</option>
              <option value="error">Errores (error)</option>
              <option value="decryption_error">Fallo descifrado</option>
            </select>
          </div>
          <div className="flex-1 overflow-auto border border-slate-100 dark:border-slate-800 rounded-xl">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 sticky top-0 shadow-sm">
                <tr>
                  <th className="px-4 py-3 font-medium">Hora</th>
                  <th className="px-4 py-3 font-medium">Acción</th>
                  <th className="px-4 py-3 font-medium">Motivo</th>
                  <th className="px-4 py-3 font-medium">JID / Teléfono</th>
                  <th className="px-4 py-3 font-medium">Msj</th>
                  <th className="px-4 py-3 font-medium">Raw</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No hay eventos recientes {auditFilter !== 'all' ? \`para el filtro: \${auditFilter}\` : ''}
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-300">
                        {new Date(log.created_at).toLocaleTimeString()}
                      </td>
                      <td className="px-4 py-2">
                        <span className={\`px-2 py-0.5 rounded-full text-xs font-medium 
                          \${log.action === 'saved' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                            log.action === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                            'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'}\`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-300">
                        {log.reason_to_ignore || log.error_message || '-'}
                      </td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-300">
                        {(log.resolved_phone || log.raw_jid || '').split('@')[0]}
                      </td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-300 max-w-[150px] truncate">
                        {log.final_text || log.message_type || '-'}
                      </td>
                      <td className="px-4 py-2">
                        {log.raw && (
                          <button
                            title="Ver Raw JSON"
                            onClick={() => setShowRawModal(log.raw)}
                            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors text-slate-500"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 dark:text-blue-300">
          <p className="font-bold mb-1">Nota sobre la conexión:</p>
          <p>Esta conexión utiliza WhatsApp Web de fondo. El teléfono principal debe mantenerse con conexión a internet. Si tienes problemas persistentes de descifrado, haz clic en "Reparar sesión WhatsApp".</p>
        </div>
      </div>

      {showRawModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[99]">
          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 max-w-2xl w-full max-h-[80vh] flex flex-col shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold">Raw JSON</h3>
              <button title="Cerrar" onClick={() => setShowRawModal(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <pre className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950 p-4 rounded-lg text-xs font-mono text-slate-800 dark:text-slate-300">
              {JSON.stringify(showRawModal, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
`;

fs.writeFileSync('pages/WhatsAppSettings.tsx', content);

console.log('done!');

console.log('done!');
