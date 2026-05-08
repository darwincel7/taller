
import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { AuditLog, UserRole } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useOrders } from '../contexts/OrderContext';
import { 
    Clock, User, FileText, Activity, Search, Filter, Calendar, 
    XCircle, SlidersHorizontal, ArrowDownCircle, ChevronRight, 
    ExternalLink, MousePointer2, Settings, Database, AlertTriangle,
    CheckCircle2, Info, History, UserCheck, TrendingUp, BarChart3,
    ArrowRight, Package, CreditCard, Wrench
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
    ResponsiveContainer, Cell, LineChart, Line, AreaChart, Area
} from 'recharts';

// --- INTELLIGENT DEVICE NORMALIZER ---
const normalizeDeviceName = (rawName: string): string => {
    if (!rawName) return '';
    let s = rawName.toLowerCase().trim();
    s = s.replace(/\biphone\b/g, '').trim(); 
    s = s.replace(/(\d+)\s*(pm|promax|pro max|p max)\b/g, '$1 pro max');
    s = s.replace(/(\d+)\s*(plus|plu|\+)\b/g, '$1 plus');
    s = s.replace(/(\d+)\s*p(?!lus|lu|lay|ro)\b/g, '$1 pro');
    s = s.replace(/(\d+)\s*(n|normal)\b/g, '$1'); 
    return s.replace(/\s+/g, ' ').trim();
};

