
import React, { useMemo, useState } from 'react';
import { useOrders } from '../contexts/OrderContext';
import { useAuth } from '../contexts/AuthContext';
import { OrderType, OrderStatus, UserRole } from '../types';
import { ShoppingBag, DollarSign, Package, TrendingUp, Search, PlusCircle, Calendar, Hash, ArrowUpCircle, ArrowDownCircle, ArrowDownAZ, ArrowUpAZ, History, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// --- INTELLIGENT NORMALIZER ---
const normalizeForSearch = (s: string) => {
    return s.toLowerCase()
      .replace(/\biphone\b/g, '')
      .replace(/pro\s*max|promax|pm|p\s*max/g, 'pm')
      .replace(/\s+/g, '');
};

type SortOption = 'NEWEST' | 'OLDEST' | 'MODEL_AZ' | 'MODEL_ZA' | 'INVEST_HIGH' | 'INVEST_LOW' | 'PROFIT_HIGH' | 'ID_DESC';

const StoreStockComponent: React.FC = () => {
  const { orders } = useOrders();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('NEWEST');

  const myBranch = currentUser?.branch || 'T4';
  const isAdmin = currentUser?.role === UserRole.ADMIN;

  const filteredItems = useMemo(() => 
    orders.filter(o => {
        if (o.orderType !== OrderType.STORE || o.status === OrderStatus.RETURNED) return false;
        if (!isAdmin && o.currentBranch !== myBranch) return false;

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            const normTerm = normalizeForSearch(term);
            const normModel = normalizeForSearch(o.deviceModel || '');
            
            return (
                o.deviceModel.toLowerCase().includes(term) ||
                normModel.includes(normTerm) || 
                o.id.toLowerCase().includes(term) ||
                (o.readable_id && o.readable_id.toString().includes(term))
            );
        }
        return true;
    }),
  [orders, myBranch, isAdmin, searchTerm]);

  const sortedItems = useMemo(() => {
      return [...filteredItems].sort((a, b) => {
          const costA = (a.purchaseCost || a.estimatedCost || 0) + (a.partsCost || 0);
          const costB = (b.purchaseCost || b.estimatedCost || 0) + (b.partsCost || 0);
          const profitA = (a.targetPrice || 0) - costA;
          const profitB = (b.targetPrice || 0) - costB;

          switch (sortBy) {
              case 'NEWEST': return b.createdAt - a.createdAt;
              case 'OLDEST': return a.createdAt - b.createdAt;
              case 'MODEL_AZ': return a.deviceModel.localeCompare(b.deviceModel, undefined, { numeric: true });
              case 'MODEL_ZA': return b.deviceModel.localeCompare(a.deviceModel, undefined, { numeric: true });
              case 'INVEST_HIGH': return costB - costA;
              case 'INVEST_LOW': return costA - costB;
              case 'PROFIT_HIGH': return profitB - profitA;
              case 'ID_DESC': return (b.readable_id || 0) - (a.readable_id || 0);
              default: return 0;
          }
      });
  }, [filteredItems, sortBy]);

  const totalItems = sortedItems.length;
  const totalInvested = sortedItems.reduce((sum, item) => sum + (item.purchaseCost || item.estimatedCost || 0) + (item.partsCost || 0), 0);
  const potentialRevenue = sortedItems.reduce((sum, item) => sum + (item.targetPrice || item.finalPrice || item.estimatedCost || 0), 0); 
  const potentialProfit = potentialRevenue - totalInvested;

  const SortButton = ({ type, label, icon: Icon, activeColor }: { type: SortOption, label: string, icon: any, activeColor: string }) => (
      <button onClick={() => setSortBy(type)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border whitespace-nowrap ${sortBy === type ? `${activeColor} text-white shadow-md transform scale-105` : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
          <Icon className="w-3.5 h-3.5" /> {label}
      </button>
  );

  return (
    <div className="p-6 max-w-[1600px] mx-auto min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-r from-red-600 to-red-800 text-white p-3 rounded-xl shadow-lg shadow-red-200"><ShoppingBag className="w-8 h-8" /></div>
          <div><h1 className="text-3xl font-bold text-red-700 tracking-tight">EQUIPOS RECIBIDOS</h1><p className="text-slate-500 font-medium">Inventario de equipos propios.</p></div>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input placeholder="Buscar modelo, ID..." className="w-full pl-9 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-100 outline-none shadow-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
            </div>
            {currentUser?.role !== UserRole.TECHNICIAN && (
                <button onClick={() => navigate('/intake')} className="bg-red-800 hover:bg-red-900 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-md transition whitespace-nowrap"><PlusCircle className="w-5 h-5" /> Nuevo Ingreso</button>
            )}
        </div>
      </div>

      <div className="mb-6 overflow-x-auto pb-2 custom-scrollbar">
          <div className="flex gap-2 min-w-max">
              <span className="text-xs font-bold text-slate-400 uppercase flex items-center px-2">Ordenar por:</span>
              <SortButton type="MODEL_AZ" label="Modelo A-Z" icon={ArrowDownAZ} activeColor="bg-slate-700 border-slate-700" />
              <SortButton type="MODEL_ZA" label="Modelo Z-A" icon={ArrowUpAZ} activeColor="bg-slate-700 border-slate-700" />
              <div className="w-px h-8 bg-slate-200 mx-1"></div>
              <SortButton type="NEWEST" label="Recientes" icon={Calendar} activeColor="bg-blue-600 border-blue-600" />
              <SortButton type="OLDEST" label="Antigüedad" icon={History} activeColor="bg-orange-500 border-orange-500" />
              <div className="w-px h-8 bg-slate-200 mx-1"></div>
              <SortButton type="INVEST_HIGH" label="Mayor Inversión" icon={ArrowUpCircle} activeColor="bg-red-600 border-red-600" />
              <SortButton type="INVEST_LOW" label="Menor Inversión" icon={ArrowDownCircle} activeColor="bg-green-600 border-green-600" />
              <SortButton type="PROFIT_HIGH" label="Mejor Margen" icon={TrendingUp} activeColor="bg-green-600 border-green-600" />
              <div className="w-px h-8 bg-slate-200 mx-1"></div>
              <SortButton type="ID_DESC" label="Nº Orden" icon={Hash} activeColor="bg-purple-600 border-purple-600" />
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
         <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between"><div><p className="text-slate-500 text-[10px] font-bold uppercase">Equipos Listados</p><h3 className="text-3xl font-black text-slate-800">{totalItems}</h3></div><div className="bg-slate-100 p-3 rounded-full text-slate-600"><Package className="w-6 h-6" /></div></div>
         <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between"><div><p className="text-slate-500 text-[10px] font-bold uppercase">Inversión Actual</p><h3 className="text-3xl font-black text-slate-800">${totalInvested.toLocaleString()}</h3></div><div className="bg-red-50 p-3 rounded-full text-red-600"><DollarSign className="w-6 h-6" /></div></div>
         <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between"><div><p className="text-slate-500 text-[10px] font-bold uppercase">Retorno Proyectado</p><h3 className="text-3xl font-black text-blue-600">${potentialRevenue.toLocaleString()}</h3></div><div className="bg-blue-50 p-3 rounded-full text-blue-600"><TrendingUp className="w-6 h-6" /></div></div>
         <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between"><div><p className="text-slate-500 text-[10px] font-bold uppercase">Margen Ganancia</p><h3 className={`text-3xl font-black ${potentialProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>${potentialProfit.toLocaleString()}</h3></div><div className="bg-green-50 p-3 rounded-full text-green-600"><DollarSign className="w-6 h-6" /></div></div>
      </div>

      {sortedItems.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200"><div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4"><AlertCircle className="w-8 h-8 text-slate-300" /></div><h3 className="text-lg font-bold text-slate-700">Inventario Vacío</h3></div>
      ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in duration-500">
             {sortedItems.map(item => {
                 const purchasePrice = item.purchaseCost || item.estimatedCost || 0;
                 const expenses = item.partsCost || 0;
                 const totalItemCost = purchasePrice + expenses;
                 const target = item.targetPrice || 0;
                 const margin = target - totalItemCost;
                 return (
                <div key={item.id} onClick={() => navigate(`/orders/${item.id}`)} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all group flex flex-col">
                   <div className="relative h-48 bg-slate-100 overflow-hidden shrink-0"><img src={item.devicePhoto} alt={item.deviceModel} className="w-full h-full object-cover group-hover:scale-110 transition-transform" /><div className="absolute top-3 right-3 bg-white/90 backdrop-blur px-2 py-1 rounded-lg text-xs font-black shadow-sm font-mono">#{item.readable_id || item.id.slice(-4)}</div></div>
                   <div className="p-5 flex-1 flex flex-col"><h3 className="font-bold text-slate-800 text-lg mb-1 truncate" title={item.deviceModel}>{item.deviceModel}</h3><p className="text-xs text-slate-500 mb-3 line-clamp-2">{item.deviceCondition || 'Condición no especificada'}</p>
                      <div className="mt-auto pt-3 border-t border-slate-100 grid grid-cols-2 gap-4"><div><p className="text-[9px] font-bold text-slate-400 uppercase">Inversión</p><p className="font-bold text-slate-800 text-base">${totalItemCost.toLocaleString()}</p></div><div className="text-right"><p className="text-[9px] font-bold text-slate-400 uppercase">Venta</p><p className="font-bold text-green-600 text-xl">${target.toLocaleString()}</p></div></div>
                      <div className="mt-2 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden"><div className={`h-full ${margin > 0 ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, Math.max(5, (margin / (target || 1)) * 100))}%` }}></div></div>
                   </div>
                </div>
             );})}
          </div>
      )}
    </div>
  );
};

export const StoreStock = StoreStockComponent;
