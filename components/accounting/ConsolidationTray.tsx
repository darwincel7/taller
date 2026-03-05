import React from 'react';
import { Check, X, AlertCircle } from 'lucide-react';
import { AccountingTransaction } from '../../types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ConsolidationTrayProps {
  transactions: AccountingTransaction[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export const ConsolidationTray: React.FC<ConsolidationTrayProps> = ({ transactions, onApprove, onReject }) => {
  if (transactions.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-8 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <AlertCircle className="w-5 h-5 text-amber-600" />
        <h3 className="text-lg font-bold text-amber-800">Gastos de Taller Pendientes de Consolidar</h3>
        <span className="bg-amber-200 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full">
          {transactions.length}
        </span>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-xs uppercase text-amber-700/70 font-bold border-b border-amber-200">
              <th className="pb-3 pl-2">Fecha</th>
              <th className="pb-3">Descripción</th>
              <th className="pb-3">Orden</th>
              <th className="pb-3 text-right">Monto</th>
              <th className="pb-3 text-right pr-2">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-200/50">
            {transactions.map(t => (
              <tr key={t.id} className="group hover:bg-amber-100/50 transition">
                <td className="py-3 pl-2 text-sm text-amber-900 font-medium">
                  {format(new Date(t.transaction_date), 'dd MMM', { locale: es })}
                </td>
                <td className="py-3 text-sm text-amber-800">
                  <div className="font-medium">{t.description}</div>
                  {t.vendor && <span className="text-xs text-amber-600">{t.vendor}</span>}
                </td>
                <td className="py-3 text-sm text-amber-800">
                  {t.order_id ? (
                    <span className="font-mono text-xs bg-white border border-amber-200 px-1.5 py-0.5 rounded text-amber-700">
                      {t.order_id.slice(0, 8)}...
                    </span>
                  ) : '-'}
                </td>
                <td className="py-3 text-sm font-bold text-rose-600 text-right">
                  {t.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                </td>
                <td className="py-3 text-right pr-2">
                  <div className="flex justify-end gap-2">
                    <button 
                      onClick={() => onReject(t.id)}
                      className="p-1.5 bg-white border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50 transition"
                      title="Rechazar / Eliminar"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => onApprove(t.id)}
                      className="p-1.5 bg-emerald-600 text-white rounded-lg shadow-sm hover:bg-emerald-700 transition flex items-center gap-1 text-xs font-bold px-3"
                      title="Aprobar y Consolidar"
                    >
                      <Check className="w-3 h-3" />
                      Aprobar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
