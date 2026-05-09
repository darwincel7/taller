import React, { useState, useMemo, useEffect } from 'react';
import { useInventory } from '../../contexts/InventoryContext';
import { useAuth } from '../../contexts/AuthContext';
import { parseInventoryCategory, UserRole } from '../../types';
import { Package, Search, Plus, Grid, Folder, List as ListIcon, Edit2, ChevronDown, ChevronUp, ChevronRight, Image as ImageIcon, Smartphone, Hash, Check, BrainCircuit, AlertTriangle, Trash2, X, BellRing, UploadCloud, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { AddStoreProductModal } from './AddStoreProductModal';
import { AddStoreItemModal } from './AddStoreItemModal';
import { AIReceiptScanner } from './AIReceiptScanner';
import { StoreStockAlertsTab } from './StoreStockAlertsTab';
import { StoreItemDetailsInline } from './StoreItemDetailsInline';

export const StoreCatalogTab = () => {
  const { inventory, deleteInventoryPart, updateInventoryPart } = useInventory();
  const { currentUser } = useAuth();
  
  const canViewCost = currentUser?.role === UserRole.ADMIN || currentUser?.permissions?.canViewInventoryCost;
  const canManageInv = currentUser?.role === UserRole.ADMIN || currentUser?.permissions?.canManageInventory;

  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<'ALL' | string>('ALL');
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [cloneProductId, setCloneProductId] = useState<string | null>(null);
  const [itemModalProductId, setItemModalProductId] = useState<string | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(40);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);

  const detailsPanelRef = React.useRef<HTMLDivElement>(null);
  const arrowRef = React.useRef<HTMLDivElement>(null);

  const updateArrowPosition = React.useCallback(() => {
    if (!activeItemId) return;
    
    // Attempt to find active row element
    let activeEl = document.getElementById(`store-inner-${activeItemId}`);
    if (!activeEl) {
       activeEl = document.getElementById(`store-row-${activeItemId}`);
       if (!activeEl) {
          const matchingProduct = document.getElementById(`store-row-${activeItemId}`);
          if (matchingProduct) activeEl = matchingProduct;
       }
    }
    
    if (activeEl && detailsPanelRef.current && arrowRef.current) {
       const elRect = activeEl.getBoundingClientRect();
       const panelRect = detailsPanelRef.current.getBoundingClientRect();
       
       const elCenterY = elRect.top + (elRect.height / 2);
       let relativeY = elCenterY - panelRect.top;
       
       // Clamp between 50 and height - 50 
       relativeY = Math.max(50, Math.min(relativeY, panelRect.height - 50));
       
       arrowRef.current.style.top = `${relativeY}px`;
    }
  }, [activeItemId]);

  React.useEffect(() => {
    const timeout = setTimeout(updateArrowPosition, 50);
    window.addEventListener('scroll', updateArrowPosition, true);
    window.addEventListener('resize', updateArrowPosition);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('scroll', updateArrowPosition, true);
      window.removeEventListener('resize', updateArrowPosition);
    };
  }, [activeItemId, updateArrowPosition, expandedProductId]);
  
  const [selectedBranches, setSelectedBranches] = useState<string[]>([currentUser?.branch || 'T4']);

  useEffect(() => {
    setVisibleCount(40);
  }, [searchTerm, activeCategory]);

  // Split inventory parts
  const attributes = useMemo(() => inventory.filter(p => parseInventoryCategory(p.category).type === 'STORE_ATTRIBUTE'), [inventory]);
  const categories = useMemo(() => attributes.filter(a => (parseInventoryCategory(a.category) as any).subType === 'CATEGORY'), [attributes]);
  const brands = useMemo(() => attributes.filter(a => (parseInventoryCategory(a.category) as any).subType === 'BRAND'), [attributes]);
  
  const products = useMemo(() => inventory.filter(p => parseInventoryCategory(p.category).type === 'STORE_PRODUCT'), [inventory]);
  const items = useMemo(() => inventory.filter(p => {
    const parsed = parseInventoryCategory(p.category) as any;
    if (parsed.type !== 'STORE_ITEM') return false;
    if (!selectedBranches.includes(parsed.branch || 'T4')) return false;
    if (parsed.status === 'IN_TRANSIT') return false;
    return true;
  }), [inventory, selectedBranches]);

  const getProductItems = (productId: string) => {
    return items.filter(i => {
      const cat = parseInventoryCategory(i.category) as any;
      return cat.parentId === productId && cat.status !== 'PENDING_ACCEPTANCE';
    });
  };

  const handleDeleteProduct = async (productId: string, units: any[]) => {
      const hasSoldUnits = units.some(u => u.stock === 0);
      if (hasSoldUnits) {
          toast.error("No puedes eliminar un artículo que tenga unidades vendidas o procesadas.");
          return;
      }
      if (!confirm(`¿Estás seguro de que deseas eliminar este artículo con todas sus (${units.length}) unidades? ¡Esta acción no se puede deshacer y el valor de las unidades será devuelto a sus compras correspondientes!`)) return;

      setIsDeletingBulk(true);
      try {
          for (const unit of units) {
              const unitCat = parseInventoryCategory(unit.category) as any;
              if (unitCat.purchaseId) {
                  const purchase = inventory.find(p => p.id === unitCat.purchaseId);
                  if (purchase) {
                      const pCat = parseInventoryCategory(purchase.category) as any;
                      await updateInventoryPart(purchase.id, {
                          ...purchase,
                          category: JSON.stringify({
                              ...pCat,
                              usedAmount: Math.max(0, (pCat.usedAmount || 0) - (unit.cost * unit.stock))
                          })
                      });
                  }
              }
              await deleteInventoryPart(unit.id);
          }
          await deleteInventoryPart(productId);
          toast.success("Artículo eliminado con éxito");
          if (expandedProductId === productId) setExpandedProductId(null);
      } catch (err) {
          toast.error("Error al eliminar el artículo");
      } finally {
          setIsDeletingBulk(false);
      }
  };

  const handleDeleteSelected = async () => {
       if (selectedItems.length === 0) return;
       
       const unitsToDelete = items.filter(i => selectedItems.includes(i.id) && i.stock > 0);
       
       if (unitsToDelete.length === 0) {
           toast.error("No hay unidades válidas para eliminar.");
           return;
       }

       if (!confirm(`¿Estás seguro de que deseas eliminar ${unitsToDelete.length} unidad(es)? ¡El valor será devuelto a sus compras correspondientes!`)) return;

       setIsDeletingBulk(true);
       try {
           for (const unit of unitsToDelete) {
               const unitCat = parseInventoryCategory(unit.category) as any;
               if (unitCat.purchaseId) {
                   const purchase = inventory.find(p => p.id === unitCat.purchaseId);
                   if (purchase) {
                       const pCat = parseInventoryCategory(purchase.category) as any;
                       await updateInventoryPart(purchase.id, {
                           ...purchase,
                           category: JSON.stringify({
                               ...pCat,
                               usedAmount: Math.max(0, (pCat.usedAmount || 0) - (unit.cost * unit.stock))
                           })
                       });
                   }
               }
               await deleteInventoryPart(unit.id);
           }
           toast.success("Unidad(es) eliminada(s) con éxito");
           setSelectedItems([]);
       } catch(err) {
           toast.error("Error al eliminar las unidades");
       } finally {
           setIsDeletingBulk(false);
       }
  };

  const filteredProducts = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return products.filter(product => {
      const parsed = parseInventoryCategory(product.category) as any;
      const productItems = getProductItems(product.id);
      
      const hasPendingAcceptance = items.some(i => {
          const cat = parseInventoryCategory(i.category) as any;
          return cat.parentId === product.id && cat.status === 'PENDING_ACCEPTANCE';
      });

      // Hide placeholder product if it only consists of pending items
      if (productItems.length === 0 && hasPendingAcceptance) {
          return false;
      }

      const matchName = product.name.toLowerCase().includes(term);
      const matchReadableId = parsed.readable_id?.toString().includes(term);
      const matchCatSearch = categories.find(c => c.id === parsed.categoryId)?.name.toLowerCase().includes(term);
      
      const itemMatch = productItems.some(i => {
        const itemParsed = parseInventoryCategory(i.category) as any;
        return (
          itemParsed.readable_id?.toString().includes(term) ||
          i.id.toLowerCase().includes(term) ||
          itemParsed.imei?.toLowerCase().includes(term)
        );
      });

      const matchSearch = matchName || matchReadableId || matchCatSearch || itemMatch || !term;
      const matchCat = activeCategory === 'ALL' || parsed.categoryId === activeCategory;
      return matchSearch && matchCat;
    });
  }, [products, items, searchTerm, activeCategory, categories]);

  useEffect(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return;
    
    let matchingItems: any[] = [];
    const matchingProduct = filteredProducts.find(product => {
      const productItems = getProductItems(product.id);
      const matches = productItems.filter(i => {
        const itemParsed = parseInventoryCategory(i.category) as any;
        return (
          itemParsed.readable_id?.toString().includes(term) ||
          i.id.toLowerCase().includes(term) ||
          itemParsed.imei?.toLowerCase().includes(term)
        );
      });
      if (matches.length > 0) {
          matchingItems.push(...matches);
          return true;
      }
      return false;
    });
    
    if (matchingProduct && filteredProducts.length === 1) {
      setExpandedProductId(matchingProduct.id);
    }
    
    if (matchingItems.length === 1) {
        setActiveItemId(matchingItems[0].id);
    }
  }, [searchTerm, filteredProducts, items]);

  const pendingAcceptanceItems = useMemo(() => items.filter(i => (parseInventoryCategory(i.category) as any).status === 'PENDING_ACCEPTANCE'), [items]);

  return (
    <div className="flex flex-col gap-8">
      {pendingAcceptanceItems.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-amber-900 font-black uppercase text-sm tracking-tight">Equipos en espera de validación</h3>
              <p className="text-amber-700 text-xs font-bold">Hay {pendingAcceptanceItems.length} equipos transferidos que precisan revisión, foto, y ser enlazados a su modelo del catálogo.</p>
            </div>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            {pendingAcceptanceItems.slice(0, 3).map(item => (
              <button 
                key={item.id} 
                onClick={() => setActiveItemId(item.id)}
                className="flex-1 md:flex-none px-3 py-2 bg-white border border-amber-200 rounded-xl text-[10px] font-black text-amber-600 hover:bg-amber-50 transition-all shadow-sm truncate max-w-[150px]"
              >
                {item.name.split(' (')[0]}
              </button>
            ))}
            {pendingAcceptanceItems.length > 3 && (
              <span className="text-[10px] font-bold text-amber-500 self-center">+{pendingAcceptanceItems.length - 3} más</span>
            )}
          </div>
        </div>
      )}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-2 gap-4 w-full">
         <div className="flex items-center gap-3 relative z-20 flex-1 w-full min-w-0">
           <h2 className="text-2xl font-black text-slate-800 hidden lg:block shrink-0">Catálogo</h2>
           
           {/* CATEGORY DROPDOWN */}
           <div className="relative shrink-0">
              <button 
                onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                className="bg-white border border-slate-200 text-slate-700 px-2 py-1.5 rounded-md shadow-sm flex items-center gap-1.5 text-xs font-bold hover:bg-slate-50 transition-all"
              >
                <Folder className="w-3.5 h-3.5 text-indigo-500" />
                CATEGORÍAS
                <ChevronDown className="w-3 h-3 ml-0.5" />
              </button>

              {isCategoryDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden py-2" style={{ transformOrigin: 'top left' }}>
                   <button
                    onClick={() => { setActiveCategory('ALL'); setIsCategoryDropdownOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-sm font-bold transition-all ${activeCategory === 'ALL' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                   >
                     Todas las Categorías
                   </button>
                   {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => { 
                        setActiveCategory(cat.id); 
                        setIsCategoryDropdownOpen(false); 
                        if (cat.name.toLowerCase().includes('celular') || cat.name.toLowerCase().includes('iphone')) {
                           setSelectedBranches(['T1', 'T4']);
                        } else {
                           setSelectedBranches([currentUser?.branch || 'T4']);
                        }
                      }}
                      className={`w-full text-left px-4 py-2 text-sm font-bold transition-all ${activeCategory === cat.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                      {cat.name}
                    </button>
                   ))}
                </div>
              )}
           </div>

           {/* SEARCH */}
           <div className="relative z-10 hidden sm:block flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar artículo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 bg-white border border-slate-200 shadow-sm rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none w-full"
              />
           </div>
         </div>

         <div className="flex gap-3 shrink-0">
             <button 
               onClick={() => {
    if (!canManageInv) {
        toast.error('Acceso denegado: No tienes permisos para usar el escáner.', {
            style: { background: '#ef4444', color: 'white', border: 'none' },
            icon: <AlertTriangle className="w-5 h-5 text-white" />
        });
        return;
    }
    setIsScannerOpen(!isScannerOpen);
}}
               className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 font-bold transition-all whitespace-nowrap"
             >
               <BrainCircuit className="w-5 h-5 text-indigo-400" /> Escáner AI
             </button>
             <button 
               onClick={() => {
    if (!canManageInv) {
        toast.error('Acceso denegado: No tienes permisos para añadir artículos.', {
            style: { background: '#ef4444', color: 'white', border: 'none' },
            icon: <AlertTriangle className="w-5 h-5 text-white" />
        });
        return;
    }
    setIsProductModalOpen(true);
}}
               className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 font-bold transition-all"
             >
               <Plus className="w-5 h-5" /> Nuevo Modelo / Artículo
             </button>
         </div>
      </div>
      
      {/* MOBILE SEARCH (if needed) */}
      <div className="relative sm:hidden z-10 -mt-4">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Buscar artículo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 shadow-sm rounded-xl font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
          />
      </div>

      {isScannerOpen && (
         <div className="mb-4">
             <AIReceiptScanner onClose={() => setIsScannerOpen(false)} />
         </div>
      )}

      <div className="flex flex-col lg:flex-row lg:gap-8 gap-6 items-start relative">
        {/* Main List - Minimalist Table */}
        <div className={`transition-all duration-300 lg:w-[72%] w-full space-y-2 relative z-10`}>
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm relative">
             <div className="overflow-visible rounded-3xl">
                <table className="w-full text-left border-collapse table-fixed">
                   <thead>
                      <tr className="border-b border-slate-100">
                         <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider w-[15%] text-center">SKU</th>
                         <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider w-[65%]">Artículo</th>
                         <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider w-[20%] text-center">Stock</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100 relative">
                      {filteredProducts.slice(0, visibleCount).map(product => {
                         const parsed = parseInventoryCategory(product.category) as any;
                         const category = categories.find(c => c.id === parsed.categoryId);
                         const isCellphoneProduct = (category?.name || '').toLowerCase().includes('celular');
                         const productItems = getProductItems(product.id);
                         const availableItems = productItems.filter(i => i.stock > 0);
                         const availableCount = availableItems.reduce((acc, i) => acc + i.stock, 0);
                         const isActive = expandedProductId === product.id || activeItemId === product.id || productItems.some(i => i.id === activeItemId);
                         const firstPhotoItem = productItems.find(i => (parseInventoryCategory(i.category) as any).imageUrl);
                         const thumbnailUrl = parsed.imageUrl || (firstPhotoItem ? (parseInventoryCategory(firstPhotoItem.category) as any).imageUrl : null);
                         const codigo = parsed.readable_id ? `#${parsed.readable_id}` : `#${product.id.substring(0, 6).toUpperCase()}`;

                         return (
                            <React.Fragment key={product.id}>
                               <tr 
                                  id={`store-row-${product.id}`}
                                  onClick={() => {
                                     setExpandedProductId(expandedProductId === product.id ? null : product.id);
                                     const itemToOpen = availableItems[0] || productItems[0];
                                     if (itemToOpen && !isCellphoneProduct) {
                                         setActiveItemId(itemToOpen.id);
                                     } else if (!isCellphoneProduct) {
                                         setActiveItemId(product.id);
                                     }
                                  }}
                                  className={`group cursor-pointer transition-colors relative ${isActive ? 'bg-slate-50' : 'hover:bg-slate-50/50 bg-white'}`}
                               >
                                  <td className="px-2 py-2 align-middle text-center border-b border-transparent relative">
                                     {isActive && (
                                         <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 rounded-r-full" />
                                     )}
                                     <div className="inline-flex items-center justify-center bg-slate-100/80 border border-slate-200/60 text-slate-500 font-bold text-[9px] px-1.5 py-0.5 rounded-lg font-mono">
                                        {codigo}
                                     </div>
                                  </td>
                                  <td className="px-3 py-2 align-middle border-b border-transparent">
                                     <div className="flex items-start gap-2.5">
                                         {thumbnailUrl ? (
                                            <div className="w-7 h-7 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-200 mt-0.5">
                                               <img src={thumbnailUrl} alt="thumbnail" className="w-full h-full object-cover" />
                                            </div>
                                         ) : (
                                            <div className="w-7 h-7 rounded-lg bg-slate-50 border border-dashed border-slate-300 flex items-center justify-center shrink-0 mt-0.5">
                                               <Package className="w-3.5 h-3.5 text-slate-300" />
                                            </div>
                                         )}
                                         <div className="flex flex-col justify-center max-w-full min-w-0">
                                            <div className="flex items-center gap-1 mb-0.5 opacity-80">
                                                <Wrench className="w-2.5 h-2.5 text-indigo-400" />
                                                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest truncate">{category?.name || 'Artículo'}</span>
                                            </div>
                                            <span className="font-bold text-[10px] text-slate-700 leading-tight line-clamp-2 pr-2">{product.name}</span>
                                         </div>
                                     </div>
                                  </td>
                                  <td className="px-2 py-2 align-middle text-center border-b border-transparent relative">
                                     {availableCount > 0 ? (
                                        <div className="inline-flex items-center justify-center bg-emerald-50 text-emerald-600 border border-emerald-200 font-black text-[10px] px-2 py-0.5 rounded-lg">
                                           {availableCount}
                                        </div>
                                     ) : (
                                        <div className="inline-flex items-center justify-center bg-rose-50 text-rose-500 border border-rose-200 font-black text-[10px] px-2 py-0.5 rounded-lg gap-1">
                                           {availableCount} <AlertTriangle className="w-3 h-3" />
                                        </div>
                                     )}
                                     
                                  </td>
                               </tr>
                               {expandedProductId === product.id && isCellphoneProduct && (
                                  <tr>
                                    <td colSpan={3} className="p-0 border-b border-slate-200 bg-slate-50/80 shadow-inner">
                                      <div className="p-3">
                                         {productItems.length === 0 ? (
                                            <div className="text-center py-4 text-slate-400 text-xs font-bold bg-white rounded-xl border border-dashed border-slate-200">
                                              No hay equipos registrados.
                                            </div>
                                         ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                              {productItems.map(item => {
                                                const itemCat = parseInventoryCategory(item.category) as any;
                                                const isAvailable = item.stock > 0;
                                                const branch = itemCat.branch || 'T4';
                                                const isItemActive = activeItemId === item.id;
                                                
                                                let cleanName = item.name;
                                                const imeiIndex = cleanName.indexOf('(IMEI:');
                                                if (imeiIndex !== -1) cleanName = cleanName.substring(0, imeiIndex).trim();
                                                const sNIndex = cleanName.indexOf('(S/N:');
                                                if (sNIndex !== -1) cleanName = cleanName.substring(0, sNIndex).trim();
                                                
                                                return (
                                                  <div 
                                                    key={item.id} 
                                                    id={`store-inner-${item.id}`}
                                                    onClick={() => setActiveItemId(item.id)}
                                                    className={`flex bg-white rounded-xl shadow-sm border transition-all cursor-pointer hover:bg-slate-50 ${isItemActive ? 'border-indigo-500 bg-indigo-50/20 shadow-indigo-500/10' : 'border-slate-200'} ${!isAvailable ? 'opacity-60 grayscale hover:grayscale-0' : ''}`}
                                                  >
                                                    <div className="p-3 flex items-start gap-3 flex-1 min-w-0">
                                                       <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center shrink-0 overflow-hidden border border-slate-200/60 shadow-sm relative group/img">
                                                         {itemCat.imageUrl ? (
                                                           <img src={itemCat.imageUrl} alt="img" className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-110" />
                                                         ) : (
                                                           <Smartphone className="w-6 h-6 text-slate-300" />
                                                         )}
                                                       </div>
                                                       <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                                                         <div>
                                                             <div className="flex justify-between items-start gap-2 mb-1.5">
                                                               <h4 className="font-bold text-xs text-slate-800 line-clamp-1 leading-tight flex-1">{cleanName}</h4>
                                                               <p className="font-black text-slate-900 text-[13px] shrink-0">${item.price.toLocaleString()}</p>
                                                             </div>
                                                             <div className="flex flex-wrap gap-1.5 items-center mb-2">
                                                                 <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-md whitespace-nowrap tracking-wide leading-none ${isAvailable ? (itemCat.status === 'IN_TRANSIT' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700') : 'bg-slate-200 text-slate-500'}`}>
                                                                   {isAvailable ? (itemCat.status === 'IN_TRANSIT' ? 'En Tránsito' : 'Disponible') : 'Vendido'}
                                                                 </span>
                                                                 <span className="text-[9px] font-black bg-slate-800 text-white px-2 py-0.5 rounded-md uppercase tracking-wider shadow-sm leading-none">{branch}</span>
                                                             </div>
                                                         </div>
                                                         
                                                         <div className="flex justify-between items-center w-full">
                                                           {itemCat.imei && (
                                                             <span className="text-[10px] font-semibold text-slate-500 font-mono truncate bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md" title={itemCat.imei}>IMEI: {itemCat.imei}</span>
                                                           )}
                                                           {!itemCat.imei && <div />}
                                                           <span className="text-[9px] font-bold text-slate-400">ID: #{item.readable_id || item.id.slice(-4)}</span>
                                                         </div>
                                                       </div>
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                         )}
                                      </div>
                                    </td>
                                  </tr>
                               )}
                            </React.Fragment>
                         );
                      })}
                   </tbody>
                </table>
             </div>
             
            {filteredProducts.length === 0 && (
                <div className="p-8 text-center text-slate-400 font-medium">No se encontraron artículos.</div>
            )}
          </div>
          
          {filteredProducts.length > visibleCount && (
            <div className="flex justify-center py-4">
              <button onClick={() => setVisibleCount(v => v + 40)} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-6 py-3 rounded-xl font-bold transition-all shadow-sm flex items-center gap-2">
                Mostrar más artículos ({filteredProducts.length - visibleCount} ocultos)
              </button>
            </div>
          )}
        </div>

        {/* Right Panel (Details & Alerts) */}
        <div className="lg:w-[28%] w-full flex-shrink-0 sticky top-6 z-30 flex flex-col gap-6 max-h-[calc(100vh-120px)] lg:pl-10 lg:-ml-10 pt-2 lg:-mt-2 overflow-y-auto hidden-scrollbar pointer-events-none">
          <div className="flex flex-col gap-6 pointer-events-auto w-full">
            <AnimatePresence mode="wait">
              {activeItemId ? (
              <motion.div
                key="details"
                initial={{ opacity: 0, scale: 0.95, x: 20 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95, x: 20 }}
                transition={{ duration: 0.2 }}
                className="w-full relative shrink-0"
              >
                <div ref={detailsPanelRef} className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-200 flex flex-col min-h-[320px] max-h-[75vh] min-h-[500px] w-full relative overflow-visible">
                   
                   {/* Dynamic Thought Bubble Tail (Arrow) */}
                   <div 
                     ref={arrowRef}
                     className="absolute z-20 transition-all duration-300 ease-out hidden lg:block pointer-events-none"
                     style={{ 
                       left: '-28px', 
                       top: `100px`, 
                       transform: 'translateY(-50%)', 
                       width: '29px', 
                       height: '50px',
                       filter: 'drop-shadow(-2px 3px 3px rgba(226, 232, 240, 0.5))'
                     }}
                   >
                     <svg width="29" height="50" viewBox="0 0 29 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                       <path d="M29 5 C16 5 8 12 0 25 C8 38 16 45 29 45 Z" fill="white" />
                       <path d="M29 5 C16 5 8 12 0 25 C8 38 16 45 29 45" stroke="#e2e8f0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                     </svg>
                   </div>

                   <div className="flex-1 overflow-y-auto hidden-scrollbar relative z-30 flex flex-col rounded-[2rem] overflow-hidden">
                      {/* Top gradient bar */}
                      <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 shrink-0"></div>
                      
                      <div className="flex-1 overflow-y-auto hidden-scrollbar relative z-10 flex flex-col bg-white">
                         <StoreItemDetailsInline itemId={activeItemId} onClose={() => setActiveItemId(null)} onAddRequest={(pid) => setItemModalProductId(pid)} />
                      </div>
                   </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ duration: 0.2 }}
                className="w-full relative shrink-0 hidden lg:block"
              >
                <div className="bg-slate-50/50 rounded-3xl border-2 border-slate-200 border-dashed flex flex-col items-center justify-center min-h-[320px] h-[52vh] max-h-[560px] w-full text-slate-400 p-8 text-center gap-4">
                  <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100 mb-2">
                    <Package className="w-10 h-10 text-slate-300" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-600 mb-1 text-lg">Visor de Artículos</h3>
                    <p className="text-sm font-medium text-slate-400">Selecciona una unidad del inventario a la izquierda para ver su información en detalle y opciones.</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="w-full shrink-0">
             <StoreStockAlertsTab />
          </div>
          </div>
        </div>
      </div>
      
      {isProductModalOpen && <AddStoreProductModal onClose={() => setIsProductModalOpen(false)} />}
      {cloneProductId && <AddStoreProductModal cloneFromProductId={cloneProductId} onClose={() => setCloneProductId(null)} />}
      {itemModalProductId && <AddStoreItemModal productId={itemModalProductId} onClose={() => setItemModalProductId(null)} />}
      
      {/* Full Screen Image Modal */}
      <AnimatePresence>
         {fullScreenImage && (
             <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4"
               onClick={() => setFullScreenImage(null)}
             >
                <button className="absolute top-6 right-6 text-white bg-slate-800 hover:bg-slate-700 p-2 rounded-full cursor-pointer transition-colors" onClick={() => setFullScreenImage(null)}><X className="w-8 h-8" /></button>
                <motion.img 
                  initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
                  src={fullScreenImage} 
                  className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl" 
                  alt="Enlarged" 
                  onClick={e => e.stopPropagation()}
                />
             </motion.div>
         )}
      </AnimatePresence>
    </div>
  );
};
