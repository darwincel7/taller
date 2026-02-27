
import React, { useState, useMemo, useEffect } from 'react';
import { useOrders } from '../contexts/OrderContext';
import { useAuth } from '../contexts/AuthContext';
import { OrderStatus, PriorityLevel, OrderType, RepairOrder, UserRole } from '../types';
import { 
  Search, PlusCircle, User, AlertTriangle, Smartphone, 
  ArrowRightLeft, CheckCircle2, Loader2, RefreshCw, Filter, 
  LayoutGrid, Clock, MapPin, DollarSign, MousePointer2, 
  AlertCircle, ChevronRight, Trophy, List, HandCoins, 
  XCircle, ArrowUpNarrowWide, LayoutList, Timer, ShieldAlert,
  Wrench, ShoppingBag, History, RotateCcw, Reply, Truck,
  UserCheck, Briefcase, MousePointer, Hand, ChevronDown, MessageSquare, LayoutDashboard, Database
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MiniStatusTimeline } from '../components/MiniStatusTimeline';
import { DbFixModal } from '../components/DbFixModal';
import { fetchActionRequiredOrders } from '../services/alertsService';

type SortOption = 'PRIORITY' | 'DEADLINE' | 'NEWEST' | 'ID';

// ... (Existing helper functions remain same) ...
const normalizeForSearch = (s: string) => {
    return s.toLowerCase()
      .replace(/\s+/g, '') // Remove ALL spaces
      .replace(/-/g, '')   // Remove dashes
      .replace(/\biphone\b/g, '') // Remove common prefix
      .replace(/pro\s*max|promax|pm|p\s*max/g, 'pm');
};

const getTimeLeft = (deadline: number, status?: OrderStatus) => {
    if (status && (status === OrderStatus.RETURNED || status === OrderStatus.REPAIRED || status === OrderStatus.CANCELED)) {
        return { text: 'Finalizado', color: 'text-slate-400', bg: 'bg-slate-50', urgent: false };
    }
    const now = Date.now();
    const diff = deadline - now;
    const isOverdue = diff < 0;
    const absDiff = Math.abs(diff);
    const hours = Math.floor(absDiff / (1000 * 60 * 60));
    const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
    const days = Math.floor(hours / 24);
    if (isOverdue) return { text: `Vencido ${days > 0 ? `${days}d ` : ''}${hours % 24}h`, color: 'text-red-600', bg: 'bg-red-50', urgent: true };
    if (days > 0) return { text: `Faltan ${days}d ${hours % 24}h`, color: 'text-blue-600', bg: 'bg-blue-50', urgent: false };
    if (hours < 3) return { text: `¡Solo ${hours}h ${minutes}m!`, color: 'text-orange-600', bg: 'bg-orange-50', urgent: true };
    return { text: `${hours}h restantes`, color: 'text-slate-600', bg: 'bg-slate-50', urgent: false };
};

const getPriorityStyle = (p: string) => {
    switch (p) {
        case PriorityLevel.CRITICAL: return 'bg-red-600 text-white shadow-red-200';
        case PriorityLevel.HIGH: return 'bg-orange-500 text-white shadow-orange-100';
        case PriorityLevel.LOW: return 'bg-blue-400 text-white shadow-blue-100';
        default: return 'bg-slate-500 text-white';
    }
};

const getStatusBadgeStyle = (status: OrderStatus, isReturn = false) => {
    if (isReturn) return 'bg-red-600 text-white border-red-500 shadow-md animate-pulse';
    if (status === OrderStatus.EXTERNAL) return 'bg-purple-600 text-white border-purple-500 shadow-md';
    switch (status) {
        case OrderStatus.DIAGNOSIS: return 'bg-purple-100 text-purple-700 border-purple-200';
        case OrderStatus.WAITING_APPROVAL: return 'bg-orange-100 text-orange-700 border-orange-200';
        case OrderStatus.IN_REPAIR: return 'bg-blue-50 text-blue-700 border-blue-200';
        case OrderStatus.REPAIRED: return 'bg-green-100 text-green-700 border-green-200';
        case OrderStatus.RETURNED: return 'bg-slate-200 text-slate-600 border-slate-300';
        case OrderStatus.CANCELED: return 'bg-red-100 text-red-700 border-red-200';
        default: return 'bg-slate-100 text-slate-500 border-slate-200';
    }
};

