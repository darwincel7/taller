import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInventory } from '../../contexts/InventoryContext';
import { useAuth } from '../../contexts/AuthContext';
import { parseInventoryCategory, UserRole } from '../../types';
import { X, Smartphone, Download, Tag, DollarSign, Edit2, Trash2, History, AlertTriangle, UploadCloud, CheckCircle2, ShieldCheck, Wrench, Loader2, Camera, QrCode, BellRing, Plus, Package } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, getCleanStorageUrl } from '../../services/supabase';
import { CameraCapture } from '../../components/CameraCapture';
import { QRCodeSVG } from 'qrcode.react';

export const StoreItemDetailsInline = ({ itemId, onClose, onAddRequest }: { itemId: string, onClose: () => void, onAddRequest?: (productId: string) => void }) => {
  const navigate = useNavigate();
  const { inventory, deleteInventoryPart, updateInventoryPart } = useInventory();
  const { currentUser } = useAuth();
  const [showHistory, setShowHistory] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [sessionId] = useState(() => `sess_${Math.random().toString(36).substr(2, 9)}`);

  const itemFallback = inventory.find(p => p.id === itemId);
  const catFallback = itemFallback ? (parseInventoryCategory(itemFallback.category) as any) : {};

  const [activePhoto, setActivePhoto] = useState<'CURRENT' | 'INITIAL'>('CURRENT');
  const [isEditing, setIsEditing] = useState(false);
  
  const [selectedParentId, setSelectedParentId] = useState<string>(catFallback.parentId || '');
  const [editImei, setEditImei] = useState<string>(catFallback.imei || '');
  const [editPrice, setEditPrice] = useState<string>(itemFallback?.price?.toString() || '0');
  const [editName, setEditName] = useState<string>(itemFallback?.name || '');

  // Keep state in sync if itemId changes
  useEffect(() => {
    setActivePhoto('CURRENT');
    setIsEditing(false);
    setShowHistory(false);
    if (itemFallback) {
        setSelectedParentId(catFallback.parentId || '');
        setEditImei(catFallback.imei || '');
        setEditPrice(itemFallback.price?.toString() || '0');
        
        // Strip legacy (IMEI: ...) appends from old items
        let cleanName = itemFallback.name || '';
        const imeiIndex = cleanName.indexOf('(IMEI:');
        const imeiIndex2 = cleanName.indexOf('(Imei:');
        const sNIndex = cleanName.indexOf('(S/N:');
        
        let minIndex = -1;
        if (imeiIndex !== -1) minIndex = imeiIndex;
        if (imeiIndex2 !== -1 && (minIndex === -1 || imeiIndex2 < minIndex)) minIndex = imeiIndex2;
        if (sNIndex !== -1 && (minIndex === -1 || sNIndex < minIndex)) minIndex = sNIndex;
        
        if (minIndex !== -1) cleanName = cleanName.substring(0, minIndex).trim();

        setEditName(cleanName);
    }
  }, [itemId, itemFallback]);

  // QR Upload Listener
  useEffect(() => {
    if (!showQR) return;
    
    console.log("Listening for upload on session:", sessionId);
    const channel = supabase.channel(`upload_${sessionId}`)
        .on('broadcast', { event: 'upload_complete' }, (payload) => {
            console.log("Received upload broadcast!", payload);
            if (payload.payload?.url) {
                handleAcceptDevice(payload.payload.url);
                setShowQR(false);
            }
        })
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
  }, [showQR, sessionId]);
  
  const item = itemFallback;
  if (!item) return null;
  
  const itemCat = catFallback;
  const isProduct = itemCat.type === 'STORE_PRODUCT';

  if (isProduct) {
     return (
        <div className="flex flex-col w-full h-full p-6 relative bg-white">
            <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4 shrink-0">
                <div>
                   <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-50 px-2 py-0.5 rounded border border-slate-200 mb-2 inline-block shadow-sm">Matriz de Modelo</span>
                   <h2 className="text-xl font-black text-slate-800 leading-tight mt-1">{item.name}</h2>
                </div>
                <button onClick={onClose} className="p-2 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors">
                    <X className="w-5 h-5 text-slate-400" />
                </button>
            </div>
            
            <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
                <div className="w-24 h-24 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center mb-6 relative shadow-inner">
                    <div className="absolute inset-0 bg-indigo-500/5 rounded-full blur-xl"></div>
                    <Package className="w-10 h-10 text-indigo-400/50 relative z-10" />
                </div>
                <h3 className="text-slate-800 font-bold text-lg mb-2">Modelo sin unidades registradas</h3>
                <p className="text-slate-500 font-medium max-w-[250px] mb-8 text-sm leading-relaxed">
                   Este modelo actualmente no tiene unidades registradas ni stock disponible en la tienda.
                </p>
            </div>
            
            <div className="flex gap-3 mt-auto shrink-0 border-t border-slate-100 pt-5">
                <button 
                    onClick={(e) => { 
                        e.stopPropagation(); 
                        if (confirm("¿Estás seguro de que deseas eliminar este modelo?")) {
                            deleteInventoryPart(item.id);
                            toast.success('Modelo eliminado exitosamente');
                            onClose();
                        }
                    }} 
                    className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-600 py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors border border-rose-200"
                >
                    <Trash2 className="w-4 h-4" /> Eliminar Modelo
                </button>
                {onAddRequest && (
                    <button 
                        onClick={() => onAddRequest(item.id)}
                        className="flex-[1.5] bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 rounded-2xl font-black shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 transition-colors border border-indigo-500"
                    >
                        <Plus className="w-5 h-5" /> Ingresar Unidades
                    </button>
                )}
            </div>
        </div>
     );
  }

  const product = inventory.find(p => p.id === itemCat.parentId);
  
  const purchases = inventory.filter(p => parseInventoryCategory(p.category).type === 'STORE_PURCHASE');
  const purchase = purchases.find(p => p.id === itemCat.purchaseId);
  const purchaseCat = purchase ? parseInventoryCategory(purchase.category) as any : null;

  const providers = inventory.filter(p => {
    const c = parseInventoryCategory(p.category) as any;
    return c.type === 'STORE_ATTRIBUTE' && c.subType === 'PROVIDER';
  });

  const providerId = itemCat.providerId || purchaseCat?.providerId;
  const provider = providers.find(p => p.id === providerId);

  const isAvailable = item.stock > 0;
  const isPendingAcceptance = itemCat.status === 'PENDING_ACCEPTANCE';

  // Calculate Days in Shop Window
  const acceptanceLog = (itemCat.history || []).find((h: any) => h.action === 'ACEPTACIÓN DESDE TALLER' || h.action === 'CREACIÓN LOTE' || h.action === 'RECEPCIÓN');
  const getFormattedTimeInStock = () => {
    if (!acceptanceLog) return null;
    const diffTime = Math.abs(new Date().getTime() - new Date(acceptanceLog.date).getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 30) {
      return `${diffDays} DÍA${diffDays !== 1 ? 'S' : ''}`;
    }
    
    const diffMonths = Math.floor(diffDays / 30);
    const remainingDays = diffDays % 30;
    
    if (diffMonths < 12) {
      if (remainingDays === 0) return `${diffMonths} MES${diffMonths !== 1 ? 'ES' : ''}`;
      return `${diffMonths} MES${diffMonths !== 1 ? 'ES' : ''} Y ${remainingDays} DÍA${remainingDays !== 1 ? 'S' : ''}`;
    }
    
    const diffYears = Math.floor(diffMonths / 12);
    const remainingMonths = diffMonths % 12;
    
    if (remainingMonths === 0) return `${diffYears} AÑO${diffYears !== 1 ? 'S' : ''}`;
    return `${diffYears} AÑO${diffYears !== 1 ? 'S' : ''} Y ${remainingMonths} MES${remainingMonths !== 1 ? 'ES' : ''}`;
  };
  
  const formattedTimeInStock = getFormattedTimeInStock();
  const daysInWindow = acceptanceLog 
    ? Math.floor((new Date().getTime() - new Date(acceptanceLog.date).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const storeProducts = inventory.filter(p => {
     const c = parseInventoryCategory(p.category) as any;
     return c.type === 'STORE_PRODUCT';
  }).sort((a, b) => a.name.localeCompare(b.name));
  
  const canViewCost = currentUser?.role === UserRole.ADMIN || currentUser?.permissions?.canViewInventoryCost;
  const canManageInv = currentUser?.role === UserRole.ADMIN || currentUser?.permissions?.canManageInventory;

  const handleActionClick = (actionName: string, actualAction: () => void) => {
      if (!canManageInv) {
          toast.error(`Acceso denegado: No tienes permisos para ${actionName}.`, {
              style: { background: '#ef4444', color: 'white', border: 'none' },
              icon: <AlertTriangle className="w-5 h-5 text-white" />
          });
          return;
      }
      actualAction();
  };

   const handleAcceptDevice = async (newImageUrl?: string) => {
      try {
          const targetImageUrl = newImageUrl || itemCat.imageUrl || itemCat.oldImageUrl;
          const newHistory = [
              ...(itemCat.history || []),
              {
                  action: 'ACEPTACIÓN DESDE TALLER',
                  date: new Date().toISOString(),
                  user: currentUser!!.name,
                  details: `Equipo aceptado. Relocalizado en producto.`,
                  imageUrl: targetImageUrl
              }
          ];

          await updateInventoryPart(item.id, {
              name: editName.trim() || item.name,
              price: parseFloat(editPrice) || item.price,
              category: JSON.stringify({
                  ...itemCat,
                  parentId: selectedParentId,
                  imei: editImei,
                  status: 'AVAILABLE',
                  imageUrl: targetImageUrl, // New photo priority
                  oldImageUrl: itemCat.oldImageUrl || itemCat.imageUrl, // keep original
                  history: newHistory
              })
          });
          
          if (selectedParentId !== itemCat.parentId) {
              // Delete placeholder product if empty
              const otherItemsForOld = inventory.filter(i => {
                 const c = parseInventoryCategory(i.category) as any;
                 return c.parentId === itemCat.parentId && i.id !== item.id;
              });
              if (otherItemsForOld.length === 0) {
                 await deleteInventoryPart(itemCat.parentId);
              }
          }
          
          toast.success("Equipo aceptado y listo para la venta");
      } catch (err) {
          toast.error("Error al aceptar equipo");
      }
   };

   const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.length) return;
      const file = e.target.files[0];
      setIsUploading(true);
      try {
        const ext = file.name.split('.').pop();
        const fileName = `accepted_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
        const { error } = await supabase.storage.from('receipts').upload(fileName, file, { cacheControl: '3600' });
        if (error) throw error;
        const { data } = supabase.storage.from('receipts').getPublicUrl(fileName);
        await handleAcceptDevice(getCleanStorageUrl(data.publicUrl));
      } catch (err: any) {
        toast.error('Error al subir imagen: ' + err.message);
      } finally {
        setIsUploading(false);
      }
    };

   const handleUpdateImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.length) return;
      const file = e.target.files[0];
      setIsUploading(true);
      try {
        const ext = file.name.split('.').pop();
        const fileName = `item_${item.id}_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
        const { error } = await supabase.storage.from('receipts').upload(fileName, file, { cacheControl: '3600' });
        if (error) throw error;
        const { data } = supabase.storage.from('receipts').getPublicUrl(fileName);
        
        await updateInventoryPart(item.id, {
            ...item,
            category: JSON.stringify({
                ...itemCat,
                imageUrl: getCleanStorageUrl(data.publicUrl)
            })
        });
        toast.success('Imagen actualizada correctamente');
      } catch (err: any) {
        toast.error('Error al subir imagen: ' + err.message);
      } finally {
        setIsUploading(false);
      }
    };

  const handleSaveEdit = async () => {
      try {
          await updateInventoryPart(item.id, {
              name: editName.trim() || item.name,
              price: parseFloat(editPrice) || item.price,
              category: JSON.stringify({
                  ...itemCat,
                  parentId: selectedParentId,
                  imei: editImei
              })
          });
          setIsEditing(false);
          toast.success("Artículo guardado correctamente");
      } catch (err) {
          toast.error("Error al guardar artículo");
      }
  };

  const handleDelete = async () => {
      if (confirm('¿Estás seguro de que deseas eliminar esta unidad? ¡Esta acción no se puede deshacer!')) {
          try {
              await deleteInventoryPart(item.id);
              if (purchase) {
                  const pCat = parseInventoryCategory(purchase.category) as any;
                  await updateInventoryPart(purchase.id, {
                      ...purchase,
                      category: JSON.stringify({
                          ...pCat,
                          usedAmount: Math.max(0, (pCat.usedAmount || 0) - (item.cost * (item.stock || 1)))
                      })
                  });
              }
              toast.success("Unidad eliminada");
              onClose();
          } catch (e) {
              toast.error("Error al eliminar");
          }
      }
  };

  const historyLogs = itemCat.history || [];

  return (
    <div className="flex flex-col relative w-full h-full flex-1 min-h-0 p-4 bg-white">
        {showHistory ? (
           <div className="flex flex-col h-full min-h-0">
               <div className="flex gap-2 items-center justify-between mb-3 border-b border-slate-100 pb-2">
                   <h3 className="text-slate-800 font-bold text-sm tracking-tight flex items-center gap-2">
                       <History className="w-4 h-4 text-indigo-500"/> Historial de Unidad
                   </h3>
                   <button onClick={() => setShowHistory(false)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
                     <X className="w-5 h-5"/>
                   </button>
               </div>
               <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                   {historyLogs.length === 0 ? (
                       <p className="text-slate-400 text-xs text-center py-4">No hay registros</p>
                   ) : (
                       historyLogs.slice().reverse().map((log: any, idx: number) => (
                           <div key={idx} className="relative pl-4 border-l-2 border-indigo-200">
                               <div className="absolute w-2 h-2 rounded-full bg-indigo-500 -left-[5px] top-1.5" />
                               <p className="text-[10px] text-indigo-600 font-mono mb-0.5">{new Date(log.date).toLocaleString()} • {log.user}</p>
                               <p className="text-xs text-slate-800 font-medium">{log.action}</p>
                               {log.details && <p className="text-[10px] text-slate-500 mt-1">{log.details}</p>}
                           </div>
                       ))
                   )}
               </div>
           </div>
        ) : (
           <>
                 <div className="flex gap-2 items-start justify-between mb-3 border-b border-slate-100 pb-2 shrink-0">
                  <div className="flex flex-col gap-1">
                     <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${isAvailable ? (isPendingAcceptance ? 'bg-amber-500 text-white animate-pulse shadow-lg shadow-amber-500/20' : (itemCat.status === 'IN_TRANSIT' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-600')) : 'bg-slate-100 text-slate-600'}`}>
                          {isAvailable ? (isPendingAcceptance ? 'Pendiente Aceptación' : (itemCat.status === 'IN_TRANSIT' ? 'En Tránsito' : 'Disponible')) : 'Vendido / No Disp.'}
                        </span>
                        {formattedTimeInStock !== null && isAvailable && !isPendingAcceptance && (
                           <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${(daysInWindow ?? 0) > 30 ? 'bg-rose-500 text-white animate-bounce' : 'bg-indigo-50 text-indigo-600'}`}>
                              {formattedTimeInStock} EN TIENDA
                           </span>
                        )}
                     </div>
                     {isPendingAcceptance && (
                       <span className="text-[9px] font-black text-amber-500 uppercase tracking-tighter">Requiere validación física</span>
                     )}
                  </div>
                  <div className="flex gap-1">
                      <button onClick={() => setShowHistory(true)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors" title="Ver Historial">
                        <History className="w-5 h-5"/>
                      </button>
                      <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
                        <X className="w-5 h-5"/>
                      </button>
                  </div>
               </div>

               {(itemCat.imageUrl || itemCat.oldImageUrl) ? (
                  <div className="w-full mb-4 shrink-0">
                     <div className="w-full h-40 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden relative group">
                        {isUploading && (
                          <div className="absolute inset-0 bg-white/80 z-20 flex flex-col items-center justify-center backdrop-blur-sm">
                            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-2" />
                            <span className="text-xs font-bold text-slate-700">Subiendo...</span>
                          </div>
                        )}
                        <img 
                           src={activePhoto === 'CURRENT' ? itemCat.imageUrl : itemCat.oldImageUrl} 
                           className="w-full h-full object-contain transition-transform duration-500" 
                           alt="Unidad"
                        />
                        
                        {itemCat.oldImageUrl && itemCat.imageUrl && itemCat.oldImageUrl !== itemCat.imageUrl && (
                           <div className="absolute bottom-2 left-2 flex gap-1 bg-white/80 border border-slate-200 p-1 rounded-lg backdrop-blur-sm z-10">
                              <button 
                                 onClick={() => setActivePhoto('INITIAL')} 
                                 className={`px-2 py-1 text-[9px] font-black rounded-md transition-all ${activePhoto === 'INITIAL' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-900'}`}
                              >
                                 INICIAL
                              </button>
                              <button 
                                 onClick={() => setActivePhoto('CURRENT')} 
                                 className={`px-2 py-1 text-[9px] font-black rounded-md transition-all ${activePhoto === 'CURRENT' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-900'}`}
                              >
                                 RESTAURADO
                              </button>
                           </div>
                        )}

                        <div className="absolute top-2 right-2 flex flex-col gap-2 z-10">
                           <a 
                              href={activePhoto === 'CURRENT' ? itemCat.imageUrl : itemCat.oldImageUrl} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="bg-white/80 border border-slate-200 p-1.5 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
                           >
                              <Download className="w-4 h-4"/>
                           </a>
                           {canManageInv && (
                              <label className="bg-white/80 border border-slate-200 p-1.5 rounded-lg text-slate-700 hover:bg-emerald-500 hover:text-white transition-colors cursor-pointer" title="Actualizar Imagen">
                                 <UploadCloud className="w-4 h-4"/>
                                 <input type="file" className="hidden" accept="image/*" onChange={handleUpdateImage} disabled={isUploading} />
                              </label>
                           )}
                           {activePhoto === 'INITIAL' && (
                              <div className="bg-amber-500 text-white text-[8px] font-black px-1.5 py-1 rounded-md shadow-lg shadow-amber-500/20 mt-1">
                                 ESTADO RECIBIDO
                              </div>
                           )}
                        </div>
                     </div>
                  </div>
               ) : (
                  <div className="w-full mb-4 shrink-0">
                     <div className="w-full h-40 bg-slate-50 rounded-xl overflow-hidden relative flex flex-col items-center justify-center border border-dashed border-slate-300">
                        {isUploading && (
                          <div className="absolute inset-0 bg-white/80 z-20 flex flex-col items-center justify-center backdrop-blur-sm">
                            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-2" />
                            <span className="text-xs font-bold text-slate-700">Subiendo...</span>
                          </div>
                        )}
                        <Smartphone className="w-12 h-12 text-slate-300 mb-2" />
                        <span className="text-xs text-slate-500 font-medium">Sin imagen</span>
                        {canManageInv && (
                           <label className="mt-3 bg-indigo-50 text-indigo-600 hover:bg-indigo-500 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors flex items-center gap-1">
                              <UploadCloud className="w-3.5 h-3.5"/> Subir Foto
                              <input type="file" className="hidden" accept="image/*" onChange={handleUpdateImage} disabled={isUploading} />
                           </label>
                        )}
                     </div>
                  </div>
               )}

               <div className="space-y-3 flex-1 overflow-y-auto min-h-0 pr-1">
                   {canManageInv && product && (
                       <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                            <button 
                               onClick={(e) => {
                                 e.stopPropagation();
                                 const currentMin = product.min_stock ?? 2;
                                 const val = prompt(`Mínimo de stock para el modelo ${product.name} (Actual: ${currentMin}):\nSugerencia: Cambie este número para ajustar cuándo recibirá alertas.`, currentMin.toString());
                                 if (val !== null && !isNaN(parseInt(val))) {
                                    updateInventoryPart(product.id, { min_stock: parseInt(val) });
                                    toast.success("Alerta de stock mínimo actualizada para el modelo");
                                 }
                               }}
                               className="flex-1 bg-rose-50 text-rose-600 py-2 rounded-lg text-[10px] font-bold uppercase tracking-tight flex items-center justify-center gap-1.5 hover:bg-rose-100 transition-all border border-rose-200"
                               title="Configurar Alerta de Stock"
                            >
                              <BellRing className="w-3.5 h-3.5" /> Alerta (Mín: {product.min_stock ?? 2})
                            </button>
                            
                            <button 
                               onClick={(e) => {
                                 e.stopPropagation();
                                 if (onAddRequest) onAddRequest(product.id);
                               }}
                               className="flex-1 bg-indigo-50 text-indigo-600 py-2 rounded-lg text-[10px] font-bold uppercase tracking-tight flex items-center justify-center gap-1.5 hover:bg-indigo-100 transition-all border border-indigo-200"
                               title="Añadir más unidades de este modelo"
                            >
                              <Plus className="w-3.5 h-3.5" /> Lote / Unidad
                            </button>
                       </div>
                   )}

                   <div className={`grid ${canViewCost ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
                      <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl">
                         <p className="text-[9px] font-bold text-emerald-600 uppercase mb-0.5">Precio de Venta</p>
                         <p className="text-lg font-black text-emerald-700">${item.price.toLocaleString()}</p>
                      </div>
                      {canViewCost && (
                          <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl">
                             <p className="text-[9px] font-bold text-slate-500 uppercase mb-0.5">Costo / Origen</p>
                             <p className="text-lg font-bold text-slate-800">${item.cost.toLocaleString()}</p>
                          </div>
                      )}
                   </div>

                   {itemCat.imei && (
                     <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                        <p className="text-[9px] font-bold text-slate-500 uppercase flex justify-between">
                           IMEI/Serial 
                           <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(itemCat.imei); toast.success('Copiado'); }} className="text-indigo-500 hover:text-indigo-600">Copiar</button>
                        </p>
                        <p className="font-mono text-xs text-slate-800 font-bold mt-0.5 break-all">{itemCat.imei}</p>
                     </div>
                   )}

                   {(purchase && canViewCost) && (
                     <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                        <p className="text-[9px] font-bold text-slate-500 uppercase mb-0.5">Fondo / Compra</p>
                        <p className="font-bold text-slate-800 text-xs truncate" title={purchase.name}>{purchase.name}</p>
                        {provider && (
                          <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                            <Tag className="w-3 h-3" />
                            Prov: {provider.name}
                          </p>
                        )}
                     </div>
                   )}

                   {itemCat.workshopOrderId && (
                     <button 
                       onClick={(e) => { e.stopPropagation(); navigate(`/orders/${itemCat.workshopOrderId}`); }}
                       className="w-full bg-slate-100/10 border border-white/10 p-2.5 rounded-xl text-left hover:bg-white/5 transition-all"
                     >
                        <p className="text-[9px] font-bold text-indigo-300 uppercase flex items-center gap-1 mb-1">
                           Historial de Taller <Wrench className="w-3 h-3"/>
                        </p>
                        <p className="text-[10px] text-white font-medium">Este equipo tiene reparaciones registradas. Clic para ver detalles.</p>
                     </button>
                   )}
               </div>

               {isPendingAcceptance ? (
                    <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-3 shrink-0">
                       <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-[10px] text-amber-700">
                          Este equipo viene de taller y el costo ya incluye reparaciones (${item.cost}). Revise los datos y acepte.
                       </div>
                       
                       <div className="flex flex-col gap-2">
                           <label className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">¿A qué grupo de catálogo pertenece?</label>
                           <p className="text-[9px] text-slate-400 -mt-1 leading-tight mb-1">
                             Selecciona el modelo correcto. Se usarán la <b>Marca</b> y <b>Categoría</b> del grupo que elijas. Si el modelo no existe, ciérrame, usa el botón azul <b>+ Nuevo Modelo / Artículo</b> arriba, crea sólo la matriz con stock 0 y vuelve aquí para seleccionarlo.
                           </p>
                           <select 
                               value={selectedParentId} 
                               onChange={(e) => setSelectedParentId(e.target.value)}
                               className="w-full bg-white border border-slate-200 text-slate-800 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none font-medium"
                           >
                               {storeProducts.map(sp => (
                                   <option key={sp.id} value={sp.id}>{sp.name}</option>
                               ))}
                           </select>
                       </div>

                       <div className="flex flex-col gap-1">
                           <label className="text-[10px] text-slate-600 font-bold uppercase">Nombre del Artículo (Facturación)</label>
                           <input 
                               type="text" 
                               value={editName} 
                               onChange={(e) => setEditName(e.target.value)}
                               className="w-full bg-white border border-slate-200 text-slate-800 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500"
                           />
                       </div>
                       <div className="grid grid-cols-2 gap-2">
                           <div className="flex flex-col gap-1">
                               <label className="text-[10px] text-slate-600 font-bold uppercase">IMEI / Sériál</label>
                               <input 
                                   type="text" 
                                   value={editImei} 
                                   onChange={(e) => setEditImei(e.target.value)}
                                   className="w-full bg-white border border-slate-200 text-slate-800 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500"
                               />
                           </div>
                           <div className="flex flex-col gap-1">
                               <label className="text-[10px] text-slate-600 font-bold uppercase">Precio Venta</label>
                               <input 
                                   type="number" 
                                   value={editPrice} 
                                   onChange={(e) => setEditPrice(e.target.value)}
                                   className="w-full bg-white border border-slate-200 text-slate-800 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500"
                               />
                           </div>
                       </div>
                       
                       <div className="flex flex-col gap-2">
                           <div className="flex gap-2">
                               <button 
                                   onClick={() => setShowCamera(true)}
                                   className="flex-1 bg-slate-50 text-slate-600 py-3 rounded-xl font-black uppercase text-[10px] flex items-center justify-center gap-1.5 shadow-sm hover:bg-slate-100 transition-all cursor-pointer border border-slate-200"
                               >
                                   <Camera className="w-4 h-4"/> USAR CÁMARA
                               </button>
                               <button 
                                   onClick={() => setShowQR(true)}
                                   className="flex-1 bg-slate-50 text-slate-600 py-3 rounded-xl font-black uppercase text-[10px] flex items-center justify-center gap-1.5 shadow-sm hover:bg-slate-100 transition-all cursor-pointer border border-slate-200"
                               >
                                   <QrCode className="w-4 h-4"/> ESCANEAR QR
                               </button>
                           </div>
                           <div className="flex gap-2">
                               <label className={`flex-1 bg-indigo-50 text-indigo-600 py-3 rounded-xl font-black uppercase text-[10px] flex items-center justify-center gap-1.5 shadow-sm hover:bg-indigo-100 transition-all cursor-pointer border border-indigo-100 ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                                  {isUploading ? (
                                      <div className="flex items-center gap-2">
                                          <div className="w-3 h-3 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
                                          SUBIENDO...
                                      </div>
                                  ) : (
                                      <>
                                          <UploadCloud className="w-4 h-4"/>
                                          SUBIR FOTO (ARCHIVO)
                                      </>
                                  )}
                                  <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={isUploading} />
                               </label>
                               <button 
                                   onClick={() => handleAcceptDevice()} 
                                   className={`px-6 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase transition-all shadow-lg shadow-indigo-600/30 active:scale-95 ${!(itemCat.imageUrl || itemCat.oldImageUrl) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-700'}`}
                                   disabled={!(itemCat.imageUrl || itemCat.oldImageUrl)}
                               >
                                   {!!(itemCat.imageUrl || itemCat.oldImageUrl) ? 'ACEPTAR (MANTENER FOTO)' : 'FOTO REQUERIDA PARA ACEPTAR'}
                               </button>
                           </div>
                       </div>
                       
                       <div className="mt-4 pt-3 border-t border-amber-200">
                           <button 
                                onClick={(e) => { e.stopPropagation(); handleActionClick('rechazar (eliminar) este equipo en espera', handleDelete); }}
                                className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-[10px] font-black uppercase transition-all border border-rose-100"
                           >
                               <Trash2 className="w-4 h-4" />
                               RECHAZAR Y ELIMINAR DEL INVENTARIO
                           </button>
                           <p className="text-center text-[9px] text-slate-400 font-medium mt-1">Si este equipo no debió ser ingresado, presiona aquí para borrarlo permanentemente.</p>
                       </div>
                    </div>
                ) : (
                    isEditing ? (
                       <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col gap-3">
                           <div className="flex flex-col gap-1">
                               <label className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">¿A qué grupo pertenece?</label>
                               <select 
                                   value={selectedParentId} 
                                   onChange={(e) => setSelectedParentId(e.target.value)}
                                   className="w-full bg-white border border-slate-200 text-slate-800 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none font-medium"
                               >
                                   {storeProducts.map(sp => (
                                       <option key={sp.id} value={sp.id}>{sp.name}</option>
                                   ))}
                               </select>
                           </div>
                           <div className="flex flex-col gap-1">
                               <label className="text-[10px] text-slate-600 font-bold uppercase">Nombre del Artículo</label>
                               <input 
                                   type="text" 
                                   value={editName} 
                                   onChange={(e) => setEditName(e.target.value)}
                                   className="w-full bg-white border border-slate-200 text-slate-800 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500"
                               />
                           </div>
                           <div className="grid grid-cols-2 gap-2">
                               <div className="flex flex-col gap-1">
                                   <label className="text-[10px] text-slate-600 font-bold uppercase">IMEI / Sériál</label>
                                   <input 
                                       type="text" 
                                       value={editImei} 
                                       onChange={(e) => setEditImei(e.target.value)}
                                       className="w-full bg-white border border-slate-200 text-slate-800 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500"
                                   />
                               </div>
                               <div className="flex flex-col gap-1">
                                   <label className="text-[10px] text-slate-600 font-bold uppercase">Precio Venta</label>
                                   <input 
                                       type="number" 
                                       value={editPrice} 
                                       onChange={(e) => setEditPrice(e.target.value)}
                                       className="w-full bg-white border border-slate-200 text-slate-800 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500"
                                   />
                               </div>
                           </div>
                           <div className="flex gap-2 shrink-0 mt-2">
                               <button onClick={() => setIsEditing(false)} className="flex-1 text-slate-500 hover:bg-slate-50 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 border border-slate-200"><X className="w-4 h-4"/> Cancelar</button>
                               <button onClick={handleSaveEdit} className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl text-xs font-black shadow-sm transition-colors flex items-center justify-center gap-1.5 hover:bg-indigo-700"><CheckCircle2 className="w-4 h-4"/> Guardar</button>
                           </div>
                       </div>
                    ) : (
                        <div className="mt-4 pt-3 border-t border-slate-100 flex gap-2 shrink-0">
                           <button onClick={(e) => { e.stopPropagation(); handleActionClick('eliminar este artículo', handleDelete); }} className="flex-1 text-rose-500 hover:bg-rose-50 border border-slate-100 hover:border-rose-100 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5"><Trash2 className="w-4 h-4"/> Eliminar</button>
                           <button onClick={(e) => { e.stopPropagation(); handleActionClick('editar este artículo', () => setIsEditing(true)); }} className="flex-[1.5] bg-indigo-50 border border-indigo-100 text-indigo-600 py-2.5 rounded-xl text-xs font-black hover:bg-indigo-100 shadow-sm transition-colors flex items-center justify-center gap-1.5"><Edit2 className="w-4 h-4"/> Editar</button>
                        </div>
                    )
                )}
           </>
        )}

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
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
                <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl max-w-sm w-full animate-in zoom-in-95 fade-in duration-200">
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
                        <QRCodeSVG value={`${window.location.origin}/#/mobile-upload/${sessionId}`} size={200} level="H" includeMargin={true} className="rounded-xl" />
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
    </div>
  );
};
