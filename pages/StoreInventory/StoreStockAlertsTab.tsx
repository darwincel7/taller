import React, { useMemo } from 'react';
import { useInventory } from '../../contexts/InventoryContext';
import { parseInventoryCategory } from '../../types';
import { AlertTriangle, Package, BellRing } from 'lucide-react';

export const StoreStockAlertsTab = () => {
    const { inventory } = useInventory();
    
    const alerts = useMemo(() => {
        // Collect all products
        const products = inventory.filter(item => {
            const parsed = parseInventoryCategory(item.category);
            return parsed.type === 'STORE_PRODUCT';
        });

        const lowStockProducts = products.map(product => {
            const items = inventory.filter(i => {
                const parsed = parseInventoryCategory(i.category);
                return parsed.type === 'STORE_ITEM' && parsed.parentId === product.id && i.stock > 0;
            });
            const stock = items.length;
            return { ...product, stock };
        }).filter(p => p.stock <= p.min_stock);

        return lowStockProducts;
    }, [inventory]);

    return (
        <div className="bg-white rounded-3xl shadow-lg border border-slate-200 p-5 w-full">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
                <div className="p-2.5 bg-rose-100 text-rose-600 rounded-xl w-fit">
                    <BellRing className="w-5 h-5" />
                </div>
                <div>
                    <h2 className="text-lg font-black text-slate-800 leading-tight">Stock Crítico ({alerts.length})</h2>
                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">Bajo mínimo requerido</p>
                </div>
            </div>

            {alerts.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                    <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No hay alertas de stock bajo en este momento.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {alerts.map(p => (
                        <div key={p.id} className="py-2.5 px-3 border border-rose-200 bg-rose-50 rounded-xl flex items-center justify-between gap-3 relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-rose-500" />
                            <div className="flex-1 ml-2 min-w-0">
                                <h3 className="font-bold text-slate-800 text-xs mb-1 truncate leading-tight" title={p.name}>{p.name}</h3>
                                <div className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-wider">
                                    <span className="text-rose-600 flex items-center gap-1">Stock Actual: <span className="text-sm leading-none">{p.stock}</span></span>
                                    <span className="text-slate-500 flex items-center gap-1">Mínimo: <span className="text-sm leading-none">{p.min_stock}</span></span>
                                </div>
                            </div>
                            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 opacity-70" />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
