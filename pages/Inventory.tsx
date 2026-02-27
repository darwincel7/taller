import React, { useState, useEffect } from 'react';
import { useInventory } from '../contexts/InventoryContext';
import { useAuth } from '../contexts/AuthContext';
import { InventoryPart, UserRole } from '../types';
import { Package, Plus, Edit2, Trash2, AlertCircle, Save, X, Printer, Lock, Search } from 'lucide-react';
import { printInventoryLabel } from '../services/invoiceService';

export const Inventory: React.FC = () => {
  const { inventory, fetchInventory, addInventoryPart, updateInventoryPart, deleteInventoryPart } = useInventory();
  const { currentUser } = useAuth();
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<InventoryPart>>({ name: '', stock: 0, min_stock: 2, cost: 0, price: 0 });
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => { fetchInventory(); }, []);

  const handleSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isEditing) await updateInventoryPart(isEditing, formData);
      else await addInventoryPart(formData);
      setFormData({ name: '', stock: 0, min_stock: 2, cost: 0, price: 0 });
      setIsEditing(null);
  };

  // STRICT PERMISSION: Only ADMIN can edit inventory
  const isAdmin = currentUser?.role === UserRole.ADMIN;

  const filteredInventory = inventory.filter(part => 
      part.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      part.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2"><Package className="w-6 h-6"/> Inventario de Repuestos</h1>
        
        {/* ACTION AREA - RESTRICTED */}
        {isAdmin ? (
            <form onSubmit={handleSave} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-8 grid grid-cols-2 md:grid-cols-6 gap-4 items-end animate-in fade-in">
                <div className="col-span-2">
                    <label className="text-xs font-bold text-slate-500">Nombre Repuesto</label>
                    <input required className="w-full p-2 border rounded bg-white text-slate-900" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Ej. Pantalla iPhone 11" />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500">Stock Actual</label>
                    <input required type="number" className="w-full p-2 border rounded bg-white text-slate-900" value={formData.stock} onChange={e => setFormData({...formData, stock: parseInt(e.target.value)})} />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500">Costo (Compra)</label>
                    <input required type="number" className="w-full p-2 border rounded bg-white text-slate-900" value={formData.cost} onChange={e => setFormData({...formData, cost: parseFloat(e.target.value)})} />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500">Precio (Venta)</label>
                    <input required type="number" className="w-full p-2 border rounded bg-white text-slate-900" value={formData.price} onChange={e => setFormData({...formData, price: parseFloat(e.target.value)})} />
                </div>
                <div className="flex gap-2">
                    {isEditing && <button type="button" onClick={() => {setIsEditing(null); setFormData({ name: '', stock: 0, min_stock: 2, cost: 0, price: 0 })}} className="p-2 bg-slate-100 rounded"><X className="w-5 h-5"/></button>}
                    <button type="submit" className="p-2 bg-blue-600 text-white rounded w-full flex justify-center items-center gap-2"><Save className="w-4 h-4"/> {isEditing ? 'Guardar' : 'Agregar'}</button>
                </div>
            </form>
        ) : (
            <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 mb-8 flex items-center justify-between text-slate-500">
                <div className="flex items-center gap-3">
                    <Lock className="w-5 h-5" />
                    <span className="text-sm font-bold">Modo Lectura: Edición restringida a Administradores.</span>
                </div>
            </div>
        )}

        {/* SEARCH & LIST */}
        <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input 
                placeholder="Buscar repuesto..." 
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 bg-white"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
            />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase font-bold">
                    <tr>
                        <th className="p-4">Código / SKU</th>
                        <th className="p-4">Nombre</th>
                        <th className="p-4">Stock</th>
                        <th className="p-4">Costo</th>
                        <th className="p-4">Precio</th>
                        <th className="p-4 text-right">Acciones</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {filteredInventory.map(part => (
                        <tr key={part.id} className="hover:bg-slate-50">
                            <td className="p-4">
                                <span className="font-mono font-bold text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded border border-slate-200">
                                    #{part.id.slice(0, 8).toUpperCase()}
                                </span>
                            </td>
                            <td className="p-4 font-bold text-slate-700">{part.name}</td>
                            <td className="p-4">
                                <span className={`px-2 py-1 rounded font-bold ${part.stock <= part.min_stock ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                    {part.stock} {part.stock <= part.min_stock && <AlertCircle className="w-3 h-3 inline"/>}
                                </span>
                            </td>
                            <td className="p-4 text-slate-600">{isAdmin ? `$${part.cost}` : '***'}</td>
                            <td className="p-4 text-slate-600 font-bold">${part.price}</td>
                            <td className="p-4 flex justify-end gap-2">
                                <button onClick={() => printInventoryLabel(part)} className="p-2 text-slate-600 hover:bg-slate-100 rounded border border-slate-200 hover:border-slate-300 transition" title="Imprimir Etiqueta">
                                    <Printer className="w-4 h-4"/>
                                </button>
                                {isAdmin && (
                                    <>
                                        <button onClick={() => { setIsEditing(part.id); setFormData(part); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded transition">
                                            <Edit2 className="w-4 h-4"/>
                                        </button>
                                        <button onClick={() => { if(confirm('¿Seguro que deseas eliminar este repuesto?')) deleteInventoryPart(part.id); }} className="p-2 text-red-600 hover:bg-red-50 rounded transition">
                                            <Trash2 className="w-4 h-4"/>
                                        </button>
                                    </>
                                )}
                            </td>
                        </tr>
                    ))}
                    {filteredInventory.length === 0 && (
                        <tr><td colSpan={6} className="p-8 text-center text-slate-400">No se encontraron repuestos.</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
  );
};