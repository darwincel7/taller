
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useOrders } from '../contexts/OrderContext';
import { useAuth } from '../contexts/AuthContext';
import { 
  RepairOrder, OrderStatus, UserRole, PriorityLevel, OrderType, Expense, PointSplit
} from '../types';
import { 
  ArrowLeft, Printer, MessageCircle, AlertTriangle, 
  CheckCircle2, XCircle, Wrench, User, Calendar, 
  Smartphone, Lock, Share2, Save, Trash2, Reply, ShieldAlert,
  ThumbsUp, UserCheck, MapPin, Truck, History, ArrowRightLeft, DollarSign, Wallet, FileText,
  Maximize2, X, AlertCircle, HandCoins, Crown, Split, Ban, ArrowRight, Users, Check, Hand, BellRing, Minus, Plus, Trophy, Tag, Send, Loader2, Sparkles, Zap, Phone, MessageSquare
} from 'lucide-react';
import { StatusTimeline } from '../components/StatusTimeline';
import { OrderFinancials } from '../components/OrderFinancials';
import { OrderInfoEdit } from '../components/OrderInfoEdit';
import { DeliveryModal } from '../components/DeliveryModal';
import { ProposalModal } from '../components/ProposalModal';
import { printInvoice, printSticker } from '../services/invoiceService';
import { sendWhatsAppNotification } from '../services/notificationService';
import { chatWithDarwin } from '../services/geminiService';
import { finalizeDelivery } from '../services/deliveryService';

// --- CANONICAL ROOT IMPORTS ---
import { ControlPanel } from '../components/ControlPanel'; 
import { TechnicalSheet } from '../components/orders/TechnicalSheet';
import { StageBar } from '../components/orders/StageBar';
import { ProgressNotes } from '../components/orders/ProgressNotes';
import { ExpensesAndParts } from '../components/orders/ExpensesAndParts';
import { DetailedHistory } from '../components/orders/DetailedHistory';

import { ConfirmApprovalModal } from '../components/ConfirmApprovalModal';

