
import React from 'react';
import { OrderStatus, UserRole } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle2, Clock, Wrench, PackageCheck, FileSearch, UserCheck, Lock, RotateCcw } from 'lucide-react';

const steps = [
  { status: OrderStatus.PENDING, label: 'Recibido', icon: Clock },
  { status: OrderStatus.DIAGNOSIS, label: 'Diagnóstico', icon: FileSearch },
  { status: OrderStatus.WAITING_APPROVAL, label: 'Aprobación', icon: UserCheck },
  { status: OrderStatus.IN_REPAIR, label: 'Reparación', icon: Wrench },
  { status: OrderStatus.REPAIRED, label: 'Listo', icon: CheckCircle2 },
  { status: OrderStatus.RETURNED, label: 'Entregado', icon: PackageCheck },
];

interface StatusTimelineProps {
  currentStatus: OrderStatus;
  onStepClick?: (status: OrderStatus) => void;
  disabled?: boolean;
  isReturn?: boolean;
}

export const StatusTimeline: React.FC<StatusTimelineProps> = ({ currentStatus, onStepClick, disabled = false, isReturn = false }) => {
  const { currentUser } = useAuth();
  const currentIndex = steps.findIndex(s => s.status === currentStatus);
  const activeIndex = currentIndex === -1 ? 0 : currentIndex;
  
  const progressPercentage = (activeIndex / (steps.length - 1)) * 100;

  // REGLA: La cajera puede entregar aunque la línea esté "desactivada" para otros pasos técnicos.
  const canInteract = (status: OrderStatus) => {
      if (!onStepClick) return false;
      if (currentUser?.role === UserRole.ADMIN) return true;
      
      // EXCEPTION: Cashier can ALWAYS click "RETURNED" if current state is REPAIRED
      if (status === OrderStatus.RETURNED && currentStatus === OrderStatus.REPAIRED && (currentUser?.role === UserRole.CASHIER || currentUser?.permissions?.canDeliverOrder)) {
          return true;
      }
      
      return !disabled;
  };

  const barGradient = isReturn 
    ? 'from-red-400 via-red-500 to-red-600 shadow-[0_0_15px_rgba(239,68,68,0.4)]' 
    : 'from-green-400 via-emerald-500 to-green-600 shadow-[0_0_15px_rgba(34,197,94,0.4)]';
  
  const activeStepClass = isReturn
    ? 'bg-red-600 border-red-50 text-white shadow-lg shadow-red-200 scale-105'
    : 'bg-green-600 border-green-50 text-white shadow-lg shadow-green-200 scale-105';

  const labelActiveParams = isReturn
    ? { text: 'text-red-800', bg: 'bg-red-50', border: 'border-red-100' }
    : { text: 'text-green-800', bg: 'bg-green-50', border: 'border-green-100' };

  return (
    <div className={`w-full py-4 px-2`}>
      <div className="relative w-full px-4">
        
        {disabled && currentUser?.role !== UserRole.ADMIN && currentUser?.role !== UserRole.CASHIER && (
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full z-20">
                <Lock className="w-3 h-3" /> Solo el técnico asignado puede cambiar etapas técnicas
            </div>
        )}

        {isReturn && (
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 px-3 py-1 rounded-full z-20 animate-pulse">
                <RotateCcw className="w-3 h-3" /> MODO DEVOLUCIÓN / GARANTÍA
            </div>
        )}

        <div className="absolute top-1/2 left-0 w-full h-3 bg-slate-100 rounded-full -translate-y-1/2 shadow-inner border border-slate-200 dark:bg-slate-800 dark:border-slate-700" />
        
        <div 
          className={`absolute top-1/2 left-0 h-3 bg-gradient-to-r rounded-full -translate-y-1/2 transition-all duration-1000 ease-in-out overflow-hidden ${barGradient}`}
          style={{ width: `${progressPercentage}%` }}
        >
            <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite] w-full h-full" style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)' }}></div>
        </div>

        <div className="relative flex-between w-full flex justify-between">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = index <= activeIndex;
            const isCurrent = index === activeIndex;
            const interactive = canInteract(step.status);

            return (
              <div 
                key={step.status} 
                className={`flex flex-col items-center group relative ${interactive ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                onClick={() => interactive && onStepClick!(step.status)}
              >
                <div 
                  className={`
                    w-10 h-10 rounded-full flex items-center justify-center border-4 z-10 transition-all duration-500
                    ${isActive 
                      ? activeStepClass
                      : 'bg-white border-slate-200 text-slate-300 dark:bg-slate-800 dark:border-slate-700'
                    }
                    ${isCurrent ? 'ring-4 ring-green-100 dark:ring-green-900/30 scale-110' : ''}
                    ${interactive ? 'hover:scale-110 hover:border-blue-300' : ''}
                  `}
                >
                  <Icon className="w-4 h-4" />
                </div>
                
                <div className={`absolute top-12 flex flex-col items-center transition-all duration-300 ${isActive ? 'opacity-100 translate-y-0' : 'opacity-60 translate-y-1'}`}>
                    <span 
                    className={`
                        text-[10px] font-bold whitespace-nowrap px-2 py-0.5 rounded-full
                        ${isActive ? `${labelActiveParams.text} ${labelActiveParams.bg}` : 'text-slate-500'}
                    `}
                    >
                    {step.label}
                    </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
