
import React from 'react';
import { History, User, MapPin, ShieldAlert, CheckCircle2, AlertTriangle, Info, DollarSign, Wrench, Truck, ArrowRightLeft, MessageSquare, FileText } from 'lucide-react';
import { RepairOrder, OrderStatus, ActionType } from '../../types';

interface DetailedHistoryProps {
  history: RepairOrder['history'];
}

export const DetailedHistory: React.FC<DetailedHistoryProps> = ({ history }) => {
  const getIconForAction = (actionType?: string) => {
    switch (actionType) {
      case ActionType.ORDER_CREATED: return <FileText className="w-3 h-3" />;
      case ActionType.STATUS_CHANGED: return <History className="w-3 h-3" />;
      case ActionType.NOTE_ADDED: return <MessageSquare className="w-3 h-3" />;
      case ActionType.PAYMENT_ADDED: return <DollarSign className="w-3 h-3" />;
      case ActionType.EXPENSE_ADDED: return <DollarSign className="w-3 h-3" />;
      case ActionType.TRANSFER_REQUESTED: return <Truck className="w-3 h-3" />;
      case ActionType.ASSIGNMENT_CHANGED: return <User className="w-3 h-3" />;
      case ActionType.RETURN_APPROVED: return <CheckCircle2 className="w-3 h-3" />;
      case ActionType.RETURN_REJECTED: return <ShieldAlert className="w-3 h-3" />;
      default: return <Info className="w-3 h-3" />;
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-full overflow-hidden flex flex-col">
      <h3 className="font-bold text-slate-600 text-xs uppercase mb-4 flex items-center gap-2">
        <History className="w-4 h-4"/> Historial Detallado
      </h3>
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4">
        {history.slice().reverse().map((log, idx) => {
          let dotColor = 'bg-slate-300';
          let borderClass = 'border-slate-100';
          let bgClass = 'bg-slate-50 text-slate-600';

          if (log.logType === 'DANGER' || log.action_type?.includes('REJECTED') || log.action_type?.includes('DELETED')) {
            dotColor = 'bg-red-500';
            borderClass = 'border-red-100';
            bgClass = 'bg-red-50 text-red-700';
          } else if (log.logType === 'SUCCESS' || log.action_type?.includes('APPROVED') || log.action_type?.includes('COMPLETED') || log.action_type === 'PAYMENT_ADDED') {
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
              
              <div className="mb-1 flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${bgClass} border ${borderClass}`}>
                      {log.action_type?.replace(/_/g, ' ') || 'LOG'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">
                      {new Date(log.date).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-500 font-medium mt-0.5">
                    <User className="w-3 h-3" /> {log.technician} 
                    {log.actor_role && <span className="opacity-70">({log.actor_role})</span>}
                    {log.actor_branch && <span className="opacity-70">• {log.actor_branch}</span>}
                  </div>
                </div>
              </div>

              <div className={`text-xs p-3 rounded-lg border mt-1 ${borderClass} ${bgClass} relative`}>
                <div className="flex gap-2">
                   <div className="mt-0.5 opacity-70">
                      {getIconForAction(log.action_type)}
                   </div>
                   <div className="flex-1">
                      <p className="font-medium">{log.note}</p>
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <div className="mt-2 pt-2 border-t border-black/5 text-[10px] font-mono opacity-80 grid grid-cols-2 gap-1">
                          {Object.entries(log.metadata).map(([key, value]) => (
                            <div key={key} className="flex gap-1">
                              <span className="font-bold opacity-70">{key}:</span>
                              <span className="truncate">{String(value)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                   </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
