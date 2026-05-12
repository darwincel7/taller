
import React, { useState } from 'react';
import { History, User, MapPin, ShieldAlert, CheckCircle2, AlertTriangle, Info, DollarSign, Wrench, Truck, ArrowRightLeft, MessageSquare, FileText, Filter } from 'lucide-react';
import { RepairOrder, OrderStatus, ActionType } from '../../types';

interface DetailedHistoryProps {
  history: RepairOrder['history'];
}

type FilterType = 'ALL' | 'MANUAL' | 'STATUS' | 'FINANCIAL';

export const DetailedHistory: React.FC<DetailedHistoryProps> = ({ history }) => {
  const [filter, setFilter] = useState<FilterType>('ALL');

  const getIconForAction = (actionType?: string) => {
    switch (actionType) {
      case ActionType.ORDER_CREATED: return <FileText className="w-3 h-3" />;
      case ActionType.STATUS_CHANGED: return <History className="w-3 h-3" />;
      case ActionType.NOTE_ADDED: return <MessageSquare className="w-3 h-3" />;
      case ActionType.NOTE_UPDATED: return <MessageSquare className="w-3 h-3" />;
      case ActionType.PAYMENT_ADDED: return <DollarSign className="w-3 h-3" />;
      case ActionType.EXPENSE_ADDED: return <DollarSign className="w-3 h-3" />;
      case ActionType.TRANSFER_REQUESTED: return <Truck className="w-3 h-3" />;
      case ActionType.ASSIGNMENT_CHANGED: return <User className="w-3 h-3" />;
      case ActionType.RETURN_APPROVED: return <CheckCircle2 className="w-3 h-3" />;
      case ActionType.RETURN_REJECTED: return <ShieldAlert className="w-3 h-3" />;
      default: return <Info className="w-3 h-3" />;
    }
  };

  const filteredHistory = (history || []).filter(log => {
      if (filter === 'ALL') return true;
      if (filter === 'MANUAL') {
          // Exclude logs where technician is "Sistema" or "System" or empty, unless it's explicitly a NOTE_ADDED
          const isSystem = !log.technician || log.technician.toLowerCase() === 'sistema' || log.technician.toLowerCase() === 'system';
          return !isSystem || log.action_type === 'NOTE_ADDED';
      }
      if (filter === 'STATUS') return log.action_type?.includes('STATUS') || log.action_type?.includes('ORDER_CREATED') || log.action_type?.includes('RETURNED');
      if (filter === 'FINANCIAL') return log.action_type?.includes('PAYMENT') || log.action_type?.includes('EXPENSE') || log.action_type?.includes('COST');
      return true;
  });

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-full overflow-hidden flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-slate-600 text-xs uppercase flex items-center gap-2">
            <History className="w-4 h-4"/> Historial Detallado
        </h3>
        
        {/* FILTERS */}
        <div className="flex bg-slate-100 p-1 rounded-lg">
            <button onClick={() => setFilter('ALL')} className={`px-2 py-1 rounded text-[10px] font-bold transition ${filter === 'ALL' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>TODOS</button>
            <button onClick={() => setFilter('MANUAL')} className={`px-2 py-1 rounded text-[10px] font-bold transition ${filter === 'MANUAL' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>MANUALES</button>
            <button onClick={() => setFilter('STATUS')} className={`px-2 py-1 rounded text-[10px] font-bold transition ${filter === 'STATUS' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>ESTADOS</button>
            <button onClick={() => setFilter('FINANCIAL')} className={`px-2 py-1 rounded text-[10px] font-bold transition ${filter === 'FINANCIAL' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>$$$</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4">
        {filteredHistory.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-xs italic">
                No hay registros para este filtro.
            </div>
        ) : (
            filteredHistory.slice().reverse().map((log, idx) => {
            let dotColor = 'bg-slate-300';
            let borderClass = 'border-slate-100';
            let bgClass = 'bg-slate-50 text-slate-600';

            if (log.action_type?.includes('EXPENSE')) {
                dotColor = 'bg-red-500';
                borderClass = 'border-red-200';
                bgClass = 'bg-gradient-to-r from-red-50 to-red-100 text-red-800';
            } else if (log.action_type?.includes('PAYMENT') || log.action_type?.includes('DEPOSIT')) {
                dotColor = 'bg-green-500';
                borderClass = 'border-green-200';
                bgClass = 'bg-green-50 text-green-800';
            } else if (log.logType === 'DANGER' || log.action_type?.includes('REJECTED') || log.action_type?.includes('DELETED')) {
                dotColor = 'bg-red-500';
                borderClass = 'border-red-100';
                bgClass = 'bg-red-50 text-red-700';
            } else if (log.logType === 'SUCCESS' || log.action_type?.includes('APPROVED') || log.action_type?.includes('COMPLETED')) {
                dotColor = 'bg-green-500';
                borderClass = 'border-green-100';
                bgClass = 'bg-green-50 text-green-700';
            } else if (log.logType === 'WARNING' || log.action_type?.includes('REQUESTED') || log.action_type?.includes('DEBATED')) {
                dotColor = 'bg-amber-500';
                borderClass = 'border-amber-100';
                bgClass = 'bg-amber-50 text-amber-700';
            } else if (log.action_type === 'STATUS_CHANGED') {
                dotColor = 'bg-blue-500';
                borderClass = 'border-blue-100';
                bgClass = 'bg-blue-50 text-blue-700';
            }

            return (
                <div key={idx} className="relative pl-6 border-l-2 border-slate-100 pb-1 last:pb-0 group">
                {/* Dot */}
                <div className={`absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full ring-4 ring-white ${dotColor} transition-colors`}></div>
                
                <div className="mb-0.5 flex justify-between items-center">
                    <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${bgClass} border ${borderClass}`}>
                        {log.action_type?.replace(/_/g, ' ') || 'LOG'}
                    </span>
                    <span className="text-[9px] text-slate-400 font-bold uppercase flex items-center gap-1">
                        {new Date(log.date || (log as any).timestamp || new Date()).toLocaleDateString()} {new Date(log.date || (log as any).timestamp || new Date()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        <span className="text-slate-300">•</span>
                        <User className="w-3 h-3 inline-block" /> {log.technician}
                    </span>
                    </div>
                </div>

                <div className={`text-[11px] px-2 py-1.5 rounded-md border ${borderClass} ${bgClass} relative flex items-start gap-2`}>
                    <div className="opacity-70 mt-0.5 shrink-0">
                        {getIconForAction(log.action_type)}
                    </div>
                    <div className="flex-1 font-medium break-words leading-tight">
                        {log.note || (log as any).description}
                    </div>
                </div>
                </div>
            );
            })
        )}
      </div>
    </div>
  );
};
