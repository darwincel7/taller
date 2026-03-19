
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Smartphone, Hand } from 'lucide-react';
import { RepairOrder } from '../../types';
import { getTimeLeft, getPriorityStyle } from './utils';

interface CompactOrderBannerProps {
  order: RepairOrder;
  onClaim: (e: React.MouseEvent, id: string) => void;
}

export const CompactOrderBanner: React.FC<CompactOrderBannerProps> = ({ order, onClaim }) => {
    const navigate = useNavigate();
    const timeLeft = getTimeLeft(order.deadline, order.status);
    return (
        <div className="flex items-center gap-2 group">
            <div 
                onClick={() => navigate(`/orders/${order.id}`)}
                className="flex-1 bg-white rounded-xl border border-slate-200 p-3 shadow-sm hover:shadow-md hover:border-blue-300 cursor-pointer flex items-center justify-between"
            >
                <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto overflow-hidden">
                    <div className="flex flex-col items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-slate-100 rounded-lg shrink-0">
                        {order.devicePhoto ? (
                            <img src={order.devicePhoto} className="w-full h-full object-cover rounded-lg" />
                        ) : (
                            <Smartphone className="w-5 h-5 sm:w-6 sm:h-6 text-slate-400" />
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <h4 className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-2 truncate">
                            <span className="truncate">{order.deviceModel}</span>
                            <span className="text-[9px] font-normal text-slate-400 font-mono shrink-0">#{order.readable_id || order.id.slice(-4)}</span>
                        </h4>
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 text-[10px] sm:text-xs text-slate-500 mt-0.5">
                            <span className="font-medium truncate max-w-[100px] sm:max-w-[150px]">{order.customer.name}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[8px] sm:text-[10px] font-bold uppercase ${getPriorityStyle(order.priority)}`}>{order.priority}</span>
                            <span className={`text-[9px] sm:text-[10px] ${timeLeft.color} truncate`}>{timeLeft.text}</span>
                        </div>
                    </div>
                </div>
                <div className="text-right shrink-0 ml-2 hidden sm:block">
                    <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase">Costo Est.</p>
                    <p className="text-sm sm:text-base font-black text-slate-700">${(order.finalPrice || order.estimatedCost || 0).toLocaleString()}</p>
                </div>
            </div>
            <button 
                onClick={(e) => onClaim(e, order.id)}
                className="bg-blue-600 hover:bg-blue-700 text-white p-2 sm:p-3 rounded-xl shadow-md transition-all active:scale-95 flex flex-col items-center justify-center w-16 sm:w-24 shrink-0"
                title="Reclamar orden"
            >
                <Hand className="w-4 h-4 sm:w-5 sm:h-5 mb-1" />
                <span className="text-[8px] sm:text-[10px] font-bold uppercase">Asignar</span>
            </button>
        </div>
    );
};
