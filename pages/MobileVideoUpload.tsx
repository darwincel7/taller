import React, { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Camera, CheckCircle2, Loader2, UploadCloud } from 'lucide-react';
import { supabase, getCleanStorageUrl } from '../services/supabase';

export const MobileVideoUpload: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [isUploading, setIsUploading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCaptureClick = () => {
    fileInputRef.current?.click();
  };

  const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1200;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Canvas to Blob failed'));
          }, 'image/jpeg', 0.7);
        };
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !sessionId) return;

    setIsUploading(true);
    setError(null);

    try {
      // 1. Compress Image
      const compressedBlob = await compressImage(file);
      
      // 2. Upload to Storage
      const fileName = `${sessionId}-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(fileName, compressedBlob, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // 3. Get Public URL
      const { data: publicUrlData } = supabase.storage
        .from('receipts')
        .getPublicUrl(fileName);

      // 4. Trigger PC via floating_expenses dummy record
      const { error: insertError } = await supabase
        .from('floating_expenses')
        .insert({
          description: 'RECEIPT_UPLOAD_TRIGGER',
          amount: 0,
          shared_receipt_id: sessionId,
          receipt_url: getCleanStorageUrl(publicUrlData.publicUrl)
        });

      if (insertError) throw insertError;

      setIsSuccess(true);
      setTimeout(() => {
        // Optional: close window or show success message permanently
      }, 2000);

    } catch (err: any) {
      console.warn("Error uploading receipt:", err);
      setError(err.message || "Error al subir la imagen");
    } finally {
      setIsUploading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500">
        <div className="bg-green-100 p-6 rounded-full mb-6">
          <CheckCircle2 className="w-20 h-20 text-green-600" />
        </div>
        <h1 className="text-3xl font-black text-slate-800 mb-2 tracking-tight">¡Factura Subida!</h1>
        <p className="text-slate-500 text-lg">Puede continuar en la computadora.</p>
        <p className="text-slate-400 text-sm mt-8">Ya puede cerrar esta pestaña.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
      <div className="bg-slate-800 p-8 rounded-3xl shadow-2xl max-w-sm w-full border border-slate-700">
        <div className="bg-blue-500/10 p-4 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
          <UploadCloud className="w-10 h-10 text-blue-400" />
        </div>
        <h1 className="text-2xl font-black text-white mb-2 tracking-tight">Subir Factura</h1>
        <p className="text-slate-400 text-sm mb-8">Tome una foto clara de la factura para adjuntarla a los gastos.</p>

        <input 
          type="file" 
          accept="image/*" 
          capture="environment" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          className="hidden" 
        />

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-sm mb-6">
            {error}
          </div>
        )}

        <button 
          onClick={handleCaptureClick}
          disabled={isUploading}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:pointer-events-none"
        >
          {isUploading ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              Procesando...
            </>
          ) : (
            <>
              <Camera className="w-6 h-6" />
              Tomar Foto
            </>
          )}
        </button>
      </div>
    </div>
  );
};
