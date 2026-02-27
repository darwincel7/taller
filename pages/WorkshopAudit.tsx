
import React, { useState, useMemo, useEffect } from 'react';
import { useOrders } from '../contexts/OrderContext';
import { useAuth } from '../contexts/AuthContext';
import { OrderStatus, OrderType, RepairOrder, UserRole } from '../types';
import { 
  ClipboardCheck, Search, Filter, MapPin, CheckCircle2, 
  AlertTriangle, XCircle, RefreshCw, Smartphone, User as UserIcon,
  ShieldCheck, Loader2, Info, Eye, History, Save, Trash2, ArrowRight, FileText, ChevronRight, Check, X, Edit2, HelpCircle, PlusCircle, Printer
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { printAuditReport } from '../services/invoiceService';

// LocalStorage Keys
const AUDIT_FOUND_KEY = 'darwin_audit_found_v1';
const AUDIT_MISSING_KEY = 'darwin_audit_missing_v1';
const AUDIT_REVIEW_KEY = 'darwin_audit_review_v1';

// Preview Modal Component
const SimpleOrderPreview = ({ item, onClose, onNavigate }: { item: RepairOrder, onClose: () => void, onNavigate: (id: string) => void }) => (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in zoom-in" onClick={onClose}>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-sm w-full relative shadow-2xl" onClick={e => e.stopPropagation()}>
            <button onClick={onClose} className="absolute top-2 right-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-full hover:bg-slate-200 transition"><X className="w-5 h-5"/></button>
            <div className="h-48 bg-slate-100 dark:bg-slate-800 rounded-xl mb-4 overflow-hidden flex items-center justify-center border border-slate-200 dark:border-slate-700">
                {item.devicePhoto ? (
                    <img src={item.devicePhoto} className="w-full h-full object-cover" />
                ) : (
                    <Smartphone className="w-12 h-12 text-slate-300" />
                )}
            </div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-1">{item.deviceModel}</h3>
            <p className="text-sm text-slate-500 mb-4">{item.customer.name}</p>
            <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                <div className="bg-slate-50 dark:bg-slate-800 p-2 rounded border border-slate-100 dark:border-slate-700">
                    <span className="block text-slate-400 font-bold uppercase">ID</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300">#{item.readable_id || item.id.slice(-4)}</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 p-2 rounded border border-slate-100 dark:border-slate-700">
                    <span className="block text-slate-400 font-bold uppercase">IMEI</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300">{item.imei || '---'}</span>
                </div>
            </div>
            <button 
                onClick={() => onNavigate(item.id)}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition"
            >
                <Eye className="w-4 h-4" /> Ver Orden Completa
            </button>
        </div>
    </div>
);

export const WorkshopAudit: React.FC = () => {
  const { orders, addOrderLog, showNotification } = useOrders();
  const { currentUser, users } = useAuth();
  const navigate = useNavigate();

  // View States
  const [activeTab, setActiveTab] = useState<'CURRENT' | 'HISTORY'>('CURRENT');
  const [historyReports, setHistoryReports] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  
  // Preview State
  const [previewItem, setPreviewItem] = useState<RepairOrder | null>(null);

  // Editing Report State
  const [isEditingReport, setIsEditingReport] = useState(false);
  const [addSearch, setAddSearch] = useState(''); // New search for adding items to report

  // Audit Session State (Persistent)
  const [foundIds, setFoundIds] = useState<Set<string>>(() => {
    const stored = localStorage.getItem(AUDIT_FOUND_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });
  
  const [missingIds, setMissingIds] = useState<Set<string>>(() => {
    const stored = localStorage.getItem(AUDIT_MISSING_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });

  const [reviewIds, setReviewIds] = useState<Set<string>>(() => {
    const stored = localStorage.getItem(AUDIT_REVIEW_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedTech, setSelectedTech] = useState<string>('all');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSavingReport, setIsSavingReport] = useState(false);
  
  // Expanded Sections State
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // Sync state to localStorage
  useEffect(() => { localStorage.setItem(AUDIT_FOUND_KEY, JSON.stringify(Array.from(foundIds))); }, [foundIds]);
  useEffect(() => { localStorage.setItem(AUDIT_MISSING_KEY, JSON.stringify(Array.from(missingIds))); }, [missingIds]);
  useEffect(() => { localStorage.setItem(AUDIT_REVIEW_KEY, JSON.stringify(Array.from(reviewIds))); }, [reviewIds]);

  // Default to user's branch
  useEffect(() => {
    if (currentUser?.branch && selectedBranch === 'all') {
        setSelectedBranch(currentUser.branch);
    }
  }, [currentUser]);

  // Fetch History
  const fetchHistory = async () => {
      if (!supabase) return;
      setLoadingHistory(true);
      try {
          const { data, error } = await supabase
              .from('audit_reports')
              .select('*')
              .order('created_at', { ascending: false });
          if (data) setHistoryReports(data);
      } catch (e) {
          console.error(e);
      } finally {
          setLoadingHistory(false);
      }
  };

  useEffect(() => {
      if (activeTab === 'HISTORY') fetchHistory();
  }, [activeTab]);

  // Filter ONLY items that SHOULD be in the shop physically
  const baseAuditList = useMemo(() => {
    return orders.filter(o => {
        const isActive = o.status !== OrderStatus.RETURNED && o.status !== OrderStatus.CANCELED;
        if (!isActive) return false;
        if (selectedBranch !== 'all' && o.currentBranch !== selectedBranch) return false;
        if (selectedTech !== 'all' && o.assignedTo !== selectedTech) return false;
        return true;
    });
  }, [orders, selectedBranch, selectedTech]);

  const auditList = useMemo(() => {
      if (!searchTerm) return baseAuditList;
      const term = searchTerm.toLowerCase();
      return baseAuditList.filter(o => 
          o.deviceModel.toLowerCase().includes(term) ||
          o.customer.name.toLowerCase().includes(term) ||
          (o.readable_id?.toString() || o.id).includes(term)
      );
  }, [baseAuditList, searchTerm]);

  // Stats
  const totalExpected = baseAuditList.length;
  const totalFound = baseAuditList.filter(o => foundIds.has(o.id)).length;
  const totalMissing = baseAuditList.filter(o => missingIds.has(o.id)).length;
  const totalReview = baseAuditList.filter(o => reviewIds.has(o.id)).length;
  const totalPending = totalExpected - totalFound - totalMissing - totalReview;
  const progressPercent = totalExpected > 0 ? ((totalFound + totalMissing + totalReview) / totalExpected) * 100 : 0;

  const handleMarkFound = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setMissingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      setReviewIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      setFoundIds(prev => new Set(prev).add(id));
  };

  const handleMarkMissing = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setFoundIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      setReviewIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      setMissingIds(prev => new Set(prev).add(id));
  };

  const handleMarkReview = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setFoundIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      setMissingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      setReviewIds(prev => new Set(prev).add(id));
  };

  const toggleSection = (section: string) => {
      setExpandedSections(prev => {
          const next = new Set(prev);
          if (next.has(section)) next.delete(section);
          else next.add(section);
          return next;
      });
  };

  const finalizeAudit = async () => {
      if (!currentUser || !supabase) return;
      if (totalPending > 0) {
          if (!confirm(`Aún quedan ${totalPending} equipos sin verificar. ¿Deseas finalizar la auditoría de todos modos?`)) return;
      }

      const note = prompt("Notas adicionales para el reporte (Opcional):");
      setIsSavingReport(true);

      try {
          // Gather ALL items with their status (Include PENDING items to match Total Expected)
          const allDiscrepancies = baseAuditList.map(o => {
              let status = 'PENDING';
              if (missingIds.has(o.id)) status = 'MISSING';
              else if (reviewIds.has(o.id)) status = 'REVIEW';
              else if (foundIds.has(o.id)) status = 'FOUND';

              return {
                id: o.id,
                readable_id: o.readable_id,
                model: o.deviceModel,
                customer: o.customer.name,
                tech: users.find(u => u.id === o.assignedTo)?.name || 'Sin asignar',
                status: status,
                resolvedBy: foundIds.has(o.id) ? currentUser.name : '',
                resolvedAt: foundIds.has(o.id) ? Date.now() : 0
              };
          });

          // 1. Save Report
          const { error: reportError } = await supabase.from('audit_reports').insert([{
              created_at: Date.now(),
              user_id: currentUser.id,
              user_name: currentUser.name,
              branch: selectedBranch === 'all' ? 'Multisucursal' : selectedBranch,
              total_expected: totalExpected,
              total_found: totalFound,
              total_missing: totalMissing, 
              discrepancies: allDiscrepancies, // Save EVERYTHING (Found, Missing, Review, Pending)
              notes: note || ''
          }]);

          if (reportError) throw reportError;

          // 2. Log discrepancies in each order history (Only Missing and Review)
          const itemsToLog = allDiscrepancies.filter(d => d.status === 'MISSING' || d.status === 'REVIEW');
          for (const item of itemsToLog) {
              const status = item.status === 'MISSING' ? 'DANGER' : 'WARNING';
              const msg = item.status === 'MISSING' 
                  ? `⚠️ DISCREPANCIA: Equipo no localizado en auditoría.` 
                  : `🟠 AUDITORÍA: Equipo marcado para REVISIÓN.`;
              await addOrderLog(item.id, OrderStatus.ON_HOLD, `${msg} Auditado por: ${currentUser.name}`, currentUser.name, status);
          }

          // 3. Clear Session
          setFoundIds(new Set());
          setMissingIds(new Set());
          setReviewIds(new Set());
          localStorage.removeItem(AUDIT_FOUND_KEY);
          localStorage.removeItem(AUDIT_MISSING_KEY);
          localStorage.removeItem(AUDIT_REVIEW_KEY);
          
          showNotification('success', 'Auditoría finalizada y reporte guardado.');
          setActiveTab('HISTORY');
      } catch (e: any) {
          alert("Error al guardar reporte: " + e.message);
      } finally {
          setIsSavingReport(false);
      }
  };

  const resetAudit = () => {
      if (confirm("¿Reiniciar el progreso de la auditoría actual? Se borrarán las marcas locales.")) {
          setFoundIds(new Set());
          setMissingIds(new Set());
          setReviewIds(new Set());
          localStorage.removeItem(AUDIT_FOUND_KEY);
          localStorage.removeItem(AUDIT_MISSING_KEY);
          localStorage.removeItem(AUDIT_REVIEW_KEY);
      }
  };

  // --- REPORT EDITING LOGIC ---
  
  // 1. Add Item to Report (that was missing from the list)
  const handleAddDiscrepancy = async (order: RepairOrder) => {
      if (!selectedReport || !supabase) return;
      
      const exists = selectedReport.discrepancies.some((d: any) => d.id === order.id);
      if (exists) { alert("Este equipo ya está en la lista del reporte."); return; }

      const newItem = {
          id: order.id,
          readable_id: order.readable_id,
          model: order.deviceModel,
          customer: order.customer.name,
          tech: users.find(u => u.id === order.assignedTo)?.name || 'Sin asignar',
          status: 'MISSING',
          resolvedBy: '',
          resolvedAt: 0
      };

      const newDiscrepancies = [...selectedReport.discrepancies, newItem];
      const newTotalMissing = newDiscrepancies.filter((d: any) => d.status === 'MISSING').length;
      
      // Update local state immediately
      setSelectedReport({ 
          ...selectedReport, 
          discrepancies: newDiscrepancies,
          total_missing: newTotalMissing,
          total_found: Math.max(0, selectedReport.total_found - 1) // Assume it was counted as found erroneously before
      });
      setAddSearch('');

      // Save to DB
      await supabase.from('audit_reports')
        .update({ 
            discrepancies: newDiscrepancies,
            total_missing: newTotalMissing,
            total_found: Math.max(0, selectedReport.total_found - 1)
        })
        .eq('id', selectedReport.id);
        
      showNotification('success', 'Equipo agregado al reporte');
  };

  // 2. Change Status of Discrepancy (MISSING <-> PENDING <-> FOUND)
  const handleUpdateStatus = async (index: number, newStatus: 'MISSING' | 'FOUND' | 'PENDING') => {
      if (!selectedReport || !supabase) return;
      
      const newDiscrepancies = [...selectedReport.discrepancies];
      const item = newDiscrepancies[index];
      
      newDiscrepancies[index] = {
          ...item,
          status: newStatus,
          resolved: newStatus === 'FOUND', // Legacy support
          resolvedBy: newStatus === 'FOUND' ? currentUser?.name : '',
          resolvedAt: newStatus === 'FOUND' ? Date.now() : 0
      };

      // Recalculate Totals
      const missingCount = newDiscrepancies.filter((d: any) => d.status === 'MISSING').length;
      const foundCount = selectedReport.total_expected - missingCount - newDiscrepancies.filter((d: any) => d.status === 'PENDING').length;

      const updatedReport = {
          ...selectedReport,
          discrepancies: newDiscrepancies,
          total_missing: missingCount,
          total_found: foundCount
      };

      setSelectedReport(updatedReport);

      await supabase.from('audit_reports')
        .update({ 
            discrepancies: newDiscrepancies,
            total_missing: missingCount,
            total_found: foundCount
        })
        .eq('id', selectedReport.id);
        
      if (newStatus === 'FOUND') {
          await addOrderLog(item.id, OrderStatus.IN_REPAIR, `✅ CORRECCIÓN AUDITORÍA: Equipo localizado post-auditoría por ${currentUser?.name}.`, currentUser?.name, 'SUCCESS');
      } else if (newStatus === 'PENDING') {
          await addOrderLog(item.id, OrderStatus.ON_HOLD, `🟠 AUDITORÍA: Equipo marcado como 'Pendiente de Revisión' por ${currentUser?.name}.`, currentUser?.name, 'WARNING');
      }
  };

  // Filter for adding new items
  const addableOrders = useMemo(() => {
      if (!addSearch || !selectedReport) return [];
      const term = addSearch.toLowerCase();
      // Only show orders NOT already in the discrepancy list
      return orders.filter(o => 
          (o.deviceModel.toLowerCase().includes(term) || o.readable_id?.toString().includes(term)) &&
          !selectedReport.discrepancies.some((d: any) => d.id === o.id)
      ).slice(0, 5);
  }, [addSearch, orders, selectedReport]);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto pb-24 relative">
        
        {/* Simple Preview Modal */}
        {previewItem && <SimpleOrderPreview item={previewItem} onClose={() => setPreviewItem(null)} onNavigate={(id) => navigate('/orders/' + id)} />}

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div className="flex items-center gap-3">
                <div className="bg-blue-600 text-white p-3 rounded-2xl shadow-lg shadow-blue-200">
                    <ClipboardCheck className="w-8 h-8" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Auditoría de Existencia</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Control de inventario físico y balance de equipos.</p>
                </div>
            </div>
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                <button onClick={() => setActiveTab('CURRENT')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'CURRENT' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Auditoría en Curso</button>
                <button onClick={() => setActiveTab('HISTORY')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'HISTORY' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Historial Reportes</button>
            </div>
        </div>

        {activeTab === 'CURRENT' ? (
            <div className="space-y-6 animate-in fade-in">
                {/* Audit Stats Dashboard */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Esperado</p>
                        <p className="text-2xl font-black text-slate-800 dark:text-white">{totalExpected}</p>
                    </div>
                    <div className="bg-green-50 dark:bg-green-900/10 p-4 rounded-2xl shadow-sm border border-green-100 dark:border-green-900">
                        <p className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase tracking-widest mb-1">Confirmados</p>
                        <p className="text-2xl font-black text-green-700 dark:text-green-300">{totalFound}</p>
                    </div>
                    <div className="bg-red-50 dark:bg-red-900/10 p-4 rounded-2xl shadow-sm border border-red-100 dark:border-red-900">
                        <p className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-widest mb-1">Faltantes</p>
                        <p className="text-2xl font-black text-red-700 dark:text-red-300">{totalMissing}</p>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-2xl shadow-sm border border-blue-100 dark:border-blue-900">
                        <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-1">Pendientes</p>
                        <p className="text-2xl font-black text-blue-700 dark:text-blue-300">{totalPending}</p>
                    </div>
                </div>

                {/* Progress & Persistence Info */}
                <div className="space-y-2">
                    <div className="flex justify-between items-end px-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><Save className="w-3 h-3 text-green-500" /> Progreso Autoguardado</span>
                        <span className="text-xs font-black text-slate-600">{Math.round(progressPercent)}%</span>
                    </div>
                    <div className="bg-slate-200 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden shadow-inner border border-slate-300 dark:border-slate-700">
                        <div className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-green-500 transition-all duration-1000 ease-out" style={{ width: `${progressPercent}%` }} />
                    </div>
                </div>

                {/* Controls */}
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <input 
                            placeholder="Escanear o buscar..." 
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none transition dark:text-white"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-2">
                        <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)} className="bg-slate-50 dark:bg-slate-800 border rounded-xl px-3 py-2 text-xs font-bold outline-none">
                            <option value="all">Todas Sucursales</option>
                            <option value="T4">T4 (Principal)</option>
                            <option value="T1">T1 (Secundaria)</option>
                        </select>
                        <button onClick={resetAudit} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition" title="Limpiar sesión"><Trash2 className="w-5 h-5"/></button>
                    </div>
                </div>

                {/* Main List */}
                <div className="space-y-2">
                    {auditList.map(order => {
                        const isFound = foundIds.has(order.id);
                        const isMissing = missingIds.has(order.id);
                        return (
                            <div 
                                key={order.id} 
                                onClick={() => setPreviewItem(order)}
                                className={`bg-white dark:bg-slate-900 p-3 rounded-2xl border transition-all flex flex-col md:flex-row items-center justify-between gap-4 cursor-pointer hover:shadow-md ${isFound ? 'border-green-200 bg-green-50/20' : isMissing ? 'border-red-200 bg-red-50/20' : 'border-slate-200 dark:border-slate-800'}`}
                            >
                                <div className="flex items-center gap-4 w-full md:w-auto pointer-events-none">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${isFound ? 'bg-green-100 text-green-600 border-green-200' : isMissing ? 'bg-red-100 text-red-600 border-red-200' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700'}`}>
                                        {isFound ? <CheckCircle2 className="w-5 h-5" /> : isMissing ? <XCircle className="w-5 h-5" /> : <Smartphone className="w-5 h-5" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-0.5"><span className="font-black text-[10px] text-slate-400">#{order.readable_id || order.id.slice(-4)}</span><span className="text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded border dark:border-slate-700 uppercase">{order.currentBranch}</span></div>
                                        <h4 className="font-bold text-slate-800 dark:text-white truncate text-sm">{order.deviceModel}</h4>
                                        <p className="text-[10px] text-slate-500 truncate">{order.customer.name}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 w-full md:w-auto shrink-0" onClick={e => e.stopPropagation()}>
                                    {!isFound && !isMissing && !reviewIds.has(order.id) ? (
                                        <>
                                            <button onClick={(e) => handleMarkMissing(e, order.id)} className="flex-1 md:flex-none px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-xs font-bold border border-red-100 transition">Faltante</button>
                                            <button onClick={(e) => handleMarkReview(e, order.id)} className="flex-1 md:flex-none px-3 py-2 bg-orange-50 text-orange-600 hover:bg-orange-100 rounded-xl text-xs font-bold border border-orange-100 transition">Revisar</button>
                                            <button onClick={(e) => handleMarkFound(e, order.id)} className="flex-[2] md:flex-none px-6 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-xl text-xs font-bold shadow-md transition">Localizado</button>
                                        </>
                                    ) : (
                                        <button onClick={(e) => { e.stopPropagation(); setFoundIds(prev => { const n = new Set(prev); n.delete(order.id); return n; }); setMissingIds(prev => { const n = new Set(prev); n.delete(order.id); return n; }); setReviewIds(prev => { const n = new Set(prev); n.delete(order.id); return n; }); }} className="text-[10px] font-bold text-slate-400 hover:text-blue-600 uppercase">Deshacer</button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Finalize Action */}
                <div className="pt-6 border-t border-slate-200 sticky bottom-4 z-20">
                    <button 
                        onClick={finalizeAudit} 
                        disabled={isSavingReport || totalExpected === 0} 
                        className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold shadow-xl hover:bg-black hover:scale-[1.01] transition disabled:opacity-50 flex items-center justify-center gap-3"
                    >
                        {isSavingReport ? <Loader2 className="animate-spin w-6 h-6"/> : <ShieldCheck className="w-6 h-6 text-green-400"/>}
                        CONCLUIR Y GUARDAR AUDITORÍA
                    </button>
                </div>
            </div>
        ) : (
            <div className="space-y-4 animate-in fade-in">
                {/* History Reports List */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {loadingHistory ? (
                        <div className="col-span-full py-20 text-center"><Loader2 className="animate-spin w-10 h-10 text-slate-300 mx-auto" /></div>
                    ) : historyReports.length === 0 ? (
                        <div className="col-span-full py-20 text-center text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">No hay reportes de auditoría generados.</div>
                    ) : (
                        historyReports.map(report => (
                            <div key={report.id} onClick={() => { setSelectedReport(report); setIsEditingReport(false); }} className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 cursor-pointer hover:shadow-md transition group relative overflow-hidden">
                                <div className={`absolute left-0 top-0 bottom-0 w-1 ${report.total_missing === 0 ? 'bg-green-500' : 'bg-red-500'}`} />
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{new Date(report.created_at).toLocaleDateString()}</p>
                                        <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-1"><MapPin className="w-3 h-3"/> {report.branch}</h3>
                                    </div>
                                    <div className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${report.total_missing === 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {report.total_missing === 0 ? 'Perfecto' : `${report.total_missing} Discrep.`}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                                    <div className="bg-slate-50 dark:bg-slate-800 p-2 rounded-lg"><span className="text-slate-400 block mb-0.5">Esperado</span><span className="font-bold">{report.total_expected}</span></div>
                                    <div className="bg-slate-50 dark:bg-slate-800 p-2 rounded-lg"><span className="text-slate-400 block mb-0.5">Localizado</span><span className="font-bold">{report.total_found}</span></div>
                                </div>
                                <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 border-t border-slate-100 pt-3">
                                    <span className="flex items-center gap-1 uppercase"><UserIcon className="w-3 h-3"/> {report.user_name}</span>
                                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500" />
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        )}

        {/* Report Detail Modal */}
        {selectedReport && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in zoom-in" onClick={() => setSelectedReport(null)}>
                <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                    <div className={`p-6 text-white shrink-0 ${selectedReport.total_missing === 0 ? 'bg-green-600' : 'bg-red-600'}`}>
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h2 className="text-2xl font-black">Conclusión de Auditoría</h2>
                                <p className="text-white/80 text-sm">{new Date(selectedReport.created_at).toLocaleString()} • {selectedReport.branch}</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => printAuditReport(selectedReport)} className="p-2 bg-white/20 rounded-full hover:bg-white/40" title="Imprimir Reporte"><Printer className="w-5 h-5"/></button>
                                {currentUser?.role === UserRole.ADMIN && !isEditingReport && (
                                    <button onClick={() => setIsEditingReport(true)} className="p-2 bg-white/20 rounded-full hover:bg-white/40"><Edit2 className="w-5 h-5"/></button>
                                )}
                                <button onClick={() => setSelectedReport(null)} className="p-2 bg-white/20 rounded-full hover:bg-white/40"><X className="w-6 h-6"/></button>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 mb-6">
                            <button 
                                onClick={() => toggleSection('ALL')}
                                className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col items-center justify-center gap-2 group ${expandedSections.has('ALL') ? 'bg-blue-600 border-blue-500 ring-4 ring-blue-500/20 shadow-xl scale-[1.02]' : 'bg-white/10 border-white/10 hover:bg-white/20 hover:scale-105'}`}
                            >
                                <div className={`p-2 rounded-full ${expandedSections.has('ALL') ? 'bg-white/20' : 'bg-white/10'}`}>
                                    <ClipboardCheck className="w-5 h-5 text-white" />
                                </div>
                                <div className="text-center">
                                    <p className="text-[10px] font-bold uppercase opacity-70 tracking-widest text-white">Esperado</p>
                                    <p className="text-3xl font-black text-white">{selectedReport.total_expected}</p>
                                </div>
                                {expandedSections.has('ALL') && <div className="w-1.5 h-1.5 rounded-full bg-white mt-1 animate-bounce"/>}
                            </button>

                            <button 
                                onClick={() => toggleSection('FOUND')}
                                className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col items-center justify-center gap-2 group ${expandedSections.has('FOUND') ? 'bg-green-500 border-green-400 ring-4 ring-green-500/20 shadow-xl scale-[1.02]' : 'bg-white/10 border-white/10 hover:bg-white/20 hover:scale-105'}`}
                            >
                                <div className={`p-2 rounded-full ${expandedSections.has('FOUND') ? 'bg-white/20' : 'bg-white/10'}`}>
                                    <CheckCircle2 className="w-5 h-5 text-white" />
                                </div>
                                <div className="text-center">
                                    <p className="text-[10px] font-bold uppercase opacity-70 tracking-widest text-white">Encontrado</p>
                                    <p className="text-3xl font-black text-white">{selectedReport.total_found}</p>
                                </div>
                                {expandedSections.has('FOUND') && <div className="w-1.5 h-1.5 rounded-full bg-white mt-1 animate-bounce"/>}
                            </button>

                            <button 
                                onClick={() => toggleSection('MISSING')}
                                className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col items-center justify-center gap-2 group ${expandedSections.has('MISSING') ? 'bg-red-500 border-red-400 ring-4 ring-red-500/20 shadow-xl scale-[1.02]' : 'bg-white/10 border-white/10 hover:bg-white/20 hover:scale-105'}`}
                            >
                                <div className={`p-2 rounded-full ${expandedSections.has('MISSING') ? 'bg-white/20' : 'bg-white/10'}`}>
                                    <AlertTriangle className="w-5 h-5 text-white" />
                                </div>
                                <div className="text-center">
                                    <p className="text-[10px] font-bold uppercase opacity-70 tracking-widest text-white">Faltante</p>
                                    <p className="text-3xl font-black text-white">{selectedReport.total_missing}</p>
                                </div>
                                {expandedSections.has('MISSING') && <div className="w-1.5 h-1.5 rounded-full bg-white mt-1 animate-bounce"/>}
                            </button>
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50 dark:bg-slate-900/50">
                        {isEditingReport && (
                            <div className="space-y-4 animate-in slide-in-from-top-4">
                                <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl text-blue-700 text-xs font-bold flex items-center gap-3 shadow-sm">
                                    <div className="p-2 bg-blue-100 rounded-lg"><Info className="w-4 h-4"/></div>
                                    <div>
                                        <p className="uppercase">Modo Edición Activo</p>
                                        <p className="font-normal opacity-80">Puedes agregar equipos olvidados o cambiar el estado de los existentes.</p>
                                    </div>
                                </div>
                                {/* ADD NEW DISCREPANCY SEARCH */}
                                <div className="relative group">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 group-focus-within:text-blue-500 transition" />
                                    <input 
                                        className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition shadow-sm" 
                                        placeholder="Buscar equipo para agregar al reporte..." 
                                        value={addSearch} 
                                        onChange={e => setAddSearch(e.target.value)}
                                    />
                                    {addSearch && (
                                        <div className="absolute top-full left-0 w-full bg-white border border-slate-200 shadow-2xl rounded-xl mt-2 z-20 overflow-hidden max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                                            {addableOrders.map(o => (
                                                <div key={o.id} onClick={() => handleAddDiscrepancy(o)} className="p-3 hover:bg-blue-50 cursor-pointer text-sm flex justify-between items-center border-b last:border-0 border-slate-100 transition">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500"><Smartphone className="w-4 h-4"/></div>
                                                        <div>
                                                            <p className="font-bold text-slate-800">{o.deviceModel}</p>
                                                            <p className="text-xs text-slate-500">#{o.readable_id || o.id.slice(-4)}</p>
                                                        </div>
                                                    </div>
                                                    <PlusCircle className="w-5 h-5 text-blue-600"/>
                                                </div>
                                            ))}
                                            {addableOrders.length === 0 && <div className="p-8 text-slate-400 text-xs text-center flex flex-col items-center gap-2"><Search className="w-8 h-8 opacity-20"/>No encontrado</div>}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {selectedReport.notes && (
                            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1 h-full bg-slate-300 dark:bg-slate-600"/>
                                <h4 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2"><FileText className="w-3 h-3"/> Notas del Auditor</h4>
                                <p className="text-sm text-slate-700 dark:text-slate-300 italic leading-relaxed">"{selectedReport.notes}"</p>
                            </div>
                        )}

                        <div>
                            {/* Render Lists based on Expanded Sections */}
                            <div className="space-y-6">
                                {['ALL', 'MISSING', 'FOUND'].map(section => {
                                    if (!expandedSections.has(section)) return null;
                                    
                                    let items = [];
                                    let title = "";
                                    let colorClass = "";
                                    let icon = null;

                                    if (section === 'ALL') {
                                        items = selectedReport.discrepancies || []; // Show ALL (including PENDING)
                                        title = "Listado Completo (Esperado)";
                                        colorClass = "text-blue-600 bg-blue-50 border-blue-100";
                                        icon = <ClipboardCheck className="w-4 h-4"/>;
                                    } else if (section === 'MISSING') {
                                        items = (selectedReport.discrepancies || []).filter((d: any) => d.status === 'MISSING' || (!d.status && !d.resolved));
                                        title = "Equipos Faltantes";
                                        colorClass = "text-red-600 bg-red-50 border-red-100";
                                        icon = <AlertTriangle className="w-4 h-4"/>;
                                    } else if (section === 'FOUND') {
                                        items = (selectedReport.discrepancies || []).filter((d: any) => d.status === 'FOUND' || d.resolved);
                                        title = "Equipos Encontrados";
                                        colorClass = "text-green-600 bg-green-50 border-green-100";
                                        icon = <CheckCircle2 className="w-4 h-4"/>;
                                    }

                                    return (
                                        <div key={section} className="animate-in slide-in-from-top-4 duration-300">
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className={`p-2 rounded-xl ${colorClass.split(' ')[1]}`}>
                                                    {icon}
                                                </div>
                                                <h5 className="text-lg font-bold text-slate-800 dark:text-white">{title}</h5>
                                                <span className="text-xs font-bold px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-500">{items.length} equipos</span>
                                            </div>
                                            
                                            {items.length === 0 ? (
                                                <div className="text-center py-12 text-slate-400 text-sm bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center gap-3">
                                                    <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-full"><Search className="w-6 h-6 opacity-30"/></div>
                                                    <p>No hay equipos en esta categoría.</p>
                                                    {section === 'ALL' && selectedReport.total_expected > 0 && (
                                                        <p className="text-xs text-orange-500">Nota: El detalle no está disponible para este reporte antiguo.</p>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 gap-3">
                                                    {items.map((item: any) => {
                                                        // Determine status for the badge if showing ALL
                                                        let statusBadge = null;
                                                        if (section === 'ALL') {
                                                            if (item.status === 'MISSING') statusBadge = <span className="px-2 py-1 rounded-md bg-red-100 text-red-700 text-[10px] font-bold uppercase border border-red-200">Faltante</span>;
                                                            else if (item.status === 'FOUND' || item.resolved) statusBadge = <span className="px-2 py-1 rounded-md bg-green-100 text-green-700 text-[10px] font-bold uppercase border border-green-200">Encontrado</span>;
                                                            else if (item.status === 'REVIEW') statusBadge = <span className="px-2 py-1 rounded-md bg-orange-100 text-orange-700 text-[10px] font-bold uppercase border border-orange-200">Revisión</span>;
                                                            else if (item.status === 'PENDING') statusBadge = <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-500 text-[10px] font-bold uppercase border border-slate-200">No Verificado</span>;
                                                        }

                                                        return (
                                                            <div 
                                                                key={item.id} 
                                                                onClick={() => setPreviewItem({ ...item, deviceModel: item.model, customer: { name: item.customer } } as any)}
                                                                className="group p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-700 cursor-pointer transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                                                            >
                                                                <div className="flex items-center gap-4">
                                                                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition">
                                                                        <Smartphone className="w-5 h-5"/>
                                                                    </div>
                                                                    <div>
                                                                        <div className="flex items-center gap-2 mb-1">
                                                                            <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded">#{item.readable_id || item.id.slice(-4)}</span>
                                                                            {statusBadge}
                                                                        </div>
                                                                        <div className="font-bold text-slate-800 dark:text-white group-hover:text-blue-600 transition">{item.model}</div>
                                                                        <div className="text-xs text-slate-500 flex items-center gap-1"><UserIcon className="w-3 h-3"/> {item.customer}</div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-3 pl-14 sm:pl-0">
                                                                    {item.resolvedBy && (
                                                                        <div className="text-right hidden sm:block">
                                                                            <p className="text-[10px] text-slate-400 uppercase font-bold">Auditado por</p>
                                                                            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{item.resolvedBy}</p>
                                                                        </div>
                                                                    )}
                                                                    <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition">
                                                                        <ChevronRight className="w-4 h-4"/>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                {expandedSections.size === 0 && (
                                    <div className="flex flex-col items-center justify-center py-20 text-center opacity-50">
                                        <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                                            <Filter className="w-8 h-8 text-slate-400"/>
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">Selecciona una categoría</h3>
                                        <p className="text-sm text-slate-500 max-w-xs mx-auto">Haz clic en las tarjetas de arriba (Esperado, Encontrado, Faltante) para ver el detalle de los equipos.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    <div className="p-6 bg-slate-50 dark:bg-slate-800 border-t flex justify-between items-center sticky bottom-0 z-10">
                        <span className="text-xs font-bold text-slate-500 uppercase">Auditado por: <span className="text-slate-800 dark:text-white">{selectedReport.user_name}</span></span>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => {
                                    const visibleStatuses = new Set<string>();
                                    if (expandedSections.has('MISSING')) visibleStatuses.add('MISSING');
                                    if (expandedSections.has('REVIEW')) visibleStatuses.add('REVIEW');
                                    if (expandedSections.has('FOUND')) visibleStatuses.add('FOUND');
                                    
                                    // Default to printing everything if nothing selected
                                    const printAll = visibleStatuses.size === 0;

                                    const filteredDiscrepancies = selectedReport.discrepancies.filter((d: any) => {
                                        let status = d.status;
                                        if (!status && !d.resolved) status = 'MISSING';
                                        if (!status && d.resolved) status = 'FOUND';
                                        if (status === 'PENDING') status = 'REVIEW';
                                        
                                        return printAll || visibleStatuses.has(status);
                                    });
                                    
                                    printAuditReport({
                                        ...selectedReport,
                                        discrepancies: filteredDiscrepancies
                                    });
                                }}
                                className="px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl font-bold text-sm flex items-center gap-2"
                            >
                                <Printer className="w-4 h-4"/> Imprimir {expandedSections.size > 0 ? 'Selección' : 'Todo'}
                            </button>
                            <button onClick={() => setSelectedReport(null)} className="px-6 py-2 bg-slate-900 text-white rounded-xl font-bold text-sm">Cerrar</button>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};