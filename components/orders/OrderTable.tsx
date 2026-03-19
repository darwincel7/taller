
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Smartphone, Timer } from 'lucide-react';
import { RepairOrder, RequestStatus } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { MiniStatusTimeline } from '../MiniStatusTimeline';
import { getTimeLeft, getPriorityStyle, getStatusBadgeStyle } from './utils';

interface OrderTableProps {
  list: RepairOrder[];
  onClaim: (e: React.MouseEvent, id: string) => void;
  onPreviewHover: (e: React.MouseEvent, order: RepairOrder) => void;
  onPreviewLeave: () => void;
}

export const OrderTable: React.FC<OrderTableProps> = ({ list, onClaim, onPreviewHover, onPreviewLeave }) => {
    const navigate = useNavigate();
    const { users } = useAuth();

    return (
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
                <tbody className="divide-y divide-slate-100" onMouseLeave={onPreviewLeave}>
                    {list.map(order => {
                        const timeLeft = getTimeLeft(order.deadline, order.status);
                        const assignedUser = users.find(u => u.id === order.assignedTo);
                        const isUnassigned = !order.assignedTo;
                        const isReturn = order.returnRequest?.status === RequestStatus.APPROVED || order.returnRequest?.status === RequestStatus.PENDING;
                        return (
                            <tr 
                                key={order.id} 
                                onClick={() => navigate(`/orders/${order.id}`)} 
                                onMouseLeave={onPreviewLeave} 
                                className={`hover:bg-slate-50 transition-colors cursor-pointer group ${isReturn ? 'bg-red-50/30' : (isUnassigned ? 'bg-blue-50/10' : '')}`}
                            >
                                <td className="p-4">
                                    <div className="flex flex-col gap-1">
                                        <span className="font-mono font-black text-xs text-slate-400">#{order.readable_id || order.id.slice(-4)}</span>
                                        {isReturn ? (
                                            <span className="w-fit text-[9px] font-black px-2 py-0.5 rounded-full border bg-red-100 text-red-700 border-red-200">DEVOLUCIÓN</span>
                                        ) : (
                                            <span className={`w-fit text-[9px] font-black px-2 py-0.5 rounded-full border ${getPriorityStyle(order.priority)}`}>{order.priority}</span>
                                        )}
                                        <span className="w-fit text-[8px] font-black bg-black text-white px-2 py-0.5 rounded-full border border-slate-700 uppercase">ORG: {order.originBranch || order.currentBranch || 'T4'}</span>
                                        <span className="w-fit text-[8px] font-black bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full border border-blue-200 uppercase">ACT: {order.currentBranch || 'T4'}</span>
                                    </div>
                                </td>
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div 
                                            className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center border border-slate-200 shrink-0 relative hover:ring-2 hover:ring-blue-300 transition-all" 
                                            onMouseEnter={(e) => onPreviewHover(e, order)} 
                                            onMouseLeave={onPreviewLeave}
                                        >
                                            {order.devicePhoto ? <img src={order.devicePhoto} className="w-full h-full object-cover rounded-xl" /> : <Smartphone className="w-5 h-5 text-slate-400"/>}
                                        </div>
                                        <div>
                                            <h4 className="font-black text-slate-800 text-sm">{order.deviceModel}</h4>
                                            <p className="text-xs font-bold text-slate-500">{order.customer.name}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-4">
                                    <div className="flex flex-col gap-1">
                                        <span className={`w-fit px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase border ${getStatusBadgeStyle(order.status, isReturn)}`}>
                                            {isReturn ? 'DEVOLUCIÓN' : order.status}
                                        </span>
                                        <div className="w-32 opacity-50">
                                            <MiniStatusTimeline status={order.status} isReturn={isReturn} />
                                        </div>
                                    </div>
                                </td>
                                <td className="p-4">
                                    <div className={`w-fit px-3 py-1.5 rounded-xl border flex items-center gap-2 ${timeLeft.bg} ${timeLeft.urgent ? 'border-orange-200' : 'border-slate-100'}`}>
                                        <Timer className={`w-3.5 h-3.5 ${timeLeft.color} ${timeLeft.urgent ? 'animate-pulse' : ''}`} />
                                        <span className={`text-[10px] font-black ${timeLeft.color} uppercase`}>{timeLeft.text}</span>
                                    </div>
                                </td>
                                <td className="p-4">
                                    <div className="flex flex-col">
                                        <span className="text-xs font-black text-slate-800">${(order.finalPrice || order.estimatedCost || 0).toLocaleString()}</span>
                                    </div>
                                </td>
                                <td className="p-4 text-right">
                                    {assignedUser ? (
                                        <div className="inline-flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-sm">
                                            <span className="text-[10px] font-black text-slate-700 px-1 uppercase">{assignedUser.name.split(' ')[0]}</span>
                                        </div>
                                    ) : (
                                        !isReturn && !order.externalRepair && (
                                            <button 
                                                onClick={(e) => onClaim(e, order.id)} 
                                                className="bg-blue-600 text-white px-4 py-2 rounded-xl text-[10px] font-black hover:bg-blue-700 shadow-md transition-all active:scale-95"
                                            >
                                                ASIGNARME
                                            </button>
                                        )
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};
