import React, { useState, useMemo } from 'react';
import { useInventory } from '../../contexts/InventoryContext';
import { useAuth } from '../../contexts/AuthContext';
import { parseInventoryCategory } from '../../types';
import { Package, X, Smartphone, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, getCleanStorageUrl } from '../../services/supabase';

export const AddStoreProductModal = ({ cloneFromProductId, onClose }: { cloneFromProductId?: string | null, onClose: () => void }) => {
  const { inventory, addInventoryPart, updateInventoryPart } = useInventory();
  const { currentUser } = useAuth();
  
  const baseProduct = cloneFromProductId ? inventory.find(p => p.id === cloneFromProductId) : null;
  const baseCat = baseProduct ? parseInventoryCategory(baseProduct.category) as any : null;

  const [formData, setFormData] = useState({
    name: baseProduct?.name || '',
    brandId: baseCat?.brandId || '',
    categoryId: baseCat?.categoryId || '',
    description: baseCat?.description || '',
    // Initial unit data
    purchaseId: '',
    cost: 0,
    price: 0,
    quantity: 1,
    imei: '',
    imageUrl: '',
    min_stock: baseProduct?.min_stock || 2
  });
  
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressError, setProgressError] = useState('');

  const attributes = useMemo(() => inventory.filter(p => parseInventoryCategory(p.category).type === 'STORE_ATTRIBUTE'), [inventory]);
  const categories = attributes.filter(a => (parseInventoryCategory(a.category) as any).subType === 'CATEGORY');
  const brands = attributes.filter(a => (parseInventoryCategory(a.category) as any).subType === 'BRAND');
  
  const purchases = useMemo(() => inventory.filter(p => parseInventoryCategory(p.category).type === 'STORE_PURCHASE'), [inventory]);
  const providers = attributes.filter(a => (parseInventoryCategory(a.category) as any).subType === 'PROVIDER');
  
  const selectedCategory = categories.find(c => c.id === formData.categoryId);
  const isCellphone = (selectedCategory?.name || '').toLowerCase().includes('celular');

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
    if (!formData.name) return toast.error("Ingresa el nombre del artículo");

    if (isCellphone) {
      try {
        setIsSubmitting(true);
        const newProduct = await addInventoryPart({
          name: formData.name,
          stock: 0,
          min_stock: parseInt(formData.min_stock as any) || 2,
          cost: 0,
          price: 0,
          category: JSON.stringify({
            type: 'STORE_PRODUCT',
            isCellphone,
            brandId: formData.brandId,
            categoryId: formData.categoryId,
            description: formData.description,
            imageUrl: formData.imageUrl || undefined
          })
        });

        if (!newProduct || !newProduct.id) {
            throw new Error("El sistema no devolvió el ID del modelo creado. Revisa el catálogo para ver si apareció.");
        }
        toast.success(`Modelo ${formData.name} creado correctamente.`);
        onClose();
      } catch(err: any) {
        toast.error("Error al crear modelo: " + err.message);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!formData.purchaseId) return toast.error("Por favor, asocia este ingreso a un Gasto de Compra");
    if (formData.price <= 0) return toast.error("Precio de venta inválido");
    
    // Check if it's a cellphone, qty is 1 and imei is required
    // (This block will effectively not run for isCellphone due to the return above, but kept for logic consistency)
    const qty = formData.imei?.trim() ? 1 : Math.max(1, formData.quantity);

    const purchasePart = inventory.find(i => i.id === formData.purchaseId);
    if (!purchasePart) return toast.error("Compra no encontrada");
    const pCat = parseInventoryCategory(purchasePart.category) as any;
    
    if ((pCat.usedAmount || 0) + (formData.cost * qty) > purchasePart.cost) {
        return toast.error("El costo total de estas unidades excede el monto disponible de esta compra (o fondo).");
    }

    try {
      setIsSubmitting(true);
      setProgress(0);
      setProgressError('');

      // 1. Create the Product (Matriz)
      const catItem = inventory.find(i => i.id === formData.categoryId);
      const isCellphone = (catItem?.name || '').toLowerCase().includes('celular');
      
      const newProduct = await addInventoryPart({
        name: formData.name,
        stock: 0,
        min_stock: parseInt(formData.min_stock as any) || 2,
        cost: 0,
        price: 0,
        category: JSON.stringify({
          type: 'STORE_PRODUCT',
          isCellphone,
          brandId: formData.brandId,
          categoryId: formData.categoryId,
          description: formData.description
        })
      });

      if (!newProduct || !newProduct.id) {
          throw new Error("No se pudo crear la matriz del producto");
      }

      const providerName = providers.find(p => p.id === pCat.providerId)?.name || 'N/A';

      // 2. Create the units associated with this product
      for (let i = 0; i < qty; i++) {
        await addInventoryPart({
          name: formData.name,
          stock: 1, // Available
          cost: formData.cost,
          price: formData.price,
          category: JSON.stringify({
            type: 'STORE_ITEM',
            parentId: newProduct.id,
            purchaseId: formData.purchaseId,
            providerId: pCat.providerId,
            imei: formData.imei || undefined,
            status: 'AVAILABLE',
            branch: currentUser?.branch || 'T4',
            imageUrl: formData.imageUrl || undefined,
            history: [{
                action: 'REGISTRO DE INGRESO (CREACIÓN)',
                date: new Date().toISOString(),
                user: currentUser?.name || 'Usuario desconocido',
                details: `Unidad ingresada al inventario con costo: $${formData.cost} y precio de venta: $${formData.price}. Origen: ${purchasePart.name}. Proveedor: ${providerName}`
            }]
          })
        });
        setProgress(Math.round(((i + 1) / qty) * 100));
      }

      // 3. Update the used amount in the purchase bucket
      await updateInventoryPart(purchasePart.id, {
        category: JSON.stringify({
           ...pCat,
           usedAmount: (pCat.usedAmount || 0) + (formData.cost * qty)
        })
      });

      toast.success(`Artículo creado con ${qty} unidad(es) inicial(es)`);
      onClose();
    } catch (err: any) {
      console.error(err);
      setProgressError(err.message || "Error al crear artículo y sus unidades");
      toast.error("Error al crear artículo y sus unidades");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-[2rem] w-full max-w-2xl shadow-2xl p-8 my-8" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
           <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
             <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
               <Package className="w-5 h-5"/>
             </div>
             {cloneFromProductId ? 'Clonar Modelo o Artículo' : 'Nuevo Modelo / Artículo'}
           </h2>
           <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl text-slate-500"><X className="w-6 h-6"/></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
             <div className="bg-indigo-50 border border-indigo-100 text-indigo-800 p-4 rounded-xl text-sm mb-4">
                <strong>¿Sabías que?</strong> Si vas a agregar celulares, aquí lo que vas a crear es el <b>Modelo Principal</b> (ej. "iPhone 12"). Más adelante podrás meterle adentro todas las unidades físicas. Para cables, covers y otros, esto actuará como artículo simple.
             </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Nombre del Modelo / Artículo</label>
            <input required autoFocus value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Ej. iPhone 17 Pro Max 256GB" />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
             <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Marca</label>
                <select value={formData.brandId} onChange={e => setFormData({...formData, brandId: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">(Ninguna)</option>
                  {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
             </div>
             <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Categoría</label>
                <select value={formData.categoryId} onChange={e => setFormData({...formData, categoryId: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">(Ninguna)</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
             </div>
             <div className="col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-2">Aviso de Stock Crítico (Mínimo)</label>
                <input required type="number" min="0" value={formData.min_stock} onChange={e => setFormData({...formData, min_stock: parseInt(e.target.value) || 0})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Ej. 2" />
             </div>
          </div>

          {!isCellphone && (
            <div className="mt-8 border-t border-slate-200 pt-6">
              <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 p-4 rounded-xl text-sm mb-4">
                  <strong>Paso 2: Unidades Iniciales</strong> - Usa un Gasto de Compra existente para asignar el costo a estas nuevas unidades.
              </div>
            </div>
          )}

          {!isCellphone && (
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Gasto de Compra Asociado (Fondo) *</label>
              <select required value={formData.purchaseId} onChange={e => setFormData({...formData, purchaseId: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="">Selecciona la compra de donde salió el dinero...</option>
                {purchases.map(p => {
                  const cat = parseInventoryCategory(p.category) as any;
                  const remaining = p.cost - (cat.usedAmount || 0);
                  if (remaining <= 0) return null; // Hide depleted purchases
                  return <option key={p.id} value={p.id}>{p.name} (Restante: ${remaining.toLocaleString()})</option>;
                })}
              </select>
            </div>
          )}

          {!isCellphone && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Costo Unitario</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                    <input required type="number" min="0" step="0.01" value={formData.cost || ''} onChange={e => setFormData({...formData, cost: parseFloat(e.target.value) || 0})} className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="0.00" />
                  </div>
              </div>
              <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Precio de Venta (PVP)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                    <input required type="number" min="0" step="0.01" value={formData.price || ''} onChange={e => setFormData({...formData, price: parseFloat(e.target.value) || 0})} className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="0.00" />
                  </div>
              </div>
            </div>
          )}

          {!isCellphone && (
            <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Cantidad a Ingresar</label>
                  <input required type="number" min="1" value={formData.quantity} onChange={e => setFormData({...formData, quantity: parseInt(e.target.value) || 1})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Serial Number SN (Opcional, fuerza 1 unidad)</label>
                  <input type="text" value={formData.imei} onChange={e => setFormData({...formData, imei: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="SN Opcional" />
                </div>
            </div>
          )}

          <div>
             <label className="block text-sm font-bold text-slate-700 mb-2">Foto / Recibo (Opcional)</label>
             {formData.imageUrl ? (
               <div className="relative inline-block mt-2">
                 <img src={formData.imageUrl} alt="Uploaded" className="h-40 object-contain rounded-xl border border-slate-200 shadow-sm" />
                 <button type="button" onClick={() => setFormData({...formData, imageUrl: ''})} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"><X className="w-4 h-4"/></button>
               </div>
             ) : (
               <label className="flex flex-col items-center justify-center w-full min-h-[160px] border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6 text-slate-500">
                    <UploadCloud className="w-6 h-6 mb-2" />
                    <p className="text-sm font-bold">{isUploading ? 'Subiendo...' : 'Click para subir foto'}</p>
                  </div>
                  <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={isUploading} />
               </label>
             )}
          </div>

          <div className="pt-4 flex gap-3 border-t border-slate-100 mt-6 flex-col">
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
                 <button type="button" onClick={onClose} className="flex-1 bg-slate-100 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-200 transition-colors">Cancelar</button>
                 <button type="submit" className="flex-1 bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 shadow-lg justify-center items-center flex gap-2 transition-all shadow-indigo-200">
                   {isCellphone ? 'Guardar Modelo' : formData.quantity > 1 ? `Guardar y Añadir ${formData.quantity} Unidades` : 'Guardar Artículo'}
                 </button>
               </div>
             )}
          </div>
        </form>
      </div>
    </div>
  );
}
