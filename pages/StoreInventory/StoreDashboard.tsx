import React, { useMemo } from 'react';
import { useInventory } from '../../contexts/InventoryContext';
import { parseInventoryCategory } from '../../types';
import { ShoppingBag, DollarSign, Package, Layers, Truck, BadgePercent, LayoutGrid, Store, AlertTriangle, History } from 'lucide-react';

export const StoreDashboard = () => {
    const { inventory } = useInventory();
    
    const stats = useMemo(() => {
        let stockInvertido = 0;
        let comprasMes = 0;
        let ventasEsperadas = 0;
        let marcas = new Set();
        let categorias = new Set();
        let proveedores = new Set();
        let unidadesDisponibles = 0;
        let unidadesPendientes = 0;
        let unidadesEstancadas = 0;
        let productosTotales = 0;
        const now = new Date().getTime();

        inventory.forEach(item => {
            const parsed = parseInventoryCategory(item.category) as any;
            switch (parsed.type) {
                case 'STORE_ITEM':
                    if (item.stock > 0) {
                        if (parsed.status === 'PENDING_ACCEPTANCE') {
                            unidadesPendientes++;
                        } else if (parsed.status === 'AVAILABLE' || !parsed.status) {
                            unidadesDisponibles++;
                            stockInvertido += typeof item.cost === 'number' && !isNaN(item.cost) ? item.cost : 0;
                            ventasEsperadas += typeof item.price === 'number' && !isNaN(item.price) ? item.price : 0;
                            
                            // Check for stale stock (over 15 days in window)
                            const acceptanceLog = (parsed.history || []).find((h: any) => h.action === 'ACEPTACIÓN DESDE TALLER');
                            if (acceptanceLog) {
                                const days = (now - new Date(acceptanceLog.date).getTime()) / (1000 * 60 * 60 * 24);
                                if (days > 15) unidadesEstancadas++;
                            }
                        }
                    }
                    break;
                case 'STORE_PURCHASE':
                    comprasMes += item.price; // Or cost if you use cost for purchase total. Usually price = total cost.
                    break;
                case 'STORE_ATTRIBUTE':
                    if (parsed.subType === 'BRAND') marcas.add(item.id);
                    if (parsed.subType === 'CATEGORY') categorias.add(item.id);
                    if (parsed.subType === 'PROVIDER') proveedores.add(item.id);
                    break;
                case 'STORE_PRODUCT':
                    productosTotales++;
                    break;
            }
        });
        
        return {
            stockInvertido,
            comprasMes,
            ventasEsperadas,
            marcas: marcas.size,
            categorias: categorias.size,
            proveedores: proveedores.size,
            unidadesDisponibles,
            unidadesPendientes,
            unidadesEstancadas,
            productosTotales
        };
    }, [inventory]);

    const widgets = [
        { title: 'INVERTIDO EN STOCK', value: `$${stats.stockInvertido.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: DollarSign, color: 'bg-emerald-500' },
        { title: 'VALOR DE VENTA C/U', value: `$${stats.ventasEsperadas.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: ShoppingBag, color: 'bg-indigo-500' },
        { title: 'PENDIENTES TALLER', value: stats.unidadesPendientes, icon: AlertTriangle, color: 'bg-amber-500' },
        { title: 'STOCK +15 DÍAS', value: stats.unidadesEstancadas, icon: History, color: 'bg-rose-500' },
        { title: 'UNIDADES DISP.', value: stats.unidadesDisponibles, icon: Package, color: 'bg-sky-500' },
        { title: 'PRODUCTOS REGS.', value: stats.productosTotales, icon: Store, color: 'bg-slate-700' },
        { title: 'MARCAS', value: stats.marcas, icon: LayoutGrid, color: 'bg-purple-500' },
        { title: 'PROVEEDORES', value: stats.proveedores, icon: Truck, color: 'bg-teal-500' },
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {widgets.map((w, idx) => (
                <div key={idx} className={`${w.color} text-white p-5 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between hover:scale-[1.02] transition-transform cursor-pointer`}>
                    <div className="absolute -right-4 -top-4 opacity-20 pointer-events-none">
                        <w.icon className="w-24 h-24" />
                    </div>
                    <div className="flex justify-between items-start z-10">
                        <p className="text-xl lg:text-3xl font-black mb-1 shadow-sm tracking-tight">{w.value}</p>
                        <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm shadow-inner shrink-0">
                             <w.icon className="w-5 h-5 text-white shadow-sm" />
                        </div>
                    </div>
                    <div className="z-10 mt-3 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-white rounded-full opacity-50 shadow-sm" />
                        <h3 className="text-[10px] sm:text-xs font-bold uppercase tracking-wider opacity-90">{w.title}</h3>
                    </div>
                </div>
            ))}
        </div>
    );
};
