import React from 'react';
import { X, Camera, CheckCircle2, FileText, Download, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PendingExpenseDetailsModalProps {
  expense: any;
  addedBy: string;
  onClose: () => void;
  onConsolidate: (id: string, description: string) => void;
  onPhotoConsolidate: (expense: any) => void;
  onReject: (id: string) => void;
}

export const PendingExpenseDetailsModal: React.FC<PendingExpenseDetailsModalProps> = ({
  expense,
  addedBy,
  onClose,
  onConsolidate,
  onPhotoConsolidate,
  onReject
}) => {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose}>
      <div 
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden relative animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]" 
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-amber-50 p-6 border-b border-amber-100 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 p-2.5 rounded-2xl text-amber-600">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-amber-900 tracking-tight leading-none mb-1">Detalle de Gasto Pendiente</h3>
              <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">Información y comprobante</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-amber-700 hover:text-amber-900 hover:bg-amber-200/50 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Descripción</p>
              <p className="text-sm font-bold text-slate-800">{expense.description}</p>
              {expense.readable_id && <p className="text-xs font-bold text-slate-400 mt-1">Ref: #{expense.readable_id}</p>}
            </div>
            <div className="flex justify-between items-center border-t border-slate-200 pt-3">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Fecha</p>
                <p className="text-xs font-medium text-slate-600">
                  {expense.transaction_date}
                  {expense.created_at && (
                    <span className="text-[10px] text-slate-400 ml-1">
                      {new Date(expense.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Agregado por</p>
                <p className="text-xs font-medium text-slate-600">{addedBy}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Monto</p>
                <p className="text-lg font-black text-red-600">-${Math.abs(expense.amount).toLocaleString()}</p>
              </div>
            </div>
          </div>

          {expense.order_id && (
            <div className="flex justify-center">
              <button
                onClick={() => navigate(`/orders/${expense.order_id}`)}
                className="px-4 py-2 bg-blue-50 text-blue-600 border border-blue-100 rounded-xl font-bold text-sm hover:bg-blue-100 transition flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                Ir a la Orden Original
              </button>
            </div>
          )}

          {expense.receipt_url ? (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                <Camera className="w-3 h-3"/> Comprobante / Factura
                {expense.shared_receipt_id && (
                  <span className="ml-2 bg-blue-100 text-blue-600 px-2 py-0.5 rounded text-[9px]">Factura Compartida</span>
                )}
              </p>
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50 relative group">
                <img 
                  src={expense.receipt_url} 
                  alt="Comprobante" 
                  className="w-full h-auto object-contain max-h-[400px]"
                  referrerPolicy="no-referrer"
                />
                <a 
                  href={expense.receipt_url} 
                  target="_blank" 
                  rel="noreferrer"
                  className="absolute bottom-4 right-4 bg-slate-900/80 text-white px-4 py-2 rounded-xl text-xs font-bold backdrop-blur-sm hover:bg-black transition-colors flex items-center gap-2 opacity-0 group-hover:opacity-100"
                >
                  <Download className="w-4 h-4"/> Abrir Original
                </a>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 border-dashed rounded-2xl p-8 text-center flex flex-col items-center justify-center text-slate-400">
              <FileText className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm font-bold">Sin comprobante</p>
              <p className="text-xs mt-1">Este gasto se registró sin imagen adjunta.</p>
            </div>
          )}
        </div>

        <div className="bg-slate-50 p-6 border-t border-slate-100 flex justify-between items-center shrink-0">
          <button 
            onClick={() => {
              if (window.confirm('¿Está seguro de rechazar este gasto? Se marcará como CANCELADO.')) {
                onReject(expense.id);
                onClose();
              }
            }}
            className="px-4 py-2.5 bg-red-50 text-red-600 rounded-xl font-bold text-sm hover:bg-red-100 transition flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            Rechazar
          </button>
          
          <div className="flex gap-3">
            <button 
              onClick={() => {
                onPhotoConsolidate(expense);
                onClose();
              }}
              className="px-4 py-2.5 bg-indigo-100 text-indigo-700 rounded-xl font-bold text-sm hover:bg-indigo-200 transition flex items-center gap-2"
            >
              <Camera className="w-4 h-4" />
              Consolidar con Foto
            </button>
            <button 
              onClick={() => {
                onConsolidate(expense.id, expense.description);
                onClose();
              }}
              className="px-4 py-2.5 bg-amber-500 text-white rounded-xl font-bold text-sm hover:bg-amber-600 transition flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" /> 
              Consolidar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
