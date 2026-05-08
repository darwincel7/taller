import React, { useState } from 'react';
import { useInventory } from '../../contexts/InventoryContext';
import { useAuth } from '../../contexts/AuthContext';
import { parseInventoryCategory } from '../../types';
import { ArrowRightLeft, Search, Check, AlertTriangle, PackageOpen, Clock } from 'lucide-react';
import { toast } from 'sonner';

export const StoreTransfersTab = () => {
    const { inventory, updateInventoryPart } = useInventory();
    const { currentUser } = useAuth();
    
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedItem, setSelectedItem] = useState<string | null>(null);
    const [targetBranch, setTargetBranch] = useState('');

    const currentBranch = currentUser?.branch || 'T4';

    const availableItems = inventory.filter(i => {
        const parsed = parseInventoryCategory(i.category) as any;
        return parsed.type === 'STORE_ITEM' && 
               i.stock > 0 && 
               (!parsed.status || parsed.status === 'AVAILABLE') && 
               (parsed.branch || 'T4') === currentBranch;
    });

    const incomingItems = inventory.filter(i => {
        const parsed = parseInventoryCategory(i.category) as any;
        return parsed.type === 'STORE_ITEM' && 
               i.stock > 0 && 
               parsed.status === 'IN_TRANSIT' && 
               parsed.targetBranch === currentBranch;
    });

    const filteredItems = availableItems.filter(item => {
        const parsed = parseInventoryCategory(item.category) as any;
        const search = searchTerm.toLowerCase();
        return item.name.toLowerCase().includes(search) || 
               (parsed.imei && parsed.imei.toLowerCase().includes(search));
    });

    const handleTransfer = async () => {
        if (!selectedItem || !targetBranch) {
            toast.error('Selecciona una unidad y una sucursal destino');
            return;
        }
        
        const item = inventory.find(i => i.id === selectedItem);
        if (!item) return;

        const parsed = parseInventoryCategory(item.category) as any;
        
        if (currentBranch === targetBranch) {
            toast.error('La unidad ya se encuentra en esa sucursal');
            return;
        }

        const newHistory = [...(parsed.history || []), {
            action: 'ENVIADO A SUCURSAL',
            date: new Date().toISOString(),
            user: currentUser?.name || 'Usuario',
            details: `Enviado de ${currentBranch} a ${targetBranch}`
        }];

        await updateInventoryPart(item.id, {
            category: JSON.stringify({
                ...parsed,
                status: 'IN_TRANSIT',
                targetBranch: targetBranch,
                history: newHistory
            })
        });

        toast.success(`Unidad en tránsito hacia ${targetBranch}`);
        setSelectedItem(null);
        setTargetBranch('');
    };

    const handleAcceptTransfer = async (itemId: string) => {
        const item = inventory.find(i => i.id === itemId);
        if (!item) return;

        const parsed = parseInventoryCategory(item.category) as any;
        const sourceBranch = parsed.branch || 'T4';

        const newHistory = [...(parsed.history || []), {
            action: 'RECIBIDO EN SUCURSAL',
            date: new Date().toISOString(),
            user: currentUser?.name || 'Usuario',
            details: `Recibido en ${currentBranch} desde ${sourceBranch}`
        }];

        await updateInventoryPart(item.id, {
            category: JSON.stringify({
                ...parsed,
                status: 'AVAILABLE',
                branch: currentBranch,
                targetBranch: undefined,
                history: newHistory
            })
        });

        toast.success('Mercancía recibida e ingresada al inventario');
    };

    return (
        <div className="flex flex-col gap-6">
            {incomingItems.length > 0 && (
                <div className="bg-amber-50 rounded-3xl shadow-sm border border-amber-200 p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-amber-100 text-amber-600 rounded-xl">
                            <Clock className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-amber-800">Traspasos Entrantes ({incomingItems.length})</h2>
                            <p className="text-sm text-amber-700/80">Confirma la llegada de la mercancía para añadirla a tu inventario.</p>
                        </div>
                    </div>
                    
                    <div className="flex flex-col gap-3">
                        {incomingItems.map(item => {
                            const parsed = parseInventoryCategory(item.category) as any;
                            return (
                                <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-amber-200 flex flex-col sm:flex-row justify-between items-center gap-4">
                                    <div>
                                        <h3 className="font-bold text-slate-800">{item.name}</h3>
                                        <p className="text-sm text-slate-500 font-mono mt-1">IMEI: {parsed.imei || 'N/A'}</p>
                                        <p className="text-xs font-bold text-amber-600 mt-2 uppercase tracking-wide">
                                            Origen: {parsed.branch || 'T4'}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleAcceptTransfer(item.id)}
                                        className="bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 whitespace-nowrap w-full sm:w-auto justify-center"
                                    >
                                        <PackageOpen className="w-4 h-4" /> Recibir
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row gap-8">
                <div className="flex-1">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-purple-100 text-purple-600 rounded-xl">
                            <ArrowRightLeft className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">Enviar a Sucursal</h2>
                            <p className="text-sm text-slate-500">Mueve unidades desde {currentBranch} hacia otras sucursales.</p>
                        </div>
                    </div>

                    <div className="relative mb-6">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar por nombre o IMEI..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-2">
                        {filteredItems.length === 0 && (
                            <p className="text-slate-500 text-center py-8">No tienes unidades disponibles para enviar.</p>
                        )}
                        {filteredItems.map(item => {
                            const parsed = parseInventoryCategory(item.category) as any;
                            const isSelected = selectedItem === item.id;
                            return (
                                <div 
                                    key={item.id}
                                    onClick={() => setSelectedItem(item.id)}
                                    className={`p-4 rounded-xl border cursor-pointer transition-all ${isSelected ? 'border-purple-500 bg-purple-50' : 'border-slate-200 hover:border-purple-300'}`}
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className="font-bold text-slate-800 text-sm">{item.name}</h3>
                                            <p className="font-mono text-xs text-slate-500 mt-1">{parsed.imei || 'Sin IMEI'}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="w-full md:w-80 bg-slate-50 rounded-2xl p-6 border border-slate-200 flex flex-col h-fit">
                    <h3 className="font-bold text-slate-700 mb-4 uppercase tracking-wider text-xs">Destino</h3>
                    
                    <label className="block text-sm font-bold text-slate-700 mb-1">Seleccionar Sucursal</label>
                    <select 
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500 mb-6"
                        value={targetBranch}
                        onChange={e => setTargetBranch(e.target.value)}
                    >
                        <option value="">- Selecciona -</option>
                        <option value="T1">T1</option>
                        <option value="T4">T4</option>
                    </select>

                    <button 
                        onClick={handleTransfer}
                        disabled={!selectedItem || !targetBranch}
                        className="bg-purple-600 text-white font-bold py-3 rounded-xl hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-auto"
                    >
                        <Check className="w-5 h-5"/> Efectuar Traspaso
                    </button>
                </div>
            </div>
        </div>
    );
};

