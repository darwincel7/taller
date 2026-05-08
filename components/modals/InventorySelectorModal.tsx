import React, { useState, useMemo } from 'react';
import { Search, Package, X, Layers, Tag } from 'lucide-react';
import { InventoryPart, parseInventoryCategory } from '../../types';

interface InventorySelectorModalProps {
  inventory: InventoryPart[];
  onSelect: (part: InventoryPart) => void;
  onClose: () => void;
}

export const InventorySelectorModal: React.FC<InventorySelectorModalProps> = ({ inventory, onSelect, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredInventory = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return inventory.filter(part => {
      const cat = parseInventoryCategory(part.category);
      if (cat.type === 'STORE_PRODUCT') return false;
      return part.name.toLowerCase().includes(term) || 
             part.id.toLowerCase().includes(term)
    });
  }, [inventory, searchTerm]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
          <div>
            <h2 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-xl">
                <Package className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              Catálogo de Inventario
            </h2>
            <p className="text-slate-500 text-sm mt-1 font-medium">Busca y selecciona un artículo para agregarlo a la orden</p>
          </div>
          <button onClick={onClose} className="p-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500 shadow-sm border border-slate-200 dark:border-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="relative group">
            <Search className="w-6 h-6 absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
            <input 
              type="text"
              autoFocus
              placeholder="Buscar por nombre o número de código del artículo..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-14 pr-4 py-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl font-medium text-slate-800 dark:text-white outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-lg placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 dark:bg-slate-900/50">
          {filteredInventory.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <Package className="w-16 h-16 mb-4 opacity-20" />
              <p className="font-bold text-xl text-slate-600 dark:text-slate-300">No se encontraron artículos</p>
              <p className="text-sm mt-1">Intenta con otro término de búsqueda</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredInventory.map(part => {
                const parsed = parseInventoryCategory(part.category);
                const isLowStock = part.stock <= part.min_stock;
                
                return (
                  <button
                    key={part.id}
                    onClick={() => {
                      onSelect(part);
                      onClose();
                    }}
                    className="flex flex-col text-left bg-white dark:bg-slate-800 p-5 rounded-2xl border-2 border-slate-100 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/10 transition-all group"
                  >
                    <div className="flex justify-between items-start w-full mb-3">
                      <h3 className="font-bold text-slate-800 dark:text-white text-lg leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                        {part.name}
                      </h3>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-4">
                      <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-md shrink-0 border border-slate-200 dark:border-slate-600">
                        COD: {part.id.substring(0, 8).toUpperCase()}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-600">
                        <Tag className="w-3 h-3" />
                        {parsed.type === 'DONOR' ? 'Donante' : parsed.type === 'SUPPLY' ? 'Insumo' : 'Repuesto'}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border ${isLowStock ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/50' : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50'}`}>
                        <Layers className="w-3 h-3" />
                        Stock: {part.stock}
                      </span>
                    </div>

                    <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center w-full">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Costo</span>
                        <span className="font-black text-slate-800 dark:text-white text-lg">${part.cost.toLocaleString()}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Precio Venta</span>
                        <span className="font-black text-emerald-600 dark:text-emerald-400 text-lg">${part.price.toLocaleString()}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
