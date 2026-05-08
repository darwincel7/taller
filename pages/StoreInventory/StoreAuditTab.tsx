import React, { useMemo } from 'react';
import { useInventory } from '../../contexts/InventoryContext';
import { parseInventoryCategory } from '../../types';
import { ClipboardList, History } from 'lucide-react';

export const StoreAuditTab = () => {
    const { inventory } = useInventory();
    
    const logs = useMemo(() => {
        let allLogs: any[] = [];
        
        inventory.forEach(item => {
            const parsed = parseInventoryCategory(item.category) as any;
            if (parsed.history && Array.isArray(parsed.history)) {
                parsed.history.forEach((h: any) => {
                    allLogs.push({
                        ...h,
                        itemName: item.name,
                        itemId: item.id
                    });
                });
            }
        });

        // Sort descending
        return allLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [inventory]);

    return (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-amber-100 text-amber-600 rounded-xl">
                    <ClipboardList className="w-6 h-6" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-slate-800">Auditoría / Reportes</h2>
                    <p className="text-sm text-slate-500">Registro inmutable de movimientos y cambios de estado.</p>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-slate-200">
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 text-left uppercase tracking-wider">Fecha / Hora</th>
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 text-left uppercase tracking-wider">Usuario</th>
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 text-left uppercase tracking-wider">Acción</th>
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 text-left uppercase tracking-wider">Artículo</th>
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 text-left uppercase tracking-wider">Detalles</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {logs.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="py-8 text-center text-slate-400">
                                    <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                    No hay registros históricos todavía.
                                </td>
                            </tr>
                        ) : (
                            logs.slice(0, 100).map((log, idx) => (
                                <tr key={idx} className="hover:bg-slate-50">
                                    <td className="py-3 px-4 text-[11px] font-mono whitespace-nowrap text-slate-600">{new Date(log.date).toLocaleString()}</td>
                                    <td className="py-3 px-4 text-sm font-medium text-slate-800">{log.user}</td>
                                    <td className="py-3 px-4">
                                        <span className="inline-block bg-slate-200 text-slate-700 text-[10px] font-bold uppercase px-2 py-1 rounded-md">
                                            {log.action}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-sm font-bold text-indigo-600">{log.itemName}</td>
                                    <td className="py-3 px-4 text-xs text-slate-600 max-w-xs truncate" title={log.details}>{log.details}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
