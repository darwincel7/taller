import React, { useState, useMemo, useEffect } from 'react';
import { useInventory } from '../../contexts/InventoryContext';
import { useAuth } from '../../contexts/AuthContext';
import { parseInventoryCategory } from '../../types';
import { ShoppingCart, X, UploadCloud, Smartphone, Camera, QrCode, Loader2 } from 'lucide-react';
import { supabase, getCleanStorageUrl } from '../../services/supabase';
import { toast } from 'sonner';
import { CameraCapture } from '../../components/CameraCapture';
import { QRCodeSVG } from 'qrcode.react';

export const AddStoreItemModal = ({ productId, onClose }: { productId: string, onClose: () => void }) => {
  const { inventory, addInventoryPart, updateInventoryPart } = useInventory();
  const { currentUser } = useAuth();
  
  const product = inventory.find(p => p.id === productId);
  const parsedProduct = parseInventoryCategory(product?.category) as any;
  const productCategory = inventory.find(c => c.id === parsedProduct?.categoryId);
  const isCellphone = (productCategory?.name || '').toLowerCase().includes('celular');
  
  const [formData, setFormData] = useState({
    imei: '',
    purchaseId: '',
    cost: 0,
    price: 0,
    quantity: 1,
    imageUrl: '',
    min_stock: product?.min_stock || 2
  });
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressError, setProgressError] = useState('');

  const [showCamera, setShowCamera] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [sessionId] = useState(() => `sess_${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    if (!showQR) return;
    const channel = supabase.channel(`upload_${sessionId}`)
      .on('broadcast', { event: 'image_uploaded' }, payload => {
        setFormData(prev => ({ ...prev, imageUrl: payload.payload.imageUrl }));
        setShowQR(false);
        toast.success("Imagen recibida correctamente");
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [showQR, sessionId]);

  const handleAcceptDevice = async (base64OrFile: any) => {
    let file: File;
    if (typeof base64OrFile === 'string') {
      const res = await fetch(base64OrFile);
      const blob = await res.blob();
      file = new File([blob], "camera_capture.jpg", { type: "image/jpeg" });
    } else {
      file = base64OrFile;
    }
    setIsUploading(true);
    try {
       const ext = 'jpg';
       const fileName = `item_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
       const { error } = await supabase.storage.from('receipts').upload(fileName, file, { cacheControl: '3600' });
       if (error) throw error;
       const { data } = supabase.storage.from('receipts').getPublicUrl(fileName);
       setFormData(prev => ({ ...prev, imageUrl: getCleanStorageUrl(data.publicUrl) }));
       toast.success('Imagen capturada');
    } catch (err: any) {
       toast.error('Error al subir imagen');
    } finally {
       setIsUploading(false);
    }
  };

  const purchases = useMemo(() => {
    return inventory.filter(p => {
       const cat = parseInventoryCategory(p.category);
       if (cat.type !== 'STORE_PURCHASE') return false;
       const used = (cat as any).usedAmount || 0;
       return (p.cost - used) > 0;
    });
  }, [inventory]);

  const providers = useMemo(() => {
    return inventory.filter(p => {
       const cat = parseInventoryCategory(p.category) as any;
       return cat.type === 'STORE_ATTRIBUTE' && cat.subType === 'PROVIDER';
    });
  }, [inventory]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    setIsUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `item_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const { error } = await supabase.storage.from('receipts').upload(fileName, file, { cacheControl: '3600' });
      if (error) throw error;
      const { data } = supabase.storage.from('receipts').getPublicUrl(fileName);
      setFormData(prev => ({ ...prev, imageUrl: getCleanStorageUrl(data.publicUrl) }));
      toast.success('Imagen cargada');
    } catch (err: any) {
      toast.error('Error al subir imagen');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.purchaseId) return toast.error("Selecciona una compra primero");
    if (formData.price <= 0) return toast.error("Precio de venta inválido");
    if (isCellphone && !formData.imageUrl) return toast.error("Debes incluir una foto de la unidad del celular.");
    const qty = (formData.imei?.trim()) ? 1 : Math.max(1, formData.quantity);

    const purchasePart = inventory.find(i => i.id === formData.purchaseId);
    if (!purchasePart) return toast.error("Compra no encontrada");
    const pCat = parseInventoryCategory(purchasePart.category) as any;
    
    if ((pCat.usedAmount || 0) + (formData.cost * qty) > purchasePart.cost) {
        return toast.error("El costo total de estas unidades excede el monto disponible de esta compra.");
    }

    const providerName = providers.find(p => p.id === pCat.providerId)?.name || 'N/A';

    try {
      setIsSubmitting(true);
      setProgress(0);
      setProgressError('');
      
      if (isCellphone || formData.imei?.trim()) {
        for (let i = 0; i < qty; i++) {
          await addInventoryPart({
            name: product?.name || 'Item',
            stock: 1, // Available
            cost: formData.cost,
            price: formData.price,
            category: JSON.stringify({
              type: 'STORE_ITEM',
              isCellphone: true,
              parentId: productId,
              purchaseId: formData.purchaseId,
              providerId: pCat.providerId,
              imei: formData.imei || undefined,
              status: 'AVAILABLE',
              branch: currentUser?.branch || 'T4',
              imageUrl: formData.imageUrl || undefined,
              history: [{
                  action: 'REGISTRO DE INGRESO',
                  date: new Date().toISOString(),
                  user: currentUser?.name || 'Usuario desconocido',
                  details: `Unidad ingresada al inventario con costo: $${formData.cost} y precio de venta: $${formData.price}. Origen: ${purchasePart.name}. Proveedor: ${providerName}`
              }]
            })
          });
          setProgress(Math.round(((i + 1) / qty) * 100));
        }
      } else {
        const existingItem = inventory.find(i => {
           const cat = parseInventoryCategory(i.category) as any;
           return cat.type === 'STORE_ITEM' && cat.parentId === productId && !cat.imei;
        });

        if (existingItem) {
            const eCat = parseInventoryCategory(existingItem.category) as any;
            const newTotalCost = (existingItem.cost * existingItem.stock) + (formData.cost * qty);
            const newStock = existingItem.stock + qty;
            const newCost = newTotalCost / newStock;
            
            const newHistory = [...(eCat.history || []), {
                action: 'INCREMENTO BATCH DE UNIDADES',
                date: new Date().toISOString(),
                user: currentUser?.name || 'Usuario desconocido',
                details: `Se añadieron ${qty} unidades al inventario. Costo anterior unitario: $${parseFloat(existingItem.cost.toFixed(2))}, costo de entrada: $${formData.cost}. Nuevo costo unitario promediado: $${parseFloat(newCost.toFixed(2))}. Precio actualizado a: $${formData.price}. Origen: ${purchasePart.name}. Proveedor: ${providerName}`
            }];

            await updateInventoryPart(existingItem.id, {
               stock: newStock,
               cost: newCost,
               price: formData.price,
               category: JSON.stringify({
                  ...eCat,
                  history: newHistory,
                  imageUrl: formData.imageUrl || eCat.imageUrl,
                  status: 'AVAILABLE'
               })
            });
            setProgress(100);
        } else {
            await addInventoryPart({
                name: product?.name || 'Item',
                stock: qty, 
                cost: formData.cost,
                price: formData.price,
                category: JSON.stringify({
                  type: 'STORE_ITEM',
                  isCellphone: false,
                  parentId: productId,
                  purchaseId: formData.purchaseId,
                  providerId: pCat.providerId,
                  status: 'AVAILABLE',
                  branch: currentUser?.branch || 'T4',
                  imageUrl: formData.imageUrl || undefined,
                  history: [{
                      action: 'REGISTRO DE INGRESO BULK',
                      date: new Date().toISOString(),
                      user: currentUser?.name || 'Usuario desconocido',
                      details: `${qty} unidades ingresadas con costo: $${formData.cost} y precio de venta: $${formData.price}. Origen: ${purchasePart.name}. Proveedor: ${providerName}`
                  }]
                })
            });
            setProgress(100);
        }
      }

      // Update usedAmount on the purchase
      await updateInventoryPart(purchasePart.id, {
        category: JSON.stringify({
           ...pCat,
           usedAmount: (pCat.usedAmount || 0) + (formData.cost * qty)
        })
      });

      // Update parent product's min_stock
      if (product) {
        await updateInventoryPart(product.id, {
          min_stock: parseInt(formData.min_stock as any) || 0
        });
      }

      toast.success(qty > 1 ? `${qty} unidades añadidas` : "Unidad añadida correctamente");
      onClose();
    } catch (e: any) {
      setProgressError(e.message || "Error al añadir unidades");
      toast.error("Error al añadir unidad");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] flex items-center justify-start p-4 sm:pl-[10%] xl:pl-[15%]" onClick={onClose}>
      <div className="bg-white rounded-[2rem] w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0">
           <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
             <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
               <Smartphone className="w-5 h-5"/>
             </div>
             Añadir Unidad
           </h2>
           <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl text-slate-500"><X className="w-6 h-6"/></button>
        </div>

        <div className="p-6 overflow-y-auto">
           <div className="bg-indigo-50 text-indigo-800 p-4 rounded-xl font-bold mb-6 flex items-center justify-between">
             <span>{product?.name}</span>
             {isCellphone && <span className="bg-indigo-200 text-indigo-800 text-[10px] uppercase font-bold px-2 py-1 rounded">CELULAR</span>}
           </div>

           <form id="item-form" onSubmit={handleSubmit} className="space-y-6">
              <div>
                 <label className="block text-sm font-bold text-slate-700 mb-2">Gasto de Compra Asociado *</label>
                 <select required value={formData.purchaseId} onChange={e => setFormData({...formData, purchaseId: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-indigo-500">
                   <option value="">Selecciona el fondo / compra...</option>
                   {purchases.map(p => {
                     const cat = parseInventoryCategory(p.category) as any;
                     return <option key={p.id} value={p.id}>{p.name} (Restante aprox: ${(p.cost - (cat.usedAmount || 0)).toLocaleString()})</option>;
                   })}
                 </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-sm font-bold text-slate-700 mb-2">Costo por unidad (Inversión)</label>
                   <input type="number" required min="0" step="0.01" value={formData.cost || ''} onChange={e => setFormData({...formData, cost: Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500" />
                 </div>
                 <div>
                   <label className="block text-sm font-bold text-slate-700 mb-2">Precio de Venta (und)</label>
                   <input type="number" required min="0" step="0.01" value={formData.price || ''} onChange={e => setFormData({...formData, price: Number(e.target.value)})} className="w-full bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 font-black text-indigo-700 outline-none focus:ring-2 focus:ring-indigo-500" />
                 </div>
              </div>

              {!formData.imei?.trim() && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Cantidad a ingresar</label>
                  <input type="number" required min="1" step="1" value={formData.quantity} onChange={e => setFormData({...formData, quantity: Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">{isCellphone ? 'IMEI (Opcional por ahora)' : 'Serial Number (SN)'}</label>
                <input value={formData.imei} onChange={e => setFormData({...formData, imei: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-mono font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder={isCellphone ? "IMEI de 15 dígitos..." : "SN Opcional..."} />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Aviso de Stock Crítico (Mínimo)</label>
                <input type="number" min="0" value={formData.min_stock} onChange={e => setFormData({...formData, min_stock: parseInt(e.target.value) || 0})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Ej. 2" />
                <p className="text-xs text-slate-500 mt-1">Este valor actualizará el mínimo para todo el modelo de este artículo.</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Foto de la Unidad {isCellphone ? '(Requerida)' : '(Opcional)'}</label>
                {!formData.imageUrl ? (
                   <div className="grid grid-cols-3 gap-2">
                      <button type="button" onClick={() => document.getElementById('item-upload-input')?.click()} className={`col-span-3 lg:col-span-1 bg-slate-50 border ${isCellphone ? 'border-amber-400 bg-amber-50' : 'border-slate-200'} hover:border-indigo-500 rounded-xl p-3 flex flex-col items-center justify-center gap-1 transition-colors text-slate-500 hover:text-indigo-600`}>
                         <UploadCloud className="w-5 h-5 mb-1" />
                         <span className="text-[10px] uppercase font-bold text-center">Subir Archivo</span>
                      </button>
                      <button type="button" onClick={() => setShowCamera(true)} className={`col-span-3 lg:col-span-1 bg-slate-50 border ${isCellphone ? 'border-amber-400 bg-amber-50' : 'border-slate-200'} hover:border-indigo-500 rounded-xl p-3 flex flex-col items-center justify-center gap-1 transition-colors text-slate-500 hover:text-indigo-600`}>
                         <Camera className="w-5 h-5 mb-1" />
                         <span className="text-[10px] uppercase font-bold text-center">Usar Cámara</span>
                      </button>
                      <button type="button" onClick={() => setShowQR(true)} className={`col-span-3 lg:col-span-1 bg-slate-50 border ${isCellphone ? 'border-amber-400 bg-amber-50' : 'border-slate-200'} hover:border-indigo-500 rounded-xl p-3 flex flex-col items-center justify-center gap-1 transition-colors text-slate-500 hover:text-indigo-600`}>
                         <QrCode className="w-5 h-5 mb-1" />
                         <span className="text-[10px] uppercase font-bold text-center">Desde Celular</span>
                      </button>
                      <input id="item-upload-input" type="file" accept="image/*" onChange={handleImageUpload} disabled={isUploading} className="hidden" />
                   </div>
                ) : (
                   <div className="relative group rounded-2xl overflow-hidden border-2 border-slate-200 bg-slate-50 flex items-center justify-center min-h-[160px]">
                      {isUploading ? <span className="font-bold text-indigo-500">Subiendo...</span> : <img src={formData.imageUrl} className="h-full object-contain p-2 max-h-[250px]" alt="img" />}
                      {!isUploading && (
                         <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button type="button" onClick={() => setFormData(prev => ({...prev, imageUrl: ''}))} className="bg-rose-500 text-white font-bold px-4 py-2 rounded-xl text-sm hover:bg-rose-600 flex items-center gap-2">
                               <X className="w-4 h-4"/> Remover Imagen
                            </button>
                         </div>
                      )}
                   </div>
                )}
              </div>
           </form>
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3 shrink-0 flex-col">
           {isSubmitting ? (
             <div className="w-full space-y-3">
                <div className="flex justify-between items-center text-sm font-bold text-slate-700">
                  <span>Espera, añadiendo unidades...</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                   <div className="bg-indigo-600 h-3 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                </div>
                {progressError && <div className="text-red-500 text-sm font-bold bg-red-50 p-3 rounded-lg border border-red-200">{progressError}</div>}
             </div>
           ) : (
             <div className="flex gap-3 w-full">
               <button type="button" onClick={onClose} className="flex-1 bg-slate-200 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-300 transition-colors">Cancelar</button>
               <button type="submit" form="item-form" className="flex-1 bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 shadow-lg transition-all shadow-indigo-200 flex justify-center items-center gap-2">
                 {formData.quantity > 1 ? `Añadir ${formData.quantity} Unidades` : 'Añadir Unidad'}
               </button>
             </div>
           )}
        </div>
      </div>
    </div>
      {showCamera && (
          <CameraCapture 
              onCapture={(img) => {
                  handleAcceptDevice(img);
                  setShowCamera(false);
              }} 
              onClose={() => setShowCamera(false)} 
          />
      )}
      {showQR && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4" onClick={(e) => { e.stopPropagation(); setShowQR(false); }}>
              <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl max-w-sm w-full animate-in zoom-in-95 fade-in duration-200" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-between items-center mb-6">
                      <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
                              <QrCode className="w-5 h-5 text-indigo-400" />
                          </div>
                          <div>
                              <h3 className="font-black text-white leading-tight">Escanear QR</h3>
                              <p className="text-xs text-slate-400 font-medium">Subir foto del equipo</p>
                          </div>
                      </div>
                      <button onClick={() => setShowQR(false)} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 p-2 rounded-full transition-colors">
                          <X className="w-4 h-4" />
                      </button>
                  </div>
                  
                  <div className="bg-white p-4 rounded-2xl flex items-center justify-center mb-6 shadow-indigo-500/10 shadow-xl w-fit mx-auto">
                      <QRCodeSVG value={`${window.location.origin}/#/mobile-upload/${sessionId}?type=device`} size={200} level="H" includeMargin={true} className="rounded-xl" />
                  </div>
                  
                  <div className="flex items-center gap-3 mb-6 bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-2xl">
                      <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0">
                          <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                      </div>
                      <p className="text-xs font-medium text-indigo-200 leading-relaxed">
                          Esperando recepción de imagen... La ventana se cerrará automáticamente al finalizar.
                      </p>
                  </div>

                  <button
                      onClick={() => setShowQR(false)}
                      className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl transition-colors text-sm"
                  >
                      Cancelar
                  </button>
              </div>
          </div>
      )}
    </>
  );
}
