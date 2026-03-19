
import React, { useMemo, useState, useCallback } from 'react';
import { useOrders } from '../contexts/OrderContext';
import { useAuth } from '../contexts/AuthContext';
import { UserRole, OrderStatus, DashboardStats } from '../types';
import { 
  Trophy, Star, AlertCircle, LayoutDashboard, 
  ShoppingBag, CheckCircle2, 
  Clock, DollarSign, Activity, X, ChevronRight, FileSearch, Wrench, User, ArrowRightLeft, Eye, XCircle, TrendingUp, CalendarClock, Target, BellRing, MessageSquare, Split, HandCoins, Reply, ShieldCheck, Crown, Zap, Rocket, BarChart3, PieChart as PieIcon, ExternalLink, LineChart, Users, Building2, CalendarDays, CalendarRange, Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabase';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  BarChart, Bar, Legend, PieChart, Pie, Cell, ComposedChart, Line
} from 'recharts';
import { 
  fetchRealDashboardStats, 
  fetchRevenueChartData, 
  fetchAdvancedDashboardData, 
  fetchTechnicianLeaderboard, 
  fetchTechnicianPointsDetails,
  fetchTechnicianPerformance,
  fetchWarrantyReport,
  fetchTopModels,
  fetchProfitabilityData
} from '../services/analytics';
import { analyzeProfitability } from '../services/geminiService';
import { orderService } from '../services/orderService';
import Markdown from 'react-markdown';

