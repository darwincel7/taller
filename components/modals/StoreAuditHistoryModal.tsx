import React, { useEffect, useState } from 'react';
import { X, Search, FileText, CheckCircle2, AlertTriangle, Clock, LogOut, Edit2, Download } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface StoreAuditHistoryModalProps {
    onClose: () => void;
    onEditAudit: (auditState: Record<string, string>, auditId: string) => void;
}

interface AuditRecord {
    id: string;
    created_at: string;
    auditor_name: string;
    total_items: number;
    found_items: number;
    missing_items: number;
    left_items: number;
    pending_items: number;
    items_state: Record<string, string>;
}

export function StoreAuditHistoryModal({ onClose, onEditAudit }: StoreAuditHistoryModalProps) {
    const { currentUser } = useAuth();
    const [audits, setAudits] = useState<AuditRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadAudits();
    }, []);

    const loadAudits = async () => {
        try {
            const { data, error } = await supabase
                .from('store_audits')
                .select('*')
                .eq('branch_id', currentUser?.branch || 'default_branch')
                .order('created_at', { ascending: false });

            if (error) {
                console.warn("Could not load store audits. Maybe table store_audits does not exist yet.");
                console.error(error);
                setAudits([]);
            } else {
                setAudits(data || []);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in" onClick={onClose}>
            <div className="bg-slate-50 rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-100 text-blue-600 p-2 rounded-lg">
                            <FileText className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">Historial de Auditorías</h2>
                            <p className="text-xs text-slate-500 font-medium">Visualiza y edita las auditorías pasadas</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-full text-slate-400">
                            Cargando historial...
                        </div>
                    ) : audits.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-12 text-slate-400 h-full">
                            <FileText className="w-12 h-12 mb-4 opacity-20" />
                            <p className="text-lg font-bold">No hay auditorías guardadas</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {audits.map(audit => (
                                <div key={audit.id} className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 className="font-bold text-slate-800 text-lg">
                                                Auditoría {new Date(audit.created_at).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })}
                                            </h3>
                                            <p className="text-sm text-slate-500 font-medium">Realizada por: {audit.auditor_name}</p>
                                        </div>
                                        <button 
                                            onClick={() => onEditAudit(audit.items_state || {}, audit.id)}
                                            className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-colors"
                                        >
                                            <Edit2 className="w-4 h-4" /> Editar Auditoría
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-4 text-sm font-bold">
                                        <div className="flex items-center gap-2 text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg">
                                            <span>Total:</span> <span>{audit.total_items}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-100">
                                            <CheckCircle2 className="w-4 h-4" /> <span>{audit.found_items}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-red-600 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100">
                                            <AlertTriangle className="w-4 h-4" /> <span>{audit.missing_items}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">
                                            <LogOut className="w-4 h-4" /> <span>{audit.left_items}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-orange-600 bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-100">
                                            <Clock className="w-4 h-4" /> <span>{audit.pending_items || 0}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
