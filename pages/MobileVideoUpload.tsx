
import React, { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { CheckCircle2, Video, AlertTriangle, Loader2, Camera, Wifi, XCircle, ShieldAlert } from 'lucide-react';

export const MobileVideoUpload: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [uploading, setUploading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isValidSession, setIsValidSession] = useState<boolean>(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // VALIDATE SESSION ID ON MOUNT (Prevents DB Type Error 22P02)
  useEffect(() => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!sessionId || !uuidRegex.test(sessionId)) {
          setIsValidSession(false);
          setError("QR Inválido: Este código pertenece a una versión anterior o está dañado. Por favor genera uno nuevo en la PC.");
      }
  }, [sessionId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !sessionId) return;

    // 1. Validate Size
    if (file.size > 50 * 1024 * 1024) {
        setError("El video es muy grande (Máx 50MB). Intenta grabar menos tiempo.");
        return;
    }

    // 2. Validate Session Again
    if (!isValidSession) {
        setError("No se puede subir: ID de sesión inválido.");
        return;
    }

    setUploading(true);
    setError(null);

    try {
        if (!supabase) throw new Error("Error de configuración: Cliente Supabase no inicializado.");

        // 3. Upload to Storage
        const fileName = `${sessionId}.mp4`;
        const { error: uploadError } = await supabase.storage
            .from('temp-videos')
            .upload(fileName, file, { upsert: true });

        if (uploadError) {
            console.error("Storage Error:", uploadError);
            if (uploadError.message.includes("Bucket not found") || uploadError.message.includes("row-level security")) {
                throw new Error("El sistema no acepta videos aún. (Falta ejecutar SQL de instalación en PC)");
            }
            throw uploadError;
        }

        // 4. Update Database Session
        const { data } = supabase.storage.from('temp-videos').getPublicUrl(fileName);
        const publicUrl = data.publicUrl;
        
        const { error: dbError } = await supabase
            .from('intake_sessions')
            .update({ 
                status: 'READY', 
                video_url: publicUrl 
            })
            .eq('id', sessionId);

        if (dbError) {
            console.error("DB Error:", dbError);
            throw new Error("Video subido, pero falló la notificación a la PC.");
        }

        setCompleted(true);

    } catch (err: any) {
        console.error(err);
        setError(err.message || "Fallo al subir video.");
    } finally {
        setUploading(false);
    }
  };

  // --- RENDER STATES ---

  if (!isValidSession) {
      return (
          <div className="min-h-screen bg-red-50 flex flex-col items-center justify-center p-6 text-center">
              <div className="bg-red-100 p-6 rounded-full mb-6">
                  <ShieldAlert className="w-12 h-12 text-red-600" />
              </div>
              <h1 className="text-2xl font-bold text-red-800 mb-2">Código QR Inválido</h1>
              <p className="text-red-600 mb-6">
                  El formato del código no es compatible con la base de datos actual.
              </p>
              <div className="bg-white p-4 rounded-xl border border-red-200 text-sm text-slate-600">
                  <strong>Solución:</strong><br/>
                  Cierra esta ventana, actualiza la página en tu computadora y genera un <strong>nuevo código QR</strong>.
              </div>
          </div>
      );
  }

  if (completed) {
      return (
          <div className="min-h-screen bg-green-50 flex flex-col items-center justify-center p-6 text-center animate-in zoom-in">
              <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-green-200">
                  <CheckCircle2 className="w-12 h-12 text-green-600" />
              </div>
              <h1 className="text-3xl font-extrabold text-green-800 mb-2">¡Video Enviado!</h1>
              <p className="text-green-700 font-medium">
                  La Inteligencia Artificial está procesando el video en la computadora principal.
              </p>
              <div className="mt-8 p-4 bg-white/50 rounded-xl border border-green-200 text-sm text-green-800">
                  Ya puedes cerrar esta pestaña.
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col p-6">
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8">
            
            {/* Header / Status */}
            <div className="relative">
                <div className="bg-blue-600 p-5 rounded-full shadow-[0_0_40px_rgba(37,99,235,0.6)] animate-pulse">
                    <Video className="w-10 h-10 text-white" />
                </div>
                <div className="absolute -top-2 -right-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                    <Wifi className="w-3 h-3"/> Online
                </div>
            </div>
            
            <div>
                <h1 className="text-3xl font-bold mb-2 tracking-tight">Escaneo Visual AI</h1>
                <p className="text-slate-400 max-w-xs mx-auto leading-relaxed">
                    Graba el equipo mostrando pantalla, bordes y parte trasera.
                </p>
            </div>

            {/* Error Display */}
            {error && (
                <div className="bg-red-500/20 text-red-200 p-4 rounded-2xl flex items-start gap-3 text-left w-full border border-red-500/50 animate-in slide-in-from-top-2">
                    <AlertTriangle className="w-6 h-6 flex-shrink-0 mt-0.5 text-red-400" />
                    <div>
                        <p className="font-bold text-sm text-red-300 mb-1">Hubo un problema</p>
                        <p className="text-xs opacity-90">{error}</p>
                    </div>
                </div>
            )}

            <input 
                ref={fileInputRef}
                type="file" 
                accept="video/*" 
                capture="environment" 
                className="hidden" 
                onChange={handleFileChange}
            />

            {/* Main Action Button */}
            <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className={`w-full py-6 rounded-3xl font-bold text-lg shadow-xl flex flex-col items-center gap-3 border transition-all active:scale-95 ${uploading ? 'bg-slate-700 border-slate-600 text-slate-400 cursor-not-allowed' : 'bg-gradient-to-b from-blue-500 to-blue-700 border-blue-400 text-white hover:shadow-blue-500/20'}`}
            >
                {uploading ? (
                    <>
                        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                        <span className="text-sm">Subiendo Video...</span>
                    </>
                ) : (
                    <>
                        <Camera className="w-8 h-8" />
                        <span>GRABAR AHORA</span>
                    </>
                )}
            </button>
            
            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 w-full max-w-xs">
                <p className="text-xs text-slate-400">
                    <span className="text-blue-400 font-bold">Tip:</span> Mantén el video corto (5-10 segundos) para que la IA lo procese más rápido.
                </p>
            </div>
        </div>
        
        <div className="text-center pb-4 opacity-40">
            <p className="text-[10px] font-mono">ID: {sessionId?.slice(0,8)}</p>
        </div>
    </div>
  );
};