const DashboardComponent: React.FC = () => {
  const navigate = useNavigate();
  const { users, currentUser } = useAuth();
  
  // Queries
  const { data: realStats, isLoading: loadingStats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchRealDashboardStats,
    refetchInterval: 300000, // 5 minutes
  });

  const { data: branchCounts, isLoading: loadingBranchCounts } = useQuery({
    queryKey: ['orderCounts', currentUser?.id, currentUser?.branch, currentUser?.role],
    queryFn: () => {
      if (!currentUser) return null;
      return orderService.getOrderTabCounts(currentUser.id, currentUser.branch || 'T4', currentUser.role);
    },
    enabled: !!currentUser,
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  const { data: floatingExpensesCount = 0 } = useQuery({
    queryKey: ['floating-expenses-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('floating_expenses')
        .select('*', { count: 'exact', head: true })
        .neq('description', 'RECEIPT_UPLOAD_TRIGGER');
      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 60000, // 1 minute
  });

  const { data: revenueChartData } = useQuery({
    queryKey: ['revenue-chart'],
    queryFn: fetchRevenueChartData,
  });

  const { data: advancedData } = useQuery({
    queryKey: ['advanced-dashboard'],
    queryFn: fetchAdvancedDashboardData,
  });

  const { data: leaderboard = [] } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: fetchTechnicianLeaderboard,
  });

  const { data: techPerformance = [] } = useQuery({
    queryKey: ['tech-performance'],
    queryFn: fetchTechnicianPerformance,
  });

  const { data: warrantyReport = [] } = useQuery({
    queryKey: ['warranty-report'],
    queryFn: fetchWarrantyReport,
  });

  const { data: topModels = [] } = useQuery({
    queryKey: ['top-models'],
    queryFn: fetchTopModels,
  });

  const { data: profitabilityData = [] } = useQuery({
    queryKey: ['profitability-data'],
    queryFn: fetchProfitabilityData,
  });

  const isAdmin = currentUser?.role === UserRole.ADMIN;
  const isSubAdmin = currentUser?.role === UserRole.SUB_ADMIN;
  const isMonitor = currentUser?.role === UserRole.MONITOR;
  const canViewFinancials = isAdmin || currentUser?.permissions?.canViewAccounting;
  const canViewOperationalStats = isAdmin || isSubAdmin || isMonitor;

  const { data: aiAnalysis, isLoading: loadingAiAnalysis } = useQuery({
    queryKey: ['ai-profitability-analysis', profitabilityData],
    queryFn: () => analyzeProfitability(profitabilityData),
    enabled: !!profitabilityData && profitabilityData.length > 0 && canViewFinancials,
  });

  // MODAL STATE FOR TECH POINTS
  const [selectedTechForPoints, setSelectedTechForPoints] = useState<string | null>(null);

  const { data: techPointsDetails = [], isLoading: loadingTechPoints } = useQuery({
    queryKey: ['tech-points', selectedTechForPoints],
    queryFn: () => fetchTechnicianPointsDetails(selectedTechForPoints!),
    enabled: !!selectedTechForPoints,
  });
  
  const handleTechClick = useCallback((techId: string) => {
      setSelectedTechForPoints(techId);
  }, []);
  
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

      {/* FLOATING EXPENSES ALERT */}
      {canViewFinancials && floatingExpensesCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-4">
            <div className="bg-amber-100 p-3 rounded-xl text-amber-600">
              <HandCoins className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-amber-900">Gastos Pendientes de Asignar</h3>
              <p className="text-sm text-amber-700">Hay <span className="font-black">{floatingExpensesCount}</span> gastos en el "Limbo" esperando ser asignados a una orden.</p>
            </div>
          </div>
          <button 
            onClick={() => navigate('/orders')}
            className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors flex items-center gap-2"
          >
            Ver Órdenes <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

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
                              
                              const techPerf = techPerformance.find(p => p.techId === entry.techId);
                              
                              return (
                                  <div 
                                      key={entry.techId} 
                                      onClick={() => handleTechClick(entry.techId)}
                                      className={`relative p-4 rounded-xl border ${bgColor} flex items-center gap-4 transition-transform hover:scale-105 cursor-pointer`}
                                  >
                                      <div className={`text-2xl font-black ${rankColor} w-8 text-center`}>
                                          #{index + 1}
                                      </div>
                                      <div className="flex-1">
                                          <p className="font-bold text-white truncate">{user?.name || 'Técnico'}</p>
                                          <div className="flex items-center gap-2 mt-1">
                                              <span className="text-[10px] text-slate-400 uppercase tracking-wider">{user?.role || 'N/A'}</span>
                                              {techPerf && (
                                                  <>
                                                      <span className="text-slate-600">•</span>
                                                      <span className="text-[10px] text-green-400 font-bold">{Math.floor(techPerf.successRate)}% Éxito</span>
                                                  </>
                                              )}
                                          </div>
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

      {/* --- ADMIN & MANAGEMENT DASHBOARD --- */}
      {(canViewFinancials || canViewOperationalStats) && (
      <div className="space-y-8">
          {/* 1. KEY METRICS (NOW USING REAL DB STATS) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
                <div className="flex justify-between items-start mb-2"><div className="bg-red-50 p-2 rounded-lg text-red-600"><ShoppingBag className="w-5 h-5"/></div><span className="text-xs font-bold text-red-600 uppercase tracking-wider bg-red-50 px-2 py-1 rounded">RECIBIDOS</span></div>
                <div className="text-3xl font-bold text-slate-800">{loadingBranchCounts ? '...' : branchCounts?.store || 0}</div><p className="text-xs text-slate-500">Equipos en Venta</p>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between border-l-4 border-l-orange-500">
                <div className="flex justify-between items-start mb-2"><div className="bg-orange-50 p-2 rounded-lg text-orange-600"><Clock className="w-5 h-5"/></div><span className="text-xs font-black text-orange-600 uppercase tracking-widest">PENDIENTES...</span></div>
                <div className="text-3xl font-bold text-slate-800">{loadingBranchCounts ? '...' : branchCounts?.pending || 0}</div><p className="text-xs text-slate-500">Por Revisar</p>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
                <div className="flex justify-between items-start mb-2"><div className="bg-indigo-50 p-2 rounded-lg text-indigo-600"><Wrench className="w-5 h-5"/></div><span className="text-xs font-bold text-slate-400 uppercase">Reparación</span></div>
                <div className="text-3xl font-bold text-slate-800">{loadingBranchCounts ? '...' : branchCounts?.inRepair || 0}</div><p className="text-xs text-slate-500">En Proceso</p>
            </div>
            {canViewFinancials && (
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-2"><div className="bg-green-50 p-2 rounded-lg text-green-600"><CheckCircle2 className="w-5 h-5"/></div><span className="text-xs font-bold text-slate-400 uppercase">Ingresos Hist.</span></div>
                  <div className="text-3xl font-bold text-slate-800 tracking-tight">{loadingStats ? '...' : `$${realStats?.totalRevenue.toLocaleString()}`}</div><p className="text-xs text-slate-500">Total Facturado</p>
              </div>
            )}
          </div>

          {/* 2. SALES PERFORMANCE & PROJECTIONS */}
          {canViewFinancials && advancedData && (
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
                          
                          {idx === 0 && (item.data as any).t1 !== undefined && (item.data as any).t4 !== undefined && (
                              <div className="flex gap-4 mb-3 text-xs">
                                  <div className="flex items-center gap-1">
                                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                      <span className="text-slate-500">T1:</span>
                                      <span className="font-bold text-slate-700">${Math.floor((item.data as any).t1).toLocaleString()}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                      <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                                      <span className="text-slate-500">T4:</span>
                                      <span className="font-bold text-slate-700">${Math.floor((item.data as any).t4).toLocaleString()}</span>
                                  </div>
                              </div>
                          )}

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
          {canViewOperationalStats && advancedData && (
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

          {/* 4. NEW ANALYTICS: TOP MODELS & WARRANTIES */}
          {canViewOperationalStats && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* TOP MODELS */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <div className="flex items-center justify-between mb-6">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2">
                          <Rocket className="w-5 h-5 text-blue-500" />
                          Top 3 Modelos (Este Mes)
                      </h3>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Volumen de Entrada</span>
                  </div>
                  <div className="space-y-4">
                      {topModels.length > 0 ? topModels.map((m, i) => (
                          <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-black text-lg ${i === 0 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                  {i + 1}
                              </div>
                              <div className="flex-1">
                                  <p className="font-bold text-slate-800">{m.model}</p>
                                  <p className="text-xs text-slate-500">{m.count} ingresos este mes</p>
                              </div>
                              <div className="text-right">
                                  <div className="text-xl font-black text-slate-800">{m.count}</div>
                                  <div className="text-[9px] font-bold text-slate-400 uppercase">Órdenes</div>
                              </div>
                          </div>
                      )) : (
                          <p className="text-center py-8 text-slate-400 italic">No hay datos suficientes este mes.</p>
                      )}
                  </div>
              </div>

              {/* WARRANTY REPORT */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <div className="flex items-center justify-between mb-6">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2">
                          <ShieldCheck className="w-5 h-5 text-red-500" />
                          Reporte de Garantías
                      </h3>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Calidad de Reparación</span>
                  </div>
                  <div className="space-y-4">
                      {warrantyReport.length > 0 ? warrantyReport.slice(0, 3).map((w, i) => {
                          const user = users.find(u => u.id === w.techId);
                          return (
                              <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden">
                                      {user?.avatar ? <img src={user.avatar} alt="" className="w-full h-full object-cover" /> : <User className="w-5 h-5 text-slate-400" />}
                                  </div>
                                  <div className="flex-1">
                                      <p className="font-bold text-slate-800">{user?.name || 'Técnico'}</p>
                                      <div className="flex items-center gap-2 mt-1">
                                          <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                              <div 
                                                  className={`h-full rounded-full ${w.warrantyRate > 10 ? 'bg-red-500' : 'bg-green-500'}`}
                                                  style={{ width: `${Math.min(100, w.warrantyRate * 5)}%` }}
                                              />
                                          </div>
                                          <span className={`text-[10px] font-black ${w.warrantyRate > 10 ? 'text-red-600' : 'text-green-600'}`}>
                                              {w.warrantyRate.toFixed(1)}%
                                          </span>
                                      </div>
                                  </div>
                                  <div className="text-right">
                                      <div className="text-xl font-black text-slate-800">{w.totalWarranties}</div>
                                      <div className="text-[9px] font-bold text-slate-400 uppercase">Garantías</div>
                                  </div>
                              </div>
                          );
                      }) : (
                          <p className="text-center py-8 text-slate-400 italic">No hay garantías registradas.</p>
                      )}
                  </div>
              </div>
          </div>
          )}

          {/* 5. AI PROFITABILITY ANALYSIS */}
          {canViewFinancials && aiAnalysis && (
          <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-12 opacity-10">
                  <Zap className="w-64 h-64" />
              </div>
              <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                      <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
                          <Rocket className="w-8 h-8 text-white" />
                      </div>
                      <div>
                          <h2 className="text-2xl font-black">Análisis de Rentabilidad IA</h2>
                          <p className="text-indigo-100 text-sm">Reporte mensual generado por Darwin AI</p>
                      </div>
                  </div>

                  <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
                      {loadingAiAnalysis ? (
                          <div className="flex flex-col items-center justify-center py-12">
                              <Loader2 className="w-10 h-10 animate-spin mb-4" />
                              <p className="font-bold animate-pulse">Darwin está analizando tus márgenes...</p>
                          </div>
                      ) : aiAnalysis ? (
                          <div className="prose prose-invert max-w-none">
                              <div className="markdown-body bg-transparent text-white">
                                  <Markdown>{aiAnalysis}</Markdown>
                              </div>
                          </div>
                      ) : (
                          <p className="text-center py-8 text-indigo-200 italic">No hay suficientes datos de ventas este mes para realizar un análisis.</p>
                      )}
                  </div>

                  <div className="mt-6 flex flex-wrap gap-4">
                      {profitabilityData.slice(0, 3).map((p, i) => (
                          <div key={i} className="bg-white/5 rounded-xl px-4 py-2 border border-white/10">
                              <span className="text-[10px] font-bold text-indigo-200 uppercase block">{p.model}</span>
                              <span className={`text-sm font-black ${p.margin < 20 ? 'text-red-300' : 'text-green-300'}`}>
                                  Margen: {p.margin.toFixed(1)}%
                              </span>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
          )}

          {/* 6. CHARTS SECTION (REAL DATA) */}
          {canViewFinancials && (
          loadingStats ? (
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
                                      { name: 'Pendiente', value: branchCounts?.pending || 0, color: '#ef4444' },
                                      { name: 'En Reparación', value: branchCounts?.inRepair || 0, color: '#3b82f6' },
                                      { name: 'En Tienda', value: branchCounts?.store || 0, color: '#8b5cf6' },
                                      { name: 'Reparado', value: branchCounts?.repaired || 0, color: '#22c55e' }
                                  ]}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={80}
                                  paddingAngle={5}
                                  dataKey="value"
                              >
                                  {[
                                      { name: 'Pendiente', value: branchCounts?.pending || 0, color: '#ef4444' },
                                      { name: 'En Reparación', value: branchCounts?.inRepair || 0, color: '#3b82f6' },
                                      { name: 'En Tienda', value: branchCounts?.store || 0, color: '#8b5cf6' },
                                      { name: 'Reparado', value: branchCounts?.repaired || 0, color: '#22c55e' }
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
            )
          )}

          {canViewFinancials && !loadingStats && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
               <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-orange-500"/> Ingresos por Sucursal</h3>
                  <div className="h-64 w-full" style={{ minHeight: '250px' }}>
                      <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={[
                              { name: 'T4 (Principal)', value: realStats?.revenueByBranch?.t4 || 0 },
                              { name: 'T1 (Secundaria)', value: realStats?.revenueByBranch?.t1 || 0 }
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
      {/* TECH POINTS MODAL */}
      {selectedTechForPoints && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <div>
                          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                              <Trophy className="w-6 h-6 text-yellow-500" />
                              Detalle de Puntos
                          </h2>
                          <p className="text-sm text-slate-500 font-medium mt-1">
                              {users.find(u => u.id === selectedTechForPoints)?.name || 'Técnico'}
                          </p>
                      </div>
                      <button 
                          onClick={() => setSelectedTechForPoints(null)}
                          className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                      >
                          <X className="w-6 h-6 text-slate-500" />
                      </button>
                  </div>
                  
                  <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
                      {loadingTechPoints ? (
                          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                              <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
                              <p className="font-medium">Cargando detalles...</p>
                          </div>
                      ) : techPointsDetails.length > 0 ? (
                          <div className="space-y-3">
                              {techPointsDetails.map((order, i) => (
                                  <div 
                                      key={i} 
                                      onClick={() => {
                                          setSelectedTechForPoints(null);
                                          navigate(`/orders/${order.id}`);
                                      }}
                                      className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer flex items-center justify-between group"
                                  >
                                      <div className="flex items-center gap-4">
                                          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                              <Wrench className="w-5 h-5" />
                                          </div>
                                          <div>
                                              <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                                  {order.deviceModel}
                                                  <span className="text-[10px] font-mono text-slate-400 font-normal">#{order.readable_id || order.id.slice(-4)}</span>
                                              </h4>
                                              <p className="text-xs text-slate-500 font-medium mt-0.5">
                                                  Completado: {new Date(order.completedAt).toLocaleDateString()}
                                              </p>
                                          </div>
                                      </div>
                                      <div className="flex items-center gap-4">
                                          <div className="text-right">
                                              <p className="text-lg font-black text-green-600">+{order.earnedPoints}</p>
                                              <p className="text-[9px] font-bold text-slate-400 uppercase">Puntos</p>
                                          </div>
                                          <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                                      </div>
                                  </div>
                              ))}
                          </div>
                      ) : (
                          <div className="text-center py-12 text-slate-500">
                              <p className="font-medium">No se encontraron órdenes con puntos para este técnico en la quincena actual.</p>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export const Dashboard = DashboardComponent;
