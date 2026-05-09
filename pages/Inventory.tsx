import React, { useState, useEffect } from 'react';
import { useInventory } from '../contexts/InventoryContext';
import { useAuth } from '../contexts/AuthContext';
import { InventoryPart, UserRole, parseInventoryCategory } from '../types';
import { Package, Plus, Edit2, Trash2, AlertCircle, Save, X, Printer, Lock, Search, History, Smartphone, Wrench, Box, User, Calendar, Hash, Camera, Upload } from 'lucide-react';
import { printInventoryLabel } from '../services/invoiceService';
import { supabase } from '../services/supabase';
import { CameraCapture } from '../components/CameraCapture';

export const Inventory: React.FC = () => {
  const { inventory, fetchInventory, addInventoryPart, updateInventoryPart, adjustStock, deleteInventoryPart } = useInventory();
  const { currentUser } = useAuth();
  const [isEditing, setIsEditing] = useState<string | null>(null);
  
  // Form states
  const [name, setName] = useState('');
  const [stock, setStock] = useState(0);
  const [minStock, setMinStock] = useState(2);
  const [cost, setCost] = useState(0);
  const [price, setPrice] = useState(0);
  const [partType, setPartType] = useState<'PART' | 'DONOR' | 'SUPPLY'>('PART');
  const [isExpenseRecorded, setIsExpenseRecorded] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [showCamera, setShowCamera] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  
  // Details Modal State
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedPart, setSelectedPart] = useState<InventoryPart | null>(null);
  const [selectedPartHistory, setSelectedPartHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  // Stock Adjust State
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustType, setAdjustType] = useState<'IN' | 'OUT' | 'ADJUSTMENT'>('ADJUSTMENT');
  const [adjustReason, setAdjustReason] = useState('');

  useEffect(() => { fetchInventory(); }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
              setImageUrl(reader.result as string);
          };
          reader.readAsDataURL(file);
      }
  };

  const resetForm = () => {
      setName('');
      setStock(0);
      setMinStock(2);
      setCost(0);
      setPrice(0);
      setPartType('PART');
      setIsExpenseRecorded(false);
      setImageUrl('');
      setIsEditing(null);
  };

  const handleSave = async (e: React.FormEvent) => {
      e.preventDefault();
      
      if (!imageUrl) {
          alert('Es obligatorio añadir una foto al artículo.');
          return;
      }
      
      const categoryJson = JSON.stringify({
          type: partType,
          initialCost: cost,
          isExpenseRecorded: isExpenseRecorded,
          imageUrl: imageUrl
      });

      const partData: Partial<InventoryPart> = {
          name, stock, min_stock: minStock, cost, price, category: categoryJson
      };

      if (isEditing) {
          // When editing, we don't re-trigger the expense recording logic
          await updateInventoryPart(isEditing, partData);
      } else {
          await addInventoryPart(partData);
      }
      
      resetForm();
  };

  const openEdit = (part: InventoryPart) => {
      setIsEditing(part.id);
      setName(part.name);
      setStock(part.stock);
      setMinStock(part.min_stock);
      setCost(part.cost);
      setPrice(part.price);
      
      const parsed = parseInventoryCategory(part.category);
      setPartType((parsed as any).type || 'PART');
      setIsExpenseRecorded(parsed.type === 'PART' ? parsed.isExpenseRecorded : false);
      setImageUrl((parsed as any).imageUrl || '');
  };

  const viewDetails = async (part: InventoryPart) => {
      setSelectedPart(part);
      setDetailsModalOpen(true);
      setLoadingHistory(true);
      setSelectedPartHistory([]);
      
      try {
          // Fetch from inventory_movements ledger (Formal)
          const { data, error } = await supabase
              .from('inventory_movements')
              .select('*')
              .eq('item_id', part.id)
              .order('created_at', { ascending: false })
              .limit(100);
          
          if (error) throw error;
              
          if (data) {
              const orderIds = [...new Set(data.map(log => log.source_id).filter(Boolean))];
              if (orderIds.length > 0) {
                  const { data: orders } = await supabase.from('orders').select('id, readable_id').in('id', orderIds);
                  if (orders) {
                      const orderMap: any = orders.reduce((acc: any, o: any) => { 
                          if(o.readable_id) acc[o.id] = o.readable_id; 
                          return acc; 
                      }, {});
                      data.forEach(log => {
                          if (log.source_id && orderMap[log.source_id]) {
                              (log as any)._readable_order_id = orderMap[log.source_id];
                          }
                      });
                  }
              }
              setSelectedPartHistory(data);
          }
      } catch (e) {
          console.warn("Falling back to audit_logs:", e);
          // Fallback to legacy audit_logs if movements table doesn't exist yet
          const { data } = await supabase
              .from('audit_logs')
              .select('*')
              .ilike('details', `%[INV_ID: ${part.id}]%`)
              .order('created_at', { ascending: false });
          if (data) setSelectedPartHistory(data);
      } finally {
          setLoadingHistory(false);
      }
  };

  const handleAdjustStock = async () => {
      if (!selectedPart || adjustQty === 0 || !adjustReason) {
          alert('Por favor completa todos los campos (Cantidad, Tipo y Motivo).');
          return;
      }
      
      const success = await adjustStock(selectedPart.id, adjustQty, adjustType, adjustReason);
      if (success) {
          alert('Inventario actualizado correctamente.');
          setShowAdjustModal(false);
          setAdjustQty(0);
          setAdjustReason('');
          fetchInventory();
          viewDetails({ ...selectedPart, stock: selectedPart.stock + (adjustType === 'OUT' ? -adjustQty : adjustQty) });
      } else {
          alert('Error al actualizar el inventario.');
      }
  };

  // STRICT PERMISSION: Only ADMIN can edit inventory
  const isAdmin = currentUser?.role === UserRole.ADMIN;
  const canViewFinancials = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.SUB_ADMIN || currentUser?.permissions?.canViewAccounting;

  const filteredInventory = inventory.filter(part => {
      const term = searchTerm.toLowerCase();
      const cat = parseInventoryCategory(part.category);
      if (cat.type === 'STORE_PRODUCT') return false;
      
      const readableId = (cat as any).readable_id ? (cat as any).readable_id.toString() : '';

      return (
          part.name.toLowerCase().includes(term) ||
          part.id.toLowerCase().includes(term) ||
          readableId.includes(term) ||
          part.category?.toLowerCase().includes(term)
      );
  });

  const getTypeIcon = (type: string) => {
      if (type === 'DONOR') return <Smartphone className="w-4 h-4 text-purple-500" />;
      if (type === 'SUPPLY') return <Box className="w-4 h-4 text-amber-500" />;
      return <Wrench className="w-4 h-4 text-blue-500" />;
  };

  const getTypeName = (type: string) => {
      if (type === 'DONOR') return 'Equipo Donante';
      if (type === 'SUPPLY') return 'Insumo';
      return 'Repuesto Nuevo';
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3 tracking-tight">
                    <div className="p-2.5 bg-indigo-600 text-white rounded-2xl shadow-md cursor-default transition-all duration-300 hover:rotate-3 hover:scale-105">
                        <Package className="w-7 h-7" />
                    </div>
                    Inventario de Piezas
                </h1>
                <p className="text-slate-500 font-medium mt-2 flex items-center gap-4">
                    Gestiona repuestos, equipos donantes e insumos.
                </p>
            </div>
            
            {/* SEARCH */}
            <div className="relative w-full md:w-96 group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                    <Search className="w-5 h-5" />
                </div>
                <input 
                    placeholder="Buscar repuesto, SKU, donante..." 
                    className="w-full pl-11 pr-4 py-3.5 border-2 border-slate-200/60 rounded-2xl outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 bg-white font-medium text-slate-700 placeholder:text-slate-400 transition-all shadow-sm"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                    <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600">
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
        
        {/* ACTION AREA - RESTRICTED */}
        {isAdmin ? (
            <form onSubmit={handleSave} className="relative bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200/80 overflow-hidden ring-1 ring-slate-900/5 transition-all">
                {isEditing ? (
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-amber-400 to-orange-400"></div>
                ) : (
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-blue-500 to-sky-500"></div>
                )}
                
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${isEditing ? 'bg-amber-50 text-amber-600 border-amber-200/50' : 'bg-indigo-50 text-indigo-600 border-indigo-200/50'} shadow-inner`}>
                                    {isEditing ? <Edit2 className="w-6 h-6"/> : <Plus className="w-6 h-6"/>}
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-slate-800 tracking-tight">{isEditing ? 'Editar Artículo' : 'Nuevo Artículo'}</h2>
                                    <p className="text-sm font-medium text-slate-500 mt-0.5">{isEditing ? 'Modificando los detalles del repuesto seleccionado.' : 'Registra un repuesto, donante o insumo al inventario.'}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {isEditing && (
                                    <button type="button" onClick={resetForm} className="p-2.5 text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors border border-transparent hover:border-slate-200">
                                        <X className="w-5 h-5"/>
                                    </button>
                                )}
                            </div>
                        </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Main Info */}
                    <div className="lg:col-span-7 space-y-5">
                        
                        {/* PHOTO */}
                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-5">
                            <div className="sm:col-span-12 w-full">
                                <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 flex items-center gap-1"><Camera className="w-3 h-3"/> Foto del Artículo (Obligatorio)</label>
                                {imageUrl ? (
                                    <div className="relative rounded-2xl overflow-hidden border-2 border-slate-200 h-40 group">
                                        <img src={imageUrl} className="w-full h-full object-contain bg-slate-50" />
                                        <button type="button" onClick={() => setImageUrl('')} className="absolute top-2 right-2 bg-red-600 text-white p-1.5 rounded-full shadow-lg hover:scale-110 transition"><Trash2 className="w-4 h-4"/></button>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-3 h-40">
                                        <button type="button" onClick={() => setShowCamera(true)} className="border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center text-slate-400 hover:text-indigo-500 hover:border-indigo-300 hover:bg-slate-50 transition-all gap-2">
                                            <Camera className="w-8 h-8 opacity-50"/>
                                            <span className="text-xs font-bold uppercase">Tomar Foto</span>
                                        </button>
                                        <label className="border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center text-slate-400 hover:text-indigo-500 hover:border-indigo-300 hover:bg-slate-50 transition-all gap-2 cursor-pointer">
                                            <Upload className="w-8 h-8 opacity-50"/>
                                            <span className="text-xs font-bold uppercase">Subir Archivo</span>
                                            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                                        </label>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-5">
                            <div className="sm:col-span-3">
                                <label className="flex items-center gap-1.5 text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Nombre del Artículo</label>
                                <input required className="w-full p-3.5 border-2 border-slate-200/70 rounded-xl bg-slate-50/50 hover:bg-slate-50 focus:bg-white text-slate-800 font-semibold transition-colors outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 placeholder:font-normal placeholder:text-slate-400" value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Pantalla Original iPhone 13 Pro" />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="flex items-center gap-1.5 text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Tipo</label>
                                <div className="relative">
                                    <select className="appearance-none w-full p-3.5 pr-10 border-2 border-slate-200/70 rounded-xl bg-slate-50/50 hover:bg-slate-50 focus:bg-white text-slate-800 font-semibold transition-colors outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 cursor-pointer" value={partType} onChange={e => setPartType(e.target.value as any)}>
                                        <option value="PART">Repuesto Nuevo</option>
                                        <option value="DONOR">Equipo Donante</option>
                                        <option value="SUPPLY">Insumo</option>
                                    </select>
                                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            {!isEditing && (
                                <div className="relative group">
                                    <label className="flex items-center gap-1.5 text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Stock Inicial</label>
                                    <input required type="number" min="0" className="w-full p-3.5 border-2 border-slate-200/70 rounded-xl bg-slate-50/50 hover:bg-slate-50 focus:bg-white text-slate-800 font-black text-lg transition-colors outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10" value={stock} onChange={e => setStock(parseInt(e.target.value) || 0)} />
                                </div>
                            )}
                            <div className={`relative group ${isEditing ? 'col-span-2' : ''}`}>
                                <label className="flex items-center gap-1.5 text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Stock Mínimo (Alerta)</label>
                                <input required type="number" min="0" className="w-full p-3.5 border-2 border-slate-200/70 rounded-xl bg-slate-50/50 hover:bg-slate-50 focus:bg-white text-slate-800 font-black text-lg transition-colors outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10" value={minStock} onChange={e => setMinStock(parseInt(e.target.value) || 0)} />
                            </div>
                        </div>
                    </div>
                    
                    <div className="hidden lg:block w-px bg-slate-200/80 mx-auto mt-4"></div>

                    {/* Financials & Submit */}
                    <div className="lg:col-span-4 flex flex-col justify-between space-y-6 lg:space-y-0">
                        <div className="space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                {canViewFinancials && (
                                    <div>
                                        <label className="flex items-center gap-1.5 text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Costo</label>
                                        <div className="relative">
                                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-black">$</span>
                                            <input required type="number" step="0.01" min="0" className="w-full pl-8 pr-3.5 py-3.5 border-2 border-slate-200/70 rounded-xl bg-slate-50/50 hover:bg-slate-50 focus:bg-white text-slate-800 font-black transition-colors outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10" value={cost} onChange={e => setCost(parseFloat(e.target.value) || 0)} />
                                        </div>
                                    </div>
                                )}
                                <div className={!canViewFinancials ? 'col-span-2' : ''}>
                                    <label className="flex items-center gap-1.5 text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Precio</label>
                                    <div className="relative">
                                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-500 font-black">$</span>
                                        <input required type="number" step="0.01" min="0" className="w-full pl-8 pr-3.5 py-3.5 border-2 border-blue-200/70 rounded-xl bg-blue-50/30 hover:bg-blue-50/50 focus:bg-white text-blue-700 font-black transition-colors outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" value={price} onChange={e => setPrice(parseFloat(e.target.value) || 0)} />
                                    </div>
                                </div>
                            </div>
                            
                            {!isEditing && canViewFinancials && (
                                <label className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200 hover:bg-slate-100/50 cursor-pointer transition-colors group">
                                    <div className="relative flex items-center justify-center mt-0.5">
                                        <input 
                                            type="checkbox" 
                                            checked={isExpenseRecorded} 
                                            onChange={e => setIsExpenseRecorded(e.target.checked)}
                                            className="peer appearance-none w-5 h-5 border-2 border-slate-300 rounded focus:ring-2 focus:ring-blue-500/20 focus:outline-none checked:border-blue-500 checked:bg-blue-500 transition-all cursor-pointer"
                                        />
                                        <svg className="absolute w-3.5 h-3.5 text-white pointer-events-none opacity-0 peer-checked:opacity-100 scale-50 peer-checked:scale-100 transition-all duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-slate-700 group-hover:text-slate-900 transition-colors">Registrar como gasto</p>
                                        <p className="text-[11px] text-slate-500 mt-0.5 font-medium leading-snug">Se añadirá al historial contable pero no descontará efectivo de tu caja actual.</p>
                                    </div>
                                </label>
                            )}
                        </div>

                        <button 
                            type="submit" 
                            className={`w-full py-4 rounded-xl font-bold flex justify-center items-center gap-2 transition-all duration-300 shadow-md ${isEditing ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20 hover:shadow-amber-500/40 text-white' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20 hover:shadow-indigo-600/40 text-white hover:-translate-y-0.5'}`}
                        >
                            <Save className="w-5 h-5"/> {isEditing ? 'Guardar Cambios' : 'Agregar al Inventario'}
                        </button>
                    </div>
                </div>
            </form>
        ) : (
            <div className="bg-amber-50 border-l-4 border-amber-500 p-5 rounded-2xl mb-8 flex items-start gap-4">
                <Lock className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
                <div>
                    <h3 className="font-bold text-amber-800 text-sm">Modo de Sólo Lectura</h3>
                    <p className="text-amber-700 text-sm mt-1">La edición del inventario está restringida únicamente a los Administradores.</p>
                </div>
            </div>
        )}

        {showCamera && <CameraCapture onCapture={(img) => { setImageUrl(img); setShowCamera(false); }} onClose={() => setShowCamera(false)} />}


        <div className="flex flex-col lg:flex-row gap-6 relative">
            <div className={`bg-white rounded-3xl shadow-sm border border-slate-200/80 overflow-hidden ring-1 ring-slate-900/5 transition-all duration-300 ${detailsModalOpen ? 'lg:w-[60%]' : 'w-full'}`}>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="bg-slate-50/80 border-b border-slate-200/80">
                        <tr>
                            <th className="px-6 py-5 text-xs font-black text-slate-500 uppercase tracking-widest">Código / SKU</th>
                            <th className="px-6 py-5 text-xs font-black text-slate-500 uppercase tracking-widest">Tipo</th>
                            <th className="px-6 py-5 text-xs font-black text-slate-500 uppercase tracking-widest">Nombre</th>
                            <th className="px-6 py-5 text-xs font-black text-slate-500 uppercase tracking-widest text-center">Stock</th>
                            {canViewFinancials && <th className="px-6 py-5 text-xs font-black text-slate-500 uppercase tracking-widest text-right">Costo</th>}
                            <th className="px-6 py-5 text-xs font-black text-slate-500 uppercase tracking-widest text-right">Precio</th>
                            <th className="px-6 py-5 text-xs font-black text-slate-500 uppercase tracking-widest text-center">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredInventory.map(part => {
                            const parsed = parseInventoryCategory(part.category);
                            const readableId = (parsed as any).readable_id ? (parsed as any).readable_id.toString() : part.id.slice(0, 8).toUpperCase();
                            const isLowStock = part.stock <= part.min_stock;
                            return (
                            <tr 
                                key={part.id} 
                                className="hover:bg-indigo-50/40 cursor-pointer transition-colors group"
                                onClick={() => viewDetails(part)}
                            >
                                <td className="px-6 py-4">
                                    <span className="font-mono font-bold text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md border border-slate-200 group-hover:border-indigo-200 transition-colors shadow-sm">
                                        #{readableId}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 bg-slate-50 rounded border border-slate-100 text-slate-400 group-hover:bg-white transition-colors">
                                            {getTypeIcon(parsed.type)}
                                        </div>
                                        <span className="font-bold text-slate-600 text-xs tracking-tight">{getTypeName(parsed.type)}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center shrink-0">
                                            {(parsed as any).imageUrl ? (
                                                <img src={(parsed as any).imageUrl} className="w-full h-full object-contain" />
                                            ) : (
                                                <Package className="w-5 h-5 text-slate-300" />
                                            )}
                                        </div>
                                        <span className="font-bold text-slate-700 group-hover:text-indigo-600 transition-colors whitespace-normal line-clamp-2 max-w-sm">{part.name}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex justify-center">
                                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-black text-sm border shadow-sm ${isLowStock ? 'bg-red-50 text-red-600 border-red-200 animate-pulse' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>
                                            {part.stock} {isLowStock && <AlertCircle className="w-4 h-4"/>}
                                        </span>
                                    </div>
                                </td>
                                {canViewFinancials && (
                                    <td className="px-6 py-4 text-right">
                                        <span className="text-slate-500 font-semibold">{part.cost.toLocaleString('es-DO', { style: 'currency', currency: 'DOP' })}</span>
                                    </td>
                                )}
                                <td className="px-6 py-4 text-right">
                                    <span className="font-black text-slate-800 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">{part.price.toLocaleString('es-DO', { style: 'currency', currency: 'DOP' })}</span>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center justify-center gap-2">
                                        <button onClick={(e) => { e.stopPropagation(); printInventoryLabel(part); }} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-white rounded-xl border border-transparent hover:border-slate-200 hover:shadow-sm transition-all" title="Imprimir Etiqueta">
                                            <Printer className="w-4 h-4"/>
                                        </button>
                                        {isAdmin && (
                                            <>
                                                <button onClick={(e) => { e.stopPropagation(); openEdit(part); }} className="p-2 text-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 rounded-xl border border-transparent hover:border-indigo-100 transition-all" title="Editar Artículo">
                                                    <Edit2 className="w-4 h-4"/>
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); if(confirm('¿Seguro que deseas eliminar este artículo?')) deleteInventoryPart(part.id); }} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl border border-transparent hover:border-red-100 transition-all" title="Eliminar Artículo">
                                                    <Trash2 className="w-4 h-4"/>
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        )})}
                        {filteredInventory.length === 0 && (
                            <tr>
                                <td colSpan={canViewFinancials ? 7 : 6} className="p-16">
                                    <div className="flex flex-col items-center justify-center text-center">
                                        <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center mb-4">
                                            <Search className="w-8 h-8 text-slate-300" />
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-800 mb-1">No hay resultados</h3>
                                        <p className="text-slate-500 font-medium">Búsqueda o inventario vacío. Intenta con otros términos.</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>

        {/* SIDE DETAILS PANEL (THOUGHT BUBBLE) */}
        {detailsModalOpen && selectedPart && (
            <div className="w-full lg:w-[40%] bg-slate-50/80 rounded-3xl shadow-xl w-full flex flex-col max-h-[85vh] ring-1 ring-slate-200/60 sticky top-4 border-2 border-indigo-100 relative">
                {/* Speech Bubble Arrow pointing left */}
                <div className="hidden lg:block absolute top-[150px] -left-[18px] text-indigo-100">
                    <svg width="20" height="40" viewBox="0 0 20 40" fill="currentColor">
                        <path d="M20 0L0 20L20 40Z" />
                    </svg>
                </div>
                {/* Inner bubble to match background */}
                <div className="hidden lg:block absolute top-[150px] -left-[15px] text-white">
                    <svg width="20" height="40" viewBox="0 0 20 40" fill="currentColor">
                        <path d="M20 2L2 20L20 38Z" />
                    </svg>
                </div>
                
                <div className="bg-white rounded-3xl w-full h-full flex flex-col overflow-hidden relative z-10 shadow-sm">
                    {/* Header Area */}
                    <div className="relative overflow-hidden bg-white px-8 py-8 border-b border-slate-200/60">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
                        <div className="absolute -right-20 -top-20 w-64 h-64 bg-slate-50 rounded-full blur-3xl opacity-50 pointer-events-none"></div>
                        
                        <div className="relative flex justify-between items-start gap-6">
                            <div className="flex-1">
                                <div className="flex items-center gap-4 mb-3">
                                    <div className="relative w-16 h-16 shrink-0 rounded-2xl overflow-hidden shadow-sm">
                                        <div className="absolute inset-0 bg-indigo-500 blur-md opacity-20"></div>
                                        <div className="w-full h-full bg-slate-50 border border-slate-200 flex items-center justify-center relative z-10 p-1">
                                            {(parseInventoryCategory(selectedPart.category) as any).imageUrl ? (
                                                <img src={(parseInventoryCategory(selectedPart.category) as any).imageUrl} className="w-full h-full object-contain rounded-xl" />
                                            ) : (
                                                <Package className="w-8 h-8 text-slate-300" />
                                            )}
                                        </div>
                                    </div>
                                    <h2 className="text-3xl font-black text-slate-800 tracking-tight leading-tight">
                                        {selectedPart.name}
                                    </h2>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 mt-4">
                                    <span className="font-mono text-xs font-semibold bg-slate-100/80 text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200">
                                        No. Artículo: #{selectedPart.readable_id || selectedPart.id.slice(0, 8).toUpperCase()}
                                    </span>
                                    <span className="text-[11px] font-bold uppercase tracking-widest bg-white text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm flex items-center gap-1.5">
                                        {getTypeIcon(parseInventoryCategory(selectedPart.category).type)}
                                        {getTypeName(parseInventoryCategory(selectedPart.category).type)}
                                    </span>
                                    {selectedPart.stock <= selectedPart.min_stock && (
                                        <span className="text-[11px] font-bold uppercase tracking-widest bg-red-50 text-red-600 px-3 py-1.5 rounded-lg border border-red-200 flex items-center gap-1.5 animate-pulse">
                                            <AlertCircle className="w-3.5 h-3.5" /> Stock Bajo
                                        </span>
                                    )}
                                </div>
                            </div>
                            <button onClick={() => setDetailsModalOpen(false)} className="p-2.5 hover:bg-slate-100 rounded-xl transition-all duration-200 bg-white shadow-sm border border-slate-200 text-slate-400 hover:text-slate-700 hover:shadow-md">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-8 space-y-8 bg-slate-50/50">
                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
                            <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm relative overflow-hidden group hover:border-indigo-300 transition-all cursor-pointer" onClick={() => setShowAdjustModal(true)}>
                                <div className={`absolute inset-0 bg-gradient-to-br ${selectedPart.stock <= selectedPart.min_stock ? 'from-red-50 to-white' : 'from-indigo-50 to-white'} opacity-50`}></div>
                                <div className="relative">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Stock Actual</p>
                                        <div className="flex items-center gap-1">
                                            <Edit2 className="w-3 h-3 text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            <div className={`w-2 h-2 rounded-full ${selectedPart.stock <= selectedPart.min_stock ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                                        </div>
                                    </div>
                                    <p className={`text-4xl font-black tracking-tight ${selectedPart.stock <= selectedPart.min_stock ? 'text-red-600' : 'text-indigo-600'}`}>
                                        {selectedPart.stock}
                                    </p>
                                </div>
                            </div>
                            <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm hover:border-slate-300 transition-colors">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Stock Mínimo</p>
                                <p className="text-4xl font-black text-slate-700 tracking-tight">{selectedPart.min_stock}</p>
                            </div>
                            {canViewFinancials && (
                                <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm hover:border-slate-300 transition-colors">
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Costo (Unidad)</p>
                                    <p className="text-3xl sm:text-4xl font-black text-slate-700 tracking-tight">${selectedPart.cost.toLocaleString()}</p>
                                </div>
                            )}
                            <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm hover:border-slate-300 transition-colors">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Precio Venta</p>
                                <p className="text-3xl sm:text-4xl font-black text-blue-600 tracking-tight">${selectedPart.price.toLocaleString()}</p>
                            </div>
                        </div>

                        {showAdjustModal && (
                            <div className="bg-indigo-50/50 p-6 rounded-2xl border-2 border-indigo-200 animate-in slide-in-from-top-4 duration-300">
                                <div className="flex items-center justify-between mb-4">
                                    <h4 className="font-black text-indigo-800 uppercase text-xs tracking-widest flex items-center gap-2">
                                        <Wrench className="w-4 h-4" /> Ajuste Formal de Stock (Auditado)
                                    </h4>
                                    <button onClick={() => setShowAdjustModal(false)} className="text-indigo-400 hover:text-indigo-600">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                                    <div>
                                        <label className="text-[10px] font-bold text-indigo-400 uppercase mb-1 block">Cantidad</label>
                                        <input 
                                            type="number" 
                                            className="w-full p-2.5 rounded-xl border border-indigo-200 bg-white font-black text-indigo-700 focus:ring-2 focus:ring-indigo-500/20 outline-none" 
                                            value={adjustQty} 
                                            onChange={e => setAdjustQty(Math.abs(parseInt(e.target.value) || 0))}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-indigo-400 uppercase mb-1 block">Tipo Movimiento</label>
                                        <select 
                                            className="w-full p-2.5 rounded-xl border border-indigo-200 bg-white font-bold text-indigo-700 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                                            value={adjustType}
                                            onChange={e => setAdjustType(e.target.value as any)}
                                        >
                                            <option value="IN">Entrada (+)</option>
                                            <option value="OUT">Salida (-)</option>
                                            <option value="ADJUSTMENT">Ajuste Manual</option>
                                        </select>
                                    </div>
                                    <div className="sm:col-span-1">
                                        <label className="text-[10px] font-bold text-indigo-400 uppercase mb-1 block">Motivo Obligatorio</label>
                                        <input 
                                            placeholder="Ej: Conteo físico, Devolución..." 
                                            className="w-full p-2.5 rounded-xl border border-indigo-200 bg-white font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500/20 outline-none" 
                                            value={adjustReason}
                                            onChange={e => setAdjustReason(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <button 
                                    onClick={handleAdjustStock}
                                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                                >
                                    Confirmar Movimiento
                                </button>
                            </div>
                        )}

                        {/* History Section */}
                        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden mb-8">
                            <div className="p-5 sm:p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                                        <History className="w-5 h-5 text-indigo-500" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800">Historial de Movimientos</h3>
                                        <p className="text-xs text-slate-500 font-medium">Registro de auditoría del artículo</p>
                                    </div>
                                </div>
                            </div>
                            <div className="p-4 sm:p-8">
                                {loadingHistory ? (
                                    <div className="text-center py-8 text-slate-500">Cargando historial...</div>
                                ) : selectedPartHistory.length > 0 ? (
                                    <div className="relative pl-4 space-y-6 before:absolute before:inset-0 before:ml-[31px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                                        {selectedPartHistory.map((log, i) => {
                                            const isFormalMovement = !!log.movement_type;
                                            let iconBg = "bg-white";
                                            let iconColor = "text-slate-400";
                                            let badgeClass = "bg-slate-100 text-slate-700 font-medium";
                                            let Icon = History;
                                            
                                            // Format for formal movements
                                            if (isFormalMovement) {
                                                const mType = log.movement_type;
                                                if (mType === 'IN') {
                                                    Icon = Plus;
                                                    iconBg = "bg-emerald-50"; iconColor = "text-emerald-500";
                                                    badgeClass = "bg-emerald-100 text-emerald-700 border border-emerald-200";
                                                } else if (mType === 'SALE' || mType === 'OUT') {
                                                    Icon = Package;
                                                    iconBg = "bg-indigo-50"; iconColor = "text-indigo-500";
                                                    badgeClass = "bg-indigo-100 text-indigo-700 border border-indigo-200";
                                                } else if (mType === 'ADJUSTMENT') {
                                                    Icon = Edit2;
                                                    iconBg = "bg-amber-50"; iconColor = "text-amber-500";
                                                    badgeClass = "bg-amber-100 text-amber-700 border border-amber-200";
                                                }
                                            } else {
                                                // Legacy audit logs
                                                if (log.action === 'INVENTORY_CREATED') {
                                                    Icon = Plus; iconBg = "bg-emerald-50"; iconColor = "text-emerald-500";
                                                } else if (log.action === 'INVENTORY_DELETED') {
                                                    Icon = Trash2; iconBg = "bg-red-50"; iconColor = "text-red-500";
                                                }
                                            }

                                            return (
                                                <div key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                                    <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 border-white ${iconBg} ${iconColor} shadow-sm shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 ring-4 ring-white z-10 mx-4 md:mx-0 transition-transform group-hover:scale-110`}>
                                                        <Icon className="w-3.5 h-3.5" />
                                                    </div>
                                                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 sm:p-5 rounded-2xl border border-slate-100 bg-white shadow-sm hover:shadow-md transition-all border-l-4 group-hover:border-indigo-100 cursor-default relative">
                                                        <div className="flex flex-col gap-2">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div>
                                                                    <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-md ${badgeClass} mb-2 inline-block`}>
                                                                        {isFormalMovement ? log.movement_type : log.action}
                                                                    </span>
                                                                    <div className="font-bold text-slate-800 text-sm">
                                                                        {isFormalMovement ? (
                                                                            <>
                                                                                {log.movement_type === 'IN' ? 'Entrada' : log.movement_type === 'OUT' ? 'Salida' : 'Movimiento'}: {log.quantity} unidades
                                                                                <span className="block text-xs text-slate-500 font-medium mt-1">Stock: {log.before_stock} → {log.after_stock}</span>
                                                                            </>
                                                                        ) : log.details?.replace(/\[INV_ID:.*?\]\s*/, '')}
                                                                    </div>
                                                                    {log.reason && <p className="text-xs text-indigo-600 font-bold mt-1 inline-flex items-center gap-1"><Wrench className="w-3 h-3" /> {log.reason}</p>}
                                                                </div>
                                                                
                                                                {(log.source_id || log.order_id) && (
                                                                    <div className="shrink-0 flex items-center justify-center bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                                                                        <span className="font-mono text-[10px] font-black text-indigo-600">#{(log as any)._readable_order_id || log.source_id || log.order_id}</span>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div className="pt-2 mt-1 border-t border-slate-50 flex items-center justify-between text-[10px]">
                                                                <div className="flex items-center gap-1 text-slate-500 font-bold">
                                                                    <User className="w-3 h-3" />
                                                                    {log.user_name || 'Sistema'}
                                                                </div>
                                                                <div className="text-slate-400 font-mono">
                                                                    {new Date(log.created_at || (log.created_at * 1000)).toLocaleString()}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-center py-16 px-4 bg-slate-50/50 rounded-2xl border border-slate-100 border-dashed">
                                        <div className="w-16 h-16 bg-white border border-slate-200 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm rotate-3">
                                            <History className="w-8 h-8 text-slate-300" />
                                        </div>
                                        <p className="font-semibold text-slate-600 mb-1">Sin movimientos recientes</p>
                                        <p className="text-xs text-slate-400 max-w-xs mx-auto">Cuando se realicen salidas, actualizaciones o extracciones, aparecerán aquí.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}
        </div>
    </div>
  );
};