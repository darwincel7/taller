
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, Smartphone, Clock, ChevronRight } from 'lucide-react';
import { RepairOrder, RequestStatus } from '../../types';
import { getTimeLeft } from './utils';

interface ExternalOrderCardProps {
  order: RepairOrder;
}

export const ExternalOrderCard: React.FC<ExternalOrderCardProps> = ({ order }) => {
    const navigate = useNavigate();
    const isPending = order.externalRepair?.status === RequestStatus.PENDING;
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
