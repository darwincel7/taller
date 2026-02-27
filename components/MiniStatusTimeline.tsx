import React from 'react';
import { OrderStatus } from '../types';

const steps = [
  OrderStatus.PENDING,
  OrderStatus.DIAGNOSIS,
  OrderStatus.WAITING_APPROVAL,
  OrderStatus.IN_REPAIR,
  OrderStatus.REPAIRED,
  OrderStatus.RETURNED,
];

interface MiniStatusTimelineProps {
  status: OrderStatus;
  isReturn?: boolean;
}

export const MiniStatusTimeline: React.FC<MiniStatusTimelineProps> = ({ status, isReturn = false }) => {
  const currentIndex = steps.findIndex(s => s === status);
  const activeIndex = currentIndex === -1 ? 0 : currentIndex;

  const activeColor = isReturn ? 'bg-red-500' : 'bg-emerald-500';
  const ringColor = isReturn ? 'ring-red-100' : 'ring-emerald-100';
  const borderColor = isReturn ? 'border-red-500' : 'border-emerald-500';
  const shadowColor = isReturn ? 'rgba(239,68,68,0.5)' : 'rgba(16,185,129,0.5)';

  return (
    <div className="w-full flex items-center justify-between px-0.5 relative group">
      {/* Linea de fondo */}
      <div className="absolute top-1/2 left-0 w-full h-[2px] bg-slate-200 -translate-y-1/2 rounded-full" />
      
      {/* Linea Activa */}
      <div 
        className={`absolute top-1/2 left-0 h-[2px] ${activeColor} -translate-y-1/2 rounded-full transition-all duration-700 ease-out`} 
        style={{ width: `${(activeIndex / (steps.length - 1)) * 100}%` }}
      />
      
      {/* Nodos */}
      {steps.map((_, idx) => {
        const isCompleted = idx < activeIndex;
        const isCurrent = idx === activeIndex;

        return (
          <div key={idx} className="relative z-10 flex items-center justify-center">
            {isCompleted ? (
              <div className={`w-2.5 h-2.5 ${activeColor} rounded-full ring-2 ${ringColor} shadow-[0_0_8px_${shadowColor}]`} />
            ) : isCurrent ? (
              <div className={`w-3.5 h-3.5 rounded-full border-2 ${borderColor} bg-white flex items-center justify-center shadow-md animate-pulse`}>
                <div className={`w-1.5 h-1.5 ${activeColor} rounded-full`} />
              </div>
            ) : (
              <div className="w-2.5 h-2.5 rounded-full border-2 border-slate-200 bg-white transition-colors group-hover:border-slate-300" />
            )}
          </div>
        );
      })}
    </div>
  );
};