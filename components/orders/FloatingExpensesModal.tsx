import React, { useState, useEffect } from 'react';
import { X, Download, Loader2, Image as ImageIcon, CheckCircle2, Trash2, Building2, Receipt } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { FloatingExpense, TransactionStatus, ApprovalStatus, ExpenseDestination } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { auditService } from '../../services/auditService';
import { accountingService } from '../../services/accountingService';

interface FloatingExpensesModalProps {
  onClose: () => void;
  onAssign: (expense: FloatingExpense & { closing_id?: string, created_at?: string }) => Promise<void>;
}

export const FloatingExpensesModal: React.FC<FloatingExpensesModalProps> = ({ onClose, onAssign }) => {
  const { currentUser } = useAuth();
  const [expenses, setExpenses] = useState<FloatingExpense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchFloatingExpenses();
  }, []);

  const fetchFloatingExpenses = async () => {
    try {
      const { data, error } = await supabase
        .from('floating_expenses')
        .select('*')
        .neq('description', 'RECEIPT_UPLOAD_TRIGGER')
        .eq('approval_status', 'APPROVED')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setExpenses(data || []);
    } catch (error) {
      console.warn("Error fetching floating expenses:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssign = async (expense: FloatingExpense & { closing_id?: string, created_at?: string }) => {
    setAssigningId(expense.id);
    try {
      // 1. Call parent onAssign to add to current order
      await onAssign(expense);
      
      // 2. Delete from floating_expenses
      const { error } = await supabase
        .from('floating_expenses')
        .delete()
        .eq('id', expense.id);
        
      if (error) throw error;
      
      // 3. Remove from local state
      setExpenses(prev => prev.filter(e => e.id !== expense.id));
    } catch (error) {
      console.warn("Error assigning floating expense:", error);
      alert("Error al asignar el gasto.");
    } finally {
      setAssigningId(null);
    }
  };

  const handleConvertToLocal = async (expense: FloatingExpense) => {
    if (!window.confirm(`¿Está seguro de convertir "${expense.description}" a Gasto Local? Esto lo enviará directamente a finanzas y lo quitará de los gastos flotantes.`)) return;
    
    setAssigningId(expense.id); // Reusing assigningId for loading state
    try {
      // 1. Insert into accounting_transactions using accountingService
      await accountingService.addTransaction({
        amount: -Math.abs(expense.amount),
        description: expense.description,
        transaction_date: new Date().toISOString().split('T')[0],
        receipt_url: expense.receipt_url,
        status: TransactionStatus.COMPLETED,
        approval_status: ApprovalStatus.APPROVED,
        expense_destination: ExpenseDestination.STORE,
        source: 'STORE',
        branch: currentUser?.branch || 'T4',
        created_by: expense.created_by,
        invoice_number: expense.invoice_number,
        vendor: expense.vendor,
        shared_receipt_id: expense.shared_receipt_id,
        is_duplicate: expense.is_duplicate
        // category_id is omitted so accountingService applies the default EXPENSE category
      });

      // 2. Delete from floating_expenses
      const { error: deleteError } = await supabase
        .from('floating_expenses')
        .delete()
        .eq('id', expense.id);
        
      if (deleteError) throw deleteError;
      
      // Log conversion
      if (currentUser) {
        await auditService.recordLog(
          { id: currentUser.id, name: currentUser.name },
          'UPDATE_EXPENSE',
          `Convirtió gasto flotante a Gasto Local: ${expense.description} ($${expense.amount})`,
          undefined,
          'TRANSACTION',
          expense.id
        );
      }
      
      setExpenses(prev => prev.filter(e => e.id !== expense.id));
      alert("Gasto convertido a local exitosamente.");
    } catch (error) {
      console.warn("Error converting floating expense:", error);
      alert("Error al convertir el gasto.");
    } finally {
      setAssigningId(null);
    }
  };

  const handleDelete = async (expense: FloatingExpense) => {
    if (!window.confirm(`¿Está seguro de eliminar el gasto flotante "${expense.description}"?`)) return;
    
    setDeletingId(expense.id);
    try {
      const { error } = await supabase
        .from('floating_expenses')
        .delete()
        .eq('id', expense.id);
        
      if (error) throw error;
      
      // Log deletion
      if (currentUser) {
        await auditService.recordLog(
          { id: currentUser.id, name: currentUser.name },
          'DELETE_EXPENSE',
          `Eliminó gasto flotante: ${expense.description} ($${expense.amount})`,
          undefined,
          'TRANSACTION',
          expense.id
        );
      }
      
      setExpenses(prev => prev.filter(e => e.id !== expense.id));
    } catch (error) {
      console.warn("Error deleting floating expense:", error);
      alert("Error al eliminar el gasto.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
            <Download className="w-5 h-5 text-amber-600" />
            Gastos Flotantes
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar bg-slate-50/50">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-amber-500 mb-4" />
              <p className="text-slate-500 font-medium">Cargando gastos en espera...</p>
            </div>
          ) : expenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="bg-slate-100 p-6 rounded-full mb-4">
                <CheckCircle2 className="w-12 h-12 text-slate-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-700">Todo al día</h3>
              <p className="text-slate-500">No hay gastos flotantes esperando ser asignados.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {expenses.map(expense => (
                <div key={expense.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
                  {expense.receipt_url ? (
                    <div className="h-32 bg-slate-100 border-b border-slate-100 relative group overflow-hidden">
                      <img 
                        src={expense.receipt_url} 
                        alt="Factura" 
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <a href={expense.receipt_url} target="_blank" rel="noreferrer" className="text-white text-xs font-bold bg-black/50 px-3 py-1.5 rounded-full backdrop-blur-sm hover:bg-black/70">
                          Ver Completa
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="h-32 bg-slate-50 border-b border-slate-100 flex flex-col items-center justify-center text-slate-400">
                      <ImageIcon className="w-8 h-8 opacity-50 mb-2" />
                      <span className="text-xs font-medium">Sin imagen</span>
                    </div>
                  )}
                  
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-slate-800 text-sm line-clamp-2">{expense.description}</h3>
                      <span className="font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-lg text-sm border border-amber-100">
                        ${expense.amount.toLocaleString()}
                      </span>
                    </div>
                    {(expense.invoice_number || expense.vendor) && (
                      <div className="flex flex-col gap-1 mb-2">
                        {expense.invoice_number && (
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-slate-500 font-medium flex items-center gap-1">
                              <Receipt className="w-3 h-3" />
                              Factura: <span className="text-slate-700">{expense.invoice_number}</span>
                            </p>
                            {expense.is_duplicate && (
                              <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter border border-amber-200 leading-none">
                                DUPLICADA
                              </span>
                            )}
                          </div>
                        )}
                        {expense.vendor && (
                          <p className="text-xs text-slate-500 font-medium flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            Prov: <span className="text-slate-700">{expense.vendor}</span>
                          </p>
                        )}
                      </div>
                    )}
                    <div className="flex justify-between items-center mb-4">
                      <p className="text-[10px] text-slate-400 font-medium">
                        {new Date(expense.created_at || '').toLocaleDateString('es-ES', {
                          day: '2-digit', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </p>
                      {expense.readable_id && (
                        <span className="text-[10px] font-bold text-slate-400">
                          Ref: #{expense.readable_id}
                        </span>
                      )}
                    </div>
                    
                    <div className="mt-auto flex gap-2">
                      <button
                        onClick={() => handleConvertToLocal(expense)}
                        disabled={deletingId !== null || assigningId !== null}
                        className="bg-amber-50 hover:bg-amber-100 text-amber-600 font-bold py-2 px-3 rounded-lg text-xs flex items-center justify-center transition-colors disabled:opacity-50"
                        title="Convertir a Gasto Local"
                      >
                        <Building2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(expense)}
                        disabled={deletingId !== null || assigningId !== null}
                        className="bg-red-50 hover:bg-red-100 text-red-600 font-bold py-2 px-3 rounded-lg text-xs flex items-center justify-center transition-colors disabled:opacity-50"
                        title="Eliminar gasto flotante"
                      >
                        {deletingId === expense.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleAssign(expense)}
                        disabled={assigningId !== null || deletingId !== null}
                        className="flex-1 bg-slate-900 hover:bg-black text-white font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                      >
                        {assigningId === expense.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                        Asignar a esta Orden
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