const OrderCard: React.FC<any> = ({ order, onClaim }) => {
    const navigate = useNavigate();
    const { users } = useAuth();
    const timeLeft = getTimeLeft(order.deadline, order.status);
    const assignedUser = users.find(u => u.id === order.assignedTo);
    const isUnassigned = !order.assignedTo;
    const isReturn = order.returnRequest?.status === 'APPROVED' || order.returnRequest?.status === 'PENDING';
    const isStore = order.orderType === OrderType.STORE;
    
    return (
        <div onClick={() => navigate(`/orders/${order.id}`)} className={`bg-white rounded-3xl border shadow-sm hover:shadow-2xl transition-all cursor-pointer group relative overflow-hidden flex flex-col ${order.priority === PriorityLevel.CRITICAL ? 'ring-2 ring-red-100' : ''} ${isReturn ? 'border-l-8 border-l-red-600 bg-red-50/10' : (isUnassigned && !order.externalRepair ? 'border-l-8 border-l-blue-500 bg-gradient-to-br from-blue-50 to-white shadow-lg shadow-blue-100 border-blue-200' : 'border-slate-200')}`}>
            {!isReturn && <div className={`absolute top-0 left-0 bottom-0 w-2 ${getPriorityStyle(order.priority)}`} />}
            <div className="p-6 pl-8 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-4">
                    <div className="flex flex-wrap gap-2">
                        {isReturn ? (
                            <span className="text-[9px] font-black bg-red-600 text-white px-2 py-0.5 rounded-full flex items-center gap-1"><RotateCcw className="w-3 h-3"/> {order.returnRequest?.status === 'PENDING' ? 'SOLICITUD DEVOLUCIÓN' : 'DEVOLUCIÓN'}</span>
                        ) : (
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${getPriorityStyle(order.priority)}`}>{order.priority}</span>
                        )}
                        {isStore && <span className="text-[9px] font-black bg-gradient-to-r from-red-600 to-red-800 text-white px-2 py-0.5 rounded-full shadow-sm">RECIBIDO</span>}
                        {order.orderType === OrderType.WARRANTY && <span className="text-[9px] font-black bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full border border-yellow-200">GARANTÍA</span>}
                        <span className="text-[9px] font-black bg-slate-800 text-white px-2 py-0.5 rounded-full border border-slate-700 shadow-sm uppercase">ORIGEN: {order.branch || 'T4'}</span>
                        {isUnassigned && !isReturn && !order.externalRepair && <span className="text-[9px] font-black bg-blue-500 text-white px-2 py-0.5 rounded-full animate-pulse shadow-md">POR ASIGNAR</span>}
                        {order.externalRepair && (
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 border ${order.externalRepair.status === 'PENDING' ? 'bg-purple-100 text-purple-700 border-purple-200 animate-pulse' : 'bg-purple-600 text-white border-purple-600'}`}><Truck className="w-3 h-3"/> {order.externalRepair.targetWorkshop} {order.externalRepair.status === 'PENDING' ? '(PEND.)' : ''}</span>
                        )}
                    </div>
                    <span className="font-mono text-xs font-black text-slate-300">#{order.readable_id || order.id.slice(-4)}</span>
                </div>
                <h4 className="font-black text-slate-800 text-xl leading-tight mb-2 group-hover:text-blue-600 transition-colors">{order.deviceModel}</h4>
                <div className="space-y-1.5 mb-6">
                    <div className={`flex items-center gap-2 text-sm font-bold ${isStore ? 'text-red-600' : 'text-slate-600'}`}>
                        <User className={`w-4 h-4 ${isStore ? 'text-red-600' : 'text-blue-500'}`} /> {order.customer.name}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400 font-medium"><MapPin className="w-3.5 h-3.5" /> {order.currentBranch}</div>
                </div>
                <div className="mt-auto pt-4 border-t border-slate-100 space-y-4">
                    <div className="flex justify-between items-center">
                        <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider ${getStatusBadgeStyle(order.status, isReturn)}`}>{isReturn ? 'DEVOLUCIÓN' : order.status}</span>
                        <div className="text-right">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">A Cobrar</p>
                            <p className="text-lg font-black text-slate-800 leading-none">${(order.finalPrice || order.estimatedCost || 0).toLocaleString()}</p>
                        </div>
                    </div>
                    <div className={`p-3 rounded-2xl flex items-center justify-between border ${timeLeft.urgent ? 'border-orange-200' : 'border-slate-100'} ${timeLeft.bg}`}>
                        <div className="flex items-center gap-2"><Timer className={`w-4 h-4 ${timeLeft.color} ${timeLeft.urgent ? 'animate-pulse' : ''}`} /><span className={`text-xs font-black ${timeLeft.color}`}>{timeLeft.text}</span></div>
                        {assignedUser ? (
                            <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 shadow-sm">
                                <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] border border-slate-300 font-bold text-slate-700">{assignedUser.avatar}</div>
                                <span className="text-[10px] font-black text-slate-700 uppercase truncate max-w-[80px]">{assignedUser.name.split(' ')[0]}</span>
                            </div>
                        ) : (
                            !isReturn && !order.externalRepair && <button onClick={(e) => onClaim(e, order.id)} className="text-[10px] font-black text-blue-600 hover:underline flex items-center gap-1"><MousePointer2 className="w-3 h-3" /> RECLAMAR</button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const CompactOrderBanner: React.FC<any> = ({ order, onClaim }) => {
    const navigate = useNavigate();
    const timeLeft = getTimeLeft(order.deadline, order.status);
    return (
        <div className="flex items-center gap-2 group">
            <div 
                onClick={() => navigate(`/orders/${order.id}`)}
                className="flex-1 bg-white rounded-xl border border-slate-200 p-3 shadow-sm hover:shadow-md hover:border-blue-300 cursor-pointer flex items-center justify-between"
            >
                <div className="flex items-center gap-4">
                    <div className="flex flex-col items-center justify-center w-10 h-10 bg-slate-100 rounded-lg shrink-0">
                        {order.devicePhoto ? (
                            <img src={order.devicePhoto} className="w-full h-full object-cover rounded-lg" />
                        ) : (
                            <Smartphone className="w-5 h-5 text-slate-400" />
                        )}
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                            {order.deviceModel}
                            <span className="text-[9px] font-normal text-slate-400 font-mono">#{order.readable_id || order.id.slice(-4)}</span>
                        </h4>
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                            <span className="font-medium">{order.customer.name}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${getPriorityStyle(order.priority)}`}>{order.priority}</span>
                            <span className={`text-[10px] ${timeLeft.color}`}>{timeLeft.text}</span>
                        </div>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Costo Est.</p>
                    <p className="text-sm font-black text-slate-700">${(order.finalPrice || order.estimatedCost).toLocaleString()}</p>
                </div>
            </div>
            <button 
                onClick={(e) => onClaim(e, order.id)}
                className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-xl shadow-md transition-all active:scale-95 flex flex-col items-center justify-center w-24 shrink-0"
                title="Reclamar orden"
            >
                <Hand className="w-5 h-5 mb-1" />
                <span className="text-[10px] font-bold uppercase">Asignarme</span>
            </button>
        </div>
    );
};

