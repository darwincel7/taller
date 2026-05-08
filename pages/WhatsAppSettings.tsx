import React, { useState, useEffect } from 'react';
import { MessageSquare, RefreshCw, LogOut, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export const WhatsAppSettings: React.FC = () => {
  const [status, setStatus] = useState<'connecting' | 'open' | 'close'>('close');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
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

  useEffect(() => {
    fetchStatus();
    // Poll status every 3 seconds if not connected
    const interval = setInterval(() => {
      if (status !== 'open') {
        fetchStatus();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [status]);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const res = await fetch('/api/whatsapp/connect', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
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
      const res = await fetch('/api/whatsapp/reconnect', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      // The polling will pick up the status change
    } catch (error) {
      console.warn('Error reconnecting to WhatsApp:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleLogout = async () => {
    setIsConnecting(true);
    try {
      const res = await fetch('/api/whatsapp/logout', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      setStatus('close');
      setQrCode(null);
    } catch (error) {
      console.warn('Error logging out from WhatsApp:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
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

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
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
                disabled={isConnecting}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 rounded-xl font-medium transition-colors disabled:opacity-50"
              >
                {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Reconectar
              </button>
              <button
                onClick={handleLogout}
                disabled={isConnecting}
                className="flex items-center gap-2 px-6 py-2.5 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 rounded-xl font-medium transition-colors disabled:opacity-50"
              >
                {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                Desconectar Dispositivo
              </button>
            </div>
            <div className="mt-4 text-xs text-slate-500 dark:text-slate-400 max-w-md">
              Si experimentas errores como "Failed to decrypt message" o "Bad MAC", haz clic en <strong>Desconectar Dispositivo</strong> y vuelve a escanear el código QR.
            </div>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row items-center gap-12">
            <div className="flex-1 space-y-6">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Instrucciones de Vinculación</h2>
              <ol className="space-y-4 text-slate-600 dark:text-slate-300">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm">1</span>
                  <p>Abre WhatsApp en el teléfono del negocio.</p>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm">2</span>
                  <p>Toca el menú de tres puntos (Android) o Configuración (iPhone) y selecciona <strong>Dispositivos vinculados</strong>.</p>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm">3</span>
                  <p>Toca <strong>Vincular un dispositivo</strong>.</p>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm">4</span>
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
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    Generar nuevo QR puede borrar la sesión anterior y requerir escaneo nuevamente.
                  </p>
                </div>
              )}
            </div>
            
            <div className="w-full md:w-80 flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
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
                  <p className="text-slate-500 dark:text-slate-400 font-medium">Haz clic en "Generar Código QR" para comenzar</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 dark:text-blue-300">
          <p className="font-bold mb-1">Nota sobre la conexión:</p>
          <p>Esta conexión utiliza WhatsApp Web de fondo. El teléfono principal debe mantenerse con conexión a internet (aunque no es necesario que esté en la misma red WiFi). Si cierras sesión desde tu teléfono, tendrás que volver a escanear el código aquí.</p>
        </div>
      </div>
    </div>
  );
};
