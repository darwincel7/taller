
import React, { useRef, useState, useEffect } from 'react';
import { Camera, RefreshCw, X, CheckCircle2, Zap, Image as ImageIcon } from 'lucide-react';

interface CameraCaptureProps {
  onCapture: (base64Image: string) => void;
  onClose: () => void;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [loading, setLoading] = useState(true);

  // Iniciar Cámara
  const startCamera = async () => {
    setLoading(true);
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
      setLoading(false);
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("No se pudo acceder a la cámara. Verifique los permisos.");
      onClose();
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, [facingMode]);

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;

    // Efecto Flash
    setFlash(true);
    setTimeout(() => setFlash(false), 150);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (context) {
      // Configurar dimensiones
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Dibujar
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Obtener imagen comprimida (JPEG 0.7 calidad)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      setCapturedImage(dataUrl);
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
  };

  const handleConfirm = () => {
    if (capturedImage) {
      onCapture(capturedImage);
      onClose();
    }
  };

  const switchCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-in fade-in duration-300">
      
      {/* Flash Overlay */}
      <div className={`absolute inset-0 bg-white pointer-events-none transition-opacity duration-150 z-20 ${flash ? 'opacity-80' : 'opacity-0'}`} />

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 bg-gradient-to-b from-black/60 to-transparent text-white">
        <h3 className="font-bold flex items-center gap-2"><Camera className="w-5 h-5"/> Foto Evidencia</h3>
        <button onClick={onClose} className="p-2 bg-white/20 rounded-full hover:bg-white/30 backdrop-blur-md"><X className="w-6 h-6"/></button>
      </div>

      {/* Main View */}
      <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
        {capturedImage ? (
          <img src={capturedImage} alt="Captured" className="max-h-full max-w-full object-contain" />
        ) : (
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            className="max-h-full max-w-full object-cover md:object-contain h-full w-full"
          />
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Controls */}
      <div className="bg-black/90 p-6 pb-10">
        {capturedImage ? (
          <div className="flex gap-4 max-w-sm mx-auto">
            <button onClick={handleRetake} className="flex-1 py-4 bg-slate-800 text-white rounded-2xl font-bold flex items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5"/> Repetir
            </button>
            <button onClick={handleConfirm} className="flex-1 py-4 bg-green-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-green-900/50">
              <CheckCircle2 className="w-5 h-5"/> Usar Foto
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between max-w-sm mx-auto px-4">
            <button onClick={switchCamera} className="p-4 bg-slate-800 rounded-full text-white hover:bg-slate-700 transition">
              <RefreshCw className="w-6 h-6"/>
            </button>
            
            <button 
              onClick={handleCapture} 
              className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center relative group active:scale-95 transition-transform"
            >
              <div className="w-16 h-16 bg-white rounded-full group-hover:bg-slate-200 transition-colors" />
            </button>

            <div className="w-14" /> {/* Spacer for symmetry */}
          </div>
        )}
      </div>
    </div>
  );
};