// --- MODAL: UNREPAIRABLE (ENHANCED) ---
const UnrepairableModal = ({ onConfirm, onCancel }: any) => {
    const [reason, setReason] = useState(''); 
    const [fee, setFee] = useState('');
    const [chargeFee, setChargeFee] = useState(false);
    
    // Motivos comunes para agilizar la escritura
    const commonReasons = [
        "Irreparable (Placa base)",
        "No hay repuesto disponible",
        "Costo muy elevado",
        "Cliente no aceptó precio",
        "Cliente retiró equipo"
    ];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-300" onClick={onCancel}>
            <div 
                className="bg-slate-50 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden relative animate-in zoom-in-95 duration-300 border border-white/20 ring-1 ring-black/5" 
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-white p-6 border-b border-slate-100 flex justify-between items-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                    <div className="flex items-center gap-3 relative z-10">
                        <div className="bg-red-50 p-2.5 rounded-2xl text-red-600 shadow-sm border border-red-100">
                            <Reply className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-800 tracking-tight leading-none mb-1">Solicitar Devolución</h3>
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Proceso de salida sin reparación</p>
                        </div>
                    </div>
                    <button onClick={onCancel} className="p-2 text-slate-300 hover:text-slate-500 hover:bg-slate-100 rounded-full transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">
                    
                    {/* Quick Tags */}
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1">
                            <Tag className="w-3 h-3"/> Motivos Rápidos
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {commonReasons.map((r) => (
                                <button 
                                    key={r}
                                    onClick={() => setReason(r)}
                                    className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all active:scale-95 ${reason === r ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600'}`}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Reason Textarea - WHITE BACKGROUND */}
                    <div className="relative group">
                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1.5 block ml-1">Detalle / Razón</label>
                        <textarea 
                            className="w-full bg-white border-2 border-slate-200 rounded-2xl p-4 text-slate-700 font-medium focus:border-red-400 focus:ring-4 focus:ring-red-50 outline-none transition-all resize-none shadow-sm placeholder:text-slate-300 text-sm" 
                            placeholder="Escribe aquí por qué se devuelve el equipo..." 
                            rows={3}
                            value={reason} 
                            onChange={e => setReason(e.target.value)}
                            autoFocus
                        />
                    </div>

                    {/* Fee Input - WHITE BACKGROUND */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                             <label className="text-[10px] font-bold text-slate-500 uppercase block ml-1">Costo por Diagnóstico / Chequeo</label>
                             <label className="flex items-center gap-2 cursor-pointer">
                                 <span className="text-[10px] font-bold text-slate-400 uppercase">¿Cobrar?</span>
                                 <input type="checkbox" checked={chargeFee} onChange={e => setChargeFee(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500" />
                             </label>
                        </div>
                        
                        {chargeFee && (
                            <div className="relative group animate-in slide-in-from-top-2 fade-in">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-slate-100 text-slate-500 p-1.5 rounded-lg">
                                    <DollarSign className="w-4 h-4" />
                                </div>
                                <input 
                                    type="number" 
                                    className="w-full bg-white border-2 border-slate-200 rounded-2xl pl-14 pr-4 py-3.5 font-black text-xl text-slate-800 outline-none focus:border-green-400 focus:ring-4 focus:ring-green-50 transition-all shadow-sm placeholder:text-slate-300" 
                                    placeholder="0.00" 
                                    value={fee} 
                                    onChange={e => setFee(e.target.value)}
                                />
                            </div>
                        )}
                        <p className="text-[10px] text-slate-400 mt-2 ml-1">
                            * Si el cliente paga por la revisión, marque la casilla e ingrese el monto.
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-white border-t border-slate-100 flex gap-3">
                    <button 
                        onClick={onCancel} 
                        className="flex-1 py-3.5 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-colors text-xs uppercase tracking-wide"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={() => onConfirm(reason, chargeFee ? (parseFloat(fee) || 0) : 0)} 
                        disabled={!reason}
                        className="flex-[2] bg-gradient-to-r from-red-600 to-red-500 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-red-200 hover:shadow-xl hover:from-red-500 hover:to-red-400 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-xs uppercase tracking-wide"
                    >
                        Confirmar Devolución <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- MODAL: POINTS REQUEST (REDESIGNED) ---
const PointsRequestModal = ({ users, currentUser, onConfirm, onCancel, isSubmitting }: any) => {
    // ... (Code remains same as provided in previous turn) ...
    const [pts, setPts] = useState(1);
    const [isSplit, setIsSplit] = useState(false);
    const [partnerId, setPartnerId] = useState('');
    const [myShare, setMyShare] = useState(1); 

    const availablePartners = users.filter((u: any) => u.role === UserRole.TECHNICIAN && u.id !== currentUser.id);

    useEffect(() => {
        if (pts < 2) setIsSplit(false);
        if (pts >= 2 && !isSplit) {
            setMyShare(Math.floor(pts / 2));
        }
    }, [pts]);

    const handleConfirm = () => {
        if (isSplit && partnerId) {
            const splitData: PointSplit = {
                primaryTechId: currentUser.id,
                primaryPoints: myShare,
                secondaryTechId: partnerId,
                secondaryPoints: pts - myShare
            };
            onConfirm(pts, "Reparación Colaborativa", splitData);
        } else {
            const reason = pts === 0 ? "Reparación sin costo/puntos" : "Reparación Estándar";
            onConfirm(pts, reason);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in zoom-in" onClick={onCancel}>
            <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl relative" onClick={e=>e.stopPropagation()}>
                <button onClick={onCancel} className="absolute top-4 right-4 p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition"><X className="w-5 h-5 text-slate-500"/></button>
                
                <div className="text-center mb-6">
                    <h3 className="text-2xl font-black text-slate-800 flex items-center justify-center gap-2">
                        {pts === 0 ? '🚫 Sin Puntos' : '¡Reparación Lista!'}
                    </h3>
                    <p className="text-slate-500 text-sm">¿Cuántos puntos exige este trabajo?</p>
                </div>

                <div className="flex items-center justify-center gap-6 mb-8">
                    <button onClick={() => setPts(Math.max(0, pts - 1))} className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-600 transition active:scale-90 border border-slate-200 shadow-sm"><Minus className="w-6 h-6"/></button>
                    <div className="w-24 text-center">
                        <span className="text-6xl font-black text-blue-600">{pts}</span>
                    </div>
                    <button onClick={() => setPts(pts + 1)} className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center hover:bg-blue-100 text-blue-600 transition active:scale-90 border border-blue-200 shadow-sm"><Plus className="w-6 h-6"/></button>
                </div>

                {pts >= 2 && (
                    <div className="mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                        <label className="flex items-center justify-between cursor-pointer group">
                            <span className="flex items-center gap-2 font-bold text-slate-700 text-sm"><Split className="w-4 h-4 text-purple-500"/> Dividir con compañero</span>
                            <div className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 ${isSplit ? 'bg-purple-600' : 'bg-slate-300'}`} onClick={() => setIsSplit(!isSplit)}>
                                <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform duration-300 ${isSplit ? 'translate-x-6' : 'translate-x-0'}`}/>
                            </div>
                        </label>

                        {isSplit && (
                            <div className="mt-4 animate-in slide-in-from-top-2">
                                <div className="mb-3">
                                    <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Compañero</label>
                                    <select 
                                        className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-purple-200"
                                        value={partnerId}
                                        onChange={(e) => setPartnerId(e.target.value)}
                                    >
                                        <option value="">Seleccionar...</option>
                                        {availablePartners.map((u: any) => (
                                            <option key={u.id} value={u.id}>{u.name}</option>
                                        ))}
                                    </select>
                                </div>
                                {partnerId && (
                                    <div>
                                        <div className="flex justify-between text-xs font-bold mb-2">
                                            <span className="text-blue-600">Yo: {myShare}</span>
                                            <span className="text-purple-600">El: {pts - myShare}</span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="1" 
                                            max={pts - 1} 
                                            value={myShare} 
                                            onChange={(e) => setMyShare(parseInt(e.target.value))}
                                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                <div className="flex gap-3">
                    <button onClick={onCancel} disabled={isSubmitting} className="flex-1 py-4 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition disabled:opacity-50">Cancelar</button>
                    <button 
                        onClick={handleConfirm}
                        disabled={(isSplit && !partnerId) || isSubmitting}
                        className={`flex-[2] py-4 rounded-xl text-white font-bold shadow-lg transition active:scale-95 flex items-center justify-center gap-2 ${pts === 0 ? 'bg-slate-700 hover:bg-slate-800' : 'bg-green-600 hover:bg-green-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                        {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : (pts === 0 ? 'Reparación sin Costo' : `Confirmar (${pts} pts)`)}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- MODAL: SEND TECH MESSAGE (ENHANCED) ---
const SendTechMessageModal = ({ techName, onSend, onClose }: any) => {
    // ... (Code remains same as provided in previous turn) ...
    const [msg, setMsg] = useState('');
    const [isSending, setIsSending] = useState(false);

    const quickMsg = (text: string) => setMsg(text);

    const handleSend = () => {
        if(!msg.trim()) return;
        setIsSending(true);
        setTimeout(() => {
            onSend(msg);
        }, 600);
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4 animate-in fade-in duration-300" onClick={onClose}>
            <div
                className="bg-slate-50 rounded-[32px] shadow-2xl w-full max-w-md relative overflow-hidden animate-in zoom-in-95 duration-300 border border-white/20"
                onClick={e => e.stopPropagation()}
            >
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 pt-8 pb-10 text-white relative">
                    <div className="absolute top-0 right-0 p-3 opacity-20">
                        <MessageCircle className="w-24 h-24 -mr-6 -mt-6 rotate-12" />
                    </div>
                    <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition backdrop-blur-sm">
                        <X className="w-5 h-5" />
                    </button>
                    <h3 className="text-3xl font-black tracking-tight mb-1 flex items-center gap-2">
                        Mensaje Rápido
                    </h3>
                    <p className="text-blue-100 font-medium flex items-center gap-2 text-sm opacity-90">
                        Para: <span className="bg-white/20 px-2 py-0.5 rounded-lg font-bold text-white shadow-sm border border-white/10 uppercase tracking-wider">{techName}</span>
                    </p>
                </div>

                <div className="relative -mt-6 px-6 pb-6">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-1">
                        <div className="flex gap-2 overflow-x-auto p-3 pb-1 no-scrollbar">
                            <button onClick={() => quickMsg("⚡ Prioridad Urgente, por favor revisar.")} className="whitespace-nowrap px-3 py-1.5 bg-yellow-50 text-yellow-700 rounded-lg text-[10px] font-bold border border-yellow-100 hover:bg-yellow-100 transition active:scale-95 flex items-center gap-1"><Zap className="w-3 h-3"/> Urgente</button>
                            <button onClick={() => quickMsg("📞 Llámame cuando puedas.")} className="whitespace-nowrap px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-[10px] font-bold border border-green-100 hover:bg-green-100 transition active:scale-95 flex items-center gap-1"><Phone className="w-3 h-3"/> Llámame</button>
                            <button onClick={() => quickMsg("👀 ¿En qué estado está esto?")} className="whitespace-nowrap px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-bold border border-blue-100 hover:bg-blue-100 transition active:scale-95 flex items-center gap-1"><Sparkles className="w-3 h-3"/> Status</button>
                        </div>
                        <div className="p-3">
                            <textarea
                                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 text-slate-700 font-medium focus:bg-white focus:border-blue-400 focus:ring-4 focus:ring-blue-50 outline-none transition-all resize-none text-sm leading-relaxed placeholder:text-slate-300 shadow-inner"
                                placeholder="Escribe tu mensaje aquí..."
                                rows={4}
                                value={msg}
                                onChange={e => setMsg(e.target.value)}
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className="mt-6">
                        <button
                            onClick={handleSend}
                            disabled={!msg.trim() || isSending}
                            className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg flex items-center justify-center gap-3 transition-all transform active:scale-95 ${
                                isSending
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-blue-200 hover:-translate-y-1'
                            }`}
                        >
                            {isSending ? (
                                <>Enviando <Loader2 className="w-4 h-4 animate-spin"/></>
                            ) : (
                                <>Enviar Nota <Send className="w-4 h-4" /></>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- MODAL: CONFIRM APPROVAL ---
// ... (ConfirmApprovalModal, AssignTechModal, ExternalRepairModal remain same) ...
const AssignTechModal = ({ users, onClose, onConfirm }: any) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
        <div className="bg-white rounded-lg p-6 max-w-sm w-full" onClick={e=>e.stopPropagation()}>
            <h3 className="font-bold mb-4">Asignar Técnico</h3>
            {users.map((u:any) => <div key={u.id} onClick={()=>onConfirm(u.id, u.name)} className="p-2 hover:bg-slate-100 cursor-pointer">{u.name}</div>)}
        </div>
    </div>
);
const ExternalRepairModal = ({ onClose, onConfirm }: any) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
        <div className="bg-white rounded-lg p-6 max-w-sm w-full" onClick={e=>e.stopPropagation()}>
            <h3 className="font-bold mb-4">Envío Externo</h3>
            <div className="space-y-2">
                <button onClick={()=>onConfirm("BRENY NIZAO", "Reparación Externa")} className="bg-purple-600 text-white p-3 rounded w-full font-bold text-sm">BRENI NIZAO</button>
                <button onClick={()=>onConfirm("JUNIOR BARON", "Reparación Externa")} className="bg-indigo-600 text-white p-3 rounded w-full font-bold text-sm">JUNIOR BARON</button>
            </div>
            <button onClick={onClose} className="mt-4 text-slate-500 text-xs w-full text-center hover:underline">Cancelar</button>
        </div>
    </div>
);

export const OrderDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { 
    orders, updateOrderDetails, updateOrderStatus, addOrderLog, showNotification, 
    addPayments, resolveReturn, deleteOrder, initiateTransfer, assignOrder, requestExternalRepair,
    resolveAssignmentRequest, validateOrder, confirmTransfer, resolveExternalRepair, receiveFromExternal,
    fetchOrderById, sendTechMessage, resolveTechMessage, debatePoints, recordOrderLog, requestAssignment
  } = useOrders();
  
  const { currentUser, users } = useAuth();

  const order = orders.find(o => o.id === id);

  // States
  const [isEditing, setIsEditing] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showPointsModal, setShowPointsModal] = useState(false); 
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showExternalModal, setShowExternalModal] = useState(false);
  const [isDepositMode, setIsDepositMode] = useState(false);
  const [showConfirmApproval, setShowConfirmApproval] = useState(false); 
  const [showTechMsgModal, setShowTechMsgModal] = useState(false);
  const [isSubmittingPoints, setIsSubmittingPoints] = useState(false);
  
  // Edit Form State
  const [editForm, setEditForm] = useState<any>({});
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [finalPriceInput, setFinalPriceInput] = useState('');
  const [note, setNote] = useState('');

  // 1. Optimized Fetch Logic (REMOVED - Derived from Context)

  // 2. Initialize Form Data
  useEffect(() => {
      if (order) {
          setNote(order.technicianNotes || '');
          setEditForm({
              customerName: order.customer.name,
              customerPhone: order.customer.phone,
              deviceModel: order.deviceModel,
              deviceIssue: order.deviceIssue,
              priority: order.priority,
              deadline: order.deadline ? new Date(order.deadline - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 16) : '',
              imei: order.imei,
              deviceStorage: order.deviceStorage,
              batteryHealth: order.batteryHealth,
              unlockStatus: order.unlockStatus,
              accessories: order.accessories,
              devicePassword: order.devicePassword
          });
          setExpenses(order.expenses || []);
          const price = order.finalPrice > 0 ? order.finalPrice : order.estimatedCost;
          setFinalPriceInput(isNaN(price) ? '0' : price.toString());
      }
  }, [order]);

  const assignedUser = useMemo(() => users.find(u => u.id === order?.assignedTo), [order, users]);

  // Loading check removed
  if (!order) return <div className="p-8 text-center text-red-500">Orden no encontrada.</div>;

  // Permissions & Variables
  const isTech = currentUser?.role === UserRole.TECHNICIAN;
  const isAdmin = currentUser?.role === UserRole.ADMIN;
  const isMonitor = currentUser?.role === UserRole.MONITOR;
  const canEdit = currentUser?.permissions?.canEditOrderDetails || isAdmin;
  const canDeliver = currentUser?.permissions?.canDeliverOrder || isAdmin;
  // Everyone can view accounting details now
  const canViewAccounting = true; 
  const canEditExpenses = currentUser?.permissions?.canEditExpenses || isAdmin;

  // Check for Pending Points Request
  const pendingPointRequest = order.pointRequest && order.pointRequest.status === 'PENDING';
  const canApprovePoints = isAdmin || isMonitor;

  // --- RESTORED HANDLERS ---

  const handleStatusChange = async (newStatus: OrderStatus) => {
      if (newStatus === OrderStatus.REPAIRED) {
          setShowPointsModal(true);
          return;
      }
      if (newStatus === OrderStatus.WAITING_APPROVAL) {
          setShowProposalModal(true);
          return;
      }
      await updateOrderStatus(order.id, newStatus);
      showNotification('success', `Estado cambiado a ${newStatus}`);
  };

  const handleSubmitPoints = async (points: number, reason: string, split?: PointSplit) => {
      if (isSubmittingPoints) return;
      setIsSubmittingPoints(true);
      try {
          const isAutoApproved = points <= 1; // 0 or 1 point is auto-approved
          
          // Construct the log manually to avoid stale state race conditions
          const logMessage = isAutoApproved ? `✅ Finalizado. ${points} pts (Automático).` : `⚠️ Solicitud de ${points} pts enviada a revisión.`;
          const logType = isAutoApproved ? 'SUCCESS' : 'WARNING';
          
          const newLog = {
              date: new Date().toISOString(),
              status: isAutoApproved ? OrderStatus.REPAIRED : order.status,
              note: logMessage,
              technician: currentUser?.name || 'Sistema',
              logType: logType,
              action_type: isAutoApproved ? 'POINTS_AUTO_APPROVED' : 'POINTS_REQUESTED',
              metadata: { points, reason, split }
          };

          const currentHistory = order.history || [];
          const newHistory = [...currentHistory, newLog];

          const updates: Partial<RepairOrder> = {
              status: isAutoApproved ? OrderStatus.REPAIRED : order.status, 
              completedAt: Date.now(),
              pointsAwarded: isAutoApproved ? points : undefined,
              pointRequest: {
                  requestedPoints: points,
                  reason,
                  splitProposal: split,
                  status: isAutoApproved ? 'APPROVED' : 'PENDING',
                  approvedBy: isAutoApproved ? 'Sistema' : undefined,
                  requestedAt: Date.now()
              },
              history: newHistory // Pass history directly to avoid separate update
          };

          if (isAutoApproved && split) {
              updates.pointsSplit = split;
          }

          await updateOrderDetails(order.id, updates);
          
          setShowPointsModal(false);
          
          if(isAutoApproved) sendWhatsAppNotification(order, OrderStatus.REPAIRED);
          else showNotification('success', 'Solicitud de puntos enviada');
      } catch (error) {
          console.error("Error submitting points:", error);
          showNotification('error', 'Error al procesar la solicitud. Intente nuevamente.');
      } finally {
          setIsSubmittingPoints(false);
      }
  };

  const handleAddExpense = async (desc: string, amount: number) => { 
      const newExp: Expense = { id: Date.now().toString(), description: desc, amount, date: Date.now() };
      const newExpenses = [...expenses, newExp];
      await updateOrderDetails(order.id, { expenses: newExpenses }); 
  };
  const handleRemoveExpense = async (eid: string) => { 
      const newExpenses = expenses.filter(e => e.id !== eid);
      await updateOrderDetails(order.id, { expenses: newExpenses }); 
  };
  const handleEditExpense = async (eid: string, desc: string, amount: number) => { 
      const newExpenses = expenses.map(e => e.id === eid ? { ...e, description: desc, amount } : e);
      await updateOrderDetails(order.id, { expenses: newExpenses }); 
  };
  const handleUpdatePrice = async () => { 
      await updateOrderDetails(order.id, { finalPrice: parseFloat(finalPriceInput) }); 
  };

  const handleRequestReturn = async (reason: string, fee: number) => {
      const request = {
          reason,
          diagnosticFee: fee,
          requestedBy: currentUser?.name || 'Técnico',
          requestedAt: Date.now(),
          status: 'PENDING' as 'PENDING'
      };
      // Si hay cobro de chequeo, actualizamos el precio final de una vez (o lo dejamos para la aprobación)
      // La instrucción dice: "Al solicitar devolución, el técnico debe indicar si se cobra chequeo y el monto".
      // "Al APROBAR la devolución... Actualizar el precio final de la orden al monto indicado".
      // Así que aquí solo guardamos la solicitud.
      
      await updateOrderDetails(order.id, { returnRequest: request });
      await addOrderLog(order.id, order.status, `⚠️ SOLICITUD DEVOLUCIÓN: ${reason}. Chequeo: $${fee}`, currentUser?.name, 'WARNING');
      setShowReturnModal(false);
      showNotification('success', 'Solicitud enviada a supervisión');
  };

  const handleBudgetResponse = async (approve: boolean) => {
      if (!order || !currentUser) return;
      if (approve) {
          setShowConfirmApproval(true);
      } else {
          await updateOrderStatus(order.id, OrderStatus.DIAGNOSIS, `❌ Presupuesto RECHAZADO por ${currentUser.name}.`);
      }
  };

  const handleConfirmApproval = async (finalAmount: string, instructions: string) => {
      if (!order || !currentUser) return;
      const newEstimate = parseFloat(finalAmount);
      const currentNotes = order.technicianNotes || '';
      const updatedNotes = instructions.trim() ? `${currentNotes}\n\n[APROBACIÓN (${currentUser.name})]: ${instructions}` : currentNotes;
      
      const newLog = {
          date: new Date().toISOString(),
          status: OrderStatus.IN_REPAIR,
          note: `✅ APROBADO: Presupuesto $${finalAmount}. Notas: ${instructions || 'Ninguna'}`,
          technician: currentUser.name,
          logType: 'SUCCESS' as LogType,
          action_type: 'BUDGET_APPROVED',
          metadata: { amount: finalAmount, instructions }
      };

      const currentHistory = order.history || [];
      const newHistory = [...currentHistory, newLog];

      await updateOrderDetails(order.id, { 
          status: OrderStatus.IN_REPAIR,
          estimatedCost: !isNaN(newEstimate) ? newEstimate : order.estimatedCost,
          finalPrice: !isNaN(newEstimate) ? newEstimate : order.finalPrice,
          technicianNotes: updatedNotes,
          approvalAckPending: true,
          history: newHistory
      });
      
      setShowConfirmApproval(false);
      showNotification('success', 'Aprobación registrada y enviada al técnico.');
  };

  const handlePointsResponse = async (approve: boolean) => {
      if (!order || !order.pointRequest || !currentUser) return;
      if (approve) {
          const newLog = {
              date: new Date().toISOString(),
              status: OrderStatus.REPAIRED,
              note: `✅ Puntos APROBADOS (${order.pointRequest.requestedPoints}) por ${currentUser.name}.`,
              technician: currentUser.name,
              logType: 'SUCCESS' as LogType,
              action_type: 'POINTS_APPROVED',
              metadata: { points: order.pointRequest.requestedPoints }
          };
          
          const currentHistory = order.history || [];
          const newHistory = [...currentHistory, newLog];

          const updates: Partial<RepairOrder> = { 
              pointsAwarded: order.pointRequest.requestedPoints, 
              pointRequest: { ...order.pointRequest, status: 'APPROVED', approvedBy: currentUser.name },
              status: OrderStatus.REPAIRED,
              history: newHistory
          };
          if (order.pointRequest.splitProposal) updates.pointsSplit = order.pointRequest.splitProposal;
          await updateOrderDetails(order.id, updates);
          sendWhatsAppNotification(order, OrderStatus.REPAIRED);
      } else {
          const newLog = {
              date: new Date().toISOString(),
              status: order.status,
              note: `❌ Solicitud de puntos RECHAZADA por ${currentUser.name}.`,
              technician: currentUser.name,
              logType: 'DANGER' as LogType,
              action_type: 'POINTS_REJECTED',
              metadata: { requested: order.pointRequest.requestedPoints }
          };
          
          const currentHistory = order.history || [];
          const newHistory = [...currentHistory, newLog];

          await updateOrderDetails(order.id, { 
              pointsAwarded: 0, 
              pointRequest: { ...order.pointRequest, status: 'REJECTED', approvedBy: currentUser.name },
              history: newHistory
          });
      }
  };

  const handleAckApproval = async () => {
      if(!order || !currentUser) return;
      // a) marcar la alerta como resuelta
      await updateOrderDetails(order.id, { approvalAckPending: false });
      // b) registrar historial
      await recordOrderLog(order.id, 'APPROVAL_ACKNOWLEDGED', `🤓 TÉCNICO CONFIRMÓ INSTRUCCIONES: El técnico ${currentUser.name} ha leído y aceptado la aprobación.`, { technician: currentUser.name }, 'INFO', currentUser.name);
      // c) permitir continuar a la etapa siguiente (reparación) según lógica actual
      // (La lógica actual ya permite editar/avanzar si el estado es IN_REPAIR, que ya debería estar seteado al aprobar presupuesto)
      showNotification('success', 'Confirmado');
  };

  const handleSendTechMessage = async (msg: string) => {
      if (!currentUser) return;
      await sendTechMessage(order.id, msg, currentUser.name);
      setShowTechMsgModal(false);
      showNotification('success', 'Mensaje enviado al técnico.');
  };

  const handleReadMessage = async () => {
      await resolveTechMessage(order.id);
      showNotification('success', 'Mensaje marcado como leído');
  };

  const handleAssignmentResponse = async (accept: boolean) => {
      if (!order || !currentUser) return;
      await resolveAssignmentRequest(order.id, accept, currentUser.id, currentUser.name);
      showNotification('success', accept ? 'Orden aceptada' : 'Asignación rechazada');
  };

  const handleSelfAssign = async () => {
      if (!currentUser) return;
      if (confirm("¿Asignarte esta orden para comenzar el diagnóstico?")) {
          await assignOrder(order.id, currentUser.id, currentUser.name);
          showNotification('success', 'Orden asignada correctamente');
      }
  };

  const handleAssign = async (userId: string, name: string) => {
      // If I am a technician transferring to another technician, it must be a request
      if (currentUser?.role === UserRole.TECHNICIAN && userId !== currentUser.id) {
          await requestAssignment(order!.id, userId, name, currentUser.name);
          setShowAssignModal(false);
          showNotification('success', `Solicitud de traspaso enviada a ${name}`);
      } else {
          // Admin or self-assign (or other roles) can force assignment
          await assignOrder(order!.id, userId, name);
          setShowAssignModal(false);
          showNotification('success', `Asignado a ${name}`);
      }
  };

  const handleTransfer = async () => {
      const target = order.currentBranch === 'T1' ? 'T4' : 'T1';
      if(confirm(`¿Iniciar traslado hacia ${target}? El equipo quedará en tránsito.`)) {
          await initiateTransfer(order.id, target, currentUser?.name || 'Sistema');
          showNotification('success', 'Traslado iniciado');
      }
  };

  const handleTransferReceive = async () => {
      if(!order || !currentUser) return;
      await confirmTransfer(order.id, currentUser.name);
      showNotification('success', 'Equipo recibido en sucursal');
  };

  const handleTransferReject = async () => {
      if (!order || !currentUser) return;
      if (!confirm("¿Rechazar el traslado de este equipo?")) return;
      
      await updateOrderDetails(order.id, { 
          transferStatus: 'NONE', 
          transferTarget: null 
      });
      await recordOrderLog(order.id, 'TRANSFER_REJECTED', `🚫 TRASLADO RECHAZADO por ${currentUser.name}.`, {}, 'DANGER', currentUser.name);
      showNotification('success', 'Traslado rechazado.');
  };

  const handleClaimOrder = async () => {
      if (!order || !currentUser) return;
      if (confirm("¿Reclamar esta orden y asignártela?")) {
          await updateOrderDetails(order.id, { assignedTo: currentUser.id });
          await addOrderLog(order.id, order.status, `Orden reclamada por ${currentUser.name}`, currentUser.name, 'INFO');
          showNotification('success', 'Orden reclamada exitosamente');
      }
  };

  const handleReturnResponse = async (approve: boolean) => {
      if (!order || !order.returnRequest || !currentUser) return;
      
      if (approve) {
          const fee = order.returnRequest.diagnosticFee || 0;
          
          const newLog = {
              date: new Date().toISOString(),
              status: OrderStatus.REPAIRED,
              note: `✅ DEVOLUCIÓN APROBADA por ${currentUser.name}. Costo Chequeo: $${fee}`,
              technician: currentUser.name,
              logType: 'SUCCESS' as LogType,
              action_type: 'RETURN_APPROVED',
              metadata: { fee }
          };
          
          const currentHistory = order.history || [];
          const newHistory = [...currentHistory, newLog];

          // Apply fee, set status to REPAIRED (Ready for delivery), approve request
          await updateOrderDetails(order.id, { 
              status: OrderStatus.REPAIRED,
              finalPrice: fee,
              returnRequest: { ...order.returnRequest, status: 'APPROVED', approvedBy: currentUser.name },
              history: newHistory
          });
          showNotification('success', 'Devolución aprobada. Orden lista para entregar.');
      } else {
          const newLog = {
              date: new Date().toISOString(),
              status: order.status,
              note: `❌ Devolución RECHAZADA por ${currentUser.name}.`,
              technician: currentUser.name,
              logType: 'DANGER' as LogType,
              action_type: 'RETURN_REJECTED',
              metadata: {}
          };
          
          const currentHistory = order.history || [];
          const newHistory = [...currentHistory, newLog];

          await updateOrderDetails(order.id, { 
              returnRequest: { ...order.returnRequest, status: 'REJECTED', approvedBy: currentUser.name },
              history: newHistory
          });
          showNotification('success', 'Solicitud de devolución rechazada.');
      }
  };

  const handleExternal = async (workshop: any, reason: string) => {
      await requestExternalRepair(order.id, workshop, reason, currentUser?.name || 'Sistema');
      setShowExternalModal(false);
      showNotification('success', 'Solicitud de envío externo registrada');
  };

  const handleExternalResponse = async (approve: boolean) => {
      if(!order || !currentUser) return;
      await resolveExternalRepair(order.id, approve, currentUser.name);
  };

  const handleReceiveExternal = async () => {
      if(!order || !currentUser) return;
      const note = prompt("Nota de recepción (Estado del equipo, costo, etc):");
      if (note === null) return; // Cancelled
      await receiveFromExternal(order.id, note || "Sin nota", currentUser.name);
      showNotification('success', 'Equipo recibido de taller externo');
  };

  // --- REQUIRED RESTORED HANDLERS ---

  const handleSaveChanges = async () => {
      if (!order) return;
      const updates: Partial<RepairOrder> = {
          customer: { ...order.customer, name: editForm.customerName, phone: editForm.customerPhone },
          deviceModel: editForm.deviceModel,
          deviceIssue: editForm.deviceIssue,
          priority: editForm.priority,
          imei: editForm.imei,
          deviceStorage: editForm.deviceStorage,
          batteryHealth: editForm.batteryHealth,
          unlockStatus: editForm.unlockStatus,
          accessories: editForm.accessories,
          devicePassword: editForm.devicePassword
      };
      
      // LOG CHANGE OF DEADLINE
      if (editForm.deadline) {
          const dl = new Date(editForm.deadline).getTime();
          if (!isNaN(dl) && dl !== order.deadline) {
              updates.deadline = dl;
              // Auto-log handled in updateOrderDetails
          }
      }
      
      await updateOrderDetails(order.id, updates);
      setIsEditing(false);
      showNotification('success', 'Ficha técnica actualizada');
  };

  const handleDeposit = () => {
      setIsDepositMode(true);
      setShowDeliveryModal(true);
  };

  const handleManualUpdate = async () => { 
      if (!order) return;
      const oldNote = order.technicianNotes || '';
      const newNote = note.trim();
      if (newNote === oldNote) return;
      await updateOrderDetails(order.id, { technicianNotes: newNote });
      await recordOrderLog(order.id, 'NOTE_ADDED', `📝 NOTA BITÁCORA: ${newNote}`, { note: newNote }, 'INFO', currentUser?.name);
      showNotification('success', 'Bitácora guardada');
  };

  const handleDelete = async () => {
      if(confirm('¿ESTÁ SEGURO? Esta acción es irreversible y eliminará todo el historial.')) {
          await deleteOrder(order.id);
          navigate('/orders');
      }
  };

  const handleReopen = async (type: 'WARRANTY' | 'QUALITY') => {
      if (!order || !currentUser) return;
      if (!confirm(`¿Reingresar este equipo a taller por ${type === 'WARRANTY' ? 'GARANTÍA' : 'CALIDAD'}?`)) return;
      const logMsg = type === 'WARRANTY' ? '🛡️ REINGRESO POR GARANTÍA' : '✨ REINGRESO POR CALIDAD/MEJORA';
      await updateOrderDetails(order.id, { status: OrderStatus.DIAGNOSIS, assignedTo: null });
      await addOrderLog(order.id, OrderStatus.DIAGNOSIS, `${logMsg}: Orden reactivada por ${currentUser.name}.`, currentUser.name, 'WARNING');
      showNotification('success', 'Orden reactivada en Taller');
  };

  return (
    <div className="p-4 max-w-[1600px] mx-auto pb-24 font-sans bg-slate-50 min-h-screen">
        {/* Modals */}
        {showReturnModal && <UnrepairableModal onConfirm={handleRequestReturn} onCancel={() => setShowReturnModal(false)} />}
        {showPointsModal && <PointsRequestModal users={users} currentUser={currentUser} onConfirm={handleSubmitPoints} onCancel={() => setShowPointsModal(false)} isSubmitting={isSubmittingPoints} />}
        {showAssignModal && <AssignTechModal users={users} onClose={() => setShowAssignModal(false)} onConfirm={handleAssign} />}
        {showExternalModal && <ExternalRepairModal onClose={() => setShowExternalModal(false)} onConfirm={handleExternal} />}
        {showConfirmApproval && (
            <ConfirmApprovalModal 
                defaultAmount={order.proposedEstimate || order.estimatedCost.toString()} 
                onConfirm={handleConfirmApproval} 
                onCancel={() => setShowConfirmApproval(false)} 
            />
        )}
        {showTechMsgModal && assignedUser && (
            <SendTechMessageModal 
                techName={assignedUser.name} 
                onSend={handleSendTechMessage} 
                onClose={() => setShowTechMsgModal(false)} 
            />
        )}
        {showDeliveryModal && (
            <DeliveryModal 
                finalPriceInput={finalPriceInput}
                setFinalPriceInput={setFinalPriceInput}
                alreadyPaid={(order.payments || []).reduce((acc, p) => acc + p.amount, 0)}
                onConfirm={async (payments, printWindow) => {
                    console.log("--- INICIO onConfirm (OrderDetails) ---");
                    try {
                        let orderToPrint = order;

                        if (isDepositMode) {
                            // Handle Deposit (Abono)
                            await addPayments(order.id, payments);
                            await addOrderLog(order.id, order.status, `💰 ABONO RECIBIDO: $${payments.reduce((s,p)=>s+p.amount,0)}`, currentUser?.name, 'SUCCESS');
                            
                            orderToPrint = { ...order, payments: [...(order.payments || []), ...payments] };
                            showNotification('success', 'Abono registrado');
                            
                            setShowDeliveryModal(false);
                            setIsDepositMode(false);
                            
                            setTimeout(() => {
                                try { printInvoice(orderToPrint, printWindow); } catch(e) { console.error(e); }
                            }, 100);
                        } else {
                            // CRITICAL DELIVERY FLOW
                            const updatedOrder = await finalizeDelivery(order, payments, currentUser!, addPayments, recordOrderLog);
                            
                            // Construct temp order for printing (since we navigate away)
                            orderToPrint = {
                                ...updatedOrder,
                                // status: OrderStatus.RETURNED, // Already set in updatedOrder
                                // payments: [...(order.payments || []), ...payments] // Already set in updatedOrder
                            };

                            showNotification('success', 'Orden finalizada y entregada');
                            
                            setShowDeliveryModal(false);
                            setIsDepositMode(false);

                            // NAVIGATE IMMEDIATELY (Prevent Freeze)
                            navigate('/taller');

                            setTimeout(() => {
                                try {
                                    printInvoice(orderToPrint, printWindow);
                                } catch (printError) {
                                    console.error("Error al imprimir:", printError);
                                }
                            }, 500);
                        }

                    } catch (error: any) {
                        console.error("Error en proceso de entrega (onConfirm):", error);
                        showNotification('error', error.message || 'Error desconocido');
                    } finally {
                         console.log("--- FIN onConfirm ---");
                    }
                }}
                onCancel={() => { setShowDeliveryModal(false); setIsDepositMode(false); }}
                isSaving={false}
                isReturn={order.status === OrderStatus.REPAIRED && order.returnRequest?.status === 'APPROVED'}
                isDeposit={isDepositMode}
            />
        )}
        {showProposalModal && (
             <ProposalModal 
                onConfirm={async (est, note, type) => {
                    await updateOrderDetails(order.id, { 
                        status: OrderStatus.WAITING_APPROVAL,
                        proposedEstimate: est,
                        proposalType: type,
                        technicianNotes: (order.technicianNotes || '') + `\n[PROPUESTA]: ${type === 'MONETARY' ? `$${est}` : 'AUTORIZACIÓN'}: ${note}`
                    });
                    setShowProposalModal(false);
                    showNotification('success', 'Propuesta enviada al cliente/monitor');
                }}
                onCancel={() => setShowProposalModal(false)}
             />
        )}

        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
            <button onClick={() => navigate(-1)} className="p-2 bg-white rounded-full shadow-sm hover:bg-slate-100"><ArrowLeft className="w-5 h-5"/></button>
            <div>
                <h1 className="text-3xl font-black text-slate-800 flex items-center gap-2">
                    #{order.readable_id || order.id.slice(-4)}
                    {order.orderType === OrderType.STORE && <span className="bg-red-600 text-white px-2 py-1 rounded text-xs font-bold uppercase shadow-sm">RECIBIDO</span>}
                    <span className="text-sm font-medium text-slate-400">/ {order.deviceModel}</span>
                </h1>
                <div className="flex items-center gap-3 text-sm mt-1">
                    <span className="font-bold text-slate-500 uppercase">CLIENTE: {order.customer.name}</span>
                    <div className="flex items-center gap-1.5 bg-slate-800 px-3 py-1 rounded-full border border-slate-700 shadow-md">
                        <span className="font-black text-white uppercase text-sm tracking-wider">{order.branch || 'T4'}</span>
                    </div>
                    {assignedUser ? (
                        <div className="flex items-center gap-1.5 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                            <span className="text-[10px] text-blue-400 font-bold uppercase">TÉCNICO:</span>
                            <span className="font-black text-blue-700 uppercase text-xs">{assignedUser.name}</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200 opacity-50">
                            <span className="text-[10px] text-slate-400 font-bold uppercase">SIN ASIGNAR</span>
                        </div>
                    )}
                </div>
            </div>
            <div className="ml-auto flex gap-2">
                 <button onClick={() => printSticker(order)} className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-slate-50"><Smartphone className="w-4 h-4"/> QR</button>
                 <button onClick={() => printInvoice(order)} className="bg-slate-800 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-slate-900"><Printer className="w-4 h-4"/> Recibo</button>
            </div>
        </div>

        {/* Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* LEFT COLUMN (3/12): Image, Ficha & Control Panel */}
            <div className="lg:col-span-3 space-y-6">
                <TechnicalSheet 
                    order={order}
                    isEditing={isEditing}
                    setIsEditing={setIsEditing}
                    editForm={editForm}
                    setEditForm={setEditForm}
                    isAdmin={isAdmin}
                    canEdit={canEdit}
                    onSave={handleSaveChanges}
                />

                <ControlPanel 
                    order={order}
                    isAdmin={isAdmin}
                    currentUser={currentUser}
                    canDeliver={canDeliver}
                    onReturn={() => setShowReturnModal(true)}
                    onDeliver={() => setShowDeliveryModal(true)}
                    onAssign={() => setShowAssignModal(true)}
                    onTransfer={handleTransfer}
                    onDeposit={handleDeposit}
                    onExternal={() => setShowExternalModal(true)}
                    onDelete={handleDelete}
                    onReopenWarranty={() => handleReopen('WARRANTY')}
                    onReopenQuality={() => handleReopen('QUALITY')}
                    onNotifyTech={() => setShowTechMsgModal(true)}
                    onReceiveExternal={handleReceiveExternal}
                    onAcceptAssignment={() => handleAssignmentResponse(true)}
                    onRejectAssignment={() => handleAssignmentResponse(false)}
                    onClaim={handleClaimOrder}
                />
            </div>

            {/* RIGHT COLUMN (9/12) */}
            <div className="lg:col-span-9 space-y-6">
                
                {/* -2. TRANSFER ALERT BANNER (NEW) */}
                {order.transferStatus === 'PENDING' && order.transferTarget === (currentUser?.branch || 'T4') && (
                    <div className="bg-blue-600 text-white p-6 rounded-3xl shadow-xl shadow-blue-200 mb-6 flex flex-col md:flex-row justify-between items-center gap-6 animate-in slide-in-from-top-4 border-4 border-white/20 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12">
                            <ArrowRightLeft className="w-48 h-48 text-white" />
                        </div>
                        <div className="relative z-10 flex items-center gap-6">
                            <div className="bg-white/20 p-4 rounded-2xl shadow-inner backdrop-blur-sm animate-pulse">
                                <ArrowRightLeft className="w-10 h-10 text-white" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="bg-white text-blue-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest shadow-sm">Acción Requerida</span>
                                    <span className="text-blue-100 text-xs font-bold uppercase tracking-wider opacity-80">Traslado Entrante</span>
                                </div>
                                <h3 className="text-3xl font-black text-white tracking-tight leading-none mb-2">
                                    Recibir Equipo
                                </h3>
                                <p className="text-blue-100 font-medium text-sm max-w-md leading-snug opacity-90">
                                    Este equipo viene trasladado desde otra sucursal. Confirma la recepción.
                                </p>
                            </div>
                        </div>
                        <div className="relative z-10 flex gap-3 w-full md:w-auto">
                            <button 
                                onClick={handleTransferReject} 
                                className="flex-1 md:flex-none px-6 py-4 bg-white/10 border-2 border-white/20 text-white rounded-2xl font-black text-xs uppercase hover:bg-white/20 transition active:scale-95 flex flex-col items-center justify-center gap-1"
                            >
                                <XCircle className="w-5 h-5 opacity-80"/> Rechazar
                            </button>
                            <button 
                                onClick={handleTransferReceive} 
                                className="flex-[2] md:flex-none px-8 py-4 bg-white text-blue-600 rounded-2xl font-black text-sm uppercase shadow-lg hover:bg-blue-50 transition active:scale-95 flex flex-col items-center justify-center gap-1 hover:shadow-xl hover:-translate-y-1 transform duration-200"
                            >
                                <CheckCircle2 className="w-6 h-6 text-blue-600"/> Recibir Ahora
                            </button>
                        </div>
                    </div>
                )}

                {/* -1.5. EXTERNAL REPAIR REQUEST BANNER */}
                {order.externalRepair?.status === 'PENDING' && (
                    <div className="bg-purple-600 text-white p-6 rounded-3xl shadow-xl shadow-purple-200 mb-6 flex flex-col md:flex-row justify-between items-center gap-6 animate-in slide-in-from-top-4 border-4 border-white/20 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12">
                            <Truck className="w-48 h-48 text-white" />
                        </div>
                        <div className="relative z-10 flex items-center gap-6">
                            <div className="bg-white/20 p-4 rounded-2xl shadow-inner backdrop-blur-sm animate-pulse">
                                <Truck className="w-10 h-10 text-white" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="bg-white text-purple-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest shadow-sm">Acción Requerida</span>
                                    <span className="text-purple-100 text-xs font-bold uppercase tracking-wider opacity-80">Solicitud Externa</span>
                                </div>
                                <h3 className="text-3xl font-black text-white tracking-tight leading-none mb-2">
                                    Envío a Taller
                                </h3>
                                <p className="text-purple-100 font-medium text-sm max-w-md leading-snug opacity-90">
                                    Solicitud de envío a <b>{order.externalRepair.targetWorkshop}</b>. Razón: {order.externalRepair.reason}
                                </p>
                            </div>
                        </div>
                        <div className="relative z-10 flex gap-3 w-full md:w-auto">
                            <button 
                                onClick={() => handleExternalResponse(false)} 
                                className="flex-1 md:flex-none px-6 py-4 bg-white/10 border-2 border-white/20 text-white rounded-2xl font-black text-xs uppercase hover:bg-white/20 transition active:scale-95 flex flex-col items-center justify-center gap-1"
                            >
                                <XCircle className="w-5 h-5 opacity-80"/> Rechazar
                            </button>
                            <button 
                                onClick={() => handleExternalResponse(true)} 
                                className="flex-[2] md:flex-none px-8 py-4 bg-white text-purple-600 rounded-2xl font-black text-sm uppercase shadow-lg hover:bg-purple-50 transition active:scale-95 flex flex-col items-center justify-center gap-1 hover:shadow-xl hover:-translate-y-1 transform duration-200"
                            >
                                <CheckCircle2 className="w-6 h-6 text-purple-600"/> Aprobar Envío
                            </button>
                        </div>
                    </div>
                )}

                {/* -1.4. RETURN REQUEST BANNER */}
                {order.returnRequest?.status === 'PENDING' && (
                    <div className="bg-red-600 text-white p-6 rounded-3xl shadow-xl shadow-red-200 mb-6 flex flex-col md:flex-row justify-between items-center gap-6 animate-in slide-in-from-top-4 border-4 border-white/20 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12">
                            <Reply className="w-48 h-48 text-white" />
                        </div>
                        <div className="relative z-10 flex items-center gap-6">
                            <div className="bg-white/20 p-4 rounded-2xl shadow-inner backdrop-blur-sm animate-pulse">
                                <Reply className="w-10 h-10 text-white" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="bg-white text-red-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest shadow-sm">Acción Requerida</span>
                                    <span className="text-red-100 text-xs font-bold uppercase tracking-wider opacity-80">Devolución Pendiente</span>
                                </div>
                                <h3 className="text-3xl font-black text-white tracking-tight leading-none mb-2">
                                    Solicitud de Devolución
                                </h3>
                                <p className="text-red-100 font-medium text-sm max-w-md leading-snug opacity-90">
                                    Razón: {order.returnRequest.reason}. 
                                    {order.returnRequest.diagnosticFee > 0 && <span className="block mt-1 bg-black/20 px-2 py-1 rounded w-fit">Costo Chequeo: ${order.returnRequest.diagnosticFee}</span>}
                                </p>
                            </div>
                        </div>
                        <div className="relative z-10 flex gap-3 w-full md:w-auto">
                            <button 
                                onClick={() => handleReturnResponse(false)} 
                                className="flex-1 md:flex-none px-6 py-4 bg-white/10 border-2 border-white/20 text-white rounded-2xl font-black text-xs uppercase hover:bg-white/20 transition active:scale-95 flex flex-col items-center justify-center gap-1"
                            >
                                <XCircle className="w-5 h-5 opacity-80"/> Rechazar
                            </button>
                            <button 
                                onClick={() => handleReturnResponse(true)} 
                                className="flex-[2] md:flex-none px-8 py-4 bg-white text-red-600 rounded-2xl font-black text-sm uppercase shadow-lg hover:bg-red-50 transition active:scale-95 flex flex-col items-center justify-center gap-1 hover:shadow-xl hover:-translate-y-1 transform duration-200"
                            >
                                <CheckCircle2 className="w-6 h-6 text-red-600"/> Aprobar Devolución
                            </button>
                        </div>
                    </div>
                )}

                {/* -1. PENDING ASSIGNMENT BANNER (NEW) */}
                {order.pending_assignment_to === currentUser?.id && (
                    <div className="bg-indigo-600 text-white p-6 rounded-3xl shadow-xl shadow-indigo-200 mb-6 flex flex-col md:flex-row justify-between items-center gap-6 animate-in slide-in-from-top-4 border-4 border-white/20 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12">
                            <User className="w-48 h-48 text-white" />
                        </div>
                        <div className="relative z-10 flex items-center gap-6">
                            <div className="bg-white/20 p-4 rounded-2xl shadow-inner backdrop-blur-sm animate-pulse">
                                <User className="w-10 h-10 text-white" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="bg-white text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest shadow-sm">Acción Requerida</span>
                                    <span className="text-indigo-100 text-xs font-bold uppercase tracking-wider opacity-80">Solicitud de Traspaso</span>
                                </div>
                                <h3 className="text-3xl font-black text-white tracking-tight leading-none mb-2">
                                    ¿Aceptas esta orden?
                                </h3>
                                <p className="text-indigo-100 font-medium text-sm max-w-md leading-snug opacity-90">
                                    Se te ha asignado esta reparación. Confirma para comenzar.
                                </p>
                            </div>
                        </div>
                        <div className="relative z-10 flex gap-3 w-full md:w-auto">
                            <button 
                                onClick={() => handleAssignmentResponse(false)} 
                                className="flex-1 md:flex-none px-6 py-4 bg-white/10 border-2 border-white/20 text-white rounded-2xl font-black text-xs uppercase hover:bg-white/20 transition active:scale-95 flex flex-col items-center justify-center gap-1"
                            >
                                <XCircle className="w-5 h-5 opacity-80"/> Rechazar
                            </button>
                            <button 
                                onClick={() => handleAssignmentResponse(true)} 
                                className="flex-[2] md:flex-none px-8 py-4 bg-white text-indigo-600 rounded-2xl font-black text-sm uppercase shadow-lg hover:bg-indigo-50 transition active:scale-95 flex flex-col items-center justify-center gap-1 hover:shadow-xl hover:-translate-y-1 transform duration-200"
                            >
                                <CheckCircle2 className="w-6 h-6 text-indigo-600"/> Aceptar Orden
                            </button>
                        </div>
                    </div>
                )}

                {/* 0. BUDGET APPROVAL BANNER (NEW - HIGH PRIORITY) */}
                {order.status === OrderStatus.WAITING_APPROVAL && currentUser?.role !== UserRole.TECHNICIAN && (
                    <div className="bg-orange-500 text-white p-6 rounded-3xl shadow-xl shadow-orange-200 mb-6 flex flex-col md:flex-row justify-between items-center gap-6 animate-in slide-in-from-top-4 border-4 border-white/20 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12">
                            <HandCoins className="w-48 h-48 text-white" />
                        </div>
                        <div className="relative z-10 flex items-center gap-6">
                            <div className="bg-white/20 p-4 rounded-2xl shadow-inner backdrop-blur-sm animate-pulse">
                                <HandCoins className="w-10 h-10 text-white" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="bg-white text-orange-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest shadow-sm">Acción Requerida</span>
                                    <span className="text-orange-100 text-xs font-bold uppercase tracking-wider opacity-80">Presupuesto Pendiente</span>
                                </div>
                                <h3 className="text-3xl font-black text-white tracking-tight leading-none mb-2">
                                    ${(order.proposedEstimate || order.estimatedCost).toLocaleString()}
                                </h3>
                                <p className="text-orange-100 font-medium text-sm max-w-md leading-snug opacity-90">
                                    El técnico ha propuesto este monto. ¿El cliente aprueba la reparación?
                                </p>
                                {order.technicianNotes && order.technicianNotes.includes('[PROPUESTA]') && (
                                    <div className="mt-3 bg-black/10 p-3 rounded-xl border border-white/10 text-xs italic text-orange-50">
                                        "{order.technicianNotes.split('[PROPUESTA]:')[1]?.split('\n')[0] || 'Ver notas...'}"
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="relative z-10 flex gap-3 w-full md:w-auto">
                            <button 
                                onClick={() => handleBudgetResponse(false)} 
                                className="flex-1 md:flex-none px-6 py-4 bg-white/10 border-2 border-white/20 text-white rounded-2xl font-black text-xs uppercase hover:bg-white/20 transition active:scale-95 flex flex-col items-center justify-center gap-1"
                            >
                                <XCircle className="w-5 h-5 opacity-80"/> Rechazar
                            </button>
                            <button 
                                onClick={() => handleBudgetResponse(true)} 
                                className="flex-[2] md:flex-none px-8 py-4 bg-white text-orange-600 rounded-2xl font-black text-sm uppercase shadow-lg hover:bg-orange-50 transition active:scale-95 flex flex-col items-center justify-center gap-1 hover:shadow-xl hover:-translate-y-1 transform duration-200"
                            >
                                <CheckCircle2 className="w-6 h-6 text-green-500"/> Aprobar Reparación
                            </button>
                        </div>
                    </div>
                )}

                {/* 1. APPROVAL ACKNOWLEDGEMENT (NEW - TECHNICIAN ONLY) */}
                {order.approvalAckPending && (currentUser?.role === UserRole.TECHNICIAN && order.assignedTo === currentUser.id) && (
                    <div className="bg-green-600 text-white p-6 rounded-3xl shadow-xl shadow-green-200 mb-6 flex flex-col md:flex-row justify-between items-center gap-6 animate-in slide-in-from-top-4 border-4 border-white/20 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12">
                            <CheckCircle2 className="w-48 h-48 text-white" />
                        </div>
                        <div className="relative z-10 flex items-center gap-6">
                            <div className="bg-white/20 p-4 rounded-2xl shadow-inner backdrop-blur-sm animate-pulse">
                                <CheckCircle2 className="w-10 h-10 text-white" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="bg-white text-green-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest shadow-sm">Acción Requerida</span>
                                    <span className="text-green-100 text-xs font-bold uppercase tracking-wider opacity-80">Cliente Aprobó</span>
                                </div>
                                <h3 className="text-2xl font-black text-white tracking-tight leading-none mb-2">
                                    ¡Luz Verde para Reparar!
                                </h3>
                                <p className="text-green-100 font-medium text-sm max-w-md leading-snug opacity-90 mb-2">
                                    El cliente ha aceptado el presupuesto. Revisa las instrucciones antes de comenzar.
                                </p>
                                {order.customerNotes && (
                                    <div className="bg-black/20 p-3 rounded-xl border border-white/10 text-xs italic text-green-50">
                                        "Nota Cliente: {order.customerNotes}"
                                    </div>
                                )}
                            </div>
                        </div>
                        <button 
                            onClick={handleAckApproval} 
                            className="relative z-10 px-8 py-4 bg-white text-green-600 rounded-2xl font-black text-sm uppercase shadow-lg hover:bg-green-50 transition active:scale-95 flex flex-col items-center justify-center gap-1 hover:shadow-xl hover:-translate-y-1 transform duration-200 whitespace-nowrap"
                        >
                            <CheckCircle2 className="w-6 h-6 text-green-600"/> CONFIRMAR LECTURA
                        </button>
                    </div>
                )}

                {/* 2. APPROVAL BANNER (NEW - INSIDE ORDER) */}
                {pendingPointRequest && canApprovePoints && (
                    <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-center justify-between shadow-sm animate-in slide-in-from-top-2">
                        <div className="flex items-center gap-4">
                            <div className="bg-orange-100 p-2 rounded-full text-orange-600"><Trophy className="w-6 h-6"/></div>
                            <div>
                                <h3 className="font-bold text-orange-900 text-sm">Solicitud de Comisión</h3>
                                <p className="text-xs text-orange-700">
                                    {order.pointRequest?.splitProposal 
                                        ? `Split: ${users.find(u=>u.id===order.pointRequest?.splitProposal?.primaryTechId)?.name.split(' ')[0]} (${order.pointRequest.splitProposal.primaryPoints}) / ${users.find(u=>u.id===order.pointRequest?.splitProposal?.secondaryTechId)?.name.split(' ')[0]} (${order.pointRequest.splitProposal.secondaryPoints})` 
                                        : `${order.pointRequest?.requestedPoints} Puntos solicitados`
                                    }
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => handlePointsResponse(false)} className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-xl text-xs font-bold hover:bg-red-50 transition">Rechazar</button>
                            <button onClick={async () => { if(confirm('¿Iniciar debate de puntos con el técnico?')) { await debatePoints(order.id, currentUser.name); } }} className="px-4 py-2 bg-yellow-50 border border-yellow-200 text-yellow-600 rounded-xl text-xs font-bold hover:bg-yellow-100 transition">Debatir</button>
                            <button onClick={() => handlePointsResponse(true)} className="px-6 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold shadow-lg hover:bg-orange-600 transition">Aprobar</button>
                        </div>
                    </div>
                )}

                {/* 2. TECH MESSAGE BANNER (NEW - HIGH VISIBILITY FOR TECHNICIAN) */}
                {order.techMessage && order.techMessage.pending && (currentUser?.role === UserRole.TECHNICIAN && order.assignedTo === currentUser.id) && (
                    <div className="bg-blue-600 text-white p-4 rounded-2xl shadow-lg mb-6 flex justify-between items-center animate-in slide-in-from-top-4 border-2 border-white/20">
                        <div className="flex items-center gap-4">
                            <div className="bg-white/20 p-3 rounded-full animate-bounce">
                                <MessageSquare className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase opacity-80 mb-1 flex items-center gap-2">
                                    Mensaje de {order.techMessage.sender} <span className="bg-red-500 text-white px-2 py-0.5 rounded text-[9px]">NUEVO</span>
                                </p>
                                <p className="font-bold text-lg leading-tight tracking-wide">
                                    "{order.techMessage.message}"
                                </p>
                                <p className="text-[10px] opacity-60 mt-1 font-mono">
                                    {new Date(order.techMessage.timestamp).toLocaleString()}
                                </p>
                            </div>
                        </div>
                        <button 
                            onClick={handleReadMessage} 
                            className="bg-white text-blue-600 px-6 py-3 rounded-xl font-black text-xs hover:bg-blue-50 transition shadow-md whitespace-nowrap active:scale-95"
                        >
                            MARCAR LEÍDO
                        </button>
                    </div>
                )}

                {/* 3. TIMELINE */}
                <StageBar 
                    currentStatus={order.status} 
                    onStepClick={(s) => isTech || isAdmin ? handleStatusChange(s) : null} 
                    disabled={!isTech && !isAdmin} 
                />

                {/* 4. NOTES ONLY (Chat Removed) */}
                <ProgressNotes 
                    note={note} 
                    setNote={setNote} 
                    onSave={handleManualUpdate} 
                />

                {/* 5. FINANCIALS & HISTORY */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[500px]">
                    <ExpensesAndParts 
                        order={order}
                        expenses={expenses}
                        setExpenses={setExpenses}
                        finalPriceInput={finalPriceInput}
                        setFinalPriceInput={setFinalPriceInput}
                        canViewAccounting={canViewAccounting}
                        canEdit={canEditExpenses}
                        onAddExpense={handleAddExpense}
                        onRemoveExpense={handleRemoveExpense}
                        onEditExpense={handleEditExpense}
                        handleUpdatePrice={handleUpdatePrice}
                    />
                    <DetailedHistory 
                        history={order.history}
                    />
                </div>
            </div>
        </div>
    </div>
  );
};
