import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { CheckCircle2, XCircle, Loader2, FileText, Building2, Smartphone } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ApprovalStatus } from '../../types';

export const ExpenseApprovals: React.FC = () => {
  const { currentUser } = useAuth();
  const [pendingExpenses, setPendingExpenses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchPendingApprovals = async () => {
    setIsLoading(true);
    try {
      // Fetch from accounting_transactions (LOCAL)
      const { data: localData, error: localError } = await supabase
        .from('accounting_transactions')
        .select('*')
        .eq('approval_status', 'PENDING');
        
      if (localError) throw localError;

      // Fetch from floating_expenses (ORDER)
      const { data: orderData, error: orderError } = await supabase
        .from('floating_expenses')
        .select('*')
        .eq('approval_status', 'PENDING')
        .neq('description', 'RECEIPT_UPLOAD_TRIGGER');
        
      if (orderError) throw orderError;

      const combined = [
        ...(localData || []).map(d => ({ ...d, _type: d.source === 'ORDER' ? 'ORDER' : 'LOCAL' })),
        ...(orderData || []).map(d => ({ ...d, _type: 'ORDER' }))
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setPendingExpenses(combined);
    } catch (error) {
      console.error("Error fetching pending approvals:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingApprovals();
  }, []);

  const handleApprove = async (expense: any) => {
    setProcessingId(expense.id);
    try {
      // If it has a source, it's from accounting_transactions
      const table = expense.source ? 'accounting_transactions' : 'floating_expenses';
      const { error } = await supabase
        .from(table)
        .update({ approval_status: 'APPROVED' })
        .eq('id', expense.id);

      if (error) throw error;
      setPendingExpenses(prev => prev.filter(e => e.id !== expense.id));
    } catch (error) {
      console.error("Error approving expense:", error);
      alert("Error al aprobar el gasto.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (expense: any) => {
    if (!window.confirm(`¿Rechazar este gasto? El dinero deberá ser devuelto a caja.`)) return;
    setProcessingId(expense.id);
    try {
      // If it has a source, it's from accounting_transactions
      const table = expense.source ? 'accounting_transactions' : 'floating_expenses';
      const { error } = await supabase
        .from(table)
        .update({ approval_status: 'REJECTED' })
        .eq('id', expense.id);

      if (error) throw error;
      setPendingExpenses(prev => prev.filter(e => e.id !== expense.id));
    } catch (error) {
      console.error("Error rejecting expense:", error);
      alert("Error al rechazar el gasto.");
    } finally {
      setProcessingId(null);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center items-center p-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-6 border-b border-slate-100">
        <h2 className="text-lg font-bold text-slate-800">Aprobaciones Pendientes</h2>
        <p className="text-sm text-slate-500">Gastos creados desde caja que requieren revisión del supervisor.</p>
      </div>
      
      {pendingExpenses.length === 0 ? (
        <div className="p-12 text-center text-slate-500">
          <CheckCircle2 className="w-12 h-12 mx-auto text-green-400 mb-3 opacity-50" />
          <p>No hay gastos pendientes de aprobación.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {pendingExpenses.map(expense => (
            <div key={expense.id} className="p-4 hover:bg-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-colors">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-xl ${expense._type === 'LOCAL' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                  {expense._type === 'LOCAL' ? <Building2 className="w-5 h-5" /> : <Smartphone className="w-5 h-5" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-800">{expense.description}</h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${expense._type === 'LOCAL' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                      {expense._type === 'LOCAL' ? 'Gasto Local' : 'Repuesto / Taller'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">
                    Monto: <span className="font-bold text-red-600">${Math.abs(expense.amount).toLocaleString()}</span>
                  </p>
                  {expense.invoice_number && (
                    <p className="text-xs text-slate-500 mt-1 font-medium">
                      Factura: <span className="text-slate-700">{expense.invoice_number}</span>
                    </p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">
                    Fecha: {new Date(expense.created_at).toLocaleString()}
                  </p>
                  {expense.receipt_url && (
                    <a href={expense.receipt_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 mt-2 font-medium">
                      <FileText className="w-3 h-3" /> Ver Factura
                    </a>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2 w-full md:w-auto">
                <button
                  onClick={() => handleReject(expense)}
                  disabled={processingId === expense.id}
                  className="flex-1 md:flex-none px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {processingId === expense.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  Rechazar
                </button>
                <button
                  onClick={() => handleApprove(expense)}
                  disabled={processingId === expense.id}
                  className="flex-1 md:flex-none px-4 py-2 bg-green-50 text-green-600 hover:bg-green-100 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {processingId === expense.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Aprobar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
