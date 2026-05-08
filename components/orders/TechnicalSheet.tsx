
import React, { useState, useRef } from 'react';
import { Smartphone, Maximize2, FileText, Wrench, X, Upload, Loader2 } from 'lucide-react';
import { RepairOrder, OrderType } from '../../types';
import { OrderInfoEdit } from '../OrderInfoEdit';
import { useOrders } from '../../contexts/OrderContext';
import { supabase } from '../../services/supabase';
import { toast } from 'sonner';

interface TechnicalSheetProps {
  order: RepairOrder;
  isEditing: boolean;
  setIsEditing: (val: boolean) => void;
  editForm: any;
  setEditForm: (val: any) => void;
  isAdmin: boolean;
  canEdit: boolean;
  canChangeDeadline?: boolean;
  onSave: () => void;
  onSearchCustomer?: () => void;
}

export const TechnicalSheet: React.FC<TechnicalSheetProps> = ({
  order,
  isEditing,
  setIsEditing,
  editForm,
  setEditForm,
  isAdmin,
  canEdit,
  canChangeDeadline,
  onSave,
  onSearchCustomer
}) => {
  const [isZoomed, setIsZoomed] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { updateOrderDetails } = useOrders();

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    setIsUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `order_${order.id}_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const { error } = await supabase.storage.from('receipts').upload(fileName, file, { cacheControl: '3600' });
      if (error) throw error;
      const { data } = supabase.storage.from('receipts').getPublicUrl(fileName);
      
      await updateOrderDetails(order.id, { devicePhoto: data.publicUrl });
      toast.success('Imagen actualizada correctamente');
    } catch (err: any) {
      toast.error('Error al subir imagen: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* FULL SCREEN IMAGE PREVIEW MODAL */}
      {isZoomed && order.devicePhoto && (
        <div 
          className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-300 backdrop-blur-sm"
          onClick={() => setIsZoomed(false)}
        >
          <button 
            className="absolute top-6 right-6 text-white p-3 bg-white/10 rounded-full hover:bg-white/30 transition backdrop-blur-md"
            onClick={() => setIsZoomed(false)}
          >
            <X className="w-8 h-8" />
          </button>
          <img 
            src={order.devicePhoto} 
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl border border-white/20" 
            alt="Evidencia Full HD"
            onClick={(e) => e.stopPropagation()} 
          />
        </div>
      )}

      {/* DEVICE IMAGE THUMBNAIL */}
      <div 
        onClick={() => { if(order.devicePhoto) setIsZoomed(true); }}
        className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden h-48 flex items-center justify-center bg-slate-100 relative group cursor-pointer"
      >
        {isUploading && (
          <div className="absolute inset-0 bg-white/80 z-20 flex flex-col items-center justify-center backdrop-blur-sm">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-2" />
            <span className="text-sm font-bold text-slate-700">Subiendo...</span>
          </div>
        )}
      
        {order.devicePhoto ? (
          <img src={order.devicePhoto} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt="Evidencia" />
        ) : (
          <Smartphone className="w-16 h-16 text-slate-300" />
        )}
        
        {order.devicePhoto && (
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center backdrop-blur-[1px] gap-3">
            <p className="text-white font-bold flex items-center gap-2 bg-black/50 px-4 py-2 rounded-full border border-white/20 transform translate-y-2 group-hover:translate-y-0 transition-transform">
              <Maximize2 className="w-5 h-5"/> Ver en HD
            </p>
          </div>
        )}

        {canEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="absolute bottom-4 right-4 bg-white/90 text-slate-800 p-2 rounded-full shadow-lg border border-slate-200 hover:bg-blue-50 hover:text-blue-600 transition-all z-10"
            title="Cambiar imagen"
          >
            <Upload className="w-5 h-5" />
          </button>
        )}
        <input 
          type="file" 
          accept="image/*" 
          className="hidden" 
          ref={fileInputRef} 
          onChange={handleImageUpload} 
        />
      </div>

      {/* TECHNICAL INFO CARD */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-2">
          <h3 className="font-bold text-slate-400 text-xs uppercase flex items-center gap-2"><FileText className="w-4 h-4"/> Ficha Técnica</h3>
          {canEdit && (
            <button onClick={() => setIsEditing(!isEditing)} className="text-blue-600 hover:bg-blue-50 p-1 rounded transition">
              <Wrench className="w-4 h-4"/>
            </button>
          )}
        </div>

        {isEditing ? (
          <OrderInfoEdit 
            editForm={editForm} 
            setEditForm={setEditForm} 
            isAdmin={isAdmin} 
            canChangeDeadline={canChangeDeadline}
            onCancel={() => setIsEditing(false)} 
            onSave={onSave} 
            orderType={order.orderType}
            onSearchCustomer={onSearchCustomer}
          />
        ) : (
          <div className="space-y-4 text-sm">
            <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
              <p className="text-[10px] font-bold text-blue-400 uppercase mb-1">CLIENTE</p>
              <p className="font-black text-slate-800 text-lg leading-none">{order.customer.name}</p>
              <p className="text-blue-600 font-bold flex items-center gap-1 mt-1"><Smartphone className="w-3 h-3"/> {order.customer.phone}</p>
            </div>
            <div><p className="text-[10px] font-bold text-slate-400 uppercase">IMEI</p><p className="font-mono font-bold text-slate-700">{order.imei || 'N/A'}</p></div>
            <div><p className="text-[10px] font-bold text-slate-400 uppercase">FALLA</p><p className="font-medium text-slate-700 uppercase">{order.deviceIssue}</p></div>
            <div><p className="text-[10px] font-bold text-slate-400 uppercase">OBSERVACIONES VISUALES</p><p className="font-medium text-slate-700 uppercase">{order.deviceCondition || 'Sin observaciones'}</p></div>
            <div><p className="text-[10px] font-bold text-slate-400 uppercase">CONTRASEÑA</p><p className="font-mono bg-slate-100 px-2 py-1 rounded w-fit text-slate-700 border border-slate-200">{order.devicePassword || 'Sin clave'}</p></div>
          </div>
        )}
      </div>
    </div>
  );
};
