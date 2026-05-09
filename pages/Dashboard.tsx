
import React, { useMemo, useState, useCallback } from 'react';
import { useOrders } from '../contexts/OrderContext';
import { useAuth } from '../contexts/AuthContext';
import { UserRole, OrderStatus, DashboardStats } from '../types';
import { 
  Trophy, Star, AlertCircle, LayoutDashboard, 
  ShoppingBag, CheckCircle2, 
  Clock, DollarSign, Activity, X, ChevronRight, FileSearch, Wrench, User, ArrowRightLeft, Eye, XCircle, TrendingUp, CalendarClock, Target, BellRing, MessageSquare, Split, HandCoins, Reply, ShieldCheck, Crown, Zap, Rocket, BarChart3, PieChart as PieIcon, ExternalLink, LineChart, Users, Building2, CalendarDays, CalendarRange, Loader2, Smartphone, Lightbulb, Package, Store, Tag
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
  fetchProfitabilityData,
  fetchSalesDetails,
  fetchOrdersByModel,
  fetchWarrantiesByTech,
  fetchFlowDetails
} from '../services/analytics';
import { analyzeProfitability } from '../services/geminiService';
import { orderService } from '../services/orderService';
import Markdown from 'react-markdown';

const DashboardComponent: React.FC = () => {
  const navigate = useNavigate();
  const { users, currentUser } = useAuth();
  
  // Modals state
  const [selectedSalesPeriod, setSelectedSalesPeriod] = useState<'DAY' | 'WEEK' | 'MONTH' | 'ALL' | null>(null);
  const [selectedFlowPeriod, setSelectedFlowPeriod] = useState<'DAY' | 'WEEK' | 'MONTH' | null>(null);
  const [selectedOrderTab, setSelectedOrderTab] = useState<'STORE' | 'PENDING' | 'IN_REPAIR' | null>(null);
  const [selectedModelForOrders, setSelectedModelForOrders] = useState<string | null>(null);
  const [selectedTechForWarranties, setSelectedTechForWarranties] = useState<string | null>(null);

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
        .neq('description', 'RECEIPT_UPLOAD_TRIGGER')
        .eq('approval_status', 'APPROVED');
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
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);

  const { data: techPointsDetails = [], isLoading: loadingTechPoints } = useQuery({
    queryKey: ['tech-points', selectedTechForPoints],
    queryFn: () => fetchTechnicianPointsDetails(selectedTechForPoints!),
    enabled: !!selectedTechForPoints,
  });

  const { data: salesDetails = [], isLoading: loadingSalesDetails } = useQuery({
    queryKey: ['sales-details', selectedSalesPeriod],
    queryFn: () => fetchSalesDetails(selectedSalesPeriod!),
    enabled: !!selectedSalesPeriod,
  });

  const salesByBranch = useMemo(() => {
    if (!salesDetails || salesDetails.length === 0) return {};
    const grouped: Record<string, { items: any[], total: number }> = {};
    salesDetails.forEach((sale: any) => {
      // Group by Area (Taller vs Inventario) and Branch
      const branch = sale.branch || 'OTRO';
      const isInventory = sale.source_type?.startsWith('POS') || sale.source_type === 'INVENTORY';
      const category = isInventory ? `Inventario (${branch})` : `Taller (${branch})`;
      
      if (!grouped[category]) {
        grouped[category] = { items: [], total: 0 };
      }
      grouped[category].items.push(sale);
      grouped[category].total += Number(sale.gross_amount) || sale.amount || 0;
    });
    return grouped;
  }, [salesDetails]);

  const { data: orderTabDetails = [], isLoading: loadingOrderTabDetails } = useQuery({
    queryKey: ['order-tab-details', selectedOrderTab, currentUser?.id, currentUser?.branch, currentUser?.role],
    queryFn: () => orderService.getOrdersByTab(currentUser!.id, currentUser!.branch || 'T4', currentUser!.role, selectedOrderTab!),
    enabled: !!selectedOrderTab && !!currentUser,
  });

  const { data: modelOrders = [], isLoading: loadingModelOrders } = useQuery({
    queryKey: ['model-orders', selectedModelForOrders],
    queryFn: () => fetchOrdersByModel(selectedModelForOrders!),
    enabled: !!selectedModelForOrders,
  });

  const { data: techWarranties = [], isLoading: loadingTechWarranties } = useQuery({
    queryKey: ['tech-warranties', selectedTechForWarranties],
    queryFn: () => fetchWarrantiesByTech(selectedTechForWarranties!),
    enabled: !!selectedTechForWarranties,
  });

  const { data: flowDetails = { in: [], out: [] }, isLoading: loadingFlowDetails } = useQuery({
    queryKey: ['flow-details', selectedFlowPeriod],
    queryFn: () => fetchFlowDetails(selectedFlowPeriod!),
    enabled: !!selectedFlowPeriod,
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

      {/* --- TECHNICIAN PERFORMANCE & TIPS (ONLY FOR TECHS) --- */}
      {currentUser?.role === UserRole.TECHNICIAN && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* Performance & Commissions */}
          <div className="lg:col-span-2 bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-3 bg-blue-600 rounded-2xl text-white shadow-lg shadow-blue-100">
                <Target className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-800">Mi Rendimiento y Comisiones</h2>
                <p className="text-slate-500 text-sm font-medium">Seguimiento de tus metas quincenales.</p>
              </div>
            </div>

            {(() => {
              const myEntry = leaderboard.find(e => e.techId === currentUser.id);
              const points = myEntry?.points || 0;
              
              let rate = 150;
              let nextGoal = 60;
              let nextRate = 200;

              if (points >= 70) {
                rate = 250;
                nextGoal = 100; // Arbitrary next goal
                nextRate = 250;
              } else if (points >= 60) {
                rate = 200;
                nextGoal = 70;
                nextRate = 250;
              }

              const totalCommission = points * rate;
              const pointsToNextGoal = Math.max(0, nextGoal - points);
              const progress = Math.min(100, (points / nextGoal) * 100);

              return (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 relative overflow-hidden group">
                      <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Trophy className="w-24 h-24 text-slate-900" />
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-widest">Puntos Acumulados</p>
                      <div className="text-4xl font-black text-slate-800">{points}</div>
                    </div>
                    <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 relative overflow-hidden group">
                      <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <DollarSign className="w-24 h-24 text-blue-900" />
                      </div>
                      <p className="text-[10px] font-bold text-blue-400 uppercase mb-2 tracking-widest">Valor por Punto</p>
                      <div className="text-4xl font-black text-blue-600">${rate}</div>
                    </div>
                    <div className="bg-green-50 p-6 rounded-2xl border border-green-100 relative overflow-hidden group">
                      <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <TrendingUp className="w-24 h-24 text-green-900" />
                      </div>
                      <p className="text-[10px] font-bold text-green-400 uppercase mb-2 tracking-widest">Comisión Acumulada</p>
                      <div className="text-4xl font-black text-green-600">${totalCommission.toLocaleString()}</div>
                    </div>
                  </div>

                  <div className="bg-slate-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-xl">
                    <div className="absolute top-0 right-0 p-8 opacity-10">
                      <Rocket className="w-32 h-32" />
                    </div>
                    <div className="relative z-10">
                      <div className="flex justify-between items-end mb-4">
                        <div>
                          <p className="text-lg font-bold text-white">Progreso hacia meta de {nextGoal} puntos</p>
                          <p className="text-sm text-slate-400">Al llegar a {nextGoal}, cada punto valdrá <span className="font-bold text-blue-400">${nextRate}</span></p>
                        </div>
                        <div className="text-right">
                          <span className="text-3xl font-black text-blue-400">{points}</span>
                          <span className="text-slate-500 font-bold text-xl"> / {nextGoal}</span>
                        </div>
                      </div>
                      <div className="w-full h-4 bg-white/10 rounded-full overflow-hidden backdrop-blur-sm border border-white/5">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(37,99,235,0.5)]"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      {pointsToNextGoal > 0 && (
                        <div className="mt-6 flex items-center gap-3 bg-white/5 p-4 rounded-2xl border border-white/10">
                          <div className="p-2 bg-yellow-500/20 rounded-lg">
                            <Zap className="w-5 h-5 text-yellow-400" />
                          </div>
                          <p className="text-sm text-slate-300 font-medium">
                            Te faltan <span className="font-black text-white text-lg">{pointsToNextGoal} puntos</span> para subir de nivel de comisión. ¡Sigue así!
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-100">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-widest">Rango de Puntos</th>
                          <th className="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-widest">Pago por Punto</th>
                          <th className="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-widest">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className={`border-b border-slate-50 transition-colors ${points < 60 ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}>
                          <td className="px-6 py-4 font-bold text-slate-700">0 - 59 puntos</td>
                          <td className="px-6 py-4 font-black text-slate-800">$150</td>
                          <td className="px-6 py-4">{points < 60 ? <span className="text-[10px] bg-blue-600 text-white px-3 py-1 rounded-full font-black shadow-md shadow-blue-100">ACTUAL</span> : <div className="bg-green-100 p-1 rounded-full w-fit"><CheckCircle2 className="w-4 h-4 text-green-600"/></div>}</td>
                        </tr>
                        <tr className={`border-b border-slate-50 transition-colors ${points >= 60 && points < 70 ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}>
                          <td className="px-6 py-4 font-bold text-slate-700">60 - 69 puntos</td>
                          <td className="px-6 py-4 font-black text-slate-800">$200</td>
                          <td className="px-6 py-4">{points >= 60 && points < 70 ? <span className="text-[10px] bg-blue-600 text-white px-3 py-1 rounded-full font-black shadow-md shadow-blue-100">ACTUAL</span> : points >= 70 ? <div className="bg-green-100 p-1 rounded-full w-fit"><CheckCircle2 className="w-4 h-4 text-green-600"/></div> : null}</td>
                        </tr>
                        <tr className={`transition-colors ${points >= 70 ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}>
                          <td className="px-6 py-4 font-bold text-slate-700">70+ puntos</td>
                          <td className="px-6 py-4 font-black text-slate-800">$250</td>
                          <td className="px-6 py-4">{points >= 70 ? <span className="text-[10px] bg-blue-600 text-white px-3 py-1 rounded-full font-black shadow-md shadow-blue-100">ACTUAL</span> : null}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Tips Section */}
          <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-3 bg-yellow-500 rounded-2xl text-white shadow-lg shadow-yellow-100">
                <Lightbulb className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-800">Tips Pro</h2>
                <p className="text-slate-500 text-sm font-medium">Mejora tu rendimiento.</p>
              </div>
            </div>
            <div className="space-y-6 flex-1">
              {[
                { tip: "Mantén tu área limpia para evitar pérdidas de tornillos.", icon: Smartphone, color: 'blue' },
                { tip: "Documenta el estado inicial con fotos claras.", icon: Eye, color: 'purple' },
                { tip: "Pide ayuda si una reparación se complica (divide puntos).", icon: Users, color: 'emerald' },
                { tip: "Revisa garantías para aprender de errores comunes.", icon: ShieldCheck, color: 'rose' },
                { tip: "Llegar a 60 pts sube tu pago a $200 por punto.", icon: TrendingUp, color: 'amber' },
                { tip: "Superar 70 pts sube tu pago a $250 por punto.", icon: Rocket, color: 'indigo' }
              ].map((item, i) => (
                <div key={i} className="flex gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all group">
                  <div className={`p-2 bg-white rounded-xl shadow-sm group-hover:scale-110 transition-transform`}>
                    <item.icon className={`w-5 h-5 text-slate-400 group-hover:text-blue-500`} />
                  </div>
                  <p className="text-sm text-slate-600 font-bold leading-relaxed group-hover:text-slate-800 transition-colors">{item.tip}</p>
                </div>
              ))}
            </div>
            
            <div className="mt-8 p-6 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl text-white shadow-lg">
                <p className="text-xs font-bold uppercase tracking-widest opacity-70 mb-2">Proyección Sugerida</p>
                <p className="text-sm font-medium leading-relaxed">
                    Si reparas <span className="font-black">4 equipos diarios</span> de 1 punto, alcanzarás la meta de 60 puntos en solo 15 días.
                </p>
            </div>
          </div>
        </div>
      )}

      {/* --- ADMIN & MANAGEMENT DASHBOARD --- */}
      {(canViewFinancials || canViewOperationalStats) && (
      <div className="space-y-8">
          {/* 1. KEY METRICS (NOW USING REAL DB STATS) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            <div 
              className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedOrderTab('STORE')}
            >
                <div className="flex justify-between items-start mb-2"><div className="bg-red-50 p-2 rounded-lg text-red-600"><ShoppingBag className="w-5 h-5"/></div><span className="text-xs font-bold text-red-600 uppercase tracking-wider bg-red-50 px-2 py-1 rounded">RECIBIDOS</span></div>
                <div className="text-3xl font-bold text-slate-800">{loadingBranchCounts ? '...' : branchCounts?.store || 0}</div><p className="text-xs text-slate-500">Equipos en Venta</p>
            </div>
            <div 
              className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between border-l-4 border-l-orange-500 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedOrderTab('PENDING')}
            >
                <div className="flex justify-between items-start mb-2"><div className="bg-orange-50 p-2 rounded-lg text-orange-600"><Clock className="w-5 h-5"/></div><span className="text-xs font-black text-orange-600 uppercase tracking-widest">PENDIENTES...</span></div>
                <div className="text-3xl font-bold text-slate-800">{loadingBranchCounts ? '...' : branchCounts?.pending || 0}</div><p className="text-xs text-slate-500">Por Revisar</p>
            </div>
            <div 
              className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedOrderTab('IN_REPAIR')}
            >
                <div className="flex justify-between items-start mb-2"><div className="bg-indigo-50 p-2 rounded-lg text-indigo-600"><Wrench className="w-5 h-5"/></div><span className="text-xs font-bold text-slate-400 uppercase">Reparación</span></div>
                <div className="text-3xl font-bold text-slate-800">{loadingBranchCounts ? '...' : branchCounts?.inRepair || 0}</div><p className="text-xs text-slate-500">En Proceso</p>
            </div>
            {canViewFinancials && (
              <div 
                className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedSalesPeriod('ALL')}
              >
                  <div className="flex justify-between items-start mb-2"><div className="bg-green-50 p-2 rounded-lg text-green-600"><CheckCircle2 className="w-5 h-5"/></div><span className="text-xs font-bold text-slate-400 uppercase">Ingresos Hist.</span></div>
                  <div className="text-3xl font-bold text-slate-800 tracking-tight">{loadingStats ? '...' : `$${realStats?.totalRevenue.toLocaleString()}`}</div><p className="text-xs text-slate-500">Total Facturado</p>
              </div>
            )}
          </div>

          {/* 2. SALES PERFORMANCE & PROJECTIONS */}
          {canViewFinancials && advancedData && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                  { label: 'Ventas Hoy', period: 'DAY', data: advancedData.sales.day, icon: CalendarDays, color: 'blue' },
                  { label: 'Ventas Semana', period: 'WEEK', data: advancedData.sales.week, icon: CalendarRange, color: 'indigo' },
                  { label: 'Ventas Mes', period: 'MONTH', data: advancedData.sales.month, icon: CalendarClock, color: 'purple' }
              ].map((item, idx) => (
                  <div key={idx} 
                       className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden group cursor-pointer hover:shadow-md transition-shadow"
                       onClick={() => setSelectedSalesPeriod(item.period as any)}
                  >
                      <div className="relative z-10">
                          <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
                                  <item.icon className={`w-4 h-4 text-${item.color}-500`} /> {item.label}
                              </div>
                          </div>
                          <div className="flex items-baseline gap-2 mb-1">
                              <span className="text-3xl font-black text-slate-800">${Math.floor(item.data.current).toLocaleString()}</span>
                              <span className="text-xs font-bold text-slate-400">ventas</span>
                          </div>
                          <div className="flex items-baseline gap-2 mb-3">
                              <span className="text-xl font-bold text-emerald-600">${Math.floor(item.data.profit).toLocaleString()}</span>
                              <span className="text-[10px] font-bold text-emerald-500 uppercase">ganancia</span>
                          </div>
                          
                          {(item.data as any).currentTaller !== undefined && (item.data as any).currentInventario !== undefined && (
                              <div className="flex gap-4 mb-3 text-xs border-b border-slate-100 pb-3">
                                  <div className="flex flex-col gap-1">
                                      <div className="flex items-center gap-1">
                                          <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                                          <span className="text-slate-500">Taller:</span>
                                          <span className="font-bold text-slate-700">${Math.floor((item.data as any).currentTaller).toLocaleString()}</span>
                                      </div>
                                  </div>
                                  <div className="flex flex-col gap-1">
                                      <div className="flex items-center gap-1">
                                          <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                                          <span className="text-slate-500">Inventario:</span>
                                          <span className="font-bold text-slate-700">${Math.floor((item.data as any).currentInventario).toLocaleString()}</span>
                                      </div>
                                  </div>
                              </div>
                          )}

                          {(item.data as any).t1 !== undefined && (item.data as any).t4 !== undefined && (
                              <div className="flex gap-4 mb-3 text-xs">
                                  <div className="flex flex-col gap-1">
                                      <div className="flex items-center gap-1">
                                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                          <span className="text-slate-500">T1:</span>
                                          <span className="font-bold text-slate-700">${Math.floor((item.data as any).t1).toLocaleString()}</span>
                                      </div>
                                      <span className="text-[9px] font-bold text-emerald-600 ml-3">+${Math.floor((item.data as any).profitT1).toLocaleString()}</span>
                                  </div>
                                  <div className="flex flex-col gap-1">
                                      <div className="flex items-center gap-1">
                                          <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                                          <span className="text-slate-500">T4:</span>
                                          <span className="font-bold text-slate-700">${Math.floor((item.data as any).t4).toLocaleString()}</span>
                                      </div>
                                      <span className="text-[9px] font-bold text-emerald-600 ml-3">+${Math.floor((item.data as any).profitT4).toLocaleString()}</span>
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
                              <div className={`text-xs font-bold text-emerald-600 mt-1`}>
                                  Ganancia: ${Math.floor(item.data.projectedProfit).toLocaleString()}
                              </div>
                          </div>
                      </div>
                  </div>
              ))}

              {/* 4th Card: Historical Sales & Profit */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
                  <div className="relative z-10 h-full flex flex-col">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
                          <BarChart3 className="w-4 h-4 text-slate-500" /> Meses Anteriores
                      </div>
                      <div className="flex-1 flex flex-col justify-between gap-2">
                          {advancedData.sales.history.slice(-5).map((h: any, i: number) => (
                              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                                  <div className="flex flex-col">
                                      <span className="text-xs font-bold text-slate-700 capitalize">{h.month}</span>
                                      <div className="flex gap-2 text-[9px] font-bold text-slate-400 mt-1">
                                          <span>Taller: <span className="text-orange-500">${Math.floor(h.taller || 0).toLocaleString()}</span></span>
                                          <span>Inv: <span className="text-teal-500">${Math.floor(h.inventario || 0).toLocaleString()}</span></span>
                                      </div>
                                      <div className="flex gap-2 text-[9px] font-bold text-slate-400 mt-0.5">
                                          <span>T1: ${Math.floor(h.t1).toLocaleString()}</span>
                                          <span>T4: ${Math.floor(h.t4).toLocaleString()}</span>
                                      </div>
                                  </div>
                                  <div className="flex flex-col items-end">
                                      <span className="text-sm font-black text-slate-800">${Math.floor(h.total).toLocaleString()}</span>
                                      <span className="text-[10px] font-bold text-emerald-600">+${Math.floor(h.profit).toLocaleString()}</span>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>

          </div>
          )}

          {/* 3. ORDER FLOW (IN vs OUT) */}
          {canViewOperationalStats && advancedData && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                  { label: 'Flujo Hoy', data: advancedData.flow.day, icon: ArrowRightLeft, color: 'emerald', period: 'DAY' as const },
                  { label: 'Flujo Semana', data: advancedData.flow.week, icon: Activity, icon2: TrendingUp, color: 'amber', period: 'WEEK' as const },
                  { label: 'Flujo Mes', data: advancedData.flow.month, icon: BarChart3, color: 'rose', period: 'MONTH' as const }
              ].map((item, idx) => (
                  <div 
                      key={idx} 
                      className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 cursor-pointer hover:shadow-md hover:border-blue-300 transition-all"
                      onClick={() => setSelectedFlowPeriod(item.period)}
                  >
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
                          <div 
                              key={i} 
                              className="flex items-center gap-4 p-3 rounded-xl bg-slate-50 border border-slate-100 cursor-pointer hover:shadow-sm hover:border-blue-300 transition-all group"
                              onClick={() => setSelectedModelForOrders(m.model)}
                          >
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-black text-lg transition-colors ${i === 0 ? 'bg-blue-600 text-white group-hover:bg-blue-700' : 'bg-slate-200 text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-600'}`}>
                                  {i + 1}
                              </div>
                              <div className="flex-1">
                                  <p className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{m.model}</p>
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
                              <div 
                                  key={i} 
                                  className="flex items-center gap-4 p-3 rounded-xl bg-slate-50 border border-slate-100 cursor-pointer hover:shadow-sm hover:border-red-300 transition-all group"
                                  onClick={() => setSelectedTechForWarranties(w.techId)}
                              >
                                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden">
                                      {user?.avatar ? <img src={user.avatar} alt="" className="w-full h-full object-cover" /> : <User className="w-5 h-5 text-slate-400" />}
                                  </div>
                                  <div className="flex-1">
                                      <p className="font-bold text-slate-800 group-hover:text-red-600 transition-colors">{user?.name || 'Técnico'}</p>
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
                                                  {order.originalPointsAwarded != null && order.pointsAwarded !== order.originalPointsAwarded && (
                                                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                                                          order.pointsAwarded < order.originalPointsAwarded 
                                                          ? 'bg-red-100 text-red-600 border border-red-200' 
                                                          : 'bg-blue-100 text-blue-600 border border-blue-200'
                                                      }`}>
                                                          {order.pointsAwarded < order.originalPointsAwarded ? <AlertCircle className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                                                          {order.pointsAwarded < order.originalPointsAwarded ? 'REDUCIDO' : 'EDITADO'}
                                                      </span>
                                                  )}
                                              </h4>
                                              <p className="text-xs text-slate-500 font-medium mt-0.5">
                                                  Completado: {new Date(order.completedAt).toLocaleDateString()}
                                              </p>
                                              {order.originalPointsAwarded != null && order.pointsAwarded < order.originalPointsAwarded && (
                                                  <p className="text-[10px] text-red-500 font-bold mt-1 flex items-center gap-1">
                                                      <AlertCircle className="w-3 h-3" />
                                                      Originalmente: {order.originalPointsAwarded} pts
                                                  </p>
                                              )}
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
      {/* --- MODALS --- */}
      {/* Sales Details Modal */}
      {selectedSalesPeriod && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in duration-200">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                      <div>
                          <h3 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                              <CalendarDays className="w-7 h-7 text-blue-500" />
                              Detalles de Ventas
                          </h3>
                          <p className="text-sm text-slate-500 font-medium mt-1">
                              {selectedSalesPeriod === 'DAY' ? 'Ventas de Hoy' : selectedSalesPeriod === 'WEEK' ? 'Ventas de la Semana' : selectedSalesPeriod === 'MONTH' ? 'Ventas del Mes' : 'Ventas Históricas'}
                          </p>
                      </div>
                      <button 
                          onClick={() => setSelectedSalesPeriod(null)}
                          className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                      >
                          <X className="w-6 h-6 text-slate-500" />
                      </button>
                  </div>
                  
                  <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
                      {loadingSalesDetails ? (
                          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                              <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
                              <p className="font-medium">Cargando detalles...</p>
                          </div>
                      ) : Object.keys(salesByBranch).length > 0 ? (
                          <div className="space-y-8">
                              {['T4', 'T1', 'OTRO'].map((sucursal) => {
                                  const invKey = `Inventario (${sucursal})`;
                                  const talKey = `Taller (${sucursal})`;

                                  const invData = salesByBranch[invKey];
                                  const talData = salesByBranch[talKey];

                                  if (!invData && !talData) return null;

                                  const renderSaleCard = (sale: any, i: number) => {
                                      const isWorkshop = sale.source_type === 'WORKSHOP' || sale.source_type === 'WORKSHOP_REFUND';
                                      const isRefund = sale.is_refund;
                                      const navId = sale.order_id || sale.navigation_id;
                                      
                                      return (
                                          <div 
                                              key={i} 
                                              onClick={() => {
                                                  if (isWorkshop && navId) {
                                                      setSelectedSalesPeriod(null);
                                                      navigate(`/orders/${navId}`);
                                                  } else if (!isWorkshop && navId && navId !== 'PRODUCT_SALE' && navId !== 'GASTO_LOCAL' && navId !== 'MANUAL_TX') {
                                                      setSelectedSalesPeriod(null);
                                                      navigate(`/orders/${navId}`);
                                                  } else {
                                                      setSelectedTransaction(sale);
                                                  }
                                              }}
                                              className={`bg-white p-4 rounded-2xl border ${isRefund ? 'border-red-200' : 'border-slate-200'} shadow-sm transition-all flex items-center justify-between hover:shadow-md cursor-pointer group`}
                                          >
                                              <div className="flex items-center gap-4">
                                                  <div className={`w-10 h-10 rounded-xl ${isRefund ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'} flex items-center justify-center shrink-0`}>
                                                      <DollarSign className="w-5 h-5" />
                                                  </div>
                                                  <div>
                                                      <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                                          {sale.description || 'Venta'}
                                                      </h4>
                                                      <p className="text-xs text-slate-500 font-medium mt-0.5 flex gap-2">
                                                          <span>{new Date(sale.created_at).toLocaleString()}</span>
                                                          <span className="text-[10px] text-slate-400">#{sale.order_readable_id || navId?.slice(0,8) || 'N/A'}</span>
                                                      </p>
                                                  </div>
                                              </div>
                                              <div className="flex items-center gap-4">
                                                  <div className="text-right">
                                                      <p className={`text-sm font-black ${isRefund ? 'text-red-600' : 'text-slate-800'}`}>
                                                          ${(Number(sale.gross_amount) || sale.amount || 0).toLocaleString()}
                                                      </p>
                                                      <div className="flex flex-col items-end mt-1">
                                                          <span className="text-[10px] text-slate-400">Costo: ${(Number(sale.cost_amount) || 0).toLocaleString()}</span>
                                                          <span className={`text-[10px] font-bold ${isRefund ? 'text-red-500' : 'text-emerald-500'}`}>Ganancia: ${(Number(sale.net_profit) || 0).toLocaleString()}</span>
                                                          <span className="text-[9px] font-bold text-slate-400 uppercase mt-1">
                                                             {sale.payment_method || sale.method || 'N/A'} {isRefund ? '(DEVOLUCIÓN)' : ''}
                                                          </span>
                                                      </div>
                                                  </div>
                                                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                                              </div>
                                          </div>
                                      );
                                  };

                                  return (
                                      <div key={sucursal} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                                          <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
                                              <Store className="w-6 h-6 text-blue-500" />
                                              Sucursal {sucursal}
                                          </h3>
                                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                              {/* Inventario Column */}
                                              <div>
                                                  <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center justify-between mb-4">
                                                      <span className="flex items-center gap-2"><Package className="w-5 h-5 text-teal-500" /> Inventario</span>
                                                      <span className="text-sm font-bold text-slate-700 bg-teal-50 text-teal-700 px-3 py-1 rounded-full border border-teal-100">${(invData?.total || 0).toLocaleString()}</span>
                                                  </h4>
                                                  <div className="space-y-3">
                                                      {invData?.items?.length > 0 ? (
                                                          invData.items.map(renderSaleCard)
                                                      ) : (
                                                          <div className="text-center py-6 bg-slate-50 rounded-2xl border border-slate-100 border-dashed">
                                                              <p className="text-sm text-slate-400 font-medium">No hay ventas de inventario</p>
                                                          </div>
                                                      )}
                                                  </div>
                                              </div>

                                              {/* Taller Column */}
                                              <div>
                                                  <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center justify-between mb-4">
                                                      <span className="flex items-center gap-2"><Wrench className="w-5 h-5 text-orange-500" /> Taller</span>
                                                      <span className="text-sm font-bold text-slate-700 bg-orange-50 text-orange-700 px-3 py-1 rounded-full border border-orange-100">${(talData?.total || 0).toLocaleString()}</span>
                                                  </h4>
                                                  <div className="space-y-3">
                                                      {talData?.items?.length > 0 ? (
                                                          talData.items.map(renderSaleCard)
                                                      ) : (
                                                          <div className="text-center py-6 bg-slate-50 rounded-2xl border border-slate-100 border-dashed">
                                                              <p className="text-sm text-slate-400 font-medium">No hay cobros de taller</p>
                                                          </div>
                                                      )}
                                                  </div>
                                              </div>
                                          </div>
                                      </div>
                                  );
                              })}
                          </div>
                      ) : (
                          <div className="text-center py-12 text-slate-500">
                              <p className="font-medium">No se encontraron ventas en este período.</p>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* Order Tab Details Modal */}
      {selectedOrderTab && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in duration-200">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                      <div>
                          <h3 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                              {selectedOrderTab === 'STORE' ? <ShoppingBag className="w-7 h-7 text-red-500" /> : 
                               selectedOrderTab === 'PENDING' ? <Clock className="w-7 h-7 text-orange-500" /> : 
                               <Wrench className="w-7 h-7 text-indigo-500" />}
                              {selectedOrderTab === 'STORE' ? 'Equipos en Venta' : 
                               selectedOrderTab === 'PENDING' ? 'Órdenes Pendientes' : 
                               'Órdenes en Reparación'}
                          </h3>
                          <p className="text-sm text-slate-500 font-medium mt-1">
                              Listado de órdenes
                          </p>
                      </div>
                      <button 
                          onClick={() => setSelectedOrderTab(null)}
                          className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                      >
                          <X className="w-6 h-6 text-slate-500" />
                      </button>
                  </div>
                  
                  <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
                      {loadingOrderTabDetails ? (
                          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                              <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
                              <p className="font-medium">Cargando órdenes...</p>
                          </div>
                      ) : orderTabDetails.length > 0 ? (
                          <div className="space-y-3">
                              {orderTabDetails.map((order: any, i: number) => (
                                  <div 
                                      key={i} 
                                      onClick={() => {
                                          setSelectedOrderTab(null);
                                          navigate(`/orders/${order.id}`);
                                      }}
                                      className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer flex items-center justify-between group"
                                  >
                                      <div className="flex items-center gap-4">
                                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors
                                              ${selectedOrderTab === 'STORE' ? 'bg-red-50 text-red-600 group-hover:bg-red-600 group-hover:text-white' : 
                                                selectedOrderTab === 'PENDING' ? 'bg-orange-50 text-orange-600 group-hover:bg-orange-600 group-hover:text-white' : 
                                                'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white'}`}
                                          >
                                              {selectedOrderTab === 'STORE' ? <ShoppingBag className="w-5 h-5" /> : 
                                               selectedOrderTab === 'PENDING' ? <Clock className="w-5 h-5" /> : 
                                               <Wrench className="w-5 h-5" />}
                                          </div>
                                          <div>
                                              <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                                  {order.deviceModel}
                                                  <span className="text-[10px] font-mono text-slate-400 font-normal">#{order.readable_id || order.id.slice(-4)}</span>
                                              </h4>
                                              <p className="text-xs text-slate-500 font-medium mt-0.5">
                                                  {order.issue}
                                              </p>
                                          </div>
                                      </div>
                                      <div className="flex items-center gap-4">
                                          <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                                      </div>
                                  </div>
                              ))}
                          </div>
                      ) : (
                          <div className="text-center py-12 text-slate-500">
                              <p className="font-medium">No se encontraron órdenes.</p>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}
      {/* Top Models Orders Modal */}
      {selectedModelForOrders && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in duration-200">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                      <div>
                          <h3 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                              <Rocket className="w-7 h-7 text-blue-500" />
                              {selectedModelForOrders}
                          </h3>
                          <p className="text-sm text-slate-500 font-medium mt-1">
                              Órdenes de este modelo en el mes actual
                          </p>
                      </div>
                      <button 
                          onClick={() => setSelectedModelForOrders(null)}
                          className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                      >
                          <X className="w-6 h-6 text-slate-500" />
                      </button>
                  </div>
                  
                  <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
                      {loadingModelOrders ? (
                          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                              <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
                              <p className="font-medium">Cargando detalles...</p>
                          </div>
                      ) : modelOrders.length > 0 ? (
                          <div className="space-y-3">
                              {modelOrders.map((order: any, i: number) => (
                                  <div 
                                      key={i} 
                                      onClick={() => {
                                          setSelectedModelForOrders(null);
                                          navigate(`/orders/${order.id}`);
                                      }}
                                      className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer flex items-center justify-between group"
                                  >
                                      <div className="flex items-center gap-4">
                                          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                              <Smartphone className="w-5 h-5" />
                                          </div>
                                          <div>
                                              <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                                  {order.deviceModel}
                                                  <span className="text-[10px] font-mono text-slate-400 font-normal">#{order.readable_id || order.id.slice(-4)}</span>
                                              </h4>
                                              <p className="text-xs text-slate-500 font-medium mt-0.5">
                                                  {order.issue}
                                              </p>
                                          </div>
                                      </div>
                                      <div className="flex items-center gap-4">
                                          <div className="text-right">
                                              <p className="text-[10px] font-bold text-slate-400 uppercase">{new Date(order.createdAt).toLocaleDateString()}</p>
                                          </div>
                                          <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                                      </div>
                                  </div>
                              ))}
                          </div>
                      ) : (
                          <div className="text-center py-12 text-slate-500">
                              <p className="font-medium">No se encontraron órdenes para este modelo.</p>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* Warranties by Tech Modal */}
      {selectedTechForWarranties && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in duration-200">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                      <div>
                          <h3 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                              <ShieldCheck className="w-7 h-7 text-red-500" />
                              Garantías de {users.find(u => u.id === selectedTechForWarranties)?.name || 'Técnico'}
                          </h3>
                          <p className="text-sm text-slate-500 font-medium mt-1">
                              Órdenes marcadas como garantía
                          </p>
                      </div>
                      <button 
                          onClick={() => setSelectedTechForWarranties(null)}
                          className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                      >
                          <X className="w-6 h-6 text-slate-500" />
                      </button>
                  </div>
                  
                  <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
                      {loadingTechWarranties ? (
                          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                              <Loader2 className="w-8 h-8 animate-spin mb-4 text-red-500" />
                              <p className="font-medium">Cargando detalles...</p>
                          </div>
                      ) : techWarranties.length > 0 ? (
                          <div className="space-y-3">
                              {techWarranties.map((order: any, i: number) => (
                                  <div 
                                      key={i} 
                                      onClick={() => {
                                          setSelectedTechForWarranties(null);
                                          navigate(`/orders/${order.id}`);
                                      }}
                                      className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-red-300 transition-all cursor-pointer flex items-center justify-between group"
                                  >
                                      <div className="flex items-center gap-4">
                                          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-600 shrink-0 group-hover:bg-red-600 group-hover:text-white transition-colors">
                                              <ShieldCheck className="w-5 h-5" />
                                          </div>
                                          <div>
                                              <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                                  {order.deviceModel}
                                                  <span className="text-[10px] font-mono text-slate-400 font-normal">#{order.readable_id || order.id.slice(-4)}</span>
                                              </h4>
                                              <p className="text-xs text-slate-500 font-medium mt-0.5">
                                                  {order.issue}
                                              </p>
                                          </div>
                                      </div>
                                      <div className="flex items-center gap-4">
                                          <div className="text-right">
                                              <p className="text-[10px] font-bold text-slate-400 uppercase">{new Date(order.createdAt).toLocaleDateString()}</p>
                                          </div>
                                          <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-red-500 transition-colors" />
                                      </div>
                                  </div>
                              ))}
                          </div>
                      ) : (
                          <div className="text-center py-12 text-slate-500">
                              <p className="font-medium">No se encontraron garantías para este técnico.</p>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}
      {/* Flow Details Modal */}
      {selectedFlowPeriod && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in duration-200">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                      <div>
                          <h3 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                              <ArrowRightLeft className="w-7 h-7 text-emerald-500" />
                              Detalles de Flujo ({selectedFlowPeriod === 'DAY' ? 'Hoy' : selectedFlowPeriod === 'WEEK' ? 'Semana' : 'Mes'})
                          </h3>
                          <p className="text-sm text-slate-500 font-medium mt-1">
                              Equipos que entraron y salieron en este periodo
                          </p>
                      </div>
                      <button 
                          onClick={() => setSelectedFlowPeriod(null)}
                          className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                      >
                          <X className="w-6 h-6 text-slate-500" />
                      </button>
                  </div>
                  
                  <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
                      {loadingFlowDetails ? (
                          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                              <Loader2 className="w-8 h-8 animate-spin mb-4 text-emerald-500" />
                              <p className="font-medium">Cargando detalles...</p>
                          </div>
                      ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {/* Entradas */}
                              <div>
                                  <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                      Entradas ({flowDetails.in.length})
                                  </h4>
                                  <div className="space-y-3">
                                      {flowDetails.in.length > 0 ? flowDetails.in.map((order: any, i: number) => (
                                          <div 
                                              key={i} 
                                              onClick={() => {
                                                  setSelectedFlowPeriod(null);
                                                  navigate(`/orders/${order.id}`);
                                              }}
                                              className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer flex items-center justify-between group"
                                          >
                                              <div className="flex items-center gap-4">
                                                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                                      <Smartphone className="w-5 h-5" />
                                                  </div>
                                                  <div>
                                                      <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                                          {order.deviceModel}
                                                          <span className="text-[10px] font-mono text-slate-400 font-normal">#{order.readable_id || order.id.slice(-4)}</span>
                                                      </h4>
                                                      <p className="text-xs text-slate-500 font-medium mt-0.5 truncate max-w-[150px]">
                                                          {order.issue}
                                                      </p>
                                                  </div>
                                              </div>
                                              <div className="flex items-center gap-3">
                                                  <div className="text-right">
                                                      <p className="text-[10px] font-bold text-slate-400 uppercase">{new Date(order.createdAt).toLocaleDateString()}</p>
                                                  </div>
                                                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                                              </div>
                                          </div>
                                      )) : (
                                          <div className="text-center py-8 text-slate-500 bg-white rounded-2xl border border-slate-200 border-dashed">
                                              <p className="font-medium text-sm">No hay entradas en este periodo.</p>
                                          </div>
                                      )}
                                  </div>
                              </div>

                              {/* Salidas */}
                              <div>
                                  <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                      <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                      Salidas ({flowDetails.out.length})
                                  </h4>
                                  <div className="space-y-3">
                                      {flowDetails.out.length > 0 ? flowDetails.out.map((order: any, i: number) => (
                                          <div 
                                              key={i} 
                                              onClick={() => {
                                                  setSelectedFlowPeriod(null);
                                                  navigate(`/orders/${order.id}`);
                                              }}
                                              className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all cursor-pointer flex items-center justify-between group"
                                          >
                                              <div className="flex items-center gap-4">
                                                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                                      <CheckCircle2 className="w-5 h-5" />
                                                  </div>
                                                  <div>
                                                      <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                                          {order.deviceModel}
                                                          <span className="text-[10px] font-mono text-slate-400 font-normal">#{order.readable_id || order.id.slice(-4)}</span>
                                                      </h4>
                                                      <p className="text-xs text-slate-500 font-medium mt-0.5 truncate max-w-[150px]">
                                                          {order.issue}
                                                      </p>
                                                  </div>
                                              </div>
                                              <div className="flex items-center gap-3">
                                                  <div className="text-right">
                                                      <p className="text-[10px] font-bold text-slate-400 uppercase">{new Date(order.completedAt).toLocaleDateString()}</p>
                                                  </div>
                                                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-emerald-500 transition-colors" />
                                              </div>
                                          </div>
                                      )) : (
                                          <div className="text-center py-8 text-slate-500 bg-white rounded-2xl border border-slate-200 border-dashed">
                                              <p className="font-medium text-sm">No hay salidas en este periodo.</p>
                                          </div>
                                      )}
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}
      
      {/* TRANSACTION DETAILS MODAL (FOR STATIC / LEGACY PORT SALES) */}
      {selectedTransaction && (
         <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
             <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in duration-200">
                 <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                     <div className="flex items-center gap-3">
                         <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
                             <Package className="w-6 h-6" />
                         </div>
                         <div>
                             <h3 className="text-xl font-black text-slate-800">Detalles de Venta y Facturación</h3>
                             <p className="text-sm font-medium text-slate-500">
                                 {selectedTransaction.order_type === 'PART_ONLY' ? 'Preventa / Mostrador' : 'Venta de Inventario'}
                                 {selectedTransaction.order_readable_id ? ` • #${selectedTransaction.order_readable_id}` : ''}
                             </p>
                         </div>
                     </div>
                     <button 
                         onClick={() => setSelectedTransaction(null)}
                         className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500"
                     >
                         <X className="w-6 h-6" />
                     </button>
                 </div>
                 <div className="p-6 space-y-6 overflow-y-auto bg-white">
                     {/* Resumen */}
                     <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <span className="text-sm font-bold text-slate-400 uppercase tracking-wider block">Monto Pagado</span>
                                <span className="text-3xl font-black text-emerald-600">${selectedTransaction.amount?.toLocaleString()}</span>
                            </div>
                            
                            {/* Cálculo de Rentabilidad Global */}
                            <div className="text-right">
                                {(() => {
                                    const exps = selectedTransaction.order_expenses || [];
                                    const costOfGoods = exps.reduce((acc: number, e: any) => acc + (e.partCost || 0), 0);
                                    if (costOfGoods > 0) {
                                        const profit = selectedTransaction.amount - costOfGoods;
                                        const margin = (profit / selectedTransaction.amount) * 100;
                                        return (
                                            <>
                                                <span className="text-sm font-bold text-slate-400 uppercase tracking-wider block">Beneficio</span>
                                                <span className="text-xl font-black text-blue-600">
                                                    ${profit.toLocaleString()} <span className="text-sm text-slate-500 font-medium">({margin.toFixed(0)}%)</span>
                                                </span>
                                            </>
                                        );
                                    }
                                    return <span className="text-sm font-medium text-slate-400">Sin datos de costo global</span>;
                                })()}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 border-t border-slate-200/60 pt-4">
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase mb-1">Método de Pago</p>
                                <p className="text-sm font-bold text-slate-800 bg-white px-3 py-1.5 rounded-lg border border-slate-200 inline-block uppercase">
                                    {selectedTransaction.method || 'CASH'}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase mb-1">Fecha de Cobro</p>
                                <p className="text-sm font-bold text-slate-800 bg-white px-3 py-1.5 rounded-lg border border-slate-200 inline-block">
                                    {new Date(selectedTransaction.created_at).toLocaleString()}
                                </p>
                            </div>
                            <div className="col-span-2 md:col-span-1">
                                <p className="text-xs font-bold text-slate-400 uppercase mb-1">Facturado por</p>
                                <div className="flex items-center gap-2 text-sm font-bold text-slate-800 bg-white px-3 py-2 rounded-lg border border-slate-200 w-fit">
                                    <User className="w-4 h-4 text-slate-400" />
                                    {selectedTransaction.cashier_name || 'Sistema'}
                                </div>
                            </div>
                        </div>
                     </div>
                     
                     {/* Detalle (Artículos) */}
                     <div>
                         <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                             <Tag className="w-4 h-4 text-slate-400" /> Relación de Artículos Vendidos
                         </h4>
                         
                         {selectedTransaction.order_expenses && selectedTransaction.order_expenses.length > 0 ? (
                             <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                                 {selectedTransaction.order_expenses.map((exp: any, i: number) => {
                                     // Lógica de Descuentos y Variaciones de Precio
                                     // exp.price es el PVP original o el precio estándar.
                                     // exp.cost es el monto FINAL cobrado por el artículo
                                     // exp.partCost es el costo interno para el taller
                                     
                                     const pvp = exp.price || exp.cost || 0;
                                     const charged = exp.cost || 0;
                                     const internalCost = exp.partCost || 0;
                                     const discount = pvp - charged;
                                     const itemProfit = charged - internalCost;
                                     
                                     return (
                                     <div key={i} className="p-4 bg-white hover:bg-slate-50 transition-colors">
                                         <div className="flex justify-between items-start mb-2">
                                             <div>
                                                 <p className="font-bold text-slate-800 text-sm">{exp.description || 'Artículo'}</p>
                                                 {(exp.partId || exp.item_id) && (
                                                     <p className="text-xs text-slate-400 font-mono mt-0.5">SKU/ID: {exp.partId || exp.item_id}</p>
                                                 )}
                                             </div>
                                             <div className="text-right">
                                                 <p className="font-black text-slate-700">${charged.toLocaleString()}</p>
                                                 {discount > 0 && (
                                                     <p className="text-xs font-bold text-red-500 line-through opacity-70">
                                                         ${pvp.toLocaleString()}
                                                     </p>
                                                 )}
                                             </div>
                                         </div>
                                         
                                         {/* Metric Pills */}
                                         <div className="flex items-center gap-2 mt-3 flex-wrap">
                                             {internalCost > 0 ? (
                                                 <>
                                                     <span className="text-[10px] font-bold uppercase tracking-widest bg-slate-100/80 text-slate-600 px-2.5 py-1 rounded-md border border-slate-200 tooltip" title="Costo Interno (Compra)">
                                                         Costo: ${internalCost.toLocaleString()}
                                                     </span>
                                                     <span className="text-[10px] font-bold uppercase tracking-widest bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md border border-blue-200 tooltip">
                                                         Ganancia: ${itemProfit.toLocaleString()}
                                                     </span>
                                                 </>
                                             ) : (
                                                 <span className="text-[10px] font-bold uppercase tracking-widest bg-slate-100 text-slate-400 px-2.5 py-1 rounded-md border border-slate-200">
                                                     Sin costo registrado
                                                 </span>
                                             )}
                                             
                                             {discount > 0 ? (
                                                 <span className="text-[10px] font-bold uppercase tracking-widest bg-amber-50 text-amber-600 px-2.5 py-1 rounded-md border border-amber-200 tooltip">
                                                     Descuento Aplicado: ${discount.toLocaleString()}
                                                 </span>
                                             ) : discount < 0 ? (
                                                 <span className="text-[10px] font-bold uppercase tracking-widest bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-md border border-emerald-200 tooltip" title="Vendido por encima del estándar">
                                                     Premium: +${Math.abs(discount).toLocaleString()}
                                                 </span>
                                             ) : null}
                                         </div>
                                     </div>
                                 )})}
                             </div>
                         ) : (
                             <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm relative overflow-hidden">
                                 <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                                 <p className="font-mono text-sm whitespace-pre-wrap text-slate-700 leading-relaxed font-medium pl-2">
                                     {selectedTransaction.description || 'Venta Libre / POS / Legacy'}
                                 </p>
                                 <p className="text-xs text-slate-400 mt-2 pl-2">Solo existe un concepto global para esta venta. No hay artículos desglosados en el registro clásico.</p>
                             </div>
                         )}
                     </div>
                     
                     <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex gap-3 text-emerald-800">
                         <ShieldCheck className="w-5 h-5 shrink-0" />
                         <p className="text-xs font-medium leading-relaxed">
                             Esta visualización fue solicitada para supervisión y análisis de márgenes en ventas de inventario, permitiendo auditar posibles descuentos y costo base de forma sencilla.
                         </p>
                     </div>
                 </div>
                 <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                     <button 
                         onClick={() => setSelectedTransaction(null)}
                         className="px-6 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-colors"
                     >
                         Cerrar Detalle
                     </button>
                 </div>
             </div>
         </div>
      )}
    </div>
  );
};

export const Dashboard = DashboardComponent;
