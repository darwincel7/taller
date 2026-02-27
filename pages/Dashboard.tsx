
import React, { useMemo, useState, useEffect } from 'react';
import { useOrders } from '../contexts/OrderContext';
import { useAuth } from '../contexts/AuthContext';
import { UserRole, RepairOrder, OrderStatus, PriorityLevel, OrderType, DashboardStats } from '../types';
import { 
  Trophy, Star, AlertCircle, LayoutDashboard, 
  ShoppingBag, CheckCircle2, 
  Clock, DollarSign, Activity, X, ChevronRight, FileSearch, Wrench, User, ArrowRightLeft, Eye, XCircle, TrendingUp, CalendarClock, Target, BellRing, MessageSquare, Split, HandCoins, Reply, ShieldCheck, Crown, Zap, Rocket, BarChart3, PieChart as PieIcon, ExternalLink, LineChart, Users, Building2, CalendarDays, CalendarRange, Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  BarChart, Bar, Legend, PieChart, Pie, Cell, ComposedChart, Line
} from 'recharts';
import { fetchRealDashboardStats, fetchRevenueChartData, fetchAdvancedDashboardData, fetchTechnicianLeaderboard } from '../services/analytics';

const DashboardComponent: React.FC = () => {
  const navigate = useNavigate();
  const { orders } = useOrders(); // Still need orders for specific lists/alerts
  const { currentUser, users } = useAuth();
  
  // STATE FOR REAL DATA
  const [realStats, setRealStats] = useState<DashboardStats>({
      total: 0, priorities: 0, pending: 0, inRepair: 0, repaired: 0, returned: 0, storeStock: 0, 
      totalRevenue: 0, totalExpenses: 0, totalProfit: 0, revenueByBranch: { t1: 0, t4: 0 } 
  });
  const [revenueChartData, setRevenueChartData] = useState<any[]>([]);
  const [advancedData, setAdvancedData] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<{techId: string, points: number}[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

  // FETCH ON MOUNT
  useEffect(() => {
      const loadData = async () => {
          setLoadingStats(true);
          const stats = await fetchRealDashboardStats();
          const chart = await fetchRevenueChartData();
          const adv = await fetchAdvancedDashboardData();
          const lb = await fetchTechnicianLeaderboard();
          
          setRealStats(stats);
          setRevenueChartData(chart);
          setAdvancedData(adv);
          setLeaderboard(lb);
          setLoadingStats(false);
      };
      loadData();
  }, []);

  const isAdmin = currentUser?.role === UserRole.ADMIN;
  
  // NOTE: Keep existing `orders` logic for specific alerts/lists (like "My Tech Alerts") 
  // because those usually involve recent/active orders which ARE in the context.
  
  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-8 pb-20 relative">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-200">
            <LayoutDashboard className="w-6 h-6" />
            </div>
            <div>
            <h1 className="text-2xl font-bold text-slate-800">Dashboard General</h1>
            <p className="text-slate-500">Resumen de operaciones y rendimiento.</p>
            </div>
        </div>
      </div>

      {/* --- LEADERBOARD (VISIBLE TO ALL) --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-3 bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                  <Trophy className="w-64 h-64 text-yellow-400" />
              </div>
              
              <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-yellow-500/20 rounded-lg">
                          <Crown className="w-6 h-6 text-yellow-400" />
                      </div>
                      <div>
                          <h2 className="text-xl font-bold text-white">Tabla de Posiciones (Quincenal)</h2>
                          <p className="text-slate-400 text-sm">Puntos acumulados del {new Date().getDate() <= 15 ? '1 al 15' : '16 al fin de mes'}</p>
                      </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {leaderboard.length > 0 ? (
                          leaderboard.map((entry, index) => {
                              const user = users.find(u => u.id === entry.techId);
                              const isTop3 = index < 3;
                              const rankColor = index === 0 ? 'text-yellow-400' : index === 1 ? 'text-slate-300' : index === 2 ? 'text-amber-600' : 'text-slate-500';
                              const bgColor = index === 0 ? 'bg-yellow-500/10 border-yellow-500/50' : index === 1 ? 'bg-slate-500/10 border-slate-500/50' : index === 2 ? 'bg-amber-600/10 border-amber-600/50' : 'bg-slate-800/50 border-slate-700';
                              
                              return (
                                  <div key={entry.techId} className={`relative p-4 rounded-xl border ${bgColor} flex items-center gap-4 transition-transform hover:scale-105`}>
                                      <div className={`text-2xl font-black ${rankColor} w-8 text-center`}>
                                          #{index + 1}
                                      </div>
                                      <div className="flex-1">
                                          <p className="font-bold text-white truncate">{user?.name || 'Técnico'}</p>
                                          <p className="text-xs text-slate-400">{user?.role || 'N/A'}</p>
                                      </div>
                                      <div className="text-right">
                                          <p className="text-2xl font-black text-white">{entry.points}</p>
                                          <p className="text-[10px] text-slate-400 uppercase tracking-wider">Puntos</p>
                                      </div>
                                      {index === 0 && <Crown className="absolute -top-3 -right-3 w-8 h-8 text-yellow-400 transform rotate-12 drop-shadow-lg" />}
                                  </div>
                              );
                          })
                      ) : (
                          <div className="col-span-full text-center py-8 text-slate-500">
                              No hay puntos registrados esta quincena aún.
                          </div>
                      )}
                  </div>
              </div>
          </div>
      </div>

      {/* --- ADMIN DASHBOARD --- */}
      {isAdmin && (
      <div className="space-y-8">
          {/* 1. KEY METRICS (NOW USING REAL DB STATS) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
                <div className="flex justify-between items-start mb-2"><div className="bg-red-50 p-2 rounded-lg text-red-600"><ShoppingBag className="w-5 h-5"/></div><span className="text-xs font-bold text-red-600 uppercase tracking-wider bg-red-50 px-2 py-1 rounded">RECIBIDOS</span></div>
                <div className="text-3xl font-bold text-slate-800">{loadingStats ? '...' : realStats.storeStock}</div><p className="text-xs text-slate-500">Equipos en Venta</p>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between border-l-4 border-l-orange-500">
                <div className="flex justify-between items-start mb-2"><div className="bg-orange-50 p-2 rounded-lg text-orange-600"><Clock className="w-5 h-5"/></div><span className="text-xs font-black text-orange-600 uppercase tracking-widest">PENDIENTES...</span></div>
                <div className="text-3xl font-bold text-slate-800">{loadingStats ? '...' : realStats.pending}</div><p className="text-xs text-slate-500">Por Revisar</p>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
                <div className="flex justify-between items-start mb-2"><div className="bg-indigo-50 p-2 rounded-lg text-indigo-600"><Wrench className="w-5 h-5"/></div><span className="text-xs font-bold text-slate-400 uppercase">Reparación</span></div>
                <div className="text-3xl font-bold text-slate-800">{loadingStats ? '...' : realStats.inRepair}</div><p className="text-xs text-slate-500">En Proceso</p>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
                <div className="flex justify-between items-start mb-2"><div className="bg-green-50 p-2 rounded-lg text-green-600"><CheckCircle2 className="w-5 h-5"/></div><span className="text-xs font-bold text-slate-400 uppercase">Ingresos Hist.</span></div>
                <div className="text-3xl font-bold text-slate-800 tracking-tight">{loadingStats ? '...' : `$${realStats.totalRevenue.toLocaleString()}`}</div><p className="text-xs text-slate-500">Total Facturado</p>
            </div>
          </div>

          {/* 2. SALES PERFORMANCE & PROJECTIONS */}
          {advancedData && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                  { label: 'Ventas Hoy', data: advancedData.sales.day, icon: CalendarDays, color: 'blue' },
                  { label: 'Ventas Semana', data: advancedData.sales.week, icon: CalendarRange, color: 'indigo' },
                  { label: 'Ventas Mes', data: advancedData.sales.month, icon: CalendarClock, color: 'purple' }
              ].map((item, idx) => (
                  <div key={idx} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden group">
                      <div className="relative z-10">
                          <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
                                  <item.icon className={`w-4 h-4 text-${item.color}-500`} /> {item.label}
                              </div>
                              {idx === 2 && advancedData.sales.history.length > 0 && (
                                  <div className="flex flex-col gap-1 items-end">
                                      <span className="text-[9px] font-bold text-slate-400 uppercase">Meses Anteriores</span>
                                      {advancedData.sales.history.slice(-3).map((h: any, i: number) => (
                                          <span key={i} className="text-[10px] text-slate-500 font-medium" title={`Ventas ${h.month}`}>
                                              {h.month}: <span className="font-bold text-slate-700">${Math.floor(h.total).toLocaleString()}</span>
                                          </span>
                                      ))}
                                  </div>
                              )}
                          </div>
                          <div className="flex items-baseline gap-2 mb-1">
                              <span className="text-3xl font-black text-slate-800">${Math.floor(item.data.current).toLocaleString()}</span>
                              <span className="text-xs font-bold text-slate-400">actual</span>
                          </div>
                          <div className="flex items-center gap-2 mb-4">
                              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                  <div 
                                      className={`h-full bg-${item.color}-500 rounded-full transition-all duration-1000`} 
                                      style={{ width: `${Math.min(100, (item.data.current / (item.data.projected || 1)) * 100)}%` }}
                                  />
                              </div>
                              <span className="text-[10px] font-black text-slate-400">{Math.floor((item.data.current / (item.data.projected || 1)) * 100)}%</span>
                          </div>
                          <div className={`p-3 rounded-xl bg-${item.color}-50 border border-${item.color}-100`}>
                              <div className="flex justify-between items-center">
                                  <span className={`text-[10px] font-bold text-${item.color}-600 uppercase`}>Proyección {item.label.split(' ')[1]}</span>
                                  <TrendingUp className={`w-3 h-3 text-${item.color}-600`} />
                              </div>
                              <div className={`text-lg font-black text-${item.color}-700`}>
                                  ${Math.floor(item.data.projected).toLocaleString()}
                              </div>
                          </div>
                      </div>
                  </div>
              ))}
          </div>
          )}

          {/* 3. ORDER FLOW (IN vs OUT) */}
          {advancedData && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                  { label: 'Flujo Hoy', data: advancedData.flow.day, icon: ArrowRightLeft, color: 'emerald' },
                  { label: 'Flujo Semana', data: advancedData.flow.week, icon: Activity, icon2: TrendingUp, color: 'amber' },
                  { label: 'Flujo Mes', data: advancedData.flow.month, icon: BarChart3, color: 'rose' }
              ].map((item, idx) => (
                  <div key={idx} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                      <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
                              <item.icon className={`w-4 h-4 text-${item.color}-500`} /> {item.label}
                          </div>
                          {idx === 2 && advancedData.flow.history.length > 0 && (
                                <div className="flex flex-col gap-1 items-end">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase">Meses Anteriores</span>
                                    {advancedData.flow.history.slice(-3).map((h: any, i: number) => (
                                        <span key={i} className="text-[10px] text-slate-500 font-medium" title={`Entradas/Salidas ${h.month}`}>
                                            {h.month}: <span className="font-bold text-slate-700">{h.in} in / {h.out} out</span>
                                        </span>
                                    ))}
                                </div>
                            )}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 mb-4">
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                              <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Entradas</p>
                              <div className="flex items-baseline gap-2">
                                  <span className="text-2xl font-black text-slate-800">{item.data.in}</span>
                                  <span className="text-[10px] text-slate-400">est. {Math.floor(item.data.inProjected)}</span>
                              </div>
                          </div>
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                              <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Salidas</p>
                              <div className="flex items-baseline gap-2">
                                  <span className="text-2xl font-black text-slate-800">{item.data.out}</span>
                                  <span className="text-[10px] text-slate-400">est. {Math.floor(item.data.outProjected)}</span>
                              </div>
                          </div>
                      </div>

                      {/* Efficiency Indicator */}
                      <div className="flex items-center justify-between px-1">
                          <span className="text-[10px] font-bold text-slate-500 uppercase">Eficiencia de Salida</span>
                          <span className={`text-[10px] font-black ${item.data.out >= item.data.in ? 'text-green-600' : 'text-orange-600'}`}>
                              {item.data.in > 0 ? Math.floor((item.data.out / item.data.in) * 100) : 0}%
                          </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                          <div 
                              className={`h-full transition-all duration-1000 ${item.data.out >= item.data.in ? 'bg-green-500' : 'bg-orange-500'}`}
                              style={{ width: `${Math.min(100, (item.data.out / (item.data.in || 1)) * 100)}%` }}
                          />
                      </div>
                      <p className="text-[9px] text-slate-400 mt-2 italic">
                          {item.data.out < item.data.in 
                            ? `⚠️ Se están acumulando ${item.data.in - item.data.out} equipos.` 
                            : `✅ Flujo positivo: +${item.data.out - item.data.in} equipos liberados.`}
                      </p>
                  </div>
              ))}
          </div>
          )}

          {/* 4. CHARTS SECTION (REAL DATA) */}
          {loadingStats ? (
            <div className="flex justify-center items-center h-64 w-full">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-blue-500"/> Ingresos Diarios (Últimos 7 días)</h3>
                  <div className="h-64 w-full" style={{ minHeight: '250px' }}>
                      <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={revenueChartData}>
                              <defs>
                                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                  </linearGradient>
                              </defs>
                              <XAxis dataKey="name" fontSize={12} stroke="#94a3b8" />
                              <YAxis fontSize={12} stroke="#94a3b8" />
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                              <RechartsTooltip />
                              <Area type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                          </AreaChart>
                      </ResponsiveContainer>
                  </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><PieIcon className="w-5 h-5 text-purple-500"/> Distribución de Estado</h3>
                  <div className="h-64 w-full flex items-center justify-center" style={{ minHeight: '250px' }}>
                      <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                              <Pie
                                  data={[
                                      { name: 'Pendiente', value: realStats.pending, color: '#ef4444' },
                                      { name: 'En Reparación', value: realStats.inRepair, color: '#3b82f6' },
                                      { name: 'En Tienda', value: realStats.storeStock, color: '#8b5cf6' },
                                      { name: 'Reparado', value: realStats.repaired || 0, color: '#22c55e' }
                                  ]}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={80}
                                  paddingAngle={5}
                                  dataKey="value"
                              >
                                  {[
                                      { name: 'Pendiente', value: realStats.pending, color: '#ef4444' },
                                      { name: 'En Reparación', value: realStats.inRepair, color: '#3b82f6' },
                                      { name: 'En Tienda', value: realStats.storeStock, color: '#8b5cf6' },
                                      { name: 'Reparado', value: realStats.repaired || 0, color: '#22c55e' }
                                  ].map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                              </Pie>
                              <RechartsTooltip />
                              <Legend />
                          </PieChart>
                      </ResponsiveContainer>
                  </div>
              </div>
          </div>
          )}

          {!loadingStats && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
               <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-orange-500"/> Ingresos por Sucursal</h3>
                  <div className="h-64 w-full" style={{ minHeight: '250px' }}>
                      <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={[
                              { name: 'T4 (Principal)', value: realStats.revenueByBranch.t4 },
                              { name: 'T1 (Secundaria)', value: realStats.revenueByBranch.t1 }
                          ]}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                              <XAxis dataKey="name" fontSize={12} />
                              <YAxis fontSize={12} />
                              <RechartsTooltip />
                              <Bar dataKey="value" fill="#f97316" radius={[4, 4, 0, 0]} />
                          </BarChart>
                      </ResponsiveContainer>
                  </div>
              </div>
          </div>
          )}
      </div>
      )}
    </div>
  );
};

export const Dashboard = DashboardComponent;