const ExternalOrderCard: React.FC<any> = ({ order }) => {
    const navigate = useNavigate();
    const isPending = order.externalRepair?.status === 'PENDING';
    const workshop = order.externalRepair?.targetWorkshop || 'DESCONOCIDO';
    
    return (
        <div onClick={() => navigate(`/orders/${order.id}`)} className="bg-white rounded-3xl border border-purple-100 shadow-lg shadow-purple-100/50 hover:shadow-2xl hover:scale-[1.02] transition-all cursor-pointer group relative overflow-hidden flex flex-col h-full">
            <div className={`absolute top-0 left-0 right-0 h-1.5 ${isPending ? 'bg-purple-300 animate-pulse' : 'bg-purple-600'}`} />
            
            <div className="p-6 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-4">
                    <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${isPending ? 'bg-purple-100 text-purple-600 animate-pulse' : 'bg-purple-600 text-white shadow-md shadow-purple-200'}`}>
                        <Truck className="w-3.5 h-3.5" />
                        {isPending ? 'SOLICITUD PENDIENTE' : 'EN TALLER EXTERNO'}
                    </span>
                    <span className="font-mono text-xs font-black text-purple-200">#{order.readable_id || order.id.slice(-4)}</span>
                </div>

                <div className="mb-6 text-center py-4 bg-purple-50/50 rounded-2xl border border-purple-50 group-hover:bg-purple-50 transition-colors">
                    <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-1">Ubicación Actual</p>
                    <h3 className="text-xl font-black text-purple-900 uppercase tracking-tight">{workshop}</h3>
                </div>

                <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200">
                        {order.devicePhoto ? <img src={order.devicePhoto} className="w-full h-full object-cover rounded-2xl" /> : <Smartphone className="w-6 h-6 text-slate-400"/>}
                    </div>
                    <div>
                        <h4 className="font-black text-slate-800 text-sm leading-tight mb-0.5">{order.deviceModel}</h4>
                        <p className="text-xs font-bold text-slate-500">{order.customer.name}</p>
                    </div>
                </div>

                <div className="mt-auto pt-4 border-t border-purple-50 flex justify-between items-center">
                    <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">Enviado hace</span>
                        <span className="text-xs font-black text-slate-700 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-purple-400" />
                            {getTimeLeft(order.externalRepair?.requestedAt || Date.now()).text.replace('restantes', '').replace('Faltan', '')}
                        </span>
                    </div>
                    <button className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center hover:bg-purple-600 hover:text-white transition-all shadow-sm">
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
};

import { ConfirmApprovalModal } from '../components/ConfirmApprovalModal';

export const OrderList: React.FC = () => {
  const { orders, assignOrder, confirmTransfer, validateOrder, updateOrderDetails, updateOrderStatus, resolveExternalRepair, loadMoreOrders, hasMore, isLoadingOrders, searchOrder, addOrderLog, debatePoints } = useOrders();
  const { currentUser, users } = useAuth();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState<string>('TALLER');
  const [viewMode, setViewMode] = useState<'CARDS' | 'TABLE'>(() => {
      return (localStorage.getItem('darwin_list_view') as 'CARDS' | 'TABLE') || 'TABLE';
  });
  const [sortBy, setSortBy] = useState<SortOption>('PRIORITY');
  const [managingAlert, setManagingAlert] = useState<{ order: RepairOrder, type: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDbFixModal, setShowDbFixModal] = useState(false);
  const [previewOrder, setPreviewOrder] = useState<RepairOrder | null>(null);
  const [previewPos, setPreviewPos] = useState({ x: 0, y: 0 });
  
  // BUDGET APPROVAL STATE
  const [showConfirmApproval, setShowConfirmApproval] = useState(false);
  const [selectedOrderForApproval, setSelectedOrderForApproval] = useState<RepairOrder | null>(null);

  // ALERT ORDERS STATE (Server-side fetch)
  const [alertOrders, setAlertOrders] = useState<any[]>([]);

  useEffect(() => { localStorage.setItem('darwin_list_view', viewMode); }, [viewMode]);
  useEffect(() => { if (searchTerm.length >= 3) { searchOrder(searchTerm); } }, [searchTerm]);

  // POLL ALERTS FROM SERVER (Independent of Page)
  useEffect(() => {
      if (!currentUser) return;
      const loadAlerts = async () => {
          const rawAlerts = await fetchActionRequiredOrders(
              currentUser.role,
              currentUser.id,
              currentUser.branch || 'T4'
          );
          
          // MAP TO ALERT STRUCTURE
          const mapped = rawAlerts.map(o => {
              let type = ''; // No default, determine strictly

              // Priority 1: Direct Assignments & Messages (Personal)
              if (o.pending_assignment_to === currentUser.id) type = 'ASSIGNMENT_REQUEST';
              else if (o.techMessage?.pending === true && (currentUser.role === UserRole.ADMIN || o.assignedTo === currentUser.id)) type = 'TECH_MESSAGE';
              else if (o.approvalAckPending && o.assignedTo === currentUser.id) type = 'APPROVED_ACK';
              
              // Priority 2: Branch Operations
              else if (o.transferStatus === 'PENDING' && (currentUser.role === UserRole.ADMIN || (currentUser.role !== UserRole.TECHNICIAN && o.transferTarget === (currentUser.branch || 'T4')))) type = 'TRANSFER';
              
              // Priority 3: Admin/Monitor Tasks
              else if (o.pointRequest?.status === 'PENDING' && (currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.MONITOR)) type = 'POINTS';
              else if (o.returnRequest?.status === 'PENDING' && currentUser.role !== UserRole.TECHNICIAN) type = 'RETURN_REQUEST';
              else if (o.externalRepair?.status === 'PENDING' && currentUser.role !== UserRole.TECHNICIAN) type = 'EXTERNAL_REQUEST';
              else if (o.isValidated === false && currentUser.role !== UserRole.TECHNICIAN) type = 'VALIDATE';
              
              // Priority 4: Budget (Admin/Monitor/Cashier only)
              else if (o.status === OrderStatus.WAITING_APPROVAL && currentUser.role !== UserRole.TECHNICIAN) type = 'BUDGET';

              // Fallback if no specific type matched but it was returned by service (shouldn't happen often if service filters correctly)
              if (!type) {
                  // Try to guess based on status if still empty
                   if (o.status === OrderStatus.WAITING_APPROVAL) type = 'BUDGET';
                   else type = 'GENERIC_ALERT';
              }
              
              return { ...o, alertType: type };
          }).filter(o => {
              // Final safety filter: Remove items where we couldn't determine a valid type for this user
              // or if the type logic above decided this user shouldn't see it (e.g. tech seeing budget)
              if (o.alertType === 'BUDGET' && currentUser.role === UserRole.TECHNICIAN) return false;
              if (o.alertType === 'TECH_MESSAGE' && currentUser.role !== UserRole.ADMIN && o.assignedTo !== currentUser.id) return false;
              return true;
          });
          setAlertOrders(mapped);
      };
      
      loadAlerts();
      const interval = setInterval(loadAlerts, 30000); // 30s Polling
      return () => clearInterval(interval);
  }, [currentUser, managingAlert, showConfirmApproval]); // Re-fetch when managingAlert closes to update list

  const counts = useMemo(() => ({
    all: orders.length,
    active_taller: orders.filter(o => o.status !== OrderStatus.RETURNED && o.status !== OrderStatus.CANCELED && o.status !== OrderStatus.EXTERNAL).length,
    clients: orders.filter(o => o.orderType === OrderType.REPAIR && o.status !== OrderStatus.RETURNED && o.status !== OrderStatus.CANCELED && o.status !== OrderStatus.EXTERNAL).length,
    store: orders.filter(o => o.orderType === OrderType.STORE && o.status !== OrderStatus.RETURNED).length,
    warranty: orders.filter(o => o.orderType === OrderType.WARRANTY && o.status !== OrderStatus.RETURNED).length,
    history: orders.filter(o => o.status === OrderStatus.RETURNED || o.status === OrderStatus.CANCELED).length,
    external: orders.filter(o => o.status === OrderStatus.EXTERNAL || (o.externalRepair?.status === 'PENDING')).length,
    mine: orders.filter(o => o.assignedTo === currentUser?.id && o.status !== OrderStatus.RETURNED && o.status !== OrderStatus.CANCELED).length
  }), [orders, currentUser]);

  const processList = (rawList: RepairOrder[]) => {
      // ... (Search Logic remains same)
      let filtered = rawList;
      if (searchTerm) {
          const normTerm = normalizeForSearch(searchTerm);
          filtered = filtered.filter(o => {
              const normModel = normalizeForSearch(o.deviceModel);
              const normImei = normalizeForSearch(o.imei || '');
              const normPhone = normalizeForSearch(o.customer.phone || '');
              return (
                  o.customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  normPhone.includes(normTerm) || normModel.includes(normTerm) || normImei.includes(normTerm) ||
                  o.id.toLowerCase().includes(searchTerm.toLowerCase()) || (o.readable_id && o.readable_id.toString().includes(searchTerm))
              );
          });
      }
      return filtered.sort((a, b) => {
          // ... (Sort Logic remains same)
          const aUnassigned = !a.assignedTo && a.status !== OrderStatus.RETURNED && a.status !== OrderStatus.CANCELED;
          const bUnassigned = !b.assignedTo && b.status !== OrderStatus.RETURNED && b.status !== OrderStatus.CANCELED;
          if (aUnassigned && !bUnassigned) return -1;
          if (!aUnassigned && bUnassigned) return 1;
          switch (sortBy) {
              case 'PRIORITY':
                  const priorityMap = { [PriorityLevel.CRITICAL]: 0, [PriorityLevel.HIGH]: 1, [PriorityLevel.NORMAL]: 2, [PriorityLevel.LOW]: 3 };
                  const pA = priorityMap[a.priority as PriorityLevel] ?? 2;
                  const pB = priorityMap[b.priority as PriorityLevel] ?? 2;
                  if (pA !== pB) return pA - pB;
                  return a.deadline - b.deadline;
              case 'DEADLINE': return a.deadline - b.deadline;
              case 'NEWEST': return b.createdAt - a.createdAt;
              case 'ID': return (b.readable_id || 0) - (a.readable_id || 0);
              default: return 0;
          }
      });
  };

  const [externalFilter, setExternalFilter] = useState<string>('ALL');

  const processedOrders = useMemo(() => {
      // ... (Filter Logic remains same)
      const myBranch = currentUser?.branch || 'T4';
      const isAdmin = currentUser?.role === UserRole.ADMIN;
      
      let baseList = orders.filter(o => {
          if (!isAdmin) {
              const isMyBranch = o.currentBranch === myBranch;
              const isIncomingTransfer = o.transferStatus === 'PENDING' && o.transferTarget === myBranch;
              const isMyExternal = o.status === OrderStatus.EXTERNAL && o.originBranch === myBranch;
              if (!isMyBranch && !isIncomingTransfer && !isMyExternal) return false;
          }
          if (filterTab === 'ALL') return true; // Ensure ALL returns everything loaded in context
          
          // TALLER: All active orders (Repair, Store, Warranty) - Excludes External/History
          if (filterTab === 'TALLER') return o.status !== OrderStatus.RETURNED && o.status !== OrderStatus.CANCELED && o.status !== OrderStatus.EXTERNAL;
          
          // CLIENTES: Only Repair type
          if (filterTab === 'CLIENTES') return o.orderType === OrderType.REPAIR && o.status !== OrderStatus.RETURNED && o.status !== OrderStatus.CANCELED && o.status !== OrderStatus.EXTERNAL;
          
          if (filterTab === 'RECIBIDOS') return o.orderType === OrderType.STORE && o.status !== OrderStatus.RETURNED;
          if (filterTab === 'GARANTIAS') return o.orderType === OrderType.WARRANTY && o.status !== OrderStatus.RETURNED;
          if (filterTab === 'HISTORIAL') return o.status === OrderStatus.RETURNED || o.status === OrderStatus.CANCELED;
          
          if (filterTab === 'EXTERNAL') {
              const isExternal = o.status === OrderStatus.EXTERNAL || (o.externalRepair?.status === 'PENDING' && o.status !== OrderStatus.RETURNED);
              if (!isExternal) return false;
              
              if (externalFilter === 'ALL') return true;
              return o.externalRepair?.targetWorkshop === externalFilter;
          }
          
          if (filterTab === 'MINE') return o.status !== OrderStatus.RETURNED && o.status !== OrderStatus.CANCELED && o.orderType === OrderType.REPAIR;
          return true;
      });
      return processList(baseList);
  }, [orders, filterTab, searchTerm, sortBy, currentUser, externalFilter]);

  const { myAssignedList, unassignedList } = useMemo(() => {
      // ... (My List Logic remains same)
      const isTechView = filterTab === 'MINE' || (filterTab === 'TALLER' && currentUser?.role === UserRole.TECHNICIAN);
      if (!isTechView || !currentUser) return { myAssignedList: [], unassignedList: [] };
      const myBranch = currentUser.branch || 'T4';
      const rawMyList = orders.filter(o => o.assignedTo === currentUser.id && o.status !== OrderStatus.RETURNED && o.status !== OrderStatus.CANCELED && o.status !== OrderStatus.REPAIRED && o.currentBranch === myBranch);
      const rawUnassigned = orders.filter(o => !o.assignedTo && o.status !== OrderStatus.RETURNED && o.status !== OrderStatus.CANCELED && o.orderType !== OrderType.STORE && o.status !== OrderStatus.EXTERNAL && o.currentBranch === myBranch);
      return { myAssignedList: processList(rawMyList), unassignedList: processList(rawUnassigned) };
  }, [orders, filterTab, currentUser, searchTerm, sortBy]);

  const handleClaim = async (e: React.MouseEvent, orderId: string) => {
    e.stopPropagation();
    if (!currentUser) return;
    // Note: We might be claiming an order not in 'orders' context if it was found via search
    // But since 'orders' context now includes all active orders, it should be fine.
    const targetOrder = orders.find(o => o.id === orderId) || alertOrders.find(o => o.id === orderId);
    
    if (targetOrder?.transferStatus === 'PENDING') {
        alert("🚫 ACCIÓN BLOQUEADA\n\nEsta orden está en proceso de traslado entre sucursales.");
        return;
    }
    if (confirm("¿Asignarte esta orden para comenzar el diagnóstico?")) {
      try { await assignOrder(orderId, currentUser.id, currentUser.name); } catch (e) { setShowDbFixModal(true); }
    }
  };

  const handleBudgetResponse = async (order: RepairOrder, approve: boolean) => {
      if (!currentUser) return;
      if (approve) {
          setSelectedOrderForApproval(order);
          setShowConfirmApproval(true);
      } else {
          if (confirm('¿Rechazar presupuesto y devolver a diagnóstico?')) {
              await updateOrderStatus(order.id, OrderStatus.DIAGNOSIS, '❌ Presupuesto RECHAZADO por cliente. Volviendo a diagnóstico.');
              setManagingAlert(null);
          }
      }
  };

  const handleConfirmApproval = async (amount: string, instructions: string) => {
      if (!selectedOrderForApproval || !currentUser) return;
      try {
          await updateOrderDetails(selectedOrderForApproval.id, { 
              status: OrderStatus.IN_REPAIR, 
              finalPrice: parseFloat(amount), 
              customerNotes: instructions 
          });
          await addOrderLog(selectedOrderForApproval.id, OrderStatus.IN_REPAIR, '✅ Presupuesto APROBADO por cliente. Reparación iniciada.', currentUser.name, 'SUCCESS');
          setShowConfirmApproval(false);
          setSelectedOrderForApproval(null);
          setManagingAlert(null);
      } catch (e) {
          alert('Error al aprobar presupuesto');
      }
  };

  const handlePointsResponse = async (order: RepairOrder, approve: boolean) => {
      // ... (Logic remains same)
      if (!order || !order.pointRequest || !currentUser) return;
      setManagingAlert(null); 
      if (approve) {
          const updates: Partial<RepairOrder> = { 
              pointsAwarded: order.pointRequest.requestedPoints, 
              pointRequest: { ...order.pointRequest, status: 'APPROVED', approvedBy: currentUser.name },
              status: OrderStatus.REPAIRED
          };
          if (order.pointRequest.splitProposal) updates.pointsSplit = order.pointRequest.splitProposal;
          await updateOrderDetails(order.id, updates);
          await addOrderLog(order.id, OrderStatus.REPAIRED, `✅ Puntos APROBADOS (${order.pointRequest.requestedPoints}) por ${currentUser.name}.`, currentUser.name, 'SUCCESS');
      } else {
          await updateOrderDetails(order.id, { pointsAwarded: 0, pointRequest: { ...order.pointRequest, status: 'REJECTED', approvedBy: currentUser.name } });
          await addOrderLog(order.id, order.status, `❌ Solicitud de puntos RECHAZADA por ${currentUser.name}.`, currentUser.name, 'DANGER');
      }
  };

  const handleQuickAction = async (action: string) => {
    if (!managingAlert || !currentUser) return;
    if (managingAlert.type === 'POINTS' || managingAlert.type === 'TECH_MESSAGE') {
        navigate(`/orders/${managingAlert.order.id}`); // For messages, just go to order
        return;
    }
    if (managingAlert.type === 'BUDGET' || managingAlert.type === 'ASSIGNMENT_REQUEST' || managingAlert.type === 'RETURN_REQUEST') { 
        navigate(`/orders/${managingAlert.order.id}`); 
        return; 
    }
    setIsProcessing(true);
    const { order, type } = managingAlert;
    try {
      if (type === 'TRANSFER') await confirmTransfer(order.id, currentUser.name);
      if (type === 'VALIDATE') await validateOrder(order.id, currentUser.name);
      if (type === 'APPROVED_ACK') await updateOrderDetails(order.id, { approvalAckPending: false });
      if (type === 'EXTERNAL_REQUEST') await resolveExternalRepair(order.id, true, currentUser.name);
      setManagingAlert(null);
    } catch (e) { setShowDbFixModal(true); } finally { setIsProcessing(false); }
  };

  const handlePreviewHover = (e: React.MouseEvent, order: RepairOrder) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setPreviewPos({ x: rect.right + 10, y: rect.top });
      setPreviewOrder(order);
  };

  // ... (OrderTable and Return logic remains largely same, just updating alerts section below)

  const OrderTable = ({ list }: { list: RepairOrder[] }) => (
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">ID / Prioridad</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Equipo y Cliente</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado Taller</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Compromiso</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Finanzas</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Acción</th>
                  </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                  {list.map(order => {
                      const timeLeft = getTimeLeft(order.deadline, order.status);
                      const assignedUser = users.find(u => u.id === order.assignedTo);
                      const isUnassigned = !order.assignedTo;
                      const isReturn = order.returnRequest?.status === 'APPROVED' || order.returnRequest?.status === 'PENDING';
                      return (
                          <tr key={order.id} onClick={() => navigate(`/orders/${order.id}`)} className={`hover:bg-slate-50 transition-colors cursor-pointer group ${isReturn ? 'bg-red-50/30' : (isUnassigned ? 'bg-blue-50/10' : '')}`}>
                              <td className="p-4">
                                  <div className="flex flex-col gap-1">
                                      <span className="font-mono font-black text-xs text-slate-400">#{order.readable_id || order.id.slice(-4)}</span>
                                      {isReturn ? (<span className="w-fit text-[9px] font-black px-2 py-0.5 rounded-full border bg-red-100 text-red-700 border-red-200">DEVOLUCIÓN</span>) : (<span className={`w-fit text-[9px] font-black px-2 py-0.5 rounded-full border ${getPriorityStyle(order.priority)}`}>{order.priority}</span>)}
                                      <span className="w-fit text-[8px] font-black bg-black text-white px-2 py-0.5 rounded-full border border-slate-700 uppercase">ORG: {order.originBranch || order.currentBranch || 'T4'}</span>
                                  </div>
                              </td>
                              <td className="p-4">
                                  <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center border border-slate-200 shrink-0 relative hover:ring-2 hover:ring-blue-300 transition-all" onMouseEnter={(e) => handlePreviewHover(e, order)} onMouseLeave={() => setPreviewOrder(null)}>
                                          {order.devicePhoto ? <img src={order.devicePhoto} className="w-full h-full object-cover rounded-xl" /> : <Smartphone className="w-5 h-5 text-slate-400"/>}
                                      </div>
                                      <div><h4 className="font-black text-slate-800 text-sm">{order.deviceModel}</h4><p className="text-xs font-bold text-slate-500">{order.customer.name}</p></div>
                                  </div>
                              </td>
                              <td className="p-4"><div className="flex flex-col gap-1"><span className={`w-fit px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase border ${getStatusBadgeStyle(order.status, isReturn)}`}>{isReturn ? 'DEVOLUCIÓN' : order.status}</span><div className="w-32 opacity-50"><MiniStatusTimeline status={order.status} isReturn={isReturn} /></div></div></td>
                              <td className="p-4"><div className={`w-fit px-3 py-1.5 rounded-xl border flex items-center gap-2 ${timeLeft.bg} ${timeLeft.urgent ? 'border-orange-200' : 'border-slate-100'}`}><Timer className={`w-3.5 h-3.5 ${timeLeft.color} ${timeLeft.urgent ? 'animate-pulse' : ''}`} /><span className={`text-[10px] font-black ${timeLeft.color} uppercase`}>{timeLeft.text}</span></div></td>
                              <td className="p-4"><div className="flex flex-col"><span className="text-xs font-black text-slate-800">${(order.finalPrice || order.estimatedCost || 0).toLocaleString()}</span></div></td>
                              <td className="p-4 text-right">
                                  {assignedUser ? (<div className="inline-flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-sm"><span className="text-[10px] font-black text-slate-700 px-1 uppercase">{assignedUser.name.split(' ')[0]}</span></div>) : (!isReturn && !order.externalRepair && <button onClick={(e) => handleClaim(e, order.id)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-[10px] font-black hover:bg-blue-700 shadow-md transition-all active:scale-95">ASIGNARME</button>)}
                              </td>
                          </tr>
                      );
                  })}
              </tbody>
          </table>
      </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto pb-20 font-sans bg-slate-50 min-h-screen relative">
      {showDbFixModal && <DbFixModal onClose={() => setShowDbFixModal(false)} />}
      {previewOrder && <div className="fixed z-[100] bg-white rounded-xl shadow-2xl border border-slate-200 p-4 w-72 animate-in fade-in zoom-in-95 duration-200 pointer-events-none" style={{ top: Math.min(window.innerHeight - 300, previewPos.y), left: Math.min(window.innerWidth - 300, previewPos.x) }}><div className="h-40 bg-slate-100 rounded-lg overflow-hidden mb-3 border border-slate-100">{previewOrder.devicePhoto ? <img src={previewOrder.devicePhoto} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><Smartphone className="w-12 h-12"/></div>}</div><h4 className="font-black text-slate-800 text-sm mb-1">{previewOrder.deviceModel}</h4><p className="text-xs text-slate-500 mb-2 font-bold">{previewOrder.customer.name}</p><div className="text-[10px] text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 line-clamp-3">{previewOrder.deviceIssue}</div></div>}

      {/* Header and Filter sections remain unchanged ... */}
      
      {/* SEARCH AND HEADER SECTION */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-8 gap-6">
        <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-600 rounded-2xl text-white shadow-xl shadow-blue-200">
                <LayoutList className="w-8 h-8" />
            </div>
            <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">Control de Equipos</h1>
                <p className="text-slate-500 font-medium">Priorización y flujo de taller en tiempo real.</p>
            </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
          <div className="relative flex-1 min-w-[300px] group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 group-focus-within:text-blue-500 transition-colors" />
            <input 
              placeholder="Buscar por # Orden, Cliente, Imei o Modelo..." 
              className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm outline-none focus:ring-4 focus:ring-blue-100 transition-all shadow-sm font-medium"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm">
              <button onClick={() => setViewMode('CARDS')} className={`p-2 rounded-xl transition-all ${viewMode === 'CARDS' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`} title="Vista de Tarjetas"><LayoutGrid className="w-5 h-5" /></button>
              <button onClick={() => setViewMode('TABLE')} className={`p-2 rounded-xl transition-all ${viewMode === 'TABLE' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`} title="Vista de Tabla Densa"><List className="w-5 h-5" /></button>
          </div>

          <button onClick={() => window.location.reload()} className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-700 hover:bg-slate-50 transition shadow-sm" title="Recargar"><RefreshCw className="w-5 h-5" /></button>
          <button onClick={() => setShowDbFixModal(true)} className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-700 hover:bg-slate-50 transition shadow-sm" title="Reparar Base de Datos"><Database className="w-5 h-5" /></button>
          
          {currentUser?.role !== UserRole.TECHNICIAN && (
              <button onClick={() => navigate('/intake')} className="px-6 py-3 bg-slate-900 text-white rounded-2xl hover:bg-black transition flex items-center gap-3 text-sm font-black shadow-xl shadow-slate-200"><PlusCircle className="w-5 h-5" /> NUEVA ORDEN</button>
          )}
        </div>
      </div>

      {/* FILTER TABS */}
      <div className="flex flex-col lg:flex-row justify-between items-center gap-4 mb-8">
          <div className="flex bg-white p-1 rounded-2xl border border-slate-200 w-full lg:w-auto shadow-sm overflow-x-auto custom-scrollbar">
            {[
              { id: 'TALLER', label: 'TALLER', count: counts.active_taller, icon: LayoutDashboard },
              { id: 'CLIENTES', label: 'Clientes', count: counts.clients, icon: User },
              { id: 'RECIBIDOS', label: 'Recibidos/Venta', count: counts.store, icon: ShoppingBag, isStore: true }, 
              { id: 'GARANTIAS', label: 'Garantías', count: counts.warranty, icon: ShieldAlert },
              { id: 'EXTERNAL', label: 'OTRO TALLER', count: counts.external, icon: Truck },
              { id: 'HISTORIAL', label: 'YA ENTREGADOS', count: counts.history, icon: History },
              { id: 'ALL', label: 'Todos', count: counts.all, icon: List }
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setFilterTab(tab.id)}
                className={`px-5 py-2.5 rounded-xl text-xs font-black tracking-wide flex items-center gap-2 transition-all whitespace-nowrap ${filterTab === tab.id ? (tab.isStore ? 'bg-gradient-to-r from-red-600 to-red-800 text-white shadow-lg shadow-red-200' : 'bg-blue-600 text-white shadow-lg') : (tab.isStore ? 'text-red-600 hover:bg-red-50' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700')}`}
              >
                {React.createElement(tab.icon, { className: "w-4 h-4" })} {tab.label} 
                <span className={`px-2 py-0.5 rounded-full text-[10px] ${filterTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500 border'}`}>{tab.count}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 w-full lg:w-auto">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest hidden sm:inline">Ordenar por:</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)} className="flex-1 lg:flex-none bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-black text-slate-700 outline-none shadow-sm focus:ring-2 focus:ring-blue-100">
                  <option value="PRIORITY">🔥 Prioridad Urgente</option>
                  <option value="DEADLINE">⌛ Próximos a Vencer</option>
                  <option value="NEWEST">🆕 Recién Ingresados</option>
                  <option value="ID">🔢 Número de Orden</option>
              </select>
          </div>
      </div>
      
      {/* EXTERNAL WORKSHOP FILTER SUB-BAR */}
      {filterTab === 'EXTERNAL' && (
          <div className="mb-8 animate-in slide-in-from-top-2">
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
      
      {/* --- ALERTS SECTION (UPDATED TO USE SERVER DATA) --- */}
      {alertOrders.length > 0 && (filterTab === 'TALLER' || filterTab === 'CLIENTES') && (
          <div className="mb-10 animate-in slide-in-from-top-4">
              <h3 className="flex items-center gap-2 text-xs font-black text-red-600 uppercase tracking-[0.2em] mb-4 pl-1"><AlertTriangle className="w-4 h-4" /> PANEL DE ACCIÓN REQUERIDA (GLOBAL)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {alertOrders.filter(order => {
                      // Hide ASSIGNMENT_REQUEST from admins (only for target technician)
                      if (order.alertType === 'ASSIGNMENT_REQUEST' && currentUser?.role === UserRole.ADMIN) return false;
                      return true;
                  }).map(order => {
                      let config = { bg: 'bg-slate-600', label: 'ALERTA', icon: AlertCircle, action: 'GESTIONAR' };
                      if (order.alertType === 'TRANSFER') config = { bg: 'bg-blue-600', label: 'TRASLADO ENTRANTE', icon: ArrowRightLeft, action: 'RECIBIR EQUIPO' };
                      if (order.alertType === 'ASSIGNMENT_REQUEST') config = { bg: 'bg-indigo-600', label: 'SOLICITUD TRASPASO', icon: User, action: 'REVISAR' };
                      if (order.alertType === 'RETURN_REQUEST') config = { bg: 'bg-red-600', label: 'DEVOLUCIÓN PENDIENTE', icon: Reply, action: 'GESTIONAR' };
                      if (order.alertType === 'EXTERNAL_REQUEST') config = { bg: 'bg-purple-600', label: 'SOLICITUD SALIDA EXT.', icon: Truck, action: 'APROBAR SALIDA' };
                      if (order.alertType === 'VALIDATE') config = { bg: 'bg-purple-600', label: 'VALIDAR INGRESO', icon: CheckCircle2, action: 'VALIDAR AHORA' };
                      if (order.alertType === 'POINTS') config = { bg: 'bg-yellow-500', label: 'COMISIÓN PENDIENTE', icon: Trophy, action: 'REVISAR PUNTOS' };
                      if (order.alertType === 'APPROVED_ACK') config = { bg: 'bg-green-600', label: 'CLIENTE APROBÓ', icon: CheckCircle2, action: 'CONFIRMAR LECTURA' };
                      if (order.alertType === 'BUDGET') config = { bg: 'bg-orange-500', label: 'PRESUPUESTO PEND.', icon: HandCoins, action: 'APROBAR PRECIO' };
                      if (order.alertType === 'TECH_MESSAGE') config = { bg: 'bg-blue-600', label: 'NUEVO MENSAJE', icon: MessageSquare, action: 'LEER AHORA' };

                      return (
                          <div key={order.id} onClick={() => navigate(`/orders/${order.id}`)} className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden cursor-pointer hover:scale-[1.02] transition-all group">
                              <div className={`${config.bg} p-4 flex justify-between items-center text-white`}>
                                  <div className="flex items-center gap-2 font-black text-[10px] uppercase tracking-wider">{React.createElement(config.icon, { className: "w-4 h-4" })} {config.label}</div>
                                  <span className="font-mono text-xs font-black bg-black/20 px-2 py-0.5 rounded">#{order.readable_id || order.id.slice(-4)}</span>
                              </div>
                              <div className="p-6">
                                  <h4 className="font-black text-slate-800 text-lg mb-1 truncate">{order.deviceModel}</h4>
                                  <div className={`flex items-center gap-1 text-xs font-bold mb-4 ${order.orderType === OrderType.STORE ? 'text-red-600' : 'text-slate-500'}`}>
                                      <User className={`w-3.5 h-3.5 ${order.orderType === OrderType.STORE ? 'text-red-600' : 'text-blue-500'}`} /> {order.customer.name}
                                  </div>
                                  
                                  {order.alertType === 'TECH_MESSAGE' ? (
                                      <div className="mb-4 bg-blue-50 rounded-2xl p-3 border border-blue-100 text-xs text-blue-700 italic">
                                          "{order.techMessage?.message}"
                                      </div>
                                  ) : (
                                      <div className="mb-4 bg-slate-50 rounded-2xl p-3 border border-slate-100"><MiniStatusTimeline status={order.status} isReturn={order.returnRequest?.status === 'APPROVED'} /></div>
                                  )}
                                  
                                  {order.alertType === 'POINTS' ? (
                                      <div className="flex gap-2">
                                          <button onClick={(e) => { e.stopPropagation(); handlePointsResponse(order, false); }} className="flex-1 py-3 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition text-[10px]">RECHAZAR</button>
                                          <button onClick={async (e) => { e.stopPropagation(); if(confirm('¿Iniciar debate de puntos con el técnico?')) { await debatePoints(order.id, currentUser.name); setManagingAlert(null); } }} className="flex-1 py-3 bg-yellow-50 text-yellow-600 font-bold rounded-xl hover:bg-yellow-100 transition text-[10px]">DEBATIR</button>
                                          <button onClick={(e) => { e.stopPropagation(); handlePointsResponse(order, true); }} className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl shadow-lg hover:bg-green-700 transition text-[10px]">APROBAR</button>
                                      </div>
                                  ) : order.alertType === 'BUDGET' ? (
                                      <div className="flex gap-2">
                                          <button onClick={(e) => { e.stopPropagation(); handleBudgetResponse(order, false); }} className="flex-1 py-3 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition text-[10px]">RECHAZAR</button>
                                          <button onClick={(e) => { e.stopPropagation(); handleBudgetResponse(order, true); }} className="flex-[2] py-3 bg-green-600 text-white font-bold rounded-xl shadow-lg hover:bg-green-700 transition text-[10px]">APROBAR</button>
                                      </div>
                                  ) : (
                                      <button onClick={(e) => { e.stopPropagation(); setManagingAlert({ order, type: order.alertType }); }} className={`w-full py-4 rounded-2xl font-black text-xs text-white shadow-lg flex items-center justify-center gap-2 transition ${config.bg} hover:opacity-90 active:scale-95`}>{config.action}</button>
                                  )}
                              </div>
                          </div>
                      );
                  })}
              </div>
          </div>
      )}

      {/* CONFIRM APPROVAL MODAL */}
      {showConfirmApproval && selectedOrderForApproval && (
          <ConfirmApprovalModal 
              defaultAmount={selectedOrderForApproval.proposedEstimate || selectedOrderForApproval.estimatedCost}
              onConfirm={handleConfirmApproval}
              onCancel={() => { setShowConfirmApproval(false); setSelectedOrderForApproval(null); }}
          />
      )}

      {/* LIST CONTENT */}
      {isLoadingOrders ? (
          <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
              <p className="text-slate-400 font-bold animate-pulse">Cargando órdenes...</p>
          </div>
      ) : (
          <>
              {(filterTab === 'MINE' || (filterTab === 'TALLER' && currentUser?.role === UserRole.TECHNICIAN)) ? (
                  /* MINE VIEW */
                  <div className="space-y-8">
                      {myAssignedList.length > 0 && (
                          <div>
                              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 pl-1">MIS ASIGNACIONES ({myAssignedList.length})</h3>
                              {viewMode === 'CARDS' ? (
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                      {myAssignedList.map(order => <OrderCard key={order.id} order={order} onClaim={handleClaim} />)}
                                  </div>
                              ) : (
                                  <OrderTable list={myAssignedList} />
                              )}
                          </div>
                      )}
                      
                      {unassignedList.length > 0 && (
                          <div>
                              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 pl-1 mt-8">DISPONIBLES PARA TOMAR ({unassignedList.length})</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                  {unassignedList.map(order => <CompactOrderBanner key={order.id} order={order} onClaim={handleClaim} />)}
                              </div>
                          </div>
                      )}
                      
                      {myAssignedList.length === 0 && unassignedList.length === 0 && (
                          <div className="text-center py-20 opacity-50">
                              <Briefcase className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                              <p className="text-slate-500 font-bold">No tienes órdenes asignadas ni pendientes.</p>
                          </div>
                      )}
                  </div>
              ) : (
                  /* GENERAL VIEW */
                  <div>
                      {processedOrders.length === 0 ? (
                          <div className="text-center py-20 opacity-50">
                              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                  <Search className="w-8 h-8 text-slate-300" />
                              </div>
                              <p className="text-slate-500 font-bold text-lg">No se encontraron órdenes.</p>
                              <p className="text-xs text-slate-400 mt-1">Intenta ajustar los filtros o la búsqueda.</p>
                          </div>
                      ) : (
                          filterTab === 'EXTERNAL' ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                  {processedOrders.map(order => <ExternalOrderCard key={order.id} order={order} />)}
                              </div>
                          ) : (
                              viewMode === 'CARDS' ? (
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                      {processedOrders.map(order => <OrderCard key={order.id} order={order} onClaim={handleClaim} />)}
                                  </div>
                              ) : (
                                  <OrderTable list={processedOrders} />
                              )
                          )
                      )}
                      
                      {/* PAGINATION (Only for History/All) */}
                      {(filterTab === 'HISTORIAL' || filterTab === 'ALL') && hasMore && (
                          <div className="mt-8 text-center">
                              <button onClick={loadMoreOrders} disabled={isLoadingOrders} className="px-6 py-3 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition shadow-sm disabled:opacity-50">
                                  {isLoadingOrders ? 'Cargando...' : 'Cargar Más Antiguas'}
                              </button>
                          </div>
                      )}
                  </div>
              )}
          </>
      )}
      
      {/* (Bottom part with Alert Modal handling) */}
      {managingAlert && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/80 backdrop-blur-md p-4 animate-in zoom-in" onClick={() => setManagingAlert(null)}>
              {/* ... (Modal content structure remains same) ... */}
              <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                  {/* ... Header colors ... */}
                  <div className={`p-8 text-white text-center relative overflow-hidden`}>
                    <div className={`absolute inset-0 opacity-100 ${managingAlert.type === 'TRANSFER' ? 'bg-blue-600' : managingAlert.type === 'VALIDATE' ? 'bg-purple-600' : managingAlert.type === 'POINTS' ? 'bg-yellow-500' : managingAlert.type === 'APPROVED_ACK' ? 'bg-green-600' : managingAlert.type === 'ASSIGNMENT_REQUEST' ? 'bg-indigo-600' : managingAlert.type === 'RETURN_REQUEST' ? 'bg-red-600' : managingAlert.type === 'EXTERNAL_REQUEST' ? 'bg-purple-600' : managingAlert.type === 'TECH_MESSAGE' ? 'bg-blue-600' : 'bg-orange-500'}`} />
                    <div className="relative z-10">
                        {/* Icon Logic */}
                        {React.createElement(
                            managingAlert.type === 'TECH_MESSAGE' ? MessageSquare : 
                            managingAlert.type === 'TRANSFER' ? ArrowRightLeft : 
                            // ... other icons ...
                            HandCoins, 
                            { className: "w-16 h-16 mx-auto mb-4 drop-shadow-lg" }
                        )}
                        <h3 className="text-2xl font-black uppercase tracking-tighter">
                            {managingAlert.type === 'TECH_MESSAGE' ? 'MENSAJE' : 'ACCIÓN REQUERIDA'}
                        </h3>
                        <p className="text-white/80 text-xs font-black mt-1 tracking-widest">ORDEN #{managingAlert.order.readable_id || managingAlert.order.id.slice(-4)}</p>
                    </div>
                  </div>
                  
                  <div className="p-8 space-y-6">
                      <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 text-center">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Instrucción</p>
                        <p className="text-sm font-bold text-slate-700 leading-relaxed">
                            {/* ... Text logic ... */}
                            {managingAlert.type === 'TECH_MESSAGE' ? 'Tienes un nuevo mensaje importante sobre esta orden.' : 'Completar acción administrativa pendiente.'}
                        </p>
                      </div>
                      <div className="flex gap-3">
                          <button onClick={() => setManagingAlert(null)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase hover:bg-slate-200 transition-all">Cerrar</button>
                          <button 
                            onClick={() => handleQuickAction('APPROVE')} 
                            disabled={isProcessing} 
                            className={`flex-[2] py-4 text-white rounded-2xl font-black text-xs uppercase transition-all shadow-xl flex items-center justify-center gap-2 active:scale-95 bg-blue-600`}
                          >
                              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin"/> : <CheckCircle2 className="w-4 h-4"/>} 
                              VER AHORA
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
