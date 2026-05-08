
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { User, MapPin, Timer, Smartphone, RotateCcw, Truck, MousePointer2 } from 'lucide-react';
import { RepairOrder, PriorityLevel, OrderType, RequestStatus } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { getTimeLeft, getPriorityStyle, getStatusBadgeStyle } from './utils';

interface OrderCardProps {
  order: RepairOrder;
  onClaim: (e: React.MouseEvent, id: string) => void;
}

export const OrderCard: React.FC<OrderCardProps> = ({ order, onClaim }) => {
    const navigate = useNavigate();
    const { users } = useAuth();
    const timeLeft = getTimeLeft(order.deadline, order.status);
    const assignedUser = users.find(u => u.id === order.assignedTo);
    const isUnassigned = !order.assignedTo;
    const isReturn = order.returnRequest?.status === RequestStatus.APPROVED || order.returnRequest?.status === RequestStatus.PENDING;
    const isStore = order.orderType === OrderType.STORE;
    const isQualityReview = order.relatedOrderId && order.orderType === OrderType.REPAIR && order.technicianNotes?.includes('[REVISIÓN/CALIDAD]');
    
    return (
        <div onClick={() => navigate(`/orders/${order.id}`)} className={`bg-white rounded-3xl border shadow-sm hover:shadow-2xl transition-all cursor-pointer group relative overflow-hidden flex flex-col ${order.priority === PriorityLevel.CRITICAL ? 'ring-2 ring-red-100' : ''} ${isReturn ? 'border-l-8 border-l-red-600 bg-red-50/10' : (isUnassigned && !order.externalRepair ? 'border-l-8 border-l-blue-500 bg-gradient-to-br from-blue-50 to-white shadow-lg shadow-blue-100 border-blue-200' : 'border-slate-200')}`}>
            {!isReturn && <div className={`absolute top-0 left-0 bottom-0 w-2 ${getPriorityStyle(order.priority)}`} />}
            <div className="p-6 pl-8 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-4">
                    <div className="flex flex-wrap gap-1.5">
                        {isReturn ? (
                            <span className="text-[8px] sm:text-[9px] font-black bg-red-600 text-white px-1.5 sm:px-2 py-0.5 rounded-full flex items-center gap-1"><RotateCcw className="w-2.5 h-2.5 sm:w-3 sm:h-3"/> {order.returnRequest?.status === RequestStatus.PENDING ? 'SOLICITUD DEVOLUCIÓN' : 'DEVOLUCIÓN'}</span>
                        ) : (
                            <span className={`text-[8px] sm:text-[9px] font-black uppercase px-1.5 sm:px-2 py-0.5 rounded-full ${getPriorityStyle(order.priority)}`}>{order.priority}</span>
                        )}
                        {isStore && <span className="text-[8px] sm:text-[9px] font-black bg-gradient-to-r from-red-600 to-red-800 text-white px-1.5 sm:px-2 py-0.5 rounded-full shadow-sm">RECIBIDO</span>}
                        {order.orderType === OrderType.WARRANTY && <span className="text-[8px] sm:text-[9px] font-black bg-yellow-100 text-yellow-700 px-1.5 sm:px-2 py-0.5 rounded-full border border-yellow-200">GARANTÍA</span>}
                        {isQualityReview && <span className="text-[8px] sm:text-[9px] font-black bg-purple-100 text-purple-700 px-1.5 sm:px-2 py-0.5 rounded-full border border-purple-200">REVISIÓN DE CALIDAD</span>}
                        {order.relatedOrderId && <span className="text-[8px] sm:text-[9px] font-black bg-slate-100 text-slate-600 px-1.5 sm:px-2 py-0.5 rounded-full border border-slate-200">REINGRESO</span>}
                        <span className="text-[8px] sm:text-[9px] font-black bg-slate-800 text-white px-1.5 sm:px-2 py-0.5 rounded-full border border-slate-700 shadow-sm uppercase">ORG: {order.originBranch || order.currentBranch || 'T4'}</span>
                        <span className="text-[8px] sm:text-[9px] font-black bg-blue-100 text-blue-800 px-1.5 sm:px-2 py-0.5 rounded-full border border-blue-200 shadow-sm uppercase">ACT: {order.currentBranch || 'T4'}</span>
                        {isUnassigned && !isReturn && !order.externalRepair && <span className="text-[8px] sm:text-[9px] font-black bg-blue-500 text-white px-1.5 sm:px-2 py-0.5 rounded-full animate-pulse shadow-md">POR ASIGNAR</span>}
                        {order.externalRepair && (
                            <span className={`text-[8px] sm:text-[9px] font-black px-1.5 sm:px-2 py-0.5 rounded-full flex items-center gap-1 border ${order.externalRepair.status === RequestStatus.PENDING ? 'bg-purple-100 text-purple-700 border-purple-200 animate-pulse' : 'bg-purple-600 text-white border-purple-600'}`}><Truck className="w-2.5 h-2.5 sm:w-3 sm:h-3"/> {order.externalRepair.targetWorkshop} {order.externalRepair.status === RequestStatus.PENDING ? '(PEND.)' : ''}</span>
                        )}
                    </div>
                    <span className="font-mono text-[10px] sm:text-xs font-black text-slate-300 ml-2">#{order.readable_id || order.id.slice(-4)}</span>
                </div>
                <h4 className="font-black text-slate-800 text-lg sm:text-xl leading-tight mb-2 group-hover:text-blue-600 transition-colors line-clamp-2">{order.deviceModel}</h4>
                <div className="space-y-1.5 mb-6">
                    <div className={`flex items-center gap-2 text-xs sm:text-sm font-bold ${isStore ? 'text-red-600' : 'text-slate-600'} truncate`}>
                        <User className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${isStore ? 'text-red-600' : 'text-blue-500'}`} /> <span className="truncate">{order.customer.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] sm:text-xs text-slate-400 font-medium"><MapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" /> <span className="truncate">{order.currentBranch}</span></div>
                </div>
                <div className="mt-auto pt-4 border-t border-slate-100 space-y-4">
                    <div className="flex justify-between items-center">
                        <span className={`px-2 sm:px-3 py-1 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-wider ${getStatusBadgeStyle(order.status, isReturn)}`}>{isReturn ? 'DEVOLUCIÓN' : order.status}</span>
                        <div className="text-right shrink-0 ml-2">
                            <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase">A Cobrar</p>
                            <p className="text-base sm:text-lg font-black text-slate-800 leading-none">${(order.totalAmount ?? (order.finalPrice || order.estimatedCost || 0)).toLocaleString()}</p>
                        </div>
                    </div>
                    <div className={`p-2 sm:p-3 rounded-2xl flex items-center justify-between border ${timeLeft.urgent ? 'border-orange-200' : 'border-slate-100'} ${timeLeft.bg}`}>
                        <div className="flex items-center gap-1.5 sm:gap-2"><Timer className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${timeLeft.color} ${timeLeft.urgent ? 'animate-pulse' : ''}`} /><span className={`text-[10px] sm:text-xs font-black ${timeLeft.color} truncate max-w-[100px] sm:max-w-none`}>{timeLeft.text}</span></div>
                        {assignedUser ? (
                            <div className="flex items-center gap-1.5 bg-slate-100 px-1.5 sm:px-2 py-1 rounded-lg border border-slate-200 shadow-sm shrink-0">
                                <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-slate-200 flex items-center justify-center text-[9px] sm:text-[10px] border border-slate-300 font-bold text-slate-700">{assignedUser.avatar}</div>
                                <span className="text-[9px] sm:text-[10px] font-black text-slate-700 uppercase truncate max-w-[60px] sm:max-w-[80px]">{assignedUser.name.split(' ')[0]}</span>
                            </div>
                        ) : (
                            !isReturn && !order.externalRepair && <button onClick={(e) => onClaim(e, order.id)} className="text-[9px] sm:text-[10px] font-black text-blue-600 hover:underline flex items-center gap-1 shrink-0"><MousePointer2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> RECLAMAR</button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
