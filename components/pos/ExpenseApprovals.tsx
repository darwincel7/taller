import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { CheckCircle2, XCircle, Loader2, FileText, Building2, Smartphone, ChevronDown, ChevronUp, Image as ImageIcon, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { auditService } from '../../services/auditService';
import { accountingService } from '../../services/accountingService';
import { ApprovalStatus, UserRole, TransactionStatus, ExpenseDestination } from '../../types';

export const ExpenseApprovals: React.FC = () => {
  const { currentUser } = useAuth();
  const [pendingExpenses, setPendingExpenses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const fetchPendingApprovals = async () => {
    setIsLoading(true);
    try {
      // Fetch from accounting_transactions (LOCAL)
      let localQuery = supabase
        .from('accounting_transactions')
        .select('*')
        .eq('approval_status', 'PENDING')
        .gte('created_at', '2026-03-19T00:00:00Z');

      // Fetch from floating_expenses (ORDER)
      let orderQuery = supabase
        .from('floating_expenses')
        .select('*')
        .eq('approval_status', 'PENDING')
        .neq('description', 'RECEIPT_UPLOAD_TRIGGER')
        .gte('created_at', '2026-03-19T00:00:00Z');

      if (currentUser?.branch) {
        localQuery = localQuery.eq('branch', currentUser.branch);
        orderQuery = orderQuery.eq('branch_id', currentUser.branch);
      }

      const { data: localData, error: localError } = await localQuery;
      if (localError) throw localError;

      const { data: orderData, error: orderError } = await orderQuery;
      if (orderError) throw orderError;

      const combined = [
        ...(localData || []).map(d => ({ ...d, _type: d.source === 'ORDER' ? 'ORDER' : 'LOCAL', branch_id: d.branch || d.branch_id })),
        ...(orderData || []).map(d => ({ ...d, _type: 'ORDER' }))
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Fetch user profiles to map created_by (which might be an ID) to a name
      const userIds = [...new Set(combined.map(e => e.created_by).filter(Boolean))];
      
      if (userIds.length > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('id, email, full_name')
          .in('id', userIds);
          
        if (!usersError && usersData) {
          const userMap = usersData.reduce((acc, user) => {
            acc[user.id] = user.full_name || user.email || user.id;
            return acc;
          }, {} as Record<string, string>);
          
          combined.forEach(expense => {
            if (expense.created_by && userMap[expense.created_by]) {
              expense.created_by_name = userMap[expense.created_by];
            } else {
              expense.created_by_name = expense.created_by; // Fallback
            }
          });
        }
      }

      setPendingExpenses(combined);
    } catch (error) {
      console.warn("Error fetching pending approvals:", error);
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
      const updateData: any = { approval_status: 'APPROVED' };
      if (table === 'accounting_transactions') {
        updateData.status = 'COMPLETED';
      }

      const { error } = await supabase
        .from(table)
        .update(updateData)
        .eq('id', expense.id);

      if (error) throw error;
      
      if (currentUser) {
        await auditService.recordLog(
          currentUser,
          'APPROVE_EXPENSE',
          `Aprobó gasto: ${expense.description} (${expense.amount})`,
          undefined,
          'TRANSACTION',
          expense.id
        );
      }
      
      setPendingExpenses(prev => prev.filter(e => e.id !== expense.id));
    } catch (error) {
      console.warn("Error approving expense:", error);
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
      const updateData: any = { approval_status: 'REJECTED' };
      if (table === 'accounting_transactions') {
        updateData.status = 'CANCELLED';
      }

      const { error } = await supabase
        .from(table)
        .update(updateData)
        .eq('id', expense.id);

      if (error) throw error;
      
      if (currentUser) {
        await auditService.recordLog(
          currentUser,
          'REJECT_EXPENSE',
          `Rechazó gasto: ${expense.description} (${expense.amount})`,
          undefined,
          'TRANSACTION',
          expense.id
        );
      }
      
      setPendingExpenses(prev => prev.filter(e => e.id !== expense.id));
    } catch (error) {
      console.warn("Error rejecting expense:", error);
      alert("Error al rechazar el gasto.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleConvertToLocal = async (expense: any) => {
    if (!window.confirm(`¿Convertir "${expense.description}" a Gasto Local? Esto lo aprobará y lo enviará directamente a finanzas.`)) return;
    setProcessingId(expense.id);
    try {
      // 1. Insert into accounting_transactions using accountingService to ensure all logic (categories, etc) is applied
      await accountingService.addTransaction({
        amount: -Math.abs(expense.amount),
        description: expense.description,
        transaction_date: new Date().toISOString().split('T')[0],
        receipt_url: expense.receipt_url,
        status: TransactionStatus.COMPLETED,
        approval_status: ApprovalStatus.APPROVED,
        expense_destination: ExpenseDestination.STORE,
        source: 'STORE',
        branch: expense.branch_id || currentUser?.branch || 'T4',
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
      
      if (currentUser) {
        await auditService.recordLog(
          currentUser,
          'UPDATE_EXPENSE',
          `Convirtió gasto flotante a Gasto Local y aprobó: ${expense.description} ($${expense.amount})`,
          undefined,
          'TRANSACTION',
          expense.id
        );
      }
      
      setPendingExpenses(prev => prev.filter(e => e.id !== expense.id));
    } catch (error) {
      console.warn("Error converting expense:", error);
      alert("Error al convertir el gasto.");
    } finally {
      setProcessingId(null);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center items-center p-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;
  }

  const isSupervisor = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.SUB_ADMIN || currentUser?.role === UserRole.MONITOR;

  if (!isSupervisor) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500">
        <ShieldAlert className="w-12 h-12 mb-4 text-red-400" />
        <p className="text-lg font-medium">No tienes permisos para aprobar gastos.</p>
      </div>
    );
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
            <div key={expense.id} className="border-b border-slate-100 last:border-0">
              <div 
                className="p-4 hover:bg-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-colors cursor-pointer"
                onClick={() => toggleExpand(expense.id)}
              >
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
                    
                    {/* Alerta Destacada sobre el destino del gasto */}
                    <div className={`mt-2 p-2 rounded-lg text-xs font-bold border ${
                      expense._type === 'LOCAL' 
                        ? 'bg-amber-50 border-amber-200 text-amber-800' 
                        : 'bg-blue-50 border-blue-200 text-blue-800'
                    }`}>
                      {expense._type === 'LOCAL' ? (
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5" />
                          <span>ESTE GASTO NO VA A NINGUNA ORDEN (Se descuenta directo de caja)</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Smartphone className="w-3.5 h-3.5" />
                          <span>ESTE GASTO DEBE ASIGNARSE A UNA ORDEN LUEGO DE APROBARSE</span>
                        </div>
                      )}
                    </div>

                    <p className="text-sm text-slate-500 mt-2">
                      Monto: <span className="font-bold text-red-600">${Math.abs(expense.amount).toLocaleString()}</span>
                    </p>
                    {expense.invoice_number && (
                      <p className="text-xs text-slate-500 mt-1 font-medium">
                        Factura: <span className="text-slate-700">{expense.invoice_number}</span>
                      </p>
                    )}
                    {expense.vendor && (
                      <p className="text-xs text-slate-500 mt-1 font-medium">
                        Proveedor: <span className="text-slate-700">{expense.vendor}</span>
                      </p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">
                      Fecha: {new Date(expense.created_at).toLocaleString()}
                    </p>
                    {expense.created_by_name && (
                      <p className="text-xs text-slate-500 mt-1 font-medium">
                        Creado por: <span className="text-slate-700">{expense.created_by_name}</span>
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex flex-col gap-2 w-full md:w-auto">
                  {expense._type === 'ORDER' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleConvertToLocal(expense); }}
                      disabled={processingId === expense.id}
                      className="w-full bg-amber-50 hover:bg-amber-100 text-amber-600 font-bold py-2 px-4 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 border border-amber-200"
                    >
                      <Building2 className="w-4 h-4" />
                      Convertir a Gasto Local
                    </button>
                  )}
                  <div className="flex items-center gap-2 w-full md:w-auto">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleReject(expense); }}
                      disabled={processingId === expense.id}
                      className="flex-1 md:flex-none px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      {processingId === expense.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                      Rechazar
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleApprove(expense); }}
                      disabled={processingId === expense.id}
                      className="flex-1 md:flex-none px-4 py-2 bg-green-50 text-green-600 hover:bg-green-100 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      {processingId === expense.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Aprobar
                    </button>
                    <div className="p-2 text-slate-400 hidden md:block">
                      {expandedId === expense.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </div>
                </div>
              </div>
              
              {expandedId === expense.id && (
                <div className="p-4 bg-slate-50 border-t border-slate-100">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-sm font-bold text-slate-700 mb-3">Detalles del Gasto</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between border-b border-slate-200 pb-2">
                          <span className="text-slate-500">Descripción:</span>
                          <span className="font-medium text-slate-800">{expense.description}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-200 pb-2">
                          <span className="text-slate-500">Monto:</span>
                          <span className="font-bold text-red-600">${Math.abs(expense.amount).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-200 pb-2">
                          <span className="text-slate-500">Fecha de Registro:</span>
                          <span className="font-medium text-slate-800">{new Date(expense.created_at).toLocaleString()}</span>
                        </div>
                        {expense.created_by_name && (
                          <div className="flex justify-between border-b border-slate-200 pb-2">
                            <span className="text-slate-500">Creado por:</span>
                            <span className="font-medium text-slate-800">{expense.created_by_name}</span>
                          </div>
                        )}
                        {expense.invoice_number && (
                          <div className="flex justify-between border-b border-slate-200 pb-2">
                            <span className="text-slate-500">Nº Factura:</span>
                            <span className="font-medium text-slate-800">{expense.invoice_number}</span>
                          </div>
                        )}
                        {expense.branch_id && (
                          <div className="flex justify-between border-b border-slate-200 pb-2">
                            <span className="text-slate-500">Sucursal:</span>
                            <span className="font-medium text-slate-800">{expense.branch_id}</span>
                          </div>
                        )}
                        {expense.source && (
                          <div className="flex justify-between border-b border-slate-200 pb-2">
                            <span className="text-slate-500">Origen:</span>
                            <span className="font-medium text-slate-800">{expense.source}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="text-sm font-bold text-slate-700 mb-3">Comprobante / Factura</h4>
                      {expense.receipt_url ? (
                        <div className="rounded-xl overflow-hidden border border-slate-200 bg-white relative group">
                          <img 
                            src={expense.receipt_url} 
                            alt="Factura" 
                            className="w-full h-48 object-cover"
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <a 
                              href={expense.receipt_url} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="text-white text-sm font-bold bg-black/50 px-4 py-2 rounded-full backdrop-blur-sm hover:bg-black/70 flex items-center gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <FileText className="w-4 h-4" /> Ver Completa
                            </a>
                          </div>
                        </div>
                      ) : (
                        <div className="h-48 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-slate-400">
                          <ImageIcon className="w-8 h-8 opacity-50 mb-2" />
                          <span className="text-sm font-medium">Sin comprobante adjunto</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
