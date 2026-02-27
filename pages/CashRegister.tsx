
import React, { useState, useMemo, useEffect } from 'react';
import { useOrders } from '../contexts/OrderContext';
import { useAuth } from '../contexts/AuthContext';
import { useCash } from '../contexts/CashContext';
import { UserRole, Payment, PaymentMethod, OrderStatus, RepairOrder, DebtLog, CashClosing, OrderType } from '../types';
import { DollarSign, Filter, Calendar, User, Search, Wallet, CreditCard, Banknote, Building, AlertTriangle, Printer, CheckCircle2, Users, ChevronRight, Phone, ExternalLink, X, FileText, Smartphone, PlusCircle, Loader2, Lock, History, ClipboardCheck, ArrowUpRight, ArrowDownLeft, Edit2, CheckSquare, RotateCcw, Eye, ScrollText, UserCheck, RefreshCw, MapPin, CalendarDays, MousePointerClick, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { printCashCount } from '../services/invoiceService';
import { DbFixModal } from '../components/DbFixModal';
import { fetchGlobalPayments, FlatPayment } from '../services/analytics';

const CashRegisterComponent: React.FC = () => {
  const navigate = useNavigate();
  const { orders, addPayments, showNotification, performCashClosing, editPayment } = useOrders();
  const { getCashierDebtLogs, payCashierDebt, getCashClosings } = useCash();
  const { users, currentUser } = useAuth();
  
  // View State
  const [activeTab, setActiveTab] = useState<'DAILY' | 'RECONCILE' | 'DEBTS' | 'HISTORY'>('DAILY');
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Filters
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  
  // DATA STATE: Payments from Server (Bypass Orders Context)
  const [rawGlobalPayments, setRawGlobalPayments] = useState<FlatPayment[]>([]);
  
  // Debt States
  const [debtLogs, setDebtLogs] = useState<DebtLog[]>([]);
  const [loadingDebts, setLoadingDebts] = useState(false);
  const [debtPaymentAmount, setDebtPaymentAmount] = useState('');
  const [debtPaymentNote, setDebtPaymentNote] = useState('');
  
  const [debtSearch, setDebtSearch] = useState('');

  // Reconciliation States
  const [actualCash, setActualCash] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const [closingBranch, setClosingBranch] = useState<string>('');
  
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);

  // History State
  const [historyClosings, setHistoryClosings] = useState<CashClosing[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearchTerm, setHistorySearchTerm] = useState('');

  // Modals
  const [selectedDebtOrder, setSelectedDebtOrder] = useState<RepairOrder | null>(null);
  const [selectedPaymentDetails, setSelectedPaymentDetails] = useState<FlatPayment | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const [showDbFixModal, setShowDbFixModal] = useState(false);

  // Helper to ensure we always have a unique ID even if payment_id is missing
  const getPaymentId = (p: FlatPayment) => p.payment_id || (p as any).id || `${p.order_id}-${p.date}-${p.amount}`;

  // Permissions
  const canAdminister = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.SUB_ADMIN || currentUser?.role === UserRole.MONITOR || currentUser?.role === UserRole.CASHIER || currentUser?.permissions?.canViewAccounting;
  const isAdmin = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.SUB_ADMIN;

  useEffect(() => {
      if (currentUser && selectedUsers.length === 0) {
          setSelectedUsers([currentUser.id]);
      }
  }, [currentUser]);

  // --- 1. FETCH FROM SERVER ---
  const loadPaymentsFromServer = async () => {
      setIsSyncing(true);
      
      // Default: Last 48 hours to catch everything recent
      const end = Date.now();
      const start = end - (48 * 60 * 60 * 1000); 

      const payments = await fetchGlobalPayments(start, end, null, null);
      setRawGlobalPayments(payments);
      
      setIsSyncing(false);
  };

  const syncCashierData = async () => {
      if (selectedUsers.length > 0) {
          setLoadingDebts(true);
          Promise.all(selectedUsers.map(id => getCashierDebtLogs(id)))
            .then(results => {
                const allLogs = results.flat().sort((a, b) => b.timestamp - a.timestamp);
                setDebtLogs(allLogs);
                setLoadingDebts(false);
            });
          
          await loadPaymentsFromServer();
      } else {
          setDebtLogs([]);
      }
  };

  useEffect(() => {
      syncCashierData();
      setSelectedPaymentIds([]); 
  }, [selectedUsers]);

  useEffect(() => {
      if (activeTab === 'HISTORY' && !historySearchTerm) {
          setLoadingHistory(true);
          getCashClosings(100).then(data => {
              setHistoryClosings(data);
              setLoadingHistory(false);
          });
      }
  }, [activeTab]);

  const cashierUsers = useMemo(() => {
      return users.filter(u => u.permissions?.canDeliverOrder);
  }, [users]);

  const toggleUser = (userId: string) => {
      if (selectedUsers.includes(userId)) {
          if (selectedUsers.length === 1 && !canAdminister) return;
          setSelectedUsers(prev => prev.filter(id => id !== userId));
      } else {
          setSelectedUsers(prev => [...prev, userId]);
      }
  };

  const selectAllCashiers = () => {
      if (selectedUsers.length === cashierUsers.length) {
          setSelectedUsers([]); 
      } else {
          setSelectedUsers(cashierUsers.map(u => u.id));
      }
  };

  const getSelectedUserNames = () => {
      if (selectedUsers.length === cashierUsers.length && cashierUsers.length > 1) return "Turno General (Todos)";
      const names = users.filter(u => selectedUsers.includes(u.id)).map(u => u.name.split(' ')[0]);
      return names.join(', ');
  };

  // --- FILTER PAYMENTS FROM SERVER DATA ---
  const currentShiftPayments = useMemo(() => {
      // Use rawGlobalPayments instead of orders context
      return rawGlobalPayments
          .filter(p => selectedUsers.includes(p.cashier_id))
          .sort((a, b) => b.date - a.date);
  }, [rawGlobalPayments, selectedUsers]);

  const totalsByBranch = useMemo(() => {
      const groups: Record<string, { cash: number, transfer: number, card: number, credit: number, refunds: number, total: number, count: number }> = {};
      
      currentShiftPayments.forEach(p => {
          const branch = p.order_branch || 'T4';
          if (!groups[branch]) groups[branch] = { cash: 0, transfer: 0, card: 0, credit: 0, refunds: 0, total: 0, count: 0 };
          
          const amt = p.amount;
          const isRefund = amt < 0 || p.is_refund;
          
          groups[branch].total += amt;
          groups[branch].count += 1;
          
          if (p.method === 'CASH') groups[branch].cash += amt;
          else if (p.method === 'TRANSFER') groups[branch].transfer += amt;
          else if (p.method === 'CARD') groups[branch].card += amt;
          else if (p.method === 'CREDIT') groups[branch].credit += amt;
          
          if (isRefund) groups[branch].refunds += Math.abs(amt);
      });
      
      return groups;
  }, [currentShiftPayments]);

  useEffect(() => {
      const availableBranches = Object.keys(totalsByBranch);
      if (availableBranches.length > 0 && (!closingBranch || !availableBranches.includes(closingBranch))) {
          setClosingBranch(availableBranches[0]);
      }
  }, [totalsByBranch, closingBranch]);

  useEffect(() => {
      const branchPayments = currentShiftPayments.filter(p => (p.order_branch || 'T4') === closingBranch);
      setSelectedPaymentIds(branchPayments.map(p => getPaymentId(p)));
  }, [currentShiftPayments, closingBranch]);

  const togglePaymentSelection = (id: string) => {
      setSelectedPaymentIds(prev => 
          prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      );
  };

  const toggleSelectAllForBranch = () => {
      const branchPayments = currentShiftPayments.filter(p => (p.order_branch || 'T4') === closingBranch);
      const allIds = branchPayments.map(p => getPaymentId(p));
      const allSelected = allIds.length > 0 && allIds.every(id => selectedPaymentIds.includes(id));
      
      if (allSelected) {
          setSelectedPaymentIds([]);
      } else {
          setSelectedPaymentIds(allIds);
      }
  };

  const reconcileTotals = useMemo(() => {
      const branchPayments = currentShiftPayments.filter(p => (p.order_branch || 'T4') === closingBranch);
      const activePayments = branchPayments.filter(p => selectedPaymentIds.includes(getPaymentId(p)));

      const stats = { cash: 0, total: 0, count: 0 };
      
      activePayments.forEach(p => {
          stats.total += p.amount;
          stats.count += 1;
          if (p.method === 'CASH') stats.cash += p.amount;
      });
      
      return stats;
  }, [currentShiftPayments, closingBranch, selectedPaymentIds]);

  const handleCloseShift = async () => {
      if (!currentUser) { showNotification('error', 'Sesión inválida'); return; }
      if (selectedUsers.length === 0) { showNotification('error', 'Selecciona al menos un cajero'); return; }
      if (!closingBranch) { showNotification('error', 'Selecciona una sucursal'); return; }
      
      if (actualCash === '' || isNaN(parseFloat(actualCash))) { 
          alert("Por favor ingrese el monto real en caja (si es cero, coloque 0)."); 
          return; 
      }

      const actual = parseFloat(actualCash);
      const expectedCash = reconcileTotals.cash; 
      const diff = actual - expectedCash;

      if (!confirm(`¿CERRAR CAJA DE ${closingBranch}?\n\nSistema (Efectivo): $${expectedCash.toLocaleString()}\nReal (Conteo): $${actual.toLocaleString()}\nDiferencia: $${diff.toLocaleString()}`)) return;

      setIsClosing(true);
      try {
          let paymentIds: string[] = [];
          
          if (selectedPaymentIds.length > 0) {
              paymentIds = selectedPaymentIds;
          } else {
              paymentIds = currentShiftPayments
                  .filter(p => (p.order_branch || 'T4') === closingBranch)
                  .map(p => p.payment_id);
          }
              
          const combinedIds = selectedUsers.join(',');
          
          await performCashClosing(combinedIds, expectedCash, actual, currentUser.id, paymentIds);
          
          setActualCash('');
          setSelectedPaymentIds([]); 
          showNotification('success', `Cierre realizado correctamente`);
          
          // Refresh Data from server
          loadPaymentsFromServer();
          setActiveTab('HISTORY'); 

      } catch (error: any) {
          const errMsg = error.message || '';
          if (errMsg.includes('cash_closings') || error.code === '42P01') {
             setShowDbFixModal(true); 
          } else {
             showNotification('error', `Error al cerrar caja: ${errMsg}`);
          }
      } finally {
          setIsClosing(false);
      }
  };

  const handlePrintShift = (branch: string) => {
      const cashierName = getSelectedUserNames() + ` (${branch})`;
      const branchPayments = currentShiftPayments.filter(p => (p.order_branch || 'T4') === branch);
      const branchTotals = totalsByBranch[branch];
      
      // Map back to format expected by print function
      const printPayments = branchPayments.map(p => ({
          id: p.payment_id,
          amount: p.amount,
          method: p.method,
          date: p.date,
          cashierId: p.cashier_id,
          cashierName: p.cashier_name,
          orderId: p.order_id,
          orderModel: p.order_model,
          orderReadableId: p.order_readable_id
      } as any));

      if (branchTotals) {
          printCashCount(printPayments, cashierName, branchTotals);
      }
  };

  // KEEPING CUSTOMER DEBTS LOGIC TIED TO ORDERS CONTEXT FOR NOW (Less critical for shift closing)
  const customerDebtOrders = useMemo(() => {
      return orders.filter(o => {
          if (o.status !== OrderStatus.RETURNED) return false;
          if (o.orderType === OrderType.STORE) return false;

          const totalPaid = (o.payments || []).reduce((acc, p) => acc + p.amount, 0);
          const totalCost = o.finalPrice || o.estimatedCost || 0;
          const hasDebt = totalPaid < (totalCost - 0.1);
          
          if (!hasDebt) return false;

          if (debtSearch) {
              const term = debtSearch.toLowerCase();
              return (
                  o.customer.name.toLowerCase().includes(term) ||
                  o.deviceModel.toLowerCase().includes(term) ||
                  (o.readable_id?.toString() || o.id).includes(term)
              );
          }
          return true;
      });
  }, [orders, debtSearch]);

  const handleCustomerDebtPayment = async () => {
      if (!selectedDebtOrder) return;
      const amount = parseFloat(paymentAmount);
      if (isNaN(amount) || amount <= 0) { alert("Monto inválido"); return; }
      setIsProcessingPayment(true);
      try {
          const payment: Payment = {
              id: `pay-debt-${Date.now()}`,
              amount: amount,
              method: paymentMethod,
              date: Date.now(),
              cashierId: currentUser?.id || 'unknown',
              cashierName: currentUser?.name || 'Cajero',
              notes: 'Abono a deuda cliente'
          };
          await addPayments(selectedDebtOrder.id, [payment]);
          showNotification('success', 'Abono registrado');
          setPaymentAmount('');
          setSelectedDebtOrder(null);
      } finally { setIsProcessingPayment(false); }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto pb-20 relative">
        
        {showDbFixModal && <DbFixModal onClose={() => setShowDbFixModal(false)} />}

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div>
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Wallet className="w-6 h-6 text-green-600"/> Gestión de Caja</h1>
                <p className="text-slate-500 text-sm">Control de efectivo, cuadres y deudas.</p>
            </div>
            <div className="bg-slate-100 p-1 rounded-xl flex gap-1 overflow-x-auto max-w-full">
                <button onClick={() => setActiveTab('DAILY')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'DAILY' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Turno Actual</button>
                {canAdminister && <button onClick={() => setActiveTab('RECONCILE')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'RECONCILE' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Cierre</button>}
                <button onClick={() => setActiveTab('HISTORY')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'HISTORY' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Historial</button>
                <button onClick={() => setActiveTab('DEBTS')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'DEBTS' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Cuentas x Cobrar</button>
            </div>
        </div>

        {/* --- GLOBAL USER MULTI-SELECTOR --- */}
        {activeTab !== 'HISTORY' && (
        <div className="mb-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2 text-slate-500 font-bold text-sm uppercase tracking-wider">
                    <User className="w-4 h-4"/> Cajeros Seleccionados
                </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
                {canAdminister && (
                    <button onClick={selectAllCashiers} className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all flex items-center gap-2 ${selectedUsers.length === cashierUsers.length ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        <CheckSquare className="w-3 h-3" /> TODOS
                    </button>
                )}
                {cashierUsers.map(u => (
                    <button key={u.id} onClick={() => canAdminister ? toggleUser(u.id) : null} className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all flex items-center gap-2 ${selectedUsers.includes(u.id) ? 'bg-blue-600 text-white' : 'bg-white text-slate-600'}`}>
                        <User className="w-3 h-3"/> {u.name}
                    </button>
                ))}
                <button onClick={loadPaymentsFromServer} disabled={isSyncing} className="ml-auto text-xs font-bold text-blue-600 bg-blue-50 px-3 py-2 rounded-lg flex items-center gap-1">
                    <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} /> 
                    {isSyncing ? 'Buscando Pagos...' : 'Refrescar Datos'}
                </button>
            </div>
        </div>
        )}

        {/* --- VIEW: DAILY SHIFT --- */}
        {activeTab === 'DAILY' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in">
                {/* BRANCH CARDS */}
                <div className="lg:col-span-1 space-y-4">
                    {Object.keys(totalsByBranch).length === 0 ? (
                        <div className="bg-slate-800 text-white p-6 rounded-2xl shadow-xl text-center opacity-50">
                            <p className="text-sm font-bold">Sin movimientos activos</p>
                        </div>
                    ) : (
                        Object.entries(totalsByBranch).map(([branch, t]) => {
                            const totals = t as any;
                            return (
                            <div key={branch} className="bg-slate-800 text-white p-6 rounded-2xl shadow-xl relative overflow-hidden group border border-slate-700">
                                <div className="absolute top-0 right-0 p-2 bg-white/10 rounded-bl-xl font-bold text-xs flex items-center gap-1">
                                    <MapPin className="w-3 h-3" /> {branch}
                                </div>
                                <div className="relative z-10">
                                    <div className="flex justify-between items-start mb-4">
                                         <p className="text-slate-400 text-xs font-bold uppercase">Total {branch}</p>
                                         <button onClick={() => handlePrintShift(branch)} className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition" title="Imprimir Corte"><Printer className="w-5 h-5"/></button>
                                    </div>
                                    <h2 className="text-4xl font-extrabold mb-6 flex items-center gap-1"><span className="text-2xl opacity-50">$</span> {totals.total.toLocaleString()}</h2>
                                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-700">
                                        <div><p className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1"><Banknote className="w-3 h-3"/> Efectivo</p><p className="text-lg font-bold text-green-400">${totals.cash.toLocaleString()}</p></div>
                                        <div><p className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1"><CreditCard className="w-3 h-3"/> Tarjeta</p><p className="text-lg font-bold text-purple-400">${totals.card.toLocaleString()}</p></div>
                                        <div><p className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1"><RefreshCw className="w-3 h-3"/> Transf.</p><p className="text-lg font-bold text-blue-400">${totals.transfer.toLocaleString()}</p></div>
                                        <div><p className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1"><DollarSign className="w-3 h-3"/> Crédito</p><p className="text-lg font-bold text-orange-400">${totals.credit.toLocaleString()}</p></div>
                                        {totals.refunds > 0 && (
                                            <div className="col-span-2 mt-2 pt-2 border-t border-slate-700/50">
                                                <p className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1"><DollarSign className="w-3 h-3"/> Devoluciones</p>
                                                <p className="text-lg font-bold text-red-400">-${totals.refunds.toLocaleString()}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )})
                    )}
                </div>

                <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[600px]">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="font-bold text-slate-700">Movimientos Detectados ({currentShiftPayments.length})</h3>
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-bold">Datos Servidor</span>
                    </div>
                    <div className="overflow-y-auto flex-1 p-2">
                        {currentShiftPayments.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                <Search className="w-12 h-12 mb-2 opacity-20" />
                                <p>Caja limpia. Todo conciliado o sin datos.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {currentShiftPayments.map((p, idx) => {
                                    const isRefund = p.amount < 0 || p.is_refund;
                                    const methodTranslated = p.method === 'CASH' ? 'Efectivo' : p.method === 'TRANSFER' ? 'Transferencia' : p.method === 'CARD' ? 'Tarjeta' : p.method;
                                    const dateObj = new Date(Number(p.date));
                                    const dateStr = isNaN(dateObj.getTime()) ? new Date(p.date).toLocaleDateString() : dateObj.toLocaleDateString();
                                    
                                    return (
                                    <div 
                                        key={idx} 
                                        className={`p-3 rounded-xl border flex justify-between items-center transition-all group cursor-pointer hover:shadow-md ${isRefund ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}
                                        onClick={() => setSelectedPaymentDetails(p)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-full ${isRefund ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                                <DollarSign className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-[10px] font-bold text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                                                        <MapPin className="w-2.5 h-2.5" /> {p.order_branch || 'T4'}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-slate-400">
                                                        {dateStr}
                                                    </span>
                                                </div>
                                                <p className="text-xs font-bold text-slate-500 uppercase">{methodTranslated}</p>
                                                <p className="text-sm font-bold text-slate-800">Orden #{p.order_readable_id ? p.order_readable_id : p.order_id?.slice(-4)} - {p.order_model}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className={`text-lg font-black flex items-center justify-end gap-1 ${isRefund ? 'text-red-600' : 'text-slate-700'}`}>
                                                ${p.amount.toLocaleString()}
                                            </p>
                                            <p className="text-xs text-slate-400">{p.cashier_name}</p>
                                        </div>
                                    </div>
                                )})}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* ... (RECONCILE TAB) ... */}
        {activeTab === 'RECONCILE' && canAdminister && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in">
                {/* LIST OF MOVEMENTS FOR SELECTION */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[600px]">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2"><MousePointerClick className="w-5 h-5 text-slate-500"/> Seleccionar Movimientos</h3>
                        <button onClick={toggleSelectAllForBranch} className="text-xs text-blue-600 font-bold hover:bg-blue-50 px-3 py-1 rounded">
                            {selectedPaymentIds.length === 0 ? 'Seleccionar Todo' : 'Deseleccionar'}
                        </button>
                    </div>
                    
                    <div className="overflow-y-auto flex-1 pr-2 space-y-2">
                        {currentShiftPayments
                            .filter(p => (p.order_branch || 'T4') === closingBranch)
                            .map((p, idx) => {
                                const pId = getPaymentId(p);
                                const isChecked = selectedPaymentIds.includes(pId);
                                const methodTranslated = p.method === 'CASH' ? 'Efectivo' : p.method === 'TRANSFER' ? 'Transferencia' : p.method === 'CARD' ? 'Tarjeta' : p.method;
                                return (
                                <div 
                                    key={pId} 
                                    onClick={() => togglePaymentSelection(pId)}
                                    className={`p-3 rounded-xl border flex gap-3 items-center cursor-pointer transition-all ${isChecked ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200 opacity-60 hover:opacity-100'}`}
                                >
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center ${isChecked ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300'}`}>
                                        {isChecked && <CheckSquare className="w-3.5 h-3.5" />}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between">
                                            <p className="text-xs font-bold text-slate-700">#{p.order_readable_id ? p.order_readable_id : p.order_id?.slice(-4)}</p>
                                            <p className="text-xs font-bold text-slate-800">${p.amount.toLocaleString()}</p>
                                        </div>
                                        <p className="text-[10px] text-slate-500 uppercase">{methodTranslated} • {p.cashier_name}</p>
                                    </div>
                                </div>
                        )})}
                    </div>
                </div>

                {/* TOTALS CARD */}
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-blue-200 relative overflow-hidden h-fit">
                    <div className="absolute top-0 left-0 w-full h-1 bg-blue-600" />
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2"><ClipboardCheck className="w-6 h-6 text-blue-600"/> Cuadre de Caja</h3>
                        <select 
                            value={closingBranch}
                            onChange={e => { setClosingBranch(e.target.value); setSelectedPaymentIds([]); }}
                            className="text-xs font-bold bg-slate-100 p-2 rounded-lg border border-slate-200 outline-none"
                        >
                            {Array.from(new Set(['T1', 'T4', ...Object.keys(totalsByBranch)])).map(branch => (
                                <option key={branch} value={branch}>{branch}</option>
                            ))}
                        </select>
                    </div>
                    {/* ... content ... */}
                    {selectedUsers.length === 0 ? (<div className="text-center p-8 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">Selecciona al menos un cajero arriba.</div>) : !totalsByBranch[closingBranch] ? (<div className="text-center p-8 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">No hay movimientos para {closingBranch}.</div>) : (
                        <div className="space-y-6">
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <div className="flex justify-between items-end">
                                    <div><p className="text-xs font-bold text-slate-500 uppercase mb-1">Efectivo Esperado</p><p className="text-3xl font-black text-slate-800">${reconcileTotals.cash.toLocaleString()}</p></div>
                                </div>
                            </div>
                            <div><label className="text-sm font-bold text-slate-700 mb-2 block">Efectivo Real (Conteo)</label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span><input type="number" className="w-full pl-8 p-3 border border-slate-300 rounded-xl text-xl font-bold outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.00" value={actualCash} onChange={e => setActualCash(e.target.value)} /></div></div>
                            <button onClick={handleCloseShift} disabled={isClosing} className={`w-full py-4 bg-blue-600 text-white rounded-xl font-bold shadow-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${!actualCash ? 'opacity-90' : ''}`}>{isClosing ? <Loader2 className="w-5 h-5 animate-spin"/> : <Lock className="w-5 h-5"/>} CONSOLIDAR CIERRE</button>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* ... HISTORY TAB ... */}
        {activeTab === 'HISTORY' && (
            <div className="space-y-4 animate-in fade-in">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                        <input 
                            placeholder="Buscar en historial por cajero, fecha, ID..." 
                            className="w-full pl-10 p-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-purple-200 outline-none" 
                            value={historySearchTerm} 
                            onChange={e => setHistorySearchTerm(e.target.value)} 
                        />
                    </div>
                </div>
                {/* List Closings History */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {historyClosings
                        .filter(c => {
                            if (!historySearchTerm) return true;
                            const term = historySearchTerm.toLowerCase();
                            const dateStr = new Date(c.timestamp).toLocaleDateString().toLowerCase();
                            const cashierIdStr = c.cashierId ? c.cashierId.toLowerCase() : '';
                            const idStr = c.id ? c.id.toLowerCase() : '';
                            return (
                                cashierIdStr.includes(term) ||
                                dateStr.includes(term) ||
                                idStr.includes(term)
                            );
                        })
                        .map(closing => {
                        const date = new Date(closing.timestamp);
                        const isPerfect = closing.difference === 0;
                        return (
                            <div key={closing.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 cursor-pointer hover:shadow-md transition">
                                <div className="flex justify-between items-start mb-2 pl-2">
                                    <div className="text-xs text-slate-500 font-bold uppercase">{date.toLocaleDateString()} • {date.toLocaleTimeString()}</div>
                                    <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${isPerfect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{isPerfect ? 'Cuadrado' : 'Diferencia'}</div>
                                </div>
                                <div className="pl-2">
                                    <div className="text-2xl font-black text-slate-800 mb-1">${closing.systemTotal.toLocaleString()}</div>
                                    <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-xs">
                                        <div><span className="text-slate-400 font-bold uppercase block text-[9px]">Real</span><span className="font-bold text-slate-700">${closing.actualTotal.toLocaleString()}</span></div>
                                        <div className="text-right"><span className="text-slate-400 font-bold uppercase block text-[9px]">Diferencia</span><span className={`font-bold ${closing.difference === 0 ? 'text-slate-300' : 'text-red-500'}`}>{closing.difference > 0 ? '+' : ''}{closing.difference.toLocaleString()}</span></div>
                                    </div>
                                    <div className="mt-2 text-[10px] text-slate-400 font-mono truncate">ID: {closing.id.slice(0, 8)}...</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        )}
        
        {/* ... DEBTS TAB ... */}
        {activeTab === 'DEBTS' && (
            <div className="space-y-4 animate-in fade-in">
                {/* Search Bar for Debts */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                        <input placeholder="Buscar deuda por cliente, modelo o ID..." className="w-full pl-10 p-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-200 outline-none" value={debtSearch} onChange={e => setDebtSearch(e.target.value)} />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {customerDebtOrders.map(order => {
                        const totalPaid = (order.payments || []).reduce((acc, p) => acc + p.amount, 0);
                        const totalCost = order.finalPrice || order.estimatedCost || 0;
                        const debt = totalCost - totalPaid;
                        const creditPayment = order.payments?.find(p => p.method === 'CREDIT');

                        return (
                            <div key={order.id} className="bg-white rounded-2xl shadow-sm border border-red-100 overflow-hidden relative group hover:shadow-lg transition-all hover:-translate-y-1">
                                <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                                <div className="p-5">
                                    <div className="flex justify-between items-start mb-3"><div><h3 className="font-bold text-slate-800 text-lg">{order.customer.name}</h3><p className="text-xs text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3"/> {order.customer.phone}</p></div><span className="bg-red-50 text-red-600 text-xs font-bold px-2 py-1 rounded border border-red-100 uppercase">Debe</span></div>
                                    <div className="flex justify-between text-base border-t border-slate-200 pt-2 mt-2"><span className="font-bold text-slate-700">Pendiente:</span><span className="font-black text-red-600">${debt.toLocaleString()}</span></div>
                                    
                                    {/* --- SHOW WHO AUTHORIZED CREDIT --- */}
                                    {creditPayment && (
                                        <div className="mt-2 text-[10px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-100">
                                            <strong>Autorizado por:</strong> {creditPayment.cashierName}
                                            <br/>
                                            <span className="opacity-75">{new Date(creditPayment.date).toLocaleDateString()}</span>
                                        </div>
                                    )}

                                    <div className="flex gap-2 mt-4"><button onClick={() => navigate(`/orders/${order.id}`)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold text-xs hover:bg-slate-200 transition flex items-center justify-center gap-1"><ExternalLink className="w-3 h-3"/> Ver</button><button onClick={() => setSelectedDebtOrder(order)} className="flex-1 py-2 bg-green-600 text-white rounded-lg font-bold text-xs hover:bg-green-700 transition flex items-center justify-center gap-1 shadow-md shadow-green-200"><DollarSign className="w-3 h-3"/> Abonar</button></div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        )}
        
        {/* ... MODALS ... */}
        {selectedDebtOrder && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in zoom-in duration-200" onClick={() => setSelectedDebtOrder(null)}>
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center"><h3 className="font-bold text-slate-800">Registrar Abono Cliente</h3><button onClick={() => setSelectedDebtOrder(null)}><X className="w-5 h-5 text-slate-400 hover:text-slate-600"/></button></div>
                    <div className="p-6 space-y-4">
                        <div className="text-center mb-4"><h2 className="text-xl font-bold text-slate-800">{selectedDebtOrder.customer.name}</h2><p className="text-red-500 font-bold text-sm mt-1">Deuda: ${(selectedDebtOrder.finalPrice || selectedDebtOrder.estimatedCost) - (selectedDebtOrder.payments?.reduce((a,b)=>a+b.amount,0)||0)}</p></div>
                        <div><label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Monto</label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span><input type="number" autoFocus className="w-full pl-8 p-3 border border-slate-300 rounded-xl text-lg font-bold outline-none focus:border-green-500" placeholder="0.00" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} /></div></div>
                        <div><label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Método</label><select className="w-full p-3 border border-slate-300 rounded-xl bg-white outline-none" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}><option value="CASH">Efectivo</option><option value="TRANSFER">Transferencia</option><option value="CARD">Tarjeta</option></select></div>
                        <button onClick={handleCustomerDebtPayment} disabled={isProcessingPayment || !paymentAmount} className="w-full py-4 bg-green-600 text-white font-bold rounded-xl shadow-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">{isProcessingPayment ? <Loader2 className="w-5 h-5 animate-spin"/> : <CheckCircle2 className="w-5 h-5"/>} Confirmar Abono</button>
                    </div>
                </div>
            </div>
        )}
        {selectedPaymentDetails && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in zoom-in duration-200" onClick={() => setSelectedPaymentDetails(null)}>
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <Info className="w-5 h-5 text-blue-500"/> Detalle del Movimiento
                        </h3>
                        <button onClick={() => setSelectedPaymentDetails(null)} className="p-1 hover:bg-slate-200 rounded-full transition">
                            <X className="w-5 h-5 text-slate-400 hover:text-slate-600"/>
                        </button>
                    </div>
                    
                    <div className="p-6 space-y-6">
                        {/* Header Amount */}
                        <div className="text-center">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Monto Total</p>
                            <h2 className={`text-4xl font-black ${selectedPaymentDetails.amount < 0 || selectedPaymentDetails.is_refund ? 'text-red-500' : 'text-slate-800'}`}>
                                ${selectedPaymentDetails.amount.toLocaleString()}
                            </h2>
                            {selectedPaymentDetails.is_refund && (
                                <span className="inline-block mt-2 px-3 py-1 bg-red-100 text-red-600 text-xs font-bold rounded-full uppercase">
                                    Reembolso / Devolución
                                </span>
                            )}
                        </div>

                        {/* Details Grid */}
                        <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Orden</p>
                                <p className="font-bold text-slate-700 text-sm">#{selectedPaymentDetails.order_readable_id ? selectedPaymentDetails.order_readable_id : selectedPaymentDetails.order_id?.slice(-4)}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Fecha</p>
                                <p className="font-bold text-slate-700 text-sm">{new Date(selectedPaymentDetails.date).toLocaleString()}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Método</p>
                                <p className="font-bold text-slate-700 text-sm">
                                    {selectedPaymentDetails.method === 'CASH' ? 'Efectivo' : 
                                     selectedPaymentDetails.method === 'TRANSFER' ? 'Transferencia' : 
                                     selectedPaymentDetails.method === 'CARD' ? 'Tarjeta' : selectedPaymentDetails.method}
                                </p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Cajero</p>
                                <p className="font-bold text-slate-700 text-sm">{selectedPaymentDetails.cashier_name}</p>
                            </div>
                            <div className="col-span-2">
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Modelo / Dispositivo</p>
                                <p className="font-bold text-slate-700 text-sm truncate">{selectedPaymentDetails.order_model}</p>
                            </div>
                             <div className="col-span-2">
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Cliente</p>
                                <p className="font-bold text-slate-700 text-sm truncate">{selectedPaymentDetails.order_customer}</p>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 pt-2">
                            <button 
                                onClick={() => {
                                    setSelectedPaymentDetails(null);
                                    navigate(`/orders/${selectedPaymentDetails.order_id}`);
                                }}
                                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg hover:bg-blue-700 transition flex items-center justify-center gap-2"
                            >
                                <ExternalLink className="w-4 h-4"/> Ver Orden Completa
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export const CashRegister = CashRegisterComponent;
