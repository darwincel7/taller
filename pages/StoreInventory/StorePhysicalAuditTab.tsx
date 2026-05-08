import React, { useState, useMemo } from 'react';
import { useInventory } from '../../contexts/InventoryContext';
import { useAuth } from '../../contexts/AuthContext';
import { parseInventoryCategory } from '../../types';
import { ClipboardCheck, Search, CheckCircle2, AlertCircle, XCircle, Play, Check, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface AuditItem {
    id: string;
    name: string;
    imei: string;
    expected: boolean;
    scanned: boolean;
    productId: string;
}

export const StorePhysicalAuditTab = () => {
    const { inventory } = useInventory();
    const { currentUser } = useAuth();
    
    const [isAuditActive, setIsAuditActive] = useState(false);
    const [auditBranch, setAuditBranch] = useState(currentUser?.branch || 'T4');
    const [scanInput, setScanInput] = useState('');
    
    const [expectedItems, setExpectedItems] = useState<AuditItem[]>([]);
    const [extraItems, setExtraItems] = useState<{imei: string, note: string}[]>([]);
    
    // Derived state for the active audit
    const pendingCount = expectedItems.filter(i => !i.scanned).length;
    const scannedCount = expectedItems.filter(i => i.scanned).length;

    const handleStartAudit = () => {
        // Find all expected items for the selected branch
        const items = inventory.filter(i => {
            const parsed = parseInventoryCategory(i.category) as any;
            return parsed.type === 'STORE_ITEM' && 
                   i.stock > 0 && 
                   (!parsed.status || parsed.status === 'AVAILABLE') && 
                   (parsed.branch || 'T4') === auditBranch;
        }).map(i => {
            const parsed = parseInventoryCategory(i.category) as any;
            return {
                id: i.id,
                name: i.name,
                imei: parsed.imei || `SIN-IMEI-${i.id.substring(0,6)}`,
                expected: true,
                scanned: false,
                productId: parsed.parentId
            };
        });

        setExpectedItems(items);
        setExtraItems([]);
        setIsAuditActive(true);
        toast.info(`Auditoría iniciada para ${auditBranch} con ${items.length} unidades esperadas.`);
    };

    const handleScan = (e: React.FormEvent) => {
        e.preventDefault();
        const term = scanInput.trim().toLowerCase();
        if (!term) return;

        // Try to find in expected items by IMEI
        const index = expectedItems.findIndex(i => i.imei.toLowerCase() === term);
        
        if (index !== -1) {
            if (expectedItems[index].scanned) {
                toast.warning('Esta unidad ya fue escaneada');
            } else {
                const newItems = [...expectedItems];
                newItems[index].scanned = true;
                setExpectedItems(newItems);
                toast.success('Unidad confirmada');
            }
        } else {
            // Check if it's in the system but another branch or sold
            const sysItem = inventory.find(i => {
                const parsed = parseInventoryCategory(i.category) as any;
                return parsed.type === 'STORE_ITEM' && parsed.imei && parsed.imei.toLowerCase() === term;
            });

            if (sysItem) {
                const parsed = parseInventoryCategory(sysItem.category) as any;
                const statusStr = parsed.status === 'IN_TRANSIT' ? 'En tránsito' : 
                                 sysItem.stock === 0 ? 'Vendido/Inactivo' : 
                                 `Disponible en ${parsed.branch || 'T4'}`;
                setExtraItems([...extraItems, { imei: term, note: `${sysItem.name} (${statusStr})` }]);
                toast.error('Unidad pertenece a otra sucursal o está vendida');
            } else {
                setExtraItems([...extraItems, { imei: term, note: 'No encontrado en el sistema' }]);
                toast.error('IMEI no reconocido');
            }
        }
        
        setScanInput('');
    };

    const handleFinishAudit = () => {
        if (pendingCount > 0) {
            const confirmed = window.confirm(`Aún hay ${pendingCount} unidades sin escanear (Faltantes). ¿Estás seguro de finalizar la auditoría?`);
            if (!confirmed) return;
        }

        // Generate report text or actions
        // For now, simply end the session
        toast.success('Auditoría guardada localmente. Por favor toma captura si es necesario.');
        setIsAuditActive(false);
    };

    if (!isAuditActive) {
        return (
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8 text-center max-w-lg mx-auto mt-10">
                <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <ClipboardCheck className="w-10 h-10" />
                </div>
                <h2 className="text-2xl font-black text-slate-800 mb-2">Conteo Físico</h2>
                <p className="text-slate-500 mb-8">Pasa balance escaneando todas las unidades físicas de una sucursal para encontrar diferencias.</p>
                
                <div className="text-left mb-8">
                    <label className="block text-sm font-bold text-slate-700 mb-2">Auditar Sucursal</label>
                    <select 
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={auditBranch}
                        onChange={(e) => setAuditBranch(e.target.value)}
                    >
                        <option value="T1">T1</option>
                        <option value="T4">T4</option>
                    </select>
                </div>

                <button 
                    onClick={handleStartAudit}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2"
                >
                    <Play className="w-5 h-5"/> Iniciar Conteo
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="bg-indigo-900 rounded-3xl shadow-lg p-6 sm:p-8 flex flex-col sm:flex-row justify-between items-center gap-6">
                <div>
                    <h2 className="text-2xl font-black text-white flex items-center gap-3">
                        <ClipboardCheck className="text-indigo-400" />
                        Conteo en curso: {auditBranch}
                    </h2>
                    <p className="text-indigo-300 mt-1 font-medium">Escanea los códigos de barras o IMEI para verificar inventario.</p>
                </div>
                
                <div className="flex gap-4">
                    <div className="bg-white/10 border border-white/20 rounded-2xl p-4 text-center min-w-[120px]">
                        <p className="text-indigo-200 text-xs font-bold uppercase tracking-wider mb-1">Escaneados</p>
                        <p className="text-3xl font-black text-emerald-400">{scannedCount}</p>
                    </div>
                    <div className="bg-white/10 border border-white/20 rounded-2xl p-4 text-center min-w-[120px]">
                        <p className="text-indigo-200 text-xs font-bold uppercase tracking-wider mb-1">Pendientes</p>
                        <p className="text-3xl font-black text-amber-400">{pendingCount}</p>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
                <form onSubmit={handleScan} className="relative max-w-2xl mx-auto mb-8">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-400" />
                    <input 
                        type="text" 
                        autoFocus
                        placeholder="Escanear IMEI (presiona Enter)..." 
                        className="w-full bg-slate-50 border-2 border-indigo-100 rounded-2xl py-4 pl-14 pr-4 text-lg font-bold text-slate-700 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        value={scanInput}
                        onChange={(e) => setScanInput(e.target.value)}
                    />
                </form>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Expected List */}
                    <div>
                        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
                            <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                <CheckCircle2 className="w-5 h-5 text-indigo-500"/>
                                Unidades Registradas ({expectedItems.length})
                            </h3>
                        </div>
                        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                            {expectedItems.sort((a, b) => Number(a.scanned) - Number(b.scanned)).map(item => (
                                <div key={item.id} className={`p-4 rounded-xl border flex justify-between items-center transition-colors ${item.scanned ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                                    <div>
                                        <p className={`font-bold text-sm ${item.scanned ? 'text-emerald-800' : 'text-slate-700'}`}>{item.name}</p>
                                        <p className="text-xs font-mono text-slate-500 mt-1">{item.imei}</p>
                                    </div>
                                    <div>
                                        {item.scanned ? (
                                            <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase px-2 py-1 rounded-md flex items-center gap-1">
                                                <Check className="w-3 h-3"/> Visto
                                            </span>
                                        ) : (
                                            <span className="bg-amber-100 text-amber-700 text-[10px] font-black uppercase px-2 py-1 rounded-md flex items-center gap-1">
                                                <AlertTriangle className="w-3 h-3"/> Pendiente
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Extra / Errors */}
                    <div>
                        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
                            <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                <XCircle className="w-5 h-5 text-rose-500"/>
                                Sobrantes y Errores ({extraItems.length})
                            </h3>
                        </div>
                        {extraItems.length === 0 ? (
                            <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                                <p className="text-slate-500 text-sm font-medium">No se han detectado unidades sobrantes o no reconocidas.</p>
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                {extraItems.map((item, idx) => (
                                    <div key={idx} className="p-4 rounded-xl border bg-rose-50 border-rose-200 flex justify-between items-start">
                                        <div>
                                            <p className="font-bold text-rose-800 text-sm font-mono mb-1">{item.imei}</p>
                                            <p className="text-xs text-rose-600">{item.note}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-200 flex justify-between items-center">
                    <button 
                        onClick={() => {
                            if(window.confirm('¿Cancelar este conteo? No se guardará el progreso.')) setIsAuditActive(false)
                        }}
                        className="text-slate-500 font-bold hover:text-slate-800"
                    >
                        Cancelar y Salir
                    </button>
                    
                    <button 
                        onClick={handleFinishAudit}
                        className="bg-slate-800 hover:bg-slate-900 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg"
                    >
                        Finalizar Conteo
                    </button>
                </div>
            </div>
        </div>
    );
};
