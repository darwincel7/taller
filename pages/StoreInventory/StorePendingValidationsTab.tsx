import React, { useState, useMemo } from 'react';
import { useInventory } from '../../contexts/InventoryContext';
import { useAuth } from '../../contexts/AuthContext';
import { parseInventoryCategory } from '../../types';
import { StoreItemDetailsInline } from './StoreItemDetailsInline';
import { Image as ImageIcon, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';

export const StorePendingValidationsTab = () => {
  const { inventory } = useInventory();
  const { currentUser } = useAuth();
  
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  const pendingAcceptanceItems = useMemo(() => {
    return inventory.filter(p => {
      const parsed = parseInventoryCategory(p.category) as any;
      return parsed.type === 'STORE_ITEM' && 
             parsed.status === 'PENDING_ACCEPTANCE' && 
             (parsed.branch || 'T4') === (currentUser?.branch || 'T4');
    });
  }, [inventory, currentUser?.branch]);

  if (pendingAcceptanceItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-slate-200">
        <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mb-6">
          <AlertTriangle className="w-10 h-10 text-amber-300" />
        </div>
        <h3 className="text-xl font-black text-slate-800 mb-2">No hay equipos pendientes</h3>
        <p className="text-slate-500 font-medium text-center max-w-sm">
          No hay artículos transferidos en espera de validación para esta sucursal.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start animate-in fade-in zoom-in-95 duration-300">
      <div className="flex-1 w-full flex flex-col gap-4">
        
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-3">
          <div className="bg-amber-100 p-2 rounded-xl text-amber-600 mt-0.5">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-black text-amber-900 leading-tight">Equipos en espera de validación</h3>
            <p className="text-sm font-medium text-amber-700/80 mt-1">Hay {pendingAcceptanceItems.length} equipos transferidos que precisan revisión, foto, y ser enlazados a su modelo del catálogo. Selecciona un artículo para continuar con el proceso.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {pendingAcceptanceItems.map((item) => {
            const parsed = parseInventoryCategory(item.category) as any;
            const isSelected = activeItemId === item.id;
            
            return (
              <motion.div
                key={item.id}
                layoutId={`pending-item-${item.id}`}
                onClick={() => setActiveItemId(item.id)}
                className={`bg-white rounded-2xl border p-3 cursor-pointer transition-all hover:shadow-md flex flex-col gap-3 relative overflow-hidden group ${
                  isSelected ? 'border-amber-500 shadow-amber-500/10 shadow-lg ring-2 ring-amber-500/20' : 'border-slate-200 hover:border-amber-300'
                }`}
              >
                <div className="aspect-square bg-slate-100 rounded-xl flex items-center justify-center overflow-hidden border border-slate-200/60 relative">
                  {parsed.imageUrl ? (
                    <img src={parsed.imageUrl} alt={item.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-slate-300" />
                  )}
                  {isSelected && (
                    <div className="absolute inset-0 bg-amber-500/10 border-2 border-amber-500 rounded-xl" />
                  )}
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-xs line-clamp-2 leading-tight mb-1" title={item.name}>{item.name.split(' (')[0]}</h4>
                  <p className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded ml-auto w-fit inline-block">#{item.id.substring(0,6)}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
      
      {activeItemId && (
        <div className="w-full lg:w-[450px] xl:w-[500px] shrink-0 sticky top-4 h-[calc(100vh-2rem)]">
           <div className="w-full h-full bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200 flex flex-col overflow-hidden">
             <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 to-amber-600 shrink-0"></div>
             <div className="flex-1 overflow-y-auto hidden-scrollbar relative z-10 flex flex-col bg-white">
                <StoreItemDetailsInline itemId={activeItemId} onClose={() => setActiveItemId(null)} onAddRequest={() => {}} />
             </div>
           </div>
        </div>
      )}
    </div>
  );
};
