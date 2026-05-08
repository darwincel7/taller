import React from 'react';
import { Clock, Smartphone, Building2 } from 'lucide-react';

interface PendingExpensesWidgetProps {
  expenses: any[];
}

export const PendingExpensesWidget: React.FC<PendingExpensesWidgetProps> = ({ expenses }) => {
  if (!expenses || expenses.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-6 z-50 flex flex-col gap-3 pointer-events-none">
      {expenses.map((expense) => (
        <div 
          key={expense.id}
          className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl shadow-lg border border-amber-200/50 dark:border-amber-900/30 p-3 w-64 pointer-events-auto animate-in slide-in-from-bottom-5 fade-in duration-500 hover:scale-105 transition-transform"
        >
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              expense.expenseType === 'ORDER' 
                ? 'bg-blue-100/50 dark:bg-blue-900/30 text-blue-600' 
                : 'bg-amber-100/50 dark:bg-amber-900/30 text-amber-600'
            }`}>
              {expense.expenseType === 'ORDER' ? <Smartphone className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[9px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-wider flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5 animate-pulse" />
                  En revisión
                </span>
                <span className="text-xs font-black text-slate-800 dark:text-white">
                  ${expense.amount.toLocaleString()}
                </span>
              </div>
              <p className="font-medium text-slate-600 dark:text-slate-300 text-xs line-clamp-1">
                {expense.description}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