// --- METADATA RENDERER ---
const MetadataDisplay: React.FC<{ metadata: any }> = ({ metadata }) => {
    if (!metadata) return null;

    // Handle "Before/After" changes
    if (metadata.before !== undefined && metadata.after !== undefined) {
        return (
            <div className="mt-2 p-2 bg-slate-50 rounded-lg border border-slate-100 text-[11px] font-mono">
                <div className="flex items-center gap-2 text-rose-500 line-through opacity-60">
                    <span>Antes:</span> {JSON.stringify(metadata.before)}
                </div>
                <div className="flex items-center gap-2 text-emerald-600 font-bold mt-1">
                    <ArrowRight className="w-3 h-3" />
                    <span>Ahora:</span> {JSON.stringify(metadata.after)}
                </div>
            </div>
        );
    }

    // Handle generic key-value pairs
    return (
        <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(metadata).map(([key, value]) => (
                <div key={key} className="bg-slate-100 px-2 py-0.5 rounded text-[10px] text-slate-500 border border-slate-200">
                    <span className="font-bold uppercase opacity-60">{key}:</span> {String(value)}
                </div>
            ))}
        </div>
    );
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
  const [filterType, setFilterType] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [viewMode, setViewMode] = useState<'LIST' | 'TIMELINE' | 'FOOTPRINT'>('LIST');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (search.trim()) {
          const term = search.trim();
          const normalizedTerm = normalizeDeviceName(term);
          
          // Search in orders to find related IDs
          let orderFilter = `deviceModel.ilike.%${term}%,customer->>name.ilike.%${term}%,id.ilike.%${term}%,imei.ilike.%${term}%`;
          if (/^\d+$/.test(term) && term.length <= 9) {
              orderFilter += `,readable_id.eq.${term}`;
          }
          if (normalizedTerm.length > 1 && normalizedTerm !== term.toLowerCase()) {
              orderFilter += `,deviceModel.ilike.%${normalizedTerm}%`;
          }

          const { data: matchedOrders } = await supabase
              .from('orders')
              .select('id')
              .or(orderFilter)
              .limit(50);

          const relatedOrderIds = matchedOrders?.map(o => o.id) || [];
          
          let relatedExpenseIds: string[] = [];
          const expenseMatch = term.match(/^[gv]-?(\d+)$/i);
          const expenseNum = expenseMatch ? expenseMatch[1] : (/^\d+$/.test(term) && term.length <= 9 ? term : null);
          
          if (expenseNum) {
              const { data: matchedAt } = await supabase
                  .from('accounting_transactions')
                  .select('id')
                  .eq('readable_id', expenseNum)
                  .limit(10);
              
              const { data: matchedFe } = await supabase
                  .from('floating_expenses')
                  .select('id')
                  .eq('readable_id', expenseNum)
                  .limit(10);
                  
              relatedExpenseIds = [
                  ...(matchedAt?.map(e => e.id) || []),
                  ...(matchedFe?.map(e => e.id) || [])
              ];
          }
          
          const matchedUserIds = users.filter(u => u.name.toLowerCase().includes(term.toLowerCase())).map(u => u.id);
          
          // Construct the Logs Query
          let orConditions = `details.ilike.%${term}%,user_name.ilike.%${term}%,action.ilike.%${term}%,entity_id.ilike.%${term}%`;
          
          if (normalizedTerm.length > 1 && normalizedTerm !== term.toLowerCase()) {
              orConditions += `,details.ilike.%${normalizedTerm}%`;
          }
          
          if (relatedOrderIds.length > 0) {
              orConditions += `,order_id.in.(${relatedOrderIds.join(',')}),entity_id.in.(${relatedOrderIds.join(',')})`;
          }
          
          if (relatedExpenseIds.length > 0) {
              orConditions += `,entity_id.in.(${relatedExpenseIds.join(',')})`;
          }
          
          if (matchedUserIds.length > 0) {
              orConditions += `,entity_id.in.(${matchedUserIds.join(',')}),user_id.in.(${matchedUserIds.join(',')})`;
          }
          
          query = query.or(orConditions);
      } else {
          query = query.limit(500);
      }

      if (filterUser !== 'all') {
          if (filterUser.startsWith('role:')) {
              const role = filterUser.split(':')[1];
              const userIdsWithRole = users.filter(u => u.role === role).map(u => u.id);
              if (userIdsWithRole.length > 0) {
                  query = query.in('user_id', userIdsWithRole);
              } else {
                  query = query.eq('user_id', 'none-match');
              }
          } else {
              // Buscar acciones hechas POR el usuario o SOBRE el usuario
              query = query.or(`user_id.eq.${filterUser},entity_id.eq.${filterUser}`);
          }
      }

      if (filterAction !== 'all') query = query.ilike('action', `%${filterAction}%`);
      if (filterType !== 'all') query = query.eq('entity_type', filterType);
      
      if (startDate) {
          const startTs = new Date(startDate).setHours(0,0,0,0);
          query = query.gte('created_at', startTs);
      }
      if (endDate) {
          const endTs = new Date(endDate).setHours(23,59,59,999);
          query = query.lte('created_at', endTs);
      }

      const { data, error } = await query;
      if (!error && data) setLogs(data as AuditLog[]);
    } catch (error) {
        console.warn("Error fetching logs:", error);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchLogs();
    }, 600);
    return () => clearTimeout(delayDebounceFn);
  }, [search, filterUser, filterAction, filterType, startDate, endDate]);

  // --- ANALYTICS DATA ---
  const chartData = useMemo(() => {
    const hourlyData: Record<number, number> = {};
    const actionData: Record<string, number> = {};
    
    logs.forEach(log => {
        const hour = new Date(log.created_at).getHours();
        hourlyData[hour] = (hourlyData[hour] || 0) + 1;
        actionData[log.action] = (actionData[log.action] || 0) + 1;
    });

    const hours = Array.from({ length: 24 }, (_, i) => ({
        hour: `${i}:00`,
        count: hourlyData[i] || 0
    }));

    const actions = Object.entries(actionData)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);

    return { hours, actions };
  }, [logs]);

  const clearFilters = () => {
      setSearch('');
      setFilterUser('all');
      setFilterAction('all');
      setFilterType('all');
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

  const getActionIcon = (action: string, type?: string) => {
      if (type === 'ORDER') return <Wrench className="w-4 h-4 text-blue-500" />;
      if (type === 'TRANSACTION') return <CreditCard className="w-4 h-4 text-emerald-500" />;
      if (type === 'INVENTORY') return <Package className="w-4 h-4 text-orange-500" />;
      if (action.includes('LOGIN')) return <UserCheck className="w-4 h-4 text-purple-500" />;
      if (action.includes('CLICK')) return <MousePointer2 className="w-4 h-4 text-slate-400" />;
      return <Activity className="w-4 h-4 text-slate-400" />;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
            <div className="bg-indigo-600 text-white p-3 rounded-2xl shadow-lg shadow-indigo-100">
                <History className="w-6 h-6" />
            </div>
            <div>
                <h1 className="text-2xl font-black text-slate-800 tracking-tight">Centro de Auditoría Avanzada</h1>
                <p className="text-slate-500 text-sm font-medium">Rastreo de clics, acciones y ciclo de vida del sistema.</p>
            </div>
        </div>
        
        <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
            <button 
                onClick={() => setViewMode('LIST')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${viewMode === 'LIST' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
            >
                <BarChart3 className="w-3.5 h-3.5" /> Lista
            </button>
            <button 
                onClick={() => setViewMode('TIMELINE')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${viewMode === 'TIMELINE' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
            >
                <TrendingUp className="w-3.5 h-3.5" /> Línea de Tiempo
            </button>
        </div>
      </div>

      {/* Stats & Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 uppercase tracking-wider">
                      <Clock className="w-4 h-4 text-indigo-500" /> Actividad por Hora
                  </h3>
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded border border-slate-100">Últimos {logs.length} eventos</span>
              </div>
              <div className="h-[180px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData.hours}>
                          <defs>
                              <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                              </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                          <Tooltip 
                            contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                            itemStyle={{fontSize: '12px', fontWeight: 'bold'}}
                          />
                          <Area type="monotone" dataKey="count" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
                      </AreaChart>
                  </ResponsiveContainer>
              </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-6 uppercase tracking-wider">
                  <Activity className="w-4 h-4 text-indigo-500" /> Acciones Frecuentes
              </h3>
              <div className="space-y-3">
                  {chartData.actions.map((action, i) => (
                      <div key={action.name} className="flex items-center gap-3">
                          <div className="flex-1">
                              <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                                  <span className="truncate max-w-[150px]">{action.name}</span>
                                  <span>{action.value}</span>
                              </div>
                              <div className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden">
                                  <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${(action.value / chartData.actions[0].value) * 100}%` }}
                                    className="h-full bg-indigo-500 rounded-full"
                                  />
                              </div>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      </div>

      {/* Filters Section */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-7 gap-4">
            <div className="relative md:col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input 
                    placeholder="Buscar Orden (#), Usuario, Acción o ID..." 
                    className="w-full pl-10 p-3 border border-slate-200 rounded-xl text-sm bg-slate-50 text-slate-700 focus:ring-2 focus:ring-indigo-100 focus:bg-white outline-none transition-all font-bold" 
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>
            <div className="md:col-span-2 relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500 w-4 h-4" />
                <select className="w-full pl-10 pr-8 p-3 border border-indigo-200 rounded-xl text-sm bg-indigo-50/50 text-indigo-900 font-bold outline-none focus:ring-2 focus:ring-indigo-500 appearance-none" value={filterUser} onChange={e => setFilterUser(e.target.value)}>
                    <option value="all">Todos los Perfiles y Usuarios</option>
                    <optgroup label="Filtrar por Perfil">
                        <option value="role:ADMIN">Administradores</option>
                        <option value="role:TECHNICIAN">Técnicos</option>
                        <option value="role:CASHIER">Cajeros</option>
                    </optgroup>
                    <optgroup label="Filtrar por Usuario Específico">
                        {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                    </optgroup>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-500">
                    <ChevronRight className="w-4 h-4 rotate-90" />
                </div>
            </div>
            <div>
                <select className="w-full p-3 border border-slate-200 rounded-xl text-sm bg-slate-50 text-slate-700 font-bold outline-none focus:ring-2 focus:ring-indigo-100" value={filterType} onChange={e => setFilterType(e.target.value)}>
                    <option value="all">Tipo Entidad</option>
                    <option value="ORDER">Órdenes</option>
                    <option value="USER">Usuarios</option>
                    <option value="TRANSACTION">Finanzas</option>
                    <option value="INVENTORY">Inventario</option>
                    <option value="SYSTEM">Sistema/Clics</option>
                </select>
            </div>
            <div className="flex gap-2 lg:col-span-2">
                <input type="date" className="w-full p-3 border border-slate-200 rounded-xl text-sm bg-slate-50 text-slate-700 font-bold" value={startDate} onChange={e => setStartDate(e.target.value)} />
                <input type="date" className="w-full p-3 border border-slate-200 rounded-xl text-sm bg-slate-50 text-slate-700 font-bold" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          
          <div className="flex flex-wrap justify-between items-center pt-4 border-t border-slate-100 gap-4">
              <div className="flex gap-2">
                  <button onClick={() => setQuickDate(0)} className="text-[10px] font-black uppercase tracking-widest bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-lg text-slate-600 transition-colors">Hoy</button>
                  <button onClick={() => setQuickDate(7)} className="text-[10px] font-black uppercase tracking-widest bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-lg text-slate-600 transition-colors">7 Días</button>
                  <button onClick={() => setQuickDate(30)} className="text-[10px] font-black uppercase tracking-widest bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-lg text-slate-600 transition-colors">Mes</button>
              </div>
              <button onClick={clearFilters} className="text-[10px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-50 px-4 py-2 rounded-lg border border-rose-100 transition-all">
                  Limpiar Filtros
              </button>
          </div>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
        {loading ? (
           <div className="p-20 text-center text-slate-500 flex flex-col items-center gap-4">
               <div className="relative">
                   <Activity className="w-12 h-12 animate-spin text-indigo-600 opacity-20" />
                   <div className="absolute inset-0 flex items-center justify-center">
                       <Database className="w-5 h-5 text-indigo-600" />
                   </div>
               </div>
               <span className="font-bold text-slate-400">Consultando rastro digital...</span>
           </div>
        ) : logs.length === 0 ? (
           <div className="p-20 text-center flex flex-col items-center gap-4">
               <Search className="w-12 h-12 text-slate-200" />
               <p className="text-slate-400 font-bold">No se encontraron huellas de actividad con estos filtros.</p>
           </div>
        ) : viewMode === 'TIMELINE' ? (
            <div className="p-8">
                <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                    {logs.map((log, i) => (
                        <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            key={log.id} 
                            className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
                        >
                            <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-100 text-slate-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                                {getActionIcon(log.action, log.entity_type)}
                            </div>
                            <div 
                                onClick={() => setSelectedLog(log)}
                                className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-2xl border border-slate-100 bg-white shadow-sm hover:shadow-md transition-all group-hover:border-indigo-100 cursor-pointer"
                            >
                                <div className="flex items-center justify-between space-x-2 mb-1">
                                    <div className="font-black text-slate-800 text-xs uppercase tracking-wider">{log.action}</div>
                                    <time className="font-mono text-[10px] text-slate-400">{format(new Date(log.created_at), 'HH:mm', { locale: es })}</time>
                                </div>
                                <div className="text-slate-500 text-sm mb-2">{log.details}</div>
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                                        <div className="w-4 h-4 rounded-full bg-indigo-100 flex items-center justify-center text-[8px] font-bold text-indigo-600">
                                            {(log.user_name || '?').charAt(0).toUpperCase()}
                                        </div>
                                        <span className="text-[10px] font-bold text-slate-600">{log.user_name || 'Desconocido'}</span>
                                    </div>
                                    {log.entity_id && (
                                        <div className="text-[10px] font-mono bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 text-slate-400">
                                            ID: {log.entity_id.slice(-8)}
                                        </div>
                                    )}
                                </div>
                                <MetadataDisplay metadata={log.metadata} />
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        ) : (
           <div className="overflow-x-auto">
             <table className="w-full text-left border-collapse">
                 <thead className="bg-slate-50/50 border-b border-slate-100">
                     <tr className="text-[10px] uppercase font-black tracking-widest text-slate-400">
                         <th className="px-6 py-4">Evento</th>
                         <th className="px-6 py-4">Actor</th>
                         <th className="px-6 py-4">Detalles</th>
                         <th className="px-6 py-4 text-right">Fecha / Hora</th>
                     </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                    {logs.map((log) => (
                        <tr 
                            key={log.id} 
                            onClick={() => setSelectedLog(log)}
                            className={`group transition-colors cursor-pointer hover:bg-indigo-50/30`}
                        >
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center group-hover:bg-white group-hover:shadow-sm transition-all">
                                        {getActionIcon(log.action, log.entity_type)}
                                    </div>
                                    <div>
                                        <div className="text-xs font-black text-slate-800 uppercase tracking-tight">{log.action}</div>
                                        <div className="text-[10px] font-bold text-slate-400">{log.entity_type || 'SISTEMA'}</div>
                                    </div>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-indigo-50 flex items-center justify-center text-[10px] font-bold text-indigo-600 border border-indigo-100">
                                        {(log.user_name || '?').charAt(0).toUpperCase()}
                                    </div>
                                    <span className="text-xs font-bold text-slate-700">{log.user_name || 'Desconocido'}</span>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <div className="max-w-md">
                                    <p className="text-xs text-slate-600 leading-relaxed font-medium">{log.details}</p>
                                    <MetadataDisplay metadata={log.metadata} />
                                </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                                <div className="text-xs font-bold text-slate-800">{format(new Date(log.created_at), 'dd MMM yyyy', { locale: es })}</div>
                                <div className="text-[10px] font-medium text-slate-400">{format(new Date(log.created_at), 'HH:mm:ss')}</div>
                            </td>
                        </tr>
                    ))}
                 </tbody>
             </table>
           </div>
        )}
      </div>
      
      {/* Log Details Modal */}
      {selectedLog && (
          <div className="fixed inset-0 z-[200] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden">
                  <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50">
                      <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                              {getActionIcon(selectedLog.action, selectedLog.entity_type)}
                          </div>
                          <div>
                              <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">{selectedLog.action}</h2>
                              <p className="text-xs font-bold text-slate-500">{format(new Date(selectedLog.created_at), 'dd MMM yyyy HH:mm:ss', { locale: es })}</p>
                          </div>
                      </div>
                      <button onClick={() => setSelectedLog(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors">
                          <XCircle className="w-5 h-5" />
                      </button>
                  </div>
                  
                  <div className="p-6 space-y-6">
                      <div>
                          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Usuario</h3>
                          <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-xs font-bold text-indigo-600 border border-indigo-100">
                                  {(selectedLog.user_name || '?').charAt(0).toUpperCase()}
                              </div>
                              <span className="text-sm font-bold text-slate-700">{selectedLog.user_name || 'Desconocido'}</span>
                          </div>
                      </div>
                      
                      <div>
                          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Detalles</h3>
                          <p className="text-sm text-slate-600 leading-relaxed font-medium bg-slate-50 p-4 rounded-xl border border-slate-100">
                              {selectedLog.details}
                          </p>
                      </div>

                      {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                          <div>
                              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Metadatos Adicionales</h3>
                              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 overflow-x-auto">
                                  <pre className="text-[10px] font-mono text-slate-600 whitespace-pre-wrap">
                                      {JSON.stringify(selectedLog.metadata, null, 2)}
                                  </pre>
                              </div>
                          </div>
                      )}
                  </div>
                  
                  <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                      <button onClick={() => setSelectedLog(null)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                          Cerrar
                      </button>
                      {selectedLog.order_id && (
                          <button 
                              onClick={() => {
                                  setSelectedLog(null);
                                  navigate(`/orders/${selectedLog.order_id}`);
                              }}
                              className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-2 shadow-md shadow-indigo-200"
                          >
                              <ExternalLink className="w-4 h-4" /> Ver Orden
                          </button>
                      )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
