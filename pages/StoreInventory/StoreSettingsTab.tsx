import React, { useState, useMemo } from 'react';
import { useInventory } from '../../contexts/InventoryContext';
import { parseInventoryCategory } from '../../types';
import { Tag, Plus, Trash2, Edit2, Bookmark, Folder } from 'lucide-react';
import { toast } from 'sonner';

export const StoreSettingsTab = () => {
  const { inventory, addInventoryPart, updateInventoryPart, deleteInventoryPart } = useInventory();
  const [activeSegment, setActiveSegment] = useState<'BRAND' | 'CATEGORY' | 'PROVIDER'>('BRAND');
  const [newValue, setNewValue] = useState('');

  const attributes = useMemo(() => {
    return inventory.filter(p => {
      const cat = parseInventoryCategory(p.category);
      return cat.type === 'STORE_ATTRIBUTE';
    });
  }, [inventory]);

  const currentList = attributes.filter(a => {
    const cat = parseInventoryCategory(a.category) as any;
    return cat.subType === activeSegment;
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newValue.trim()) return;

    if (currentList.some(a => a.name.toLowerCase() === newValue.trim().toLowerCase())) {
        return toast.error("Este valor ya existe");
    }

    try {
      await addInventoryPart({
        name: newValue.trim(),
        stock: 0,
        min_stock: 0,
        cost: 0,
        price: 0,
        category: JSON.stringify({ type: 'STORE_ATTRIBUTE', subType: activeSegment })
      });
      setNewValue('');
      toast.success("Añadido correctamente");
    } catch (err) {
      toast.error("Error al añadir");
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("¿Estás seguro de eliminar este registro?")) {
      await deleteInventoryPart(id);
    }
  };

  return (
    <div className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-sm">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-black text-slate-800 mb-8 flex items-center gap-3">
          <Bookmark className="w-8 h-8 text-indigo-500" />
          Administrar Atributos
        </h2>

        <div className="flex gap-4 border-b border-slate-100 mb-8">
          {[
            { id: 'BRAND', icon: Bookmark, label: 'Marcas' },
            { id: 'CATEGORY', icon: Folder, label: 'Categorías' },
            { id: 'PROVIDER', icon: Tag, label: 'Proveedores' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSegment(tab.id as any)}
              className={`pb-4 px-4 font-bold text-sm transition-all flex items-center gap-2 border-b-2 ${activeSegment === tab.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleAdd} className="flex gap-4 mb-8">
          <input
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder={`Añadir nuevo(a) ${activeSegment === 'BRAND' ? 'marca' : activeSegment === 'CATEGORY' ? 'categoría' : 'proveedor'}...`}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 rounded-2xl font-bold flex items-center gap-2 transition-transform hover:-translate-y-1">
            <Plus className="w-5 h-5" /> Añadir
          </button>
        </form>

        <div className="bg-slate-50 border border-slate-100 rounded-3xl overflow-hidden">
          {currentList.length === 0 ? (
            <div className="p-12 text-center text-slate-400 font-bold">No hay registros almacenados.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {currentList.map(item => (
                <div key={item.id} className="p-6 flex items-center justify-between hover:bg-white transition-colors group">
                  <span className="font-extrabold text-slate-700 text-lg">{item.name}</span>
                  <button onClick={() => handleDelete(item.id)} className="text-slate-300 hover:text-red-500 transition-colors p-2 rounded-xl hover:bg-red-50">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
