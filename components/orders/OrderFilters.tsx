
import React, { useState, useEffect } from 'react';
import { Search, PlusCircle, RefreshCw, LayoutGrid, List, LayoutDashboard, User, ShoppingBag, ShieldAlert, Truck, History, Database, LayoutList, CheckSquare, Wrench } from 'lucide-react';
import { useOrders } from '../../contexts/OrderContext';
import { useAuth } from '../../contexts/AuthContext';
import { UserRole } from '../../types';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';

interface OrderFiltersProps {
  onDbFix: () => void;
  counts: {
    all: number;
    active_taller: number;
    clients: number;
    store: number;
    warranty: number;
    history: number;
    external: number;
    mine: number;
    tech_pending?: number;
  };
}

export const OrderFilters: React.FC<OrderFiltersProps> = ({ onDbFix, counts }) => {
  const { 
    searchTerm, setSearchTerm, 
    filterTab, setFilterTab, 
    viewMode, setViewMode, 
    sortBy, setSortBy,
    externalFilter, setExternalFilter
  } = useOrders();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);

  const isSupervisor = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.SUB_ADMIN || currentUser?.role === UserRole.MONITOR;

  useEffect(() => {
    if (!isSupervisor) return;

    const fetchPendingCount = async () => {
      try {
        let localQuery = supabase
          .from('accounting_transactions')
          .select('*', { count: 'exact', head: true })
          .eq('approval_status', 'PENDING')
          .gte('created_at', '2026-03-19T00:00:00Z');

        let orderQuery = supabase
          .from('floating_expenses')
          .select('*', { count: 'exact', head: true })
          .eq('approval_status', 'PENDING')
          .neq('description', 'RECEIPT_UPLOAD_TRIGGER')
          .gte('created_at', '2026-03-19T00:00:00Z');

        if (currentUser?.branch) {
          localQuery = localQuery.eq('branch', currentUser.branch);
          orderQuery = orderQuery.eq('branch_id', currentUser.branch);
        }

        const { count: localCount } = await localQuery;
        const { count: orderCount } = await orderQuery;

        setPendingCount((localCount || 0) + (orderCount || 0));
      } catch (error) {
        console.warn("Error fetching pending count:", error);
      }
    };

    fetchPendingCount();
    
    // Optional: set up real-time subscription if needed, but simple fetch is okay for now
  }, [currentUser]);

  return (
    <div className="space-y-6 mb-8">
      {/* SEARCH AND HEADER SECTION */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 sm:gap-6">
        <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
            <div className="p-2 sm:p-3 bg-blue-600 rounded-xl sm:rounded-2xl text-white shadow-lg sm:shadow-xl shadow-blue-200 shrink-0">
                <LayoutList className="w-6 h-6 sm:w-8 sm:h-8" />
            </div>
            <div className="min-w-0">
                <h1 className="text-xl sm:text-3xl font-black text-slate-900 tracking-tight truncate">Control de Equipos</h1>
                <p className="text-xs sm:text-sm text-slate-500 font-medium truncate">Priorización y flujo de taller en tiempo real.</p>
            </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full xl:w-auto">
          <div className="relative flex-1 min-w-[200px] sm:min-w-[300px] group">
            <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 sm:w-5 sm:h-5 group-focus-within:text-blue-500 transition-colors" />
            <input 
              placeholder="Buscar por # Orden, Cliente, Imei o Modelo..." 
              className="w-full pl-9 sm:pl-12 pr-3 sm:pr-4 py-2.5 sm:py-3 bg-white border border-slate-200 rounded-xl sm:rounded-2xl text-xs sm:text-sm outline-none focus:ring-4 focus:ring-blue-100 transition-all shadow-sm font-medium"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex bg-white p-1 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm shrink-0">
              <button 
                onClick={() => setViewMode('CARDS')} 
                className={`p-1.5 sm:p-2 rounded-lg sm:rounded-xl transition-all ${viewMode === 'CARDS' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`} 
                title="Vista de Tarjetas"
              >
                <LayoutGrid className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <button 
                onClick={() => setViewMode('TABLE')} 
                className={`p-1.5 sm:p-2 rounded-lg sm:rounded-xl transition-all ${viewMode === 'TABLE' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`} 
                title="Vista de Tabla Densa"
              >
                <List className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
          </div>

          {isSupervisor && (
              <button onClick={() => navigate('/cash', { state: { activeTab: 'APPROVALS' } })} className="relative w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-red-600 text-white rounded-xl sm:rounded-2xl hover:bg-red-700 transition flex items-center justify-center gap-2 sm:gap-3 text-xs sm:text-sm font-black shadow-lg sm:shadow-xl shadow-red-200">
                <CheckSquare className="w-4 h-4 sm:w-5 sm:h-5" /> APROBAR GASTOS
                {pendingCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-white text-red-600 border-2 border-red-600 text-xs font-black px-2 py-0.5 rounded-full shadow-md animate-pulse">
                    {pendingCount}
                  </span>
                )}
              </button>
          )}
        </div>
      </div>

      {/* FILTER TABS */}
      <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3 sm:gap-4">
          <div className="flex bg-white p-1 rounded-xl sm:rounded-2xl border border-slate-200 w-full lg:w-auto shadow-sm overflow-x-auto custom-scrollbar no-scrollbar">
            {[
              { id: 'TALLER', label: 'TALLER', icon: LayoutDashboard, count: counts.active_taller },
              { id: 'PENDIENTES_TECNICOS', label: 'Pendientes Técnicos', icon: Wrench, count: counts.tech_pending || 0, colorClass: 'bg-gradient-to-r from-orange-500 to-amber-600' },
              { id: 'CLIENTES', label: 'Clientes', icon: User, count: counts.clients },
              { id: 'RECIBIDOS', label: 'Recibidos', icon: ShoppingBag, isStore: true, count: counts.store }, 
              { id: 'GARANTIAS', label: 'Garantías', icon: ShieldAlert, count: counts.warranty },
              { id: 'EXTERNAL', label: 'Externo', icon: Truck, count: counts.external },
              { id: 'HISTORIAL', label: 'Entregados', icon: History, count: counts.history },
              { id: 'ALL', label: 'Todos', icon: List, count: counts.all }
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setFilterTab(tab.id)}
                className={`px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black tracking-wide flex items-center gap-1.5 sm:gap-2 transition-all whitespace-nowrap shrink-0 ${filterTab === tab.id ? (tab.colorClass ? `${tab.colorClass} text-white shadow-md sm:shadow-lg` : tab.isStore ? 'bg-gradient-to-r from-red-600 to-red-800 text-white shadow-md sm:shadow-lg shadow-red-200' : 'bg-blue-600 text-white shadow-md sm:shadow-lg') : (tab.isStore ? 'text-red-600 hover:bg-red-50' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700')}`}
              >
                {React.createElement(tab.icon, { className: "w-3 h-3 sm:w-4 sm:h-4" })} 
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.label.split('/')[0]}</span>
                {tab.count > 0 && (
                  <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[8px] font-bold ${filterTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 sm:gap-3 w-full lg:w-auto">
              <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest hidden sm:inline shrink-0">Ordenar por:</span>
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value)} 
                className="flex-1 lg:flex-none bg-white border border-slate-200 rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 text-xs font-black text-slate-700 outline-none shadow-sm focus:ring-2 focus:ring-blue-100 w-full"
              >
                  <option value="PRIORITY">🔥 Prioridad Urgente</option>
                  <option value="DEADLINE">⌛ Próximos a Vencer</option>
                  <option value="NEWEST">🆕 Recién Ingresados</option>
                  <option value="ID">🔢 Número de Orden</option>
              </select>
          </div>
      </div>
      {/* EXTERNAL WORKSHOP FILTER SUB-BAR */}
      {filterTab === 'EXTERNAL' && (
          <div className="animate-in slide-in-from-top-2">
              <div className="bg-white p-2 rounded-2xl shadow-sm border border-purple-100 flex flex-wrap gap-2 items-center justify-center md:justify-start">
                  <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest px-3 hidden md:inline-block">Filtrar por Taller:</span>
                  {[
                      { id: 'ALL', label: 'TODOS' },
                      { id: 'BRENY NIZAO', label: 'BRENY NIZAO' },
                      { id: 'JUNIOR BARON', label: 'JUNIOR BARON' },
                      { id: 'OTRO', label: 'OTROS TALLERES' }
                  ].map(ws => (
                      <button
                          key={ws.id}
                          onClick={() => setExternalFilter(ws.id)}
                          className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all ${externalFilter === ws.id ? 'bg-purple-600 text-white shadow-lg shadow-purple-200 scale-105' : 'bg-purple-50 text-purple-600 hover:bg-purple-100'}`}
                      >
                          {ws.label}
                      </button>
                  ))}
              </div>
          </div>
      )}
    </div>
  );
};
