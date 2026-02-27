
import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { AuditLog } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useOrders } from '../contexts/OrderContext';
import { Clock, User, FileText, Activity, Search, Filter, Calendar, XCircle, SlidersHorizontal, ArrowDownCircle, ChevronRight, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// --- INTELLIGENT DEVICE NORMALIZER (REUSED FOR CONSISTENCY) ---
const normalizeDeviceName = (rawName: string): string => {
    if (!rawName) return '';
    let s = rawName.toLowerCase().trim();
    
    // Remove 'iphone' prefix
    s = s.replace(/\biphone\b/g, '').trim(); 
    
    // 13pm -> 13 pro max
    s = s.replace(/(\d+)\s*(pm|promax|pro max|p max)\b/g, '$1 pro max');
    
    // 14plus, 14+, 14plu -> 14 plus (NEW)
    s = s.replace(/(\d+)\s*(plus|plu|\+)\b/g, '$1 plus');
    
    // 13p -> 13 pro
    s = s.replace(/(\d+)\s*p(?!lus|lu|lay|ro)\b/g, '$1 pro');
    
    // 11n -> 11
    s = s.replace(/(\d+)\s*(n|normal)\b/g, '$1'); 
    
    return s.replace(/\s+/g, ' ').trim();
};

export const ActivityLog: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentUser, users } = useAuth();
  const { orders } = useOrders(); 
  const navigate = useNavigate();

  // Advanced Filters State
  const [search, setSearch] = useState('');
  const [filterUser, setFilterUser] = useState('all');
  const [filterAction, setFilterAction] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false });

      // --- ADVANCED SEARCH (100% HISTORY) ---
      
      if (search.trim()) {
          const term = search.trim();
          const normalizedTerm = normalizeDeviceName(term);
          
          // Step 1: Find related Order IDs from the FULL orders table (server-side)
          // ENHANCED: Search for raw term OR normalized term in orders
          let orderFilter = `deviceModel.ilike.%${term}%,customer->>name.ilike.%${term}%,id.ilike.%${term}%`;
          
          // If normalized term is different and valid, add it to search
          if (normalizedTerm.length > 1 && normalizedTerm !== term.toLowerCase()) {
              orderFilter += `,deviceModel.ilike.%${normalizedTerm}%`;
          }

          const { data: matchedOrders } = await supabase
              .from('orders')
              .select('id')
              .or(orderFilter)
              .limit(50);

          const relatedOrderIds = matchedOrders?.map(o => o.id) || [];
          
          // Step 2: Construct the Logs Query
          // Matches: Log Text fields OR Log OrderID is in the found list
          let orConditions = `details.ilike.%${term}%,user_name.ilike.%${term}%,action.ilike.%${term}%`;
          
          // Also search normalized term in log details
          if (normalizedTerm.length > 1 && normalizedTerm !== term.toLowerCase()) {
              orConditions += `,details.ilike.%${normalizedTerm}%`;
          }
          
          if (relatedOrderIds.length > 0) {
              // Add the related orders to the search condition
              orConditions += `,order_id.in.(${relatedOrderIds.join(',')})`;
          }
          
          query = query.or(orConditions);
      } else {
          // Optimization: If no search, limit to recent 300 to load fast
          query = query.limit(300);
      }

      // 2. Specific Filters
      if (filterUser !== 'all') {
          query = query.eq('user_id', filterUser);
      }
      if (filterAction !== 'all') {
          query = query.ilike('action', `%${filterAction}%`);
      }
      if (startDate) {
          const startTs = new Date(startDate).setHours(0,0,0,0);
          query = query.gte('created_at', startTs);
      }
      if (endDate) {
          const endTs = new Date(endDate).setHours(23,59,59,999);
          query = query.lte('created_at', endTs);
      }

      const { data, error } = await query;

      if (!error && data) {
        setLogs(data as AuditLog[]);
      }
    } catch (error) {
        console.error("Error fetching logs:", error);
    } finally {
        setLoading(false);
    }
  };

  // Debounce search to avoid hitting DB on every keystroke
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchLogs();
    }, 600);

    return () => clearTimeout(delayDebounceFn);
  }, [search, filterUser, filterAction, startDate, endDate]);

  const formatDate = (ts: number) => new Date(ts).toLocaleString();

  const clearFilters = () => {
      setSearch('');
      setFilterUser('all');
      setFilterAction('all');
      setStartDate('');
      setEndDate('');
  };

  const setQuickDate = (days: number) => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - days);
      setEndDate(end.toISOString().slice(0, 10));
      setStartDate(start.toISOString().slice(0, 10));
  };

  // Handle Click
  const handleLogClick = (log: AuditLog) => {
      if (log.order_id) {
          navigate(`/orders/${log.order_id}`);
      }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-white text-slate-700 p-3 rounded-xl shadow-sm border border-slate-200">
            <Activity className="w-6 h-6" />
        </div>
        <div>
            <h1 className="text-2xl font-bold text-slate-800">Historial de Actividad</h1>
            <p className="text-slate-500">Registro inmutable de todas las operaciones del sistema.</p>
        </div>
      </div>

      {/* Filters Section */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mb-6 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2 mb-3 text-slate-500 text-xs font-bold uppercase tracking-wider">
              <SlidersHorizontal className="w-3 h-3" /> Filtros Avanzados (Busca en todo el historial)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="relative md:col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input 
                    placeholder="Buscar: Modelo, Cliente, ID, Acción..." 
                    className="w-full pl-9 p-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-700 focus:ring-2 focus:ring-blue-100 outline-none shadow-sm font-medium" 
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>
            <div>
                <select className="w-full p-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-700 shadow-sm focus:ring-2 focus:ring-blue-100 outline-none" value={filterUser} onChange={e => setFilterUser(e.target.value)}>
                    <option value="all">Todos los Usuarios</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
            </div>
            <div>
                <select className="w-full p-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-700 shadow-sm focus:ring-2 focus:ring-blue-100 outline-none" value={filterAction} onChange={e => setFilterAction(e.target.value)}>
                    <option value="all">Todas las Acciones</option>
                    <option value="VIEW_ORDER">Ver Orden</option>
                    <option value="UPDATE_STATUS">Cambio Estado</option>
                    <option value="PRINT_INVOICE">Imprimir Factura</option>
                    <option value="LOGIN">Inicios de Sesión</option>
                    <option value="CREATE">Creación</option>
                    <option value="VALIDATE">Validaciones</option>
                    <option value="MANUAL_STATUS_CHANGE">Cambio Manual</option>
                    <option value="QUICK_ADVANCE">Avance Rápido</option>
                </select>
            </div>
            <div className="flex gap-2">
                <input type="date" className="w-full p-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-700 shadow-sm" value={startDate} onChange={e => setStartDate(e.target.value)} title="Desde" />
                <input type="date" className="w-full p-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-700 shadow-sm" value={endDate} onChange={e => setEndDate(e.target.value)} title="Hasta" />
            </div>
          </div>
          <div className="flex flex-wrap justify-between items-center mt-3 pt-3 border-t border-slate-100 gap-2">
              <div className="flex gap-2">
                  <button onClick={() => setQuickDate(0)} className="text-xs bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded font-bold text-slate-600 border border-slate-200">Hoy</button>
                  <button onClick={() => setQuickDate(1)} className="text-xs bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded font-bold text-slate-600 border border-slate-200">Ayer</button>
                  <button onClick={() => setQuickDate(7)} className="text-xs bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded font-bold text-slate-600 border border-slate-200">7 Días</button>
                  <button onClick={() => setQuickDate(30)} className="text-xs bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded font-bold text-slate-600 border border-slate-200">Mes</button>
              </div>
              <button onClick={clearFilters} className="text-xs text-red-500 hover:underline flex items-center gap-1 font-bold bg-red-50 px-3 py-1.5 rounded transition hover:bg-red-100 border border-red-100">
                  <XCircle className="w-3 h-3" /> Limpiar Filtros
              </button>
          </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
           <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-2">
               <Activity className="w-8 h-8 animate-spin opacity-50" />
               Buscando en la base de datos...
           </div>
        ) : logs.length === 0 ? (
           <div className="p-12 text-center text-slate-500">No se encontraron resultados en el historial.</div>
        ) : (
           <div className="divide-y divide-slate-100">
             {logs.map(log => {
               // Try to find related order info to display context
               const relatedOrder = log.order_id ? orders.find(o => o.id === log.order_id) : null;
               
               return (
               <div 
                  key={log.id} 
                  onClick={() => handleLogClick(log)}
                  className={`p-4 transition flex items-start gap-4 group ${log.order_id ? 'cursor-pointer hover:bg-blue-50/50' : 'hover:bg-slate-50'}`}
               >
                  <div className="mt-1">
                     <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 border border-slate-200 shadow-sm group-hover:bg-white group-hover:border-blue-200 transition-colors">
                        <User className="w-5 h-5" />
                     </div>
                  </div>
                  <div className="flex-1">
                     <div className="flex justify-between items-start">
                        <h4 className="font-bold text-slate-800 flex items-center gap-2">
                            {log.user_name}
                            <span className="text-[10px] font-normal text-slate-400 px-2 py-0.5 bg-slate-100 rounded-full border">{log.user_id}</span>
                        </h4>
                        <span className="text-xs text-slate-500 flex items-center gap-1 bg-slate-50 px-2 py-1 rounded border border-slate-200 font-medium">
                           <Clock className="w-3 h-3" /> {formatDate(log.created_at)}
                        </span>
                     </div>
                     <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="text-xs font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100 uppercase tracking-wider">{log.action}</span>
                        
                        {/* ENHANCED: Display linked order context */}
                        {relatedOrder ? (
                            <div className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 font-mono font-bold hover:bg-white hover:border-blue-300 transition-colors" title={relatedOrder.customer.name}>
                                <FileText className="w-3 h-3" /> #{relatedOrder.readable_id || log.order_id?.slice(-4)} <span className="opacity-50 mx-1">|</span> {relatedOrder.deviceModel}
                            </div>
                        ) : log.order_id ? (
                            <div className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 font-mono font-bold opacity-60">
                                <FileText className="w-3 h-3" /> #{log.order_id.slice(-4)} (Info no disp.)
                            </div>
                        ) : null}
                     </div>
                     <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{log.details}</p>
                  </div>
                  {log.order_id && (
                      <div className="self-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="p-2 bg-white rounded-full border border-slate-200 shadow-sm text-blue-600">
                              <ExternalLink className="w-4 h-4" />
                          </div>
                      </div>
                  )}
               </div>
             )})}
           </div>
        )}
      </div>
    </div>
  );
};
