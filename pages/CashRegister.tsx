
import React, { useState, useMemo, useEffect } from 'react';
import { useOrders } from '../contexts/OrderContext';
import { useAuth } from '../contexts/AuthContext';
import { useCash } from '../contexts/CashContext';
import { UserRole, Payment, PaymentMethod, OrderStatus, RepairOrder, DebtLog, CashClosing, OrderType, ActionType, ClientCredit } from '../types';
import { auditService } from '../services/auditService';
import { DollarSign, Filter, Calendar, User, Search, Wallet, CreditCard, Banknote, Building, AlertTriangle, Printer, CheckCircle2, Users, ChevronRight, Phone, ExternalLink, X, FileText, Smartphone, PlusCircle, Loader2, Lock, History, ClipboardCheck, ArrowUpRight, ArrowDownRight, ArrowDownLeft, Edit2, CheckSquare, RotateCcw, Eye, ScrollText, UserCheck, RefreshCw, MapPin, CalendarDays, MousePointerClick, Info, XCircle, Trash2, ShieldAlert, AlertCircle, MessageCircle, Receipt, ListFilter } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { printCashCount } from '../services/invoiceService';
import { ExpenseApprovals } from '../components/pos/ExpenseApprovals';
import { CreditDetailsModal } from '../components/pos/CreditDetailsModal';
import { fetchGlobalPayments, FlatPayment } from '../services/analytics';
import { DbFixModal } from '../components/DbFixModal';
import { supabase } from '../services/supabase';
import { accountingService } from '../services/accountingService';
import { TransactionStatus } from '../types';

const CashRegisterComponent: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { orders, addPayments, showNotification, editPayment } = useOrders();
  const { performCashClosing, getCashierDebtLogs, payCashierDebt, getCashClosings, deleteCashClosing, updateCashClosing, forceClearPendingPayments, getClosingDetails, editClosedPayment } = useCash();
  const { users, currentUser } = useAuth();
  
  // View State
  const [activeTab, setActiveTab] = useState<'DAILY' | 'DEBTS' | 'HISTORY' | 'APPROVALS' | 'CREDITS' | 'TRANSACTIONS'>('DAILY');

  useEffect(() => {
    if (location.state && location.state.activeTab) {
      setActiveTab(location.state.activeTab);
      // Clear the state so it doesn't stick on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const [isSyncing, setIsSyncing] = useState(false);
  
  // Filters
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  
  // DATA STATE: Payments from Server (Bypass Orders Context)
  const [rawGlobalPayments, setRawGlobalPayments] = useState<FlatPayment[]>([]);
  const [legacyPayments, setLegacyPayments] = useState<FlatPayment[]>([]);
  const [isConsolidatingLegacy, setIsConsolidatingLegacy] = useState(false);

  const handleConsolidateLegacy = async () => {
    if (!currentUser || legacyPayments.length === 0) return;
    
    const cashierNames = Array.from(new Set(
        legacyPayments.map(p => p.cashier_name || p.cashier_id || 'Desconocido')
    ));
    const branches = Array.from(new Set(
        legacyPayments.map(p => p.order_branch || (p as any).branch || 'T4')
    ));
    const totalAmount = legacyPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
    
    const oldest = new Date(Math.min(...legacyPayments.map(p => p.created_at || Date.now())));
    const newest = new Date(Math.max(...legacyPayments.map(p => p.created_at || 0)));

    const messageStr = `Cantidad de movimientos: ${legacyPayments.length}\nTotal neto: $${totalAmount.toLocaleString()}\nSucursales incluidas: ${branches.join(', ')}\nCajeros incluidos: ${cashierNames.join(', ')}\nFecha mas antigua: ${oldest.toLocaleDateString()}\nFecha mas reciente: ${newest.toLocaleDateString()}\n\nEsto NO afecta el turno actual.`;

    setConfirmationDialog({
      title: 'Consolidar Limpieza Histórica',
      message: messageStr,
      confirmLabel: 'Consolidar como Histórico',
      type: 'warning',
      onConfirm: async () => {
          setConfirmationDialog(null);
          setIsConsolidatingLegacy(true);
          try {
              const legacyIds = legacyPayments.map(p => getPaymentId(p));
              const closingId = `close-legacy-${Date.now()}`;
              
              const { data, error } = await supabase.rpc('consolidate_legacy_payments', {
                  p_closing_id: closingId,
                  p_admin_id: currentUser.id,
                  p_total: totalAmount,
                  p_payment_ids: legacyIds
              });

              if (error) throw error;
              if (data && data.success === false) throw new Error(data.error || 'Error consolidando historicos');

              await auditService.recordLog(
                  { id: currentUser.id, name: currentUser.name },
                  ActionType.SETTINGS_UPDATED,
                  `Consolidación histórica de ${legacyPayments.length} registros ($${totalAmount}).`
              );

              const sBusinessDay = new Date();
              sBusinessDay.setHours(0, 0, 0, 0);
              const remainingLegacy = await fetchGlobalPayments(null, sBusinessDay.getTime() - 1, null, null, true);
              if (remainingLegacy.length > 0) {
                  console.warn('Aun quedan historicos pendientes:', remainingLegacy.length);
              }

              showNotification('success', 'Limpieza histórica completada.');
              loadPaymentsFromServer();
          } catch (e: any) {
              console.error(e);
              showNotification('error', `Error en limpieza: ${e.message}`);
          } finally {
              setIsConsolidatingLegacy(false);
          }
      }
    });
  };
  
  // Debt States
  const [debtLogs, setDebtLogs] = useState<DebtLog[]>([]);
  const [loadingDebts, setLoadingDebts] = useState(false);
  const [debtPaymentAmount, setDebtPaymentAmount] = useState('');
  const [debtPaymentNote, setDebtPaymentNote] = useState('');
  
  const [debtSearch, setDebtSearch] = useState('');

  // Reconciliation States
  const [actualCash, setActualCash] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const [isSuccessAnim, setIsSuccessAnim] = useState(false);
  const [closingBranch, setClosingBranch] = useState<string>('');
  
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  const [animatingIds, setAnimatingIds] = useState<string[]>([]); // Para animación de salida

  // History State
  const [historyClosings, setHistoryClosings] = useState<CashClosing[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [matchingClosingIds, setMatchingClosingIds] = useState<string[]>([]);

  useEffect(() => {
     if (!historySearchTerm || historySearchTerm.trim().length < 2) {
         setMatchingClosingIds([]);
         return;
     }
     const term = historySearchTerm.trim();
     if (/^\d+$/.test(term)) {
         // It's likely an invoice number, fetch matching orders to find their closing
         supabase.from('orders').select('createdAt').or(`readable_id.eq.${term},id.ilike.%${term}%`)
           .then(({data}) => {
               if (data && data.length > 0 && historyClosings.length > 0) {
                   const ids: string[] = [];
                   for (const order of data) {
                       const orderTime = new Date(order.createdAt).getTime();
                       // historyClosings are typically sorted desc (newest first).
                       // We reverse to find the first closing that comes AFTER the orderTime
                       const closing = [...historyClosings].reverse().find(c => c.timestamp >= orderTime);
                       if (closing) ids.push(closing.id);
                   }
                   setMatchingClosingIds(ids);
               } else {
                   setMatchingClosingIds([]);
               }
           });
     } else {
         setMatchingClosingIds([]);
     }
  }, [historySearchTerm, historyClosings]);
  
  // Transactions Tab State
  const [transactionsStartDate, setTransactionsStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [transactionsEndDate, setTransactionsEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [transactionsBranch, setTransactionsBranch] = useState<string>('ALL');
  const [transactionsType, setTransactionsType] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
  const [historicalTransactions, setHistoricalTransactions] = useState<any[]>([]);
  const [isFetchingTransactions, setIsFetchingTransactions] = useState(false);
  const [transactionsSearchTerm, setTransactionsSearchTerm] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState<any | null>(null);

  // Modals
  const [selectedDebtOrder, setSelectedDebtOrder] = useState<RepairOrder | null>(null);
  const [selectedPaymentDetails, setSelectedPaymentDetails] = useState<FlatPayment | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const [showDbFixModal, setShowDbFixModal] = useState(false);

  const [selectedClosing, setSelectedClosing] = useState<CashClosing | null>(null);
  const [closingDetails, setClosingDetails] = useState<any[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Confirmation Dialog State
  const [confirmationDialog, setConfirmationDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    confirmLabel?: string;
    cancelLabel?: string;
    type?: 'danger' | 'warning' | 'info';
  } | null>(null);

  // Prompt Modal State
  const [promptModal, setPromptModal] = useState<{
    title: string;
    message: string;
    fields: { key: string, label: string, type: string, defaultValue?: string }[];
    onConfirm: (values: Record<string, string>) => void;
  } | null>(null);

  // Credit Payment State
  const [payingCredit, setPayingCredit] = useState<ClientCredit | null>(null);
  const [creditPaymentMethod, setCreditPaymentMethod] = useState<PaymentMethod>('CASH');
  const [isProcessingCredit, setIsProcessingCredit] = useState(false);

  const [clientCredits, setClientCredits] = useState<ClientCredit[]>([]);
  const [loadingCredits, setLoadingCredits] = useState(false);
  const [creditSearch, setCreditSearch] = useState('');
  const [selectedCredit, setSelectedCredit] = useState<ClientCredit | null>(null);

  const loadClientCredits = async () => {
      if (!supabase) return;
      setLoadingCredits(true);
      try {
          const { data, error } = await supabase
              .from('client_credits')
              .select('*')
              .eq('status', 'PENDING')
              .order('created_at', { ascending: false });
          if (error) throw error;
          setClientCredits(data || []);
      } catch (error) {
          console.warn("Error loading credits:", error);
      } finally {
          setLoadingCredits(false);
      }
  };

  useEffect(() => {
      if (activeTab === 'CREDITS') {
          loadClientCredits();
      }
  }, [activeTab]);

  const filteredCredits = useMemo(() => {
    return clientCredits.filter(c => {
        const term = creditSearch.toLowerCase();
        return (
            (c.client_name && c.client_name.toLowerCase().includes(term)) ||
            (c.order_id && c.order_id.toLowerCase().includes(term)) ||
            (c.cashier_name && c.cashier_name.toLowerCase().includes(term)) ||
            (c.source_id && c.source_id.toLowerCase().includes(term))
        );
    });
  }, [clientCredits, creditSearch]);

    const handlePayCredit = async (credit: ClientCredit) => {
        setPayingCredit(credit);
        setCreditPaymentMethod('CASH');
    };

    const confirmCreditPayment = async () => {
        if (!payingCredit) return;
        
        setIsProcessingCredit(true);
        
        try {
            // 1. Update credit status
            const { error: updateError } = await supabase
                .from('client_credits')
                .update({ status: 'PAID', paid_at: new Date().toISOString() })
                .eq('id', payingCredit.id);
            
            if (updateError) throw updateError;

            // 1.5 Record in credit_payments
            await supabase
                .from('credit_payments')
                .insert({
                    credit_id: payingCredit.id,
                    amount: payingCredit.amount,
                    payment_method: creditPaymentMethod,
                    cashier_id: currentUser?.id || 'system',
                    cashier_name: currentUser?.name || 'Sistema'
                });

            // 2. Create payment record
            const payment: Payment = {
                id: `credit-pay-${Date.now()}`,
                amount: payingCredit.amount,
                method: creditPaymentMethod,
                date: Date.now(),
                cashierId: currentUser?.id || 'unknown',
                cashierName: currentUser?.name || 'Cajero',
                notes: `Pago de crédito - Cliente: ${payingCredit.client_name}`
            };

            if (payingCredit.order_id) {
                // If linked to an order, add payment to order
                await addPayments(payingCredit.order_id, [payment]);
            } else {
                // If it was a product sale or generic credit, we need to record it in accounting_transactions
                await accountingService.addTransaction({
                    amount: payingCredit.amount,
                    description: `Pago de crédito - Cliente: ${payingCredit.client_name}`,
                    transaction_date: new Date().toISOString().split('T')[0],
                    created_by: currentUser?.id || 'system',
                    status: TransactionStatus.COMPLETED,
                    source: 'STORE',
                    branch: currentUser?.branch || 'T4',
                    method: creditPaymentMethod
                });
            }

            showNotification('success', 'Crédito marcado como pagado');
            setPayingCredit(null);
            loadClientCredits();
        } catch (error: any) {
            showNotification('error', 'Error al pagar crédito: ' + error.message);
        } finally {
            setIsProcessingCredit(false);
        }
    };

  // Helper para extraer el ID usando el campo correcto que viene de la BD ('id' o 'payment_id')
  const getPaymentId = (p: FlatPayment) => p.payment_id || (p as any).id || `${p.order_id}-${p.date}-${p.amount}`;

  // Permissions
  const canAdminister = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.SUB_ADMIN || currentUser?.role === UserRole.MONITOR || currentUser?.role === UserRole.CASHIER || currentUser?.permissions?.canViewAccounting;
  const isSupervisor = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.SUB_ADMIN || currentUser?.role === UserRole.MONITOR;

  useEffect(() => {
      if (currentUser && selectedUsers.length === 0) {
          setSelectedUsers([currentUser.id]);
      }
  }, [currentUser]);

  // --- 1. FETCH FROM SERVER ---
  const loadPaymentsFromServer = async () => {
      if (!supabase) return;
      setIsSyncing(true);
      
      const startOfBusinessDay = new Date();
      startOfBusinessDay.setHours(0, 0, 0, 0);
      
      const endOfBusinessDay = new Date();
      endOfBusinessDay.setHours(23, 59, 59, 999);
      
      const start = startOfBusinessDay.getTime();
      const end = endOfBusinessDay.getTime();

      // 1. Fetch RPC data (Standard Order Payments, Store Sales, Expenses, Floating)
      const isSupervisor = currentUser?.role === 'Admin' || currentUser?.role === 'Monitor';
      const selectedCashierFilter = isSupervisor ? null : currentUser?.id || null;
      const selectedBranchFilter = closingBranch || null;
      
      const currentShift = await fetchGlobalPayments(start, end, null, selectedBranchFilter, true);
      const legacy = await fetchGlobalPayments(
          null,
          start - 1,
          selectedCashierFilter,
          selectedBranchFilter,
          true
      );

      // 2. SAFETY NET: Fetch IDs of closed payments directly from table
      // Check the last 30 days to avoid fetching the entire history, but catch recently missed ones
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const thirtyDaysISO = new Date(thirtyDaysAgo).toISOString();
      const [
        { data: closedPayments },
        { data: closedExpenses },
        { data: closedFloating },
        { data: closedCashMovements }
      ] = await Promise.all([
        supabase.from('order_payments').select('id').not('closing_id', 'is', null).gte('created_at', thirtyDaysAgo),
        supabase.from('accounting_transactions').select('id').not('closing_id', 'is', null).gte('created_at', thirtyDaysISO),
        supabase.from('floating_expenses').select('id').not('closing_id', 'is', null).gte('created_at', thirtyDaysISO),
        supabase.from('cash_movements').select('id').not('closing_id', 'is', null).gte('created_at', thirtyDaysISO)
      ]);

      const closedSet = new Set([
        ...(closedPayments?.map((x: any) => x.id) || []),
        ...(closedExpenses?.map((x: any) => x.id) || []),
        ...(closedFloating?.map((x: any) => x.id) || []),
        ...(closedCashMovements?.map((x: any) => x.id) || [])
      ]);
      
      // 3. Merge knowledge: If ID is in closedSet, mark it as closed locally
      const processItems = (items: FlatPayment[]) => items.map(p => {
          const pId = getPaymentId(p);
          if (closedSet.has(pId)) {
              return { ...p, closing_id: 'confirmed-closed' };
          }
          return p;
      });

      setRawGlobalPayments(processItems(currentShift));
      setLegacyPayments(processItems(legacy));
      
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

  const loadHistoricalTransactions = async () => {
      if (!transactionsStartDate || !transactionsEndDate) return;
      setIsFetchingTransactions(true);
      try {
          const [sYear, sMonth, sDay] = transactionsStartDate.split('-').map(Number);
          const startOfDay = new Date(sYear, sMonth - 1, sDay, 0, 0, 0, 0);
          
          const [eYear, eMonth, eDay] = transactionsEndDate.split('-').map(Number);
          const endOfDay = new Date(eYear, eMonth - 1, eDay, 23, 59, 59, 999);
          
          const transactions = await fetchGlobalPayments(
              startOfDay.getTime(),
              endOfDay.getTime(),
              null,
              transactionsBranch === 'ALL' ? null : transactionsBranch,
              false,
              null
          );
          setHistoricalTransactions(transactions);
      } catch (error) {
          console.warn("Error loading historical transactions:", error);
      } finally {
          setIsFetchingTransactions(false);
      }
  };

  useEffect(() => {
      if (activeTab === 'TRANSACTIONS') {
          loadHistoricalTransactions();
      }
  }, [activeTab, transactionsStartDate, transactionsEndDate, transactionsBranch]);

  const loadHistory = async () => {
      setLoadingHistory(true);
      try {
          const data = await getCashClosings(100);
          setHistoryClosings(data);
      } catch (error) {
          console.warn("Error loading history:", error);
      } finally {
          setLoadingHistory(false);
      }
  };

  useEffect(() => {
      if (activeTab === 'HISTORY' && !historySearchTerm) {
          loadHistory();
      }
  }, [activeTab]);

  const cashierUsers = useMemo(() => {
      const usersWithPendingPayments = new Set(
          rawGlobalPayments
              .filter(p => !(p as any).closing_id)
              .map(p => (p as any).cashier_id)
      );

      const knownUsers = users.filter(u => u.permissions?.canDeliverOrder || usersWithPendingPayments.has(u.id));
      
      // Add unknown users who have pending payments
      Array.from(usersWithPendingPayments).forEach(id => {
          if (!knownUsers.some(u => u.id === id)) {
              // Find their name from rawGlobalPayments
              const payment = rawGlobalPayments.find(p => (p as any).cashier_id === id);
              knownUsers.push({
                  id,
                  name: ((payment as any)?.cashier_name || 'Desconocido') + (id === 'system' ? ' (Sistema)' : ''),
                  permissions: { canDeliverOrder: true }
              } as any);
          }
      });

      return knownUsers;
  }, [users, rawGlobalPayments]);

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

  // LISTA COMPLETA PARA "TURNO ACTUAL" (Incluye Abiertos y Cerrados)
  const allDailyPayments = useMemo(() => {
      const isAllSelected = selectedUsers.length > 0 && selectedUsers.length === cashierUsers.length;
      return rawGlobalPayments
          .filter(p => (isAllSelected || selectedUsers.includes((p as any).cashier_id)) && !(p as any).closing_id)
          .sort((a, b) => {
              const timeA = (a as any).created_at || a.date || 0;
              const timeB = (b as any).created_at || b.date || 0;
              return timeB - timeA;
          });
  }, [rawGlobalPayments, selectedUsers, cashierUsers.length]);

  // LISTA FILTRADA PARA "CIERRE" (Solo Abiertos)
  const reconcilablePayments = useMemo(() => {
      return allDailyPayments.filter(p => !(p as any).closing_id);
  }, [allDailyPayments]);

  // Backward compatibility alias (to be removed after refactor)
  const currentShiftPayments = reconcilablePayments;

  const totalsByBranch = useMemo(() => {
      const groups: Record<string, { cash: number, transfer: number, card: number, credit: number, cambiazo: number, refunds: number, expenses: number, total: number, count: number, partsCost: number }> = {};
      const processedOrders = new Set<string>();
      
      allDailyPayments.forEach(p => {
          const branch = p.order_branch || 'T4';
          if (!groups[branch]) groups[branch] = { cash: 0, transfer: 0, card: 0, credit: 0, cambiazo: 0, refunds: 0, expenses: 0, total: 0, count: 0, partsCost: 0 };
          
          const amt = p.amount;
          const isExpense = ['EXPENSE', 'GASTO_LOCAL', 'GASTO_FLOTANTE', 'MANUAL_TX'].includes(p.order_id) || p.order_model === 'Gasto Orden' || p.order_model === 'Gasto Local' || p.order_model === 'Transacción Manual' || (p.amount < 0 && (p.order_model === 'Gasto Flotante' || p.order_model?.toLowerCase().includes('gasto')));
          const isRefund = !isExpense && ((amt < 0) || p.is_refund);
          
          groups[branch].total += amt;
          groups[branch].count += 1;
          
          if (p.method === 'CASH') groups[branch].cash += amt;
          else if (p.method === 'TRANSFER') groups[branch].transfer += amt;
          else if (p.method === 'CARD') groups[branch].card += amt;
          else if (p.method === 'CREDIT') groups[branch].credit += amt;
          else if (p.method === 'CAMBIAZO') groups[branch].cambiazo += amt;
          
          if (isRefund) groups[branch].refunds += Math.abs(amt);
          if (isExpense) groups[branch].expenses += Math.abs(amt);

          // Add parts cost only once per order in this shift
          if (p.order_id && !isExpense && !isRefund && !processedOrders.has(p.order_id)) {
              groups[branch].partsCost += (p as any).order_parts_cost || 0;
              processedOrders.add(p.order_id);
          }
      });
      
      return groups;
  }, [allDailyPayments, orders]);

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
  }, [currentShiftPayments, closingBranch, selectedPaymentIds, orders]);

  const handleCloseShift = async () => {
      // 1. VALIDACIONES INICIALES
      if (!currentUser) { showNotification('error', 'Sesión inválida'); return; }
      if (selectedUsers.length === 0) { showNotification('error', 'Selecciona al menos un cajero'); return; }
      if (!closingBranch) { showNotification('error', 'Selecciona una sucursal'); return; }
      
      if (actualCash === '' || isNaN(parseFloat(actualCash))) { 
          showNotification('error', "Por favor ingrese el monto real en caja (si es cero, coloque 0)."); 
          return; 
      }

      const actual = parseFloat(actualCash);
      const expectedCash = reconcileTotals.cash; 
      const diff = actual - expectedCash;

      setConfirmationDialog({
          title: `¿CERRAR CAJA DE ${closingBranch}?`,
          message: `Sistema (Efectivo): $${expectedCash.toLocaleString()}\nReal (Conteo): $${actual.toLocaleString()}\nDiferencia: $${diff.toLocaleString()}`,
          onConfirm: async () => {
              setConfirmationDialog(null);
              setIsClosing(true);
              let errorSource = 'DESCONOCIDO';

              try {
                  // 2. PREPARACIÓN DE DATOS
                  errorSource = 'PREPARACIÓN_DATOS';
                  let rawIds: string[] = [];
                  
                  if (selectedPaymentIds.length > 0) {
                      rawIds = selectedPaymentIds;
                  } else {
                      rawIds = currentShiftPayments
                          .filter(p => ((p as any).branch || p.order_branch || 'T4') === closingBranch)
                          .map(p => getPaymentId(p)); // USA LA FUNCION CORRECTA AQUI
                  }

                  // Filtro seguro para asegurar que pasamos IDs válidos (UUIDs)
                  const paymentIds = rawIds.filter(id => id && typeof id === 'string' && id.length > 20);
                  
                  if (paymentIds.length === 0) {
                      throw new Error("No se encontraron pagos con IDs válidos para consolidar. Verifique los datos.");
                  }
                      
                  const combinedIds = selectedUsers.join(',');
                  
                  // 3. EJECUCIÓN DEL CIERRE (BACKEND)
                  errorSource = 'EJECUCIÓN_RPC';
                  await performCashClosing(combinedIds, expectedCash, actual, currentUser.id, paymentIds);
                  
                  // Record audit log
                  if (currentUser) {
                    await auditService.recordLog(
                      { id: currentUser.id, name: currentUser.name },
                      ActionType.CASH_CLOSING_PERFORMED,
                      `Cierre de caja ejecutado - Esperado: $${expectedCash} - Real: $${actual} (Dif: $${actual - expectedCash})`,
                      undefined,
                      'CASH_CLOSING',
                      combinedIds
                    );

                    // ALERTA INVASIVA PARA DARWIN: Si un cajero se autoconsolida
                    if (currentUser.role === UserRole.CASHIER) {
                        try {
                            await supabase.from('cashier_alerts').insert({
                                cashier_id: currentUser.id,
                                cashier_name: currentUser.name,
                                amount: actual,
                                created_at: Date.now()
                            });
                        } catch (e) {
                            console.warn("Error creating cashier alert", e);
                        }
                    }
                  }

                  // 4. ANIMACIÓN DE SALIDA (UI)
                  errorSource = 'ANIMACIÓN_UI';
                  setAnimatingIds(paymentIds); // Activar animación de salida para estos IDs
                  
                  // Esperar a que termine la animación visual (ej. 500ms)
                  await new Promise(resolve => setTimeout(resolve, 500));

                  // ACTUALIZACIÓN OPTIMISTA: Ahora sí, removerlos de la lista
                  setRawGlobalPayments(prev => prev.map(p => {
                      const pId = getPaymentId(p);
                      if (paymentIds.includes(pId)) {
                          return { ...p, closing_id: 'temp-closed' } as any; 
                      }
                      return p;
                  }));

                  setActualCash('');
                  setSelectedPaymentIds([]); 
                  setAnimatingIds([]); // Limpiar animación
                  
                  // 5. REFRESCO DE DATOS
                  errorSource = 'REFRESCO_DATOS';
                  await loadPaymentsFromServer();
                  
                  // 6. ÉXITO FINAL Y TICKET
                  setIsSuccessAnim(true);
                  setTimeout(() => {
                      setIsSuccessAnim(false);
                  }, 3000);

                  // Post-close validation
                  const sBusinessDay = new Date();
                  sBusinessDay.setHours(0, 0, 0, 0);
                  const eBusinessDay = new Date();
                  eBusinessDay.setHours(23, 59, 59, 999);
                  const stillOpen = await fetchGlobalPayments(sBusinessDay.getTime(), eBusinessDay.getTime(), null, closingBranch, true);
                  const stillSelectedOpen = stillOpen.filter(p => paymentIds.includes(p.payment_id || (p as any).id));
                  if (stillSelectedOpen.length > 0) {
                      showNotification('error', `Advertencia: ${stillSelectedOpen.length} movimientos siguen abiertos.`);
                  } else {
                      showNotification('success', 'Cierre de caja completado con éxito');
                  }
                  
                  // IMPRIMIR TICKET AUTOMÁTICAMENTE
                  handlePrintShift(closingBranch);
                  
              } catch (error: any) {
                  const errMsg = error.message || '';
                  console.warn(`Error en fase ${errorSource}:`, error);

                  if (errMsg.includes('cash_closings') || error.code === '42P01' || errMsg.includes('uuid')) {
                     setShowDbFixModal(true); 
                  } else {
                     // Mostrar error detallado con la fuente
                     showNotification('error', `Error (${errorSource}): ${errMsg}`);
                  }
              } finally {
                  setIsClosing(false);
              }
          },
          confirmLabel: 'CERRAR CAJA',
          type: 'warning'
      });
  };

  const handleDeleteClosing = async (closingId: string) => {
      setConfirmationDialog({
          title: '¿ELIMINAR ESTE CIERRE?',
          message: 'Esto reabrirá todos los pagos asociados para que puedan ser editados o cerrados nuevamente.',
          onConfirm: async () => {
              setConfirmationDialog(null);
              try {
                  await deleteCashClosing(closingId);
                  
                  // Record audit log
                  if (currentUser) {
                    await auditService.recordLog(
                      { id: currentUser.id, name: currentUser.name },
                      ActionType.CASH_CLOSING_DELETED,
                      `Cierre de caja eliminado (ID: ${closingId})`,
                      undefined,
                      'CASH_CLOSING',
                      closingId
                    );
                  }

                  showNotification('success', 'Cierre eliminado y pagos reabiertos');
                  loadHistory(); // Recargar lista
                  loadPaymentsFromServer(); // Recargar pagos abiertos
              } catch (error: any) {
                  showNotification('error', 'Error al eliminar cierre: ' + error.message);
              }
          },
          confirmLabel: 'ELIMINAR',
          type: 'danger'
      });
  };

  const handleUpdateClosing = async (closing: CashClosing) => {
      setPromptModal({
          title: 'Actualizar Cierre de Caja',
          message: 'Ingrese el nuevo monto REAL en caja:',
          fields: [
              { key: 'amount', label: 'Monto Real', type: 'number', defaultValue: closing.actualTotal.toString() }
          ],
          onConfirm: async (values) => {
              const newActualStr = values.amount;
              const newActual = parseFloat(newActualStr);
              if (isNaN(newActual)) {
                  showNotification('error', "Monto inválido");
                  return;
              }

              try {
                  await updateCashClosing(closing.id, newActual, closing.notes || '');
                  
                  // Record audit log
                  if (currentUser) {
                    await auditService.recordLog(
                      { id: currentUser.id, name: currentUser.name },
                      ActionType.CASH_CLOSING_UPDATED,
                      `Cierre de caja actualizado (ID: ${closing.id}) - Nuevo Real: $${newActual}`,
                      undefined,
                      'CASH_CLOSING',
                      closing.id
                    );
                  }

                  showNotification('success', 'Cierre actualizado');
                  loadHistory();
                  setPromptModal(null);
              } catch (error: any) {
                  showNotification('error', 'Error al actualizar: ' + error.message);
              }
          }
      });
  };

  const handleForceClear = async () => {
      if (!currentUser) return;
      if (selectedUsers.length === 0) {
          showNotification('error', "Seleccione al menos un cajero para limpiar.");
          return;
      }
      
      const names = getSelectedUserNames();
      
      setConfirmationDialog({
          title: '¿LIMPIEZA FORZADA DE PENDIENTES?',
          message: `Esto marcará TODOS los pagos pendientes de ${names} como 'Cerrados' en un registro de limpieza manual.\n\nÚselo solo si la consolidación normal falla o desea limpiar la vista.`,
          onConfirm: async () => {
              setConfirmationDialog(null);
              try {
                  setIsSyncing(true);
                  await forceClearPendingPayments(selectedUsers, currentUser.id);
                  
                  // Record audit log
                  if (currentUser) {
                    await auditService.recordLog(
                      { id: currentUser.id, name: currentUser.name },
                      ActionType.CASH_CLEAR_FORCED,
                      `Limpieza forzada de pagos para: ${names}`,
                      undefined,
                      'CASH_CLOSING',
                      selectedUsers.join(',')
                    );
                  }

                  showNotification('success', 'Pagos limpiados correctamente');
                  await loadPaymentsFromServer();
              } catch (error: any) {
                  showNotification('error', 'Error al limpiar: ' + error.message);
              } finally {
                  setIsSyncing(false);
              }
          },
          confirmLabel: 'LIMPIAR TODO',
          type: 'danger'
      });
  };

  const handleViewClosingDetails = async (closing: CashClosing) => {
      setSelectedClosing(closing);
      setIsLoadingDetails(true);
      try {
          // Fetch all transactions (payments, expenses, collections) for this closing
          const details = await fetchGlobalPayments(null, null, null, null, false, closing.id);
          setClosingDetails(details);
      } catch (error: any) {
          showNotification('error', 'Error al cargar detalles: ' + error.message);
      } finally {
          setIsLoadingDetails(false);
      }
  };

  const handleEditClosedPayment = async (paymentId: string, currentAmount: number) => {
      setPromptModal({
          title: 'Editar Pago Cerrado',
          message: 'Ingrese el nuevo monto para este pago:',
          fields: [
              { key: 'amount', label: 'Nuevo Monto', type: 'number', defaultValue: currentAmount.toString() }
          ],
          onConfirm: async (values) => {
              const newAmountStr = values.amount;
              const newAmount = parseFloat(newAmountStr);
              if (isNaN(newAmount)) {
                  showNotification('error', "Monto inválido");
                  return;
              }

              try {
                  await editClosedPayment(paymentId, newAmount, currentUser?.id || 'admin');
                  
                  // Record audit log
                  if (currentUser) {
                    await auditService.recordLog(
                      { id: currentUser.id, name: currentUser.name },
                      ActionType.CASH_PAYMENT_EDITED,
                      `Pago cerrado editado: ID ${paymentId} - Nuevo monto: $${newAmount}`,
                      undefined,
                      'CASH_CLOSING',
                      paymentId
                    );
                  }

                  showNotification('success', 'Pago editado y cierre recalculado');
                  // Reload details and history
                  if (selectedClosing) {
                      const details = await getClosingDetails(selectedClosing.id);
                      setClosingDetails(details);
                      loadHistory();
                  }
                  setPromptModal(null);
              } catch (error: any) {
                  showNotification('error', 'Error al editar pago: ' + error.message);
              }
          }
      });
  };

  const handlePrintShift = (branch: string) => {
      const cashierName = getSelectedUserNames() + ` (${branch})`;
      const branchPayments = allDailyPayments.filter(p => (p.order_branch || 'T4') === branch);
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
          const totalCost = o.totalAmount ?? (o.finalPrice || o.estimatedCost || 0);
          const hasDebt = totalPaid < (totalCost - 0.1);
          
          if (!hasDebt) return false;

          if (debtSearch) {
              const term = debtSearch.toLowerCase();
              return (
                  o.customer.name.toLowerCase().includes(term) ||
                  o.deviceModel.toLowerCase().includes(term) ||
                  (o.readable_id?.toString() || o.id.toLowerCase()).includes(term) ||
                  (o.imei && o.imei.toLowerCase().includes(term))
              );
          }
          return true;
      });
  }, [orders, debtSearch]);

  const handleCustomerDebtPayment = async () => {
      if (!selectedDebtOrder) return;
      const amount = parseFloat(paymentAmount);
      if (isNaN(amount) || amount <= 0) { showNotification('error', "Monto inválido"); return; }
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
          try {
              await addPayments(selectedDebtOrder.id, [payment]);
              showNotification('success', 'Abono registrado');
              setPaymentAmount('');
              setSelectedDebtOrder(null);
          } catch (error: any) {
              console.warn("Error al registrar abono:", error);
              showNotification('error', error.message || 'Error desconocido');
              if (error.message && (error.message.includes('row-level security') || error.message.includes('RLS'))) {
                  setShowDbFixModal(true);
              }
          }
      } finally { setIsProcessingPayment(false); }
  };

  if (currentUser?.role === 'Monitor') {
    return (
      <div className="p-6 max-w-7xl mx-auto pb-20 relative">
        <ExpenseApprovals />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto pb-20 relative">
        
        {isSuccessAnim && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm animate-in fade-in duration-300">
                <div className="bg-white p-10 rounded-3xl shadow-2xl flex flex-col items-center animate-in zoom-in duration-500 border border-green-100">
                    <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6">
                        <CheckCircle2 className="w-12 h-12 text-green-600" />
                    </div>
                    <h2 className="text-3xl font-black text-slate-800 mb-2">¡Cierre Exitoso!</h2>
                    <p className="text-slate-500 font-medium text-center max-w-xs">Los cobros han sido consolidados correctamente en la base de datos.</p>
                </div>
            </div>
        )}

        {showDbFixModal && <DbFixModal onClose={() => setShowDbFixModal(false)} />}

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-xl shadow-slate-900/20">
                    <Wallet className="w-7 h-7" />
                </div>
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Gestión de Caja</h1>
                        {canAdminister && (
                            <button onClick={() => setShowDbFixModal(true)} className="text-[10px] bg-orange-100 text-orange-700 px-2.5 py-1 rounded-lg font-bold hover:bg-orange-200 transition-colors flex items-center gap-1 uppercase tracking-wider">
                                <AlertTriangle className="w-3 h-3" /> Fix DB
                            </button>
                        )}
                    </div>
                    <p className="text-slate-500 font-medium mt-0.5">Control de efectivo, cuadres y deudas.</p>
                </div>
            </div>
            <div className="bg-slate-100/80 backdrop-blur-md p-1.5 rounded-2xl flex gap-1 overflow-x-auto max-w-full border border-slate-200/50 shadow-inner">
                <button onClick={() => setActiveTab('DAILY')} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'DAILY' ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>Turno Actual</button>
                <button onClick={() => setActiveTab('HISTORY')} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'HISTORY' ? 'bg-white text-purple-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>Cierres</button>
                <button onClick={() => setActiveTab('TRANSACTIONS')} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'TRANSACTIONS' ? 'bg-white text-emerald-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>Movimientos</button>
                <button onClick={() => setActiveTab('CREDITS')} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'CREDITS' ? 'bg-white text-amber-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>Créditos (Fiao)</button>
                <button onClick={() => setActiveTab('DEBTS')} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'DEBTS' ? 'bg-white text-orange-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>Cuentas x Cobrar</button>
                {isSupervisor && <button onClick={() => setActiveTab('APPROVALS')} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'APPROVALS' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>Aprobaciones</button>}
            </div>
        </div>

        {/* --- GLOBAL USER MULTI-SELECTOR --- */}
        {activeTab !== 'HISTORY' && activeTab !== 'APPROVALS' && activeTab !== 'TRANSACTIONS' && (
        <div className="mb-8 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                    <User className="w-5 h-5"/>
                </div>
                <div>
                    <p className="text-sm font-bold text-slate-800">Cajeros Activos</p>
                    <p className="text-xs font-medium text-slate-500">Filtra los movimientos por usuario</p>
                </div>
            </div>
            
            <div className="flex flex-wrap gap-2 items-center w-full md:w-auto">
                {canAdminister && (
                    <button onClick={selectAllCashiers} className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${selectedUsers.length === cashierUsers.length ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                        <CheckSquare className="w-4 h-4" /> TODOS
                    </button>
                )}
                {cashierUsers.map(u => (
                    <button key={u.id} onClick={() => canAdminister ? toggleUser(u.id) : null} className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${selectedUsers.includes(u.id) ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                        <User className="w-3.5 h-3.5"/> {u.name}
                    </button>
                ))}
                
                <div className="w-px h-8 bg-slate-200 mx-2 hidden md:block"></div>
                
                <button onClick={loadPaymentsFromServer} disabled={isSyncing} className="text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-sm">
                    <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-blue-500' : 'text-slate-400'}`} /> 
                    {isSyncing ? 'Actualizando...' : 'Refrescar'}
                </button>
                
                {canAdminister && (
                    <button 
                        onClick={handleForceClear} 
                        disabled={isSyncing || selectedUsers.length === 0} 
                        className="text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 px-4 py-2.5 rounded-xl flex items-center gap-2 transition-colors"
                        title="Marca todos los pagos abiertos como cerrados manualmente"
                    >
                        <Trash2 className="w-4 h-4" /> 
                        Limpiar
                    </button>
                )}
            </div>
        </div>
        )}

        {/* --- VIEW: DAILY SHIFT (COMBINED WITH RECONCILE) --- */}
        {activeTab === 'DAILY' && (() => {
            const calculateOldestPending = () => {
                if (!currentShiftPayments || currentShiftPayments.length === 0) return null;
                const oldest = Math.min(...currentShiftPayments.map((p: any) => p.created_at || p.date));
                const diffDays = Math.floor((Date.now() - oldest) / (1000 * 60 * 60 * 24));
                if (diffDays <= 0) return 'Hoy';
                if (diffDays === 1) return 'Ayer';
                return `Hace ${diffDays} días`;
            };
            const oldestPendingText = calculateOldestPending();

            return (
            <div className="space-y-6">
                {oldestPendingText && oldestPendingText !== 'Hoy' && (
                    <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded-2xl flex items-start gap-4">
                        <div className="bg-orange-100 p-2 rounded-xl text-orange-600 shrink-0">
                            <AlertCircle className="w-5 h-5"/>
                        </div>
                        <div>
                            <h4 className="text-sm font-bold text-slate-800">Has estado sin cerrar caja desde {oldestPendingText.toLowerCase()}</h4>
                            <p className="text-xs text-slate-600 mt-1">El turno contiene transacciones multidiarias. Recuerda realizar tu cierre diario para que "Turno Actual" y el monto "Recaudado Hoy" coincidan con la estadística.</p>
                        </div>
                    </div>
                )}

                {canAdminister && legacyPayments.length > 0 && (
                    <div className="bg-slate-800 text-white p-5 rounded-3xl shadow-sm border border-slate-700 flex flex-col md:flex-row gap-4 items-center justify-between">
                        <div>
                            <h3 className="text-lg font-black flex items-center gap-2">
                                <History className="w-5 h-5 text-amber-500" />
                                Pendientes Históricos ({legacyPayments.length})
                            </h3>
                            <p className="text-sm text-slate-300 mt-1 max-w-2xl">
                                Movimientos antiguos sin cierre encontrados en la base de datos.
                                Consolidarlos no afectará el turno actual y limpiará el sistema viejo.
                            </p>
                        </div>
                        <button 
                            onClick={handleConsolidateLegacy} 
                            disabled={isConsolidatingLegacy}
                            className="text-sm font-bold bg-amber-500 text-slate-900 hover:bg-amber-400 px-6 py-3 rounded-xl transition-all shadow-sm shrink-0 disabled:opacity-50"
                        >
                            {isConsolidatingLegacy ? 'Consolidando...' : 'Consolidar limpieza histórica'}
                        </button>
                    </div>
                )}

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 animate-in fade-in">
                
                {/* LIST OF MOVEMENTS FOR SELECTION */}
                <div className="xl:col-span-8 flex flex-col h-[calc(100vh-250px)] min-h-[600px]">
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                    <MousePointerClick className="w-5 h-5 text-blue-500"/> 
                                    Movimientos del Turno
                                </h3>
                                <p className="text-xs font-medium text-slate-500 mt-1">
                                    {currentShiftPayments.filter(p => (p.order_branch || 'T4') === closingBranch).length} transacciones en {closingBranch}
                                </p>
                            </div>
                            {canAdminister && (
                                <button onClick={toggleSelectAllForBranch} className="text-xs bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 px-4 py-2 rounded-xl shadow-sm transition-all flex items-center gap-2">
                                    <CheckSquare className="w-4 h-4 text-blue-500" />
                                    {selectedPaymentIds.length === 0 ? 'Seleccionar Todo' : 'Deseleccionar'}
                                </button>
                            )}
                        </div>
                        
                        <div className="overflow-y-auto flex-1 p-4 space-y-3 bg-slate-50/30">
                            {currentShiftPayments.filter(p => (p.order_branch || 'T4') === closingBranch).length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                    <Search className="w-12 h-12 mb-2 opacity-20" />
                                    <p>No hay movimientos para {closingBranch}.</p>
                                </div>
                            ) : (
                                currentShiftPayments
                                    .filter(p => (p.order_branch || 'T4') === closingBranch)
                                    .map((p, idx) => {
                                        const pId = getPaymentId(p);
                                        const isChecked = selectedPaymentIds.includes(pId);
                                        const isAnimating = animatingIds.includes(pId);
                                        const methodTranslated = p.method === 'CASH' ? 'Efectivo' : p.method === 'TRANSFER' ? 'Transferencia' : p.method === 'CARD' ? 'Tarjeta' : p.method;
                                        const isRefund = p.amount < 0 || p.is_refund;
                                        
                                        const contextOrder = orders.find(o => o.id === p.order_id);
                                        const displayId = contextOrder?.readable_id 
                                            ? contextOrder.readable_id 
                                            : (['PRODUCT_SALE', 'VENTA_PRODUCTO'].includes(p.order_id) ? `V-${p.order_readable_id || p.id?.slice(-4)}` 
                                            : (['EXPENSE', 'GASTO_LOCAL', 'GASTO_FLOTANTE', 'MANUAL_TX'].includes(p.order_id) ? `G-${p.order_readable_id || p.id?.slice(-4)}` 
                                            : p.order_readable_id || p.order_id?.slice(-4)));
                                        
                                        const dateObj = new Date(Number(p.date));
                                        let dateStr = '';
                                        if (isNaN(dateObj.getTime())) {
                                            dateStr = new Date(p.date).toLocaleString();
                                        } else {
                                            const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                            const dateOnlyStr = dateObj.toLocaleDateString();
                                            dateStr = `${timeStr} - ${dateOnlyStr}`;
                                        }

                                        return (
                                        <div 
                                            key={pId} 
                                            onClick={() => canAdminister ? togglePaymentSelection(pId) : setSelectedPaymentDetails(p)}
                                            className={`group p-4 rounded-2xl border flex gap-4 items-center cursor-pointer transition-all duration-300 ${isAnimating ? 'opacity-0 translate-x-full' : ''} ${isChecked ? 'bg-blue-50/80 border-blue-300 shadow-sm' : (isRefund ? 'bg-red-50/80 border-red-200' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md')}`}
                                        >
                                            {canAdminister && (
                                                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors ${isChecked ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 bg-slate-50 group-hover:border-blue-400'}`}>
                                                    {isChecked && <CheckSquare className="w-4 h-4" />}
                                                </div>
                                            )}
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isRefund ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                                                {p.method === 'CASH' ? <Banknote className="w-5 h-5" /> : p.method === 'CARD' ? <CreditCard className="w-5 h-5" /> : <RefreshCw className="w-5 h-5" />}
                                            </div>
                                            <div className="flex-1 flex justify-between items-center">
                                                <div>
                                                    <p className="text-sm font-bold text-slate-800 mb-0.5">Orden #{displayId}</p>
                                                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                                                        <span className="flex items-center gap-1"><User className="w-3 h-3"/> {p.cashier_name}</span>
                                                        <span>•</span>
                                                        <span>{dateStr}</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <div className="text-right">
                                                        <p className={`text-lg font-black tracking-tight ${isRefund ? 'text-red-600' : 'text-slate-900'}`}>
                                                            {isRefund ? '-' : ''}${Math.abs(p.amount).toLocaleString()}
                                                        </p>
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{methodTranslated}</p>
                                                    </div>
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedPaymentDetails(p);
                                                        }}
                                                        className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-100 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                                                        title="Ver detalles"
                                                    >
                                                        <Info className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )})
                            )}
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN */}
                <div className="xl:col-span-4 flex flex-col gap-6 h-[calc(100vh-250px)] min-h-[600px]">
                    {/* BRANCH CARDS */}
                    <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                        {Object.keys(totalsByBranch).length === 0 ? (
                            <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl text-center opacity-50 border border-slate-800">
                                <p className="text-sm font-bold">Sin movimientos activos</p>
                            </div>
                        ) : (
                            Object.entries(totalsByBranch).map(([branch, t]) => {
                                const totals = t as any;
                                return (
                                <div key={branch} className="bg-slate-900 text-white p-6 rounded-3xl shadow-2xl relative overflow-hidden group border border-slate-800 shrink-0">
                                    {/* Decorative background elements */}
                                    <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/20 rounded-full blur-3xl"></div>
                                    <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl"></div>
                                    
                                    <div className="relative z-10">
                                        <div className="flex justify-between items-start mb-6">
                                            <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/5">
                                                <MapPin className="w-4 h-4 text-blue-400" /> 
                                                <span className="text-xs font-bold tracking-wider uppercase">{branch}</span>
                                            </div>
                                            <button onClick={() => handlePrintShift(branch)} className="bg-white/10 hover:bg-white/20 text-white p-2.5 rounded-xl transition-all backdrop-blur-md border border-white/5" title="Imprimir Corte">
                                                <Printer className="w-4 h-4"/>
                                            </button>
                                        </div>
                                        
                                        <div className="flex gap-4 mb-8">
                                            <div className="flex-1">
                                                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Total Ingresos</p>
                                                <h2 className="text-4xl font-black tracking-tighter flex items-baseline gap-1">
                                                    <span className="text-xl text-slate-500 font-medium">$</span>
                                                    {totals.total.toLocaleString()}
                                                </h2>
                                            </div>
                                            <div className="flex-1 border-l border-white/10 pl-4">
                                                <p className="text-green-400 text-xs font-bold uppercase tracking-widest mb-1">Ganancia Real</p>
                                                <h2 className="text-4xl font-black tracking-tighter flex items-baseline gap-1 text-green-400">
                                                    <span className="text-xl text-green-600 font-medium">$</span>
                                                    {(totals.total - (totals.partsCost || 0)).toLocaleString()}
                                                </h2>
                                                <p className="text-[10px] text-slate-500 font-bold mt-1">Costos: ${totals.partsCost?.toLocaleString() || '0'}</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="bg-white/5 p-3 rounded-2xl border border-white/5 backdrop-blur-sm">
                                                <p className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1.5 mb-1"><Banknote className="w-3 h-3 text-green-400"/> Efectivo</p>
                                                <p className="text-xl font-bold text-white">${totals.cash.toLocaleString()}</p>
                                            </div>
                                            <div className="bg-white/5 p-3 rounded-2xl border border-white/5 backdrop-blur-sm">
                                                <p className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1.5 mb-1"><CreditCard className="w-3 h-3 text-purple-400"/> Tarjeta</p>
                                                <p className="text-xl font-bold text-white">${totals.card.toLocaleString()}</p>
                                            </div>
                                            <div className="bg-white/5 p-3 rounded-2xl border border-white/5 backdrop-blur-sm">
                                                <p className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1.5 mb-1"><RefreshCw className="w-3 h-3 text-blue-400"/> Transf.</p>
                                                <p className="text-xl font-bold text-white">${totals.transfer.toLocaleString()}</p>
                                            </div>
                                            <div className="bg-white/5 p-3 rounded-2xl border border-white/5 backdrop-blur-sm">
                                                <p className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1.5 mb-1"><DollarSign className="w-3 h-3 text-orange-400"/> Crédito</p>
                                                <p className="text-xl font-bold text-white">${totals.credit.toLocaleString()}</p>
                                            </div>
                                            <div className="bg-white/5 p-3 rounded-2xl border border-white/5 backdrop-blur-sm">
                                                <p className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1.5 mb-1"><RefreshCw className="w-3 h-3 text-emerald-400"/> Cambiazo</p>
                                                <p className="text-xl font-bold text-white">${totals.cambiazo.toLocaleString()}</p>
                                            </div>
                                        </div>
                                        
                                        {(totals.refunds > 0 || totals.expenses > 0) && (
                                            <div className="mt-3 grid grid-cols-2 gap-3">
                                                {totals.refunds > 0 && (
                                                    <div className="bg-red-500/10 p-3 rounded-2xl border border-red-500/20 backdrop-blur-sm">
                                                        <p className="text-red-400 text-[10px] uppercase font-bold flex items-center gap-1.5 mb-1"><RefreshCw className="w-3 h-3"/> Devoluciones</p>
                                                        <p className="text-lg font-bold text-red-300">-${totals.refunds.toLocaleString()}</p>
                                                    </div>
                                                )}
                                                {totals.expenses > 0 && (
                                                    <div className="bg-orange-500/10 p-3 rounded-2xl border border-orange-500/20 backdrop-blur-sm">
                                                        <p className="text-orange-400 text-[10px] uppercase font-bold flex items-center gap-1.5 mb-1"><ArrowDownRight className="w-3 h-3"/> Gastos</p>
                                                        <p className="text-lg font-bold text-orange-300">-${totals.expenses.toLocaleString()}</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )})
                        )}
                    </div>

                    {/* TOTALS CARD (CUADRE DE CAJA) */}
                    <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-200 relative overflow-hidden shrink-0">
                        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-500 to-indigo-500" />
                        
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                <ClipboardCheck className="w-5 h-5 text-blue-600"/> 
                                Cuadre de Caja
                            </h3>
                            <select 
                                value={closingBranch}
                                onChange={e => { setClosingBranch(e.target.value); setSelectedPaymentIds([]); }}
                                className="text-xs font-bold bg-slate-100 text-slate-700 py-2 px-3 rounded-xl border-none outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                            >
                                {Array.from(new Set(['T1', 'T4', ...Object.keys(totalsByBranch)])).map(branch => (
                                    <option key={branch} value={branch}>{branch}</option>
                                ))}
                            </select>
                        </div>
                        
                        {!canAdminister ? (
                            <div className="text-center p-8 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                                <Lock className="w-8 h-8 mx-auto mb-3 opacity-20" />
                                <p className="font-medium text-sm">No tienes permisos para realizar el cierre de caja.</p>
                            </div>
                        ) : selectedUsers.length === 0 ? (
                            <div className="text-center p-8 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                                <User className="w-8 h-8 mx-auto mb-3 opacity-20" />
                                <p className="font-medium text-sm">Selecciona al menos un cajero arriba.</p>
                            </div>
                        ) : !totalsByBranch[closingBranch] && currentShiftPayments.filter(p => (p.order_branch || 'T4') === closingBranch).length === 0 ? (
                            <div className="text-center p-8 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                                <Search className="w-8 h-8 mx-auto mb-3 opacity-20" />
                                <p className="font-medium text-sm">No hay movimientos para {closingBranch}.</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100">
                                    <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">Efectivo Esperado</p>
                                    <p className="text-4xl font-black text-slate-900 tracking-tighter">
                                        <span className="text-2xl text-slate-400 font-medium mr-1">$</span>
                                        {reconcileTotals.cash.toLocaleString()}
                                    </p>
                                </div>
                                
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Efectivo Real (Conteo)</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-xl">$</span>
                                        <input 
                                            type="number" 
                                            className="w-full pl-10 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-2xl font-black text-slate-900 outline-none focus:bg-white focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all" 
                                            placeholder="0.00" 
                                            value={actualCash} 
                                            onChange={e => setActualCash(e.target.value)} 
                                        />
                                    </div>
                                </div>
                                
                                <button 
                                  onClick={handleCloseShift} 
                                  disabled={isClosing} 
                                  data-track-action="PERFORM_CASH_CLOSING"
                                  data-track-type="SYSTEM"
                                  className={`w-full py-4 bg-slate-900 text-white rounded-2xl font-bold shadow-xl hover:bg-slate-800 hover:shadow-2xl hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center gap-2 ${!actualCash ? 'opacity-90' : ''}`}
                                >
                                  {isClosing ? <Loader2 className="w-5 h-5 animate-spin"/> : <Lock className="w-5 h-5"/>} 
                                  <span>CONSOLIDAR CIERRE</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            </div>
            );
        })()}

        {/* --- VIEW: TRANSACTIONS --- */}
        {activeTab === 'TRANSACTIONS' && (
            <div className="space-y-4 animate-in fade-in">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row gap-4 items-center">
                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <label className="text-sm font-bold text-slate-700">Desde:</label>
                            <input 
                                type="date" 
                                className="p-2 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-200 flex-1"
                                value={transactionsStartDate}
                                onChange={e => setTransactionsStartDate(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <label className="text-sm font-bold text-slate-700">Hasta:</label>
                            <input 
                                type="date" 
                                className="p-2 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-200 flex-1"
                                value={transactionsEndDate}
                                onChange={e => setTransactionsEndDate(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <label className="text-sm font-bold text-slate-700">Tipo:</label>
                            <select 
                                className="p-2 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-200 flex-1"
                                value={transactionsType}
                                onChange={e => setTransactionsType(e.target.value as any)}
                            >
                                <option value="ALL">Todos</option>
                                <option value="INCOME">Ingresos</option>
                                <option value="EXPENSE">Gastos</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <label className="text-sm font-bold text-slate-700">Sucursal:</label>
                            <select 
                                className="p-2 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-200 flex-1"
                                value={transactionsBranch}
                                onChange={e => setTransactionsBranch(e.target.value)}
                            >
                                <option value="ALL">Todas</option>
                                <option value="T1">T1</option>
                                <option value="T2">T2</option>
                                <option value="T3">T3</option>
                                <option value="T4">T4</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex flex-col md:flex-row gap-4 items-center">
                        <div className="relative flex-1 w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                            <input 
                                placeholder="Buscar transacción por ID, cajero..." 
                                className="w-full pl-10 p-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-200 outline-none text-sm" 
                                value={transactionsSearchTerm} 
                                onChange={e => setTransactionsSearchTerm(e.target.value)} 
                            />
                        </div>
                        <button 
                            onClick={loadHistoricalTransactions} 
                            disabled={isFetchingTransactions}
                            className="px-4 py-2 bg-emerald-50 text-emerald-600 font-bold rounded-lg hover:bg-emerald-100 transition flex items-center gap-2 text-sm w-full md:w-auto justify-center"
                        >
                            <RefreshCw className={`w-4 h-4 ${isFetchingTransactions ? 'animate-spin' : ''}`} />
                            Refrescar
                        </button>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[calc(100vh-250px)] min-h-[600px]">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                        <h3 className="font-bold text-slate-700">
                            Movimientos del {transactionsStartDate.split('-').reverse().join('/')} al {transactionsEndDate.split('-').reverse().join('/')}
                        </h3>
                        <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded-full font-bold">
                            {historicalTransactions.filter(p => {
                                const isExpense = ['EXPENSE', 'GASTO_LOCAL', 'GASTO_FLOTANTE', 'MANUAL_TX'].includes(p.order_id) || p.order_model === 'Gasto Orden' || p.order_model === 'Gasto Local' || p.order_model === 'Transacción Manual' || (p.amount < 0 && (p.order_model === 'Gasto Flotante' || p.order_model?.toLowerCase().includes('gasto')));
                                if (transactionsType === 'INCOME' && isExpense) return false;
                                if (transactionsType === 'EXPENSE' && !isExpense) return false;
                                return true;
                            }).length} Registros
                        </span>
                    </div>
                    <div className="overflow-y-auto flex-1 p-2 space-y-2">
                        {isFetchingTransactions ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                <Loader2 className="w-8 h-8 animate-spin mb-2 text-emerald-500" />
                                <p className="font-bold">Cargando transacciones...</p>
                            </div>
                        ) : historicalTransactions.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                <Search className="w-12 h-12 mb-2 opacity-20" />
                                <p className="font-bold">No hay transacciones para esta fecha.</p>
                            </div>
                        ) : (() => {
                            const filteredTransactions = historicalTransactions.filter(p => {
                                const isExpense = ['EXPENSE', 'GASTO_LOCAL', 'GASTO_FLOTANTE', 'MANUAL_TX'].includes(p.order_id) || p.order_model === 'Gasto Orden' || p.order_model === 'Gasto Local' || p.order_model === 'Transacción Manual' || (p.amount < 0 && (p.order_model === 'Gasto Flotante' || p.order_model?.toLowerCase().includes('gasto')));
                                if (transactionsType === 'INCOME' && isExpense) return false;
                                if (transactionsType === 'EXPENSE' && !isExpense) return false;

                                if (!transactionsSearchTerm) return true;
                                const term = transactionsSearchTerm.toLowerCase().trim();
                                
                                // Parse ID search (e.g., "g-5284" -> "5284")
                                const idMatch = term.match(/^[a-z][-\s]?(\d+)$/i);
                                const searchNum = idMatch ? idMatch[1] : term;

                                const idStr = getPaymentId(p).toLowerCase();
                                const cashierName = p.cashier_name?.toLowerCase() || '';
                                const orderIdStr = p.order_id?.toLowerCase() || '';
                                const readableIdStr = p.order_readable_id?.toString().toLowerCase() || '';
                                
                                return idStr.includes(term) || 
                                       cashierName.includes(term) || 
                                       orderIdStr.includes(term) || 
                                       readableIdStr.includes(searchNum);
                            });

                            if (filteredTransactions.length === 0 && transactionsSearchTerm) {
                                return (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center bg-white rounded-3xl border border-slate-100 shadow-sm m-4">
                                        <Search className="w-12 h-12 mb-4 opacity-20 text-blue-500" />
                                        <p className="font-bold text-slate-700 mb-2">No hay transacciones que coincidan con "{transactionsSearchTerm}" en este rango de fechas.</p>
                                        <p className="text-sm text-slate-500 mb-6">Si estás buscando un recibo o venta antigua, puedes buscar en la base de datos completa.</p>
                                        <button 
                                            onClick={async () => {
                                                const search = transactionsSearchTerm.trim();
                                                const isNumeric = /^\d+$/.test(search);
                                                try {
                                                    let query = supabase.from('orders').select('id, readable_id, customer').order('createdAt', { ascending: false }).limit(1);
                                                    if (isNumeric) {
                                                        query = query.or(`readable_id.eq.${search}`);
                                                    } else {
                                                        query = query.textSearch('customer', search, { config: 'spanish' });
                                                    }
                                                    const { data } = await query;
                                                    if (data && data.length > 0) {
                                                        window.location.href = `/orders/${data[0].id}`;
                                                    } else {
                                                        alert('No se encontró ninguna orden o factura global con este criterio.');
                                                    }
                                                } catch(e) {}
                                            }}
                                            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
                                        >
                                            <Search className="w-4 h-4" /> Buscar "{transactionsSearchTerm}" en toda la App
                                        </button>
                                    </div>
                                );
                            }

                            return filteredTransactions.map((p, idx) => {
                                    const pId = getPaymentId(p);
                                    const methodTranslated = p.method === 'CASH' ? 'Efectivo' : p.method === 'TRANSFER' ? 'Transferencia' : p.method === 'CARD' ? 'Tarjeta' : p.method;
                                    
                                    const contextOrder = orders.find(o => o.id === p.order_id);
                                    const displayId = contextOrder?.readable_id 
                                        ? contextOrder.readable_id 
                                        : (['PRODUCT_SALE', 'VENTA_PRODUCTO'].includes(p.order_id) ? `V-${p.order_readable_id || p.id?.slice(-4)}` 
                                        : (['EXPENSE', 'GASTO_LOCAL', 'GASTO_FLOTANTE', 'MANUAL_TX'].includes(p.order_id) ? `G-${p.order_readable_id || p.id?.slice(-4)}` 
                                        : p.order_readable_id || p.order_id?.slice(-4)));
                                    
                                    const isExpense = ['EXPENSE', 'GASTO_LOCAL', 'GASTO_FLOTANTE', 'MANUAL_TX'].includes(p.order_id) || p.order_model === 'Gasto Orden' || p.order_model === 'Gasto Local' || p.order_model === 'Transacción Manual' || (p.amount < 0 && (p.order_model === 'Gasto Flotante' || p.order_model?.toLowerCase().includes('gasto')));
                                    const isRefund = p.amount < 0 && !isExpense;
                                    const amountColor = isExpense ? 'text-red-600' : isRefund ? 'text-orange-600' : 'text-emerald-600';
                                    const amountPrefix = isExpense || isRefund ? '-' : '+';
                                    const absAmount = Math.abs(p.amount);

                                    return (
                                        <div key={`${pId}-${idx}`} className="flex flex-col gap-1 mb-2">
                                            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider pl-2 flex items-center gap-2">
                                                <Calendar className="w-3 h-3" />
                                                {new Date(p.created_at).toLocaleDateString()} • {new Date(p.created_at).toLocaleTimeString()}
                                            </div>
                                            <div 
                                                className="p-3 rounded-xl border border-slate-200 bg-white hover:border-emerald-300 hover:shadow-md transition-colors flex flex-col gap-3 cursor-pointer shadow-sm group"
                                                onClick={() => {
                                                    if (p.order_id && !['PRODUCT_SALE', 'VENTA_PRODUCTO', 'EXPENSE', 'GASTO_LOCAL', 'GASTO_FLOTANTE', 'MANUAL_TX'].includes(p.order_id)) {
                                                        window.location.href = `/orders/${p.order_id}`;
                                                    } else {
                                                        setSelectedTransaction(p);
                                                    }
                                                }}
                                            >
                                                <div className="flex gap-3 items-center">
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isExpense ? 'bg-red-50 text-red-500' : isRefund ? 'bg-orange-50 text-orange-500' : 'bg-emerald-50 text-emerald-500'}`}>
                                                        {isExpense ? <ArrowDownRight className="w-5 h-5" /> : isRefund ? <RefreshCw className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex justify-between items-center">
                                                            <div className="truncate pr-2">
                                                                <p className="text-sm font-bold text-slate-800 truncate">
                                                                    {isExpense ? 'Gasto' : isRefund ? 'Devolución' : 'Cobro'} #{displayId}
                                                                </p>
                                                                <p className="text-[11px] text-slate-500 font-medium truncate">
                                                                    {p.cashier_name} • {p.order_branch || 'T4'}
                                                                </p>
                                                            </div>
                                                            <div className="flex items-center gap-4">
                                                                <div className="text-right shrink-0">
                                                                    <p className={`text-sm font-black ${amountColor}`}>
                                                                        {amountPrefix}${absAmount.toLocaleString()}
                                                                    </p>
                                                                    <p className="text-[10px] font-bold text-slate-400 uppercase bg-slate-100 px-2 py-0.5 rounded inline-block mt-1">
                                                                        {methodTranslated}
                                                                    </p>
                                                                </div>
                                                                <button 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (p.order_id && !['PRODUCT_SALE', 'VENTA_PRODUCTO', 'EXPENSE', 'GASTO_LOCAL', 'GASTO_FLOTANTE', 'MANUAL_TX'].includes(p.order_id)) {
                                                                            window.location.href = `/orders/${p.order_id}`;
                                                                        } else {
                                                                            setSelectedTransaction(p);
                                                                        }
                                                                    }}
                                                                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-100 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                                                                    title="Ver detalles"
                                                                >
                                                                    <Info className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                });
                            })()
                        }
                    </div>
                </div>
            </div>
        )}

        {/* --- VIEW: HISTORY --- */}
        {activeTab === 'HISTORY' && (
            <div className="space-y-6 animate-in fade-in">
                <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="relative flex-1 w-full max-w-md">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                        <input 
                            placeholder="Buscar en historial por cajero, fecha, ID..." 
                            className="w-full pl-12 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-medium text-slate-700" 
                            value={historySearchTerm} 
                            onChange={e => setHistorySearchTerm(e.target.value)} 
                        />
                    </div>
                    <button onClick={loadHistory} disabled={isSyncing} className="text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 px-5 py-3.5 rounded-2xl flex items-center gap-2 transition-all shadow-sm w-full md:w-auto justify-center">
                        <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-blue-500' : 'text-slate-400'}`} /> 
                        {isSyncing ? 'Cargando...' : 'Refrescar Historial'}
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {(() => {
                        const filtered = historyClosings.filter(c => {
                            if (!historySearchTerm) return true;
                            if (matchingClosingIds.includes(c.id)) return true;
                            const term = historySearchTerm.toLowerCase();
                            const dateStr = new Date(c.timestamp).toLocaleDateString().toLowerCase();
                            const cashierIdStr = c.cashierId ? c.cashierId.toLowerCase() : '';
                            const cashierName = users.find(u => u.id === c.cashierId)?.name.toLowerCase() || '';
                            const idStr = c.id ? c.id.toLowerCase() : '';
                            return (
                                cashierIdStr.includes(term) ||
                                cashierName.includes(term) ||
                                dateStr.includes(term) ||
                                idStr.includes(term)
                            );
                        });

                        if (filtered.length === 0 && historySearchTerm) {
                            return (
                                <div className="col-span-full py-12 flex flex-col items-center justify-center text-slate-400 bg-white rounded-3xl border border-slate-100 shadow-sm m-4 text-center">
                                    <Search className="w-12 h-12 mb-4 opacity-20 text-purple-500" />
                                    <p className="font-bold text-slate-700 mb-2">No se encontraron cierres que coincidan con "{historySearchTerm}".</p>
                                    <p className="text-sm text-slate-500 mb-6">Si estabas buscando un recibo o venta específica, intenta buscarla en la base de datos completa.</p>
                                    <button 
                                        onClick={async () => {
                                            const search = historySearchTerm.trim();
                                            const isNumeric = /^\d+$/.test(search);
                                            try {
                                                let query = supabase.from('orders').select('id, readable_id, customer').order('createdAt', { ascending: false }).limit(1);
                                                if (isNumeric) {
                                                    query = query.or(`readable_id.eq.${search}`);
                                                } else {
                                                    query = query.textSearch('customer', search, { config: 'spanish' });
                                                }
                                                const { data } = await query;
                                                if (data && data.length > 0) {
                                                    window.location.href = `/orders/${data[0].id}`;
                                                } else {
                                                    alert('No se encontró ninguna orden o factura global con este criterio.');
                                                }
                                            } catch(e) {}
                                        }}
                                        className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-lg shadow-purple-500/20 transition-all flex items-center gap-2"
                                    >
                                        <Search className="w-4 h-4" /> Buscar "{historySearchTerm}" en toda la App
                                    </button>
                                </div>
                            );
                        }

                        if (historyClosings.length === 0 && !historySearchTerm) {
                            return (
                                <div className="col-span-full py-12 flex flex-col items-center justify-center text-slate-400 bg-white rounded-3xl border border-slate-200 border-dashed">
                                    <Search className="w-12 h-12 mb-4 opacity-20" />
                                    <p className="font-bold text-lg text-slate-600">No hay historial de cierres</p>
                                    <p className="text-sm mt-1">Los cierres de caja aparecerán aquí.</p>
                                </div>
                            );
                        }

                        return filtered.map(closing => {
                            const date = new Date(closing.timestamp);
                            const isPerfect = closing.difference === 0;
                            const cashierName = users.find(u => u.id === closing.cashierId)?.name || 'Cajero Desconocido';
                            
                            return (
                                <div 
                                    key={closing.id} 
                                    className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group relative overflow-hidden"
                                    onClick={() => handleViewClosingDetails(closing)}
                                >
                                    {/* Decorative line based on status */}
                                    <div className={`absolute top-0 left-0 w-full h-1.5 ${isPerfect ? 'bg-gradient-to-r from-emerald-400 to-green-500' : 'bg-gradient-to-r from-red-400 to-rose-500'}`} />
                                    
                                    <div className="flex justify-between items-start mb-6">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isPerfect ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                                                    {isPerfect ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                                                </div>
                                                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${isPerfect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                    {isPerfect ? 'Cuadrado' : 'Diferencia'}
                                                </span>
                                                {closing.updated_at && <span className="bg-orange-100 text-orange-700 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider">Editado</span>}
                                            </div>
                                        </div>
                                        
                                        {currentUser?.role === UserRole.ADMIN && (
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleUpdateClosing(closing); }}
                                                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                                                    title="Editar Monto Real"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteClosing(closing.id); }}
                                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                                                    title="Eliminar Cierre (Reabrir Pagos)"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="mb-6">
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Efectivo Real</p>
                                        <div className="text-4xl font-black text-slate-900 tracking-tighter flex items-baseline gap-1">
                                            <span className="text-2xl text-slate-400 font-medium">$</span>
                                            {closing.actualTotal.toLocaleString()}
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 mb-4">
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Esperado</p>
                                            <p className="text-lg font-bold text-slate-700">${closing.systemTotal.toLocaleString()}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Diferencia</p>
                                            <p className={`text-lg font-black ${isPerfect ? 'text-slate-300' : 'text-red-500'}`}>
                                                {closing.difference > 0 ? '+' : ''}{closing.difference.toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                                                <User className="w-3 h-3" />
                                            </div>
                                            <span className="text-xs font-bold text-slate-700">{cashierName}</span>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs font-bold text-slate-800">{date.toLocaleDateString()}</p>
                                            <p className="text-[10px] font-medium text-slate-500">{date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        });
                    })()}
                </div>
            </div>
        )}
        
        {/* ... DEBTS TAB ... */}
        {activeTab === 'DEBTS' && (
            <div className="space-y-6 animate-in fade-in">
                {/* Search Bar for Debts */}
                <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="relative flex-1 w-full max-w-md">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                        <input 
                            placeholder="Buscar deuda por cliente, modelo o ID..." 
                            className="w-full pl-12 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all text-sm font-medium text-slate-700" 
                            value={debtSearch} 
                            onChange={e => setDebtSearch(e.target.value)} 
                        />
                    </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {customerDebtOrders.map(order => {
                        const totalPaid = (order.payments || []).reduce((acc, p) => acc + p.amount, 0);
                        const totalCost = order.totalAmount ?? (order.finalPrice || order.estimatedCost || 0);
                        const debt = totalCost - totalPaid;
                        const creditPayment = order.payments?.find(p => p.method === 'CREDIT');

                        return (
                            <div key={order.id} className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden relative group hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col">
                                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-orange-400 to-red-500"></div>
                                
                                <div className="p-6 flex-1 flex flex-col">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 className="font-black text-slate-800 text-lg leading-tight mb-1">{order.customer.name}</h3>
                                            <p className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                                                <Phone className="w-3.5 h-3.5 text-slate-400"/> {order.customer.phone}
                                            </p>
                                        </div>
                                        <span className="bg-red-50 text-red-600 text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider border border-red-100 shadow-sm">
                                            Debe
                                        </span>
                                    </div>
                                    
                                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 mb-4 mt-auto">
                                        <div className="flex justify-between items-end">
                                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pendiente</span>
                                            <span className="text-2xl font-black text-red-600 tracking-tighter flex items-baseline gap-1">
                                                <span className="text-lg text-red-400 font-medium">$</span>
                                                {debt.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    {/* --- SHOW WHO AUTHORIZED CREDIT --- */}
                                    {creditPayment && (
                                        <div className="mb-6 flex items-start gap-3 bg-orange-50/50 p-3 rounded-xl border border-orange-100/50">
                                            <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                                                <User className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Autorizado por</p>
                                                <p className="text-xs font-bold text-slate-700">{creditPayment.cashierName}</p>
                                                <p className="text-[10px] font-medium text-slate-500 mt-0.5">{new Date(creditPayment.date).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex gap-3 mt-auto">
                                        <button 
                                            onClick={() => navigate(`/orders/${order.id}`)} 
                                            className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
                                        >
                                            <ExternalLink className="w-4 h-4"/> Ver Orden
                                        </button>
                                        <button 
                                            onClick={() => setSelectedDebtOrder(order)} 
                                            className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold text-xs hover:bg-green-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-600/20 hover:shadow-green-600/40"
                                        >
                                            <DollarSign className="w-4 h-4"/> Abonar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    
                    {customerDebtOrders.length === 0 && (
                        <div className="col-span-full py-12 flex flex-col items-center justify-center text-slate-400 bg-white rounded-3xl border border-slate-200 border-dashed">
                            <Search className="w-12 h-12 mb-4 opacity-20" />
                            <p className="font-bold text-lg text-slate-600">No hay deudas pendientes</p>
                        </div>
                    )}
                </div>
            </div>
        )}

        {activeTab === 'APPROVALS' && isSupervisor && (
            <div className="space-y-6 animate-in fade-in">
                <ExpenseApprovals />
            </div>
        )}

        {activeTab === 'CREDITS' && (
            <div className="space-y-6 animate-in fade-in">
                <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="relative flex-1 w-full max-w-md">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                        <input 
                            type="text" 
                            placeholder="Buscar por cliente, orden o cajero..." 
                            className="w-full pl-12 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all text-sm font-medium text-slate-700"
                            value={creditSearch}
                            onChange={(e) => setCreditSearch(e.target.value)}
                        />
                    </div>
                    <button 
                        onClick={loadClientCredits}
                        className="bg-amber-50 text-amber-600 px-6 py-3.5 rounded-2xl font-bold hover:bg-amber-100 transition-colors flex items-center gap-2 whitespace-nowrap shadow-sm border border-amber-100"
                    >
                        <RefreshCw className={`w-5 h-5 ${loadingCredits ? 'animate-spin' : ''}`} />
                        Actualizar
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredCredits.length === 0 ? (
                        <div className="col-span-full py-20 text-center bg-white rounded-3xl border-2 border-dashed border-slate-200">
                            <DollarSign className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                            <p className="text-slate-400 font-bold text-lg">No se encontraron créditos pendientes.</p>
                        </div>
                    ) : (
                        filteredCredits.map(credit => {
                            const isOverdue = credit.status === 'PENDING' && credit.due_date && new Date(credit.due_date) < new Date();
                            return (
                                <div 
                                    key={credit.id} 
                                    className={`bg-white rounded-3xl border ${isOverdue ? 'border-red-200 bg-red-50/10' : 'border-slate-200'} p-6 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer flex flex-col relative overflow-hidden`} 
                                    onClick={() => setSelectedCredit(credit)}
                                >
                                    {isOverdue && <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-red-400 to-red-600"></div>}
                                    {!isOverdue && <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-amber-400 to-amber-500"></div>}
                                    
                                    <div className="flex justify-between items-start mb-6 mt-2">
                                        <div>
                                            <h3 className="font-black text-slate-800 text-lg leading-tight mb-1">{credit.client_name || 'Cliente POS'}</h3>
                                            <p className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                                                <Phone className="w-3.5 h-3.5 text-slate-400"/> {credit.client_phone || 'Sin número'}
                                            </p>
                                        </div>
                                        <div className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm border ${credit.status === 'PAID' ? 'bg-green-50 text-green-700 border-green-100' : (isOverdue ? 'bg-red-50 text-red-700 border-red-100 animate-pulse' : 'bg-amber-50 text-amber-700 border-amber-100')}`}>
                                            {credit.status === 'PAID' ? 'Pagado' : (isOverdue ? 'Vencido' : 'Pendiente')}
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 mb-6 mt-auto">
                                        <div className="flex justify-between items-end mb-3">
                                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Monto Pendiente</span>
                                            <span className="text-3xl font-black text-slate-900 tracking-tighter flex items-baseline gap-1">
                                                <span className="text-xl text-slate-400 font-medium">$</span>
                                                {credit.amount.toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center pt-3 border-t border-slate-200/60">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                                <Calendar className="w-3 h-3" /> Fecha Límite
                                            </span>
                                            <span className={`text-xs font-black ${isOverdue ? 'text-red-600' : 'text-slate-700'}`}>
                                                {credit.due_date ? new Date(credit.due_date).toLocaleDateString() : 'Sin definir'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-2 mb-6">
                                        <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-slate-100">
                                            <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                                                <User className="w-3.5 h-3.5" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Cajero</span>
                                                <span className="text-xs font-bold text-slate-700">{credit.cashier_name}</span>
                                            </div>
                                        </div>
                                        {credit.order_id && (
                                            <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-slate-100">
                                                <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                                                    <ScrollText className="w-3.5 h-3.5" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Orden</span>
                                                    <span className="text-xs font-bold text-slate-700">#{credit.order_id.slice(-6)}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {credit.status === 'PENDING' && (
                                        <div className="mt-auto">
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate('/pos', { 
                                                        state: { 
                                                            creditAbono: {
                                                                id: credit.id,
                                                                clientName: credit.client_name,
                                                                clientPhone: credit.client_phone,
                                                                amount: credit.amount,
                                                                orderId: credit.order_id
                                                            }
                                                        } 
                                                    });
                                                }}
                                                className="w-full py-3.5 bg-amber-500 text-white rounded-xl font-bold text-sm hover:bg-amber-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40"
                                            >
                                                <DollarSign className="w-5 h-5" />
                                                Abonar a Crédito
                                            </button>
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        const cleanPhone = credit.client_phone.replace(/\D/g, '');
                                                        const wsPhone = cleanPhone.length === 10 ? `1${cleanPhone}` : cleanPhone;
                                                        const message = `Hola ${credit.client_name}, le escribimos de la tienda para recordarle su crédito pendiente por $${credit.amount.toLocaleString()}.`;
                                                        
                                                        showNotification('success', 'Enviando mensaje...');
                                                        
                                                        try {
                                                          const response = await fetch('/api/notifications/whatsapp', {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({
                                                              phone: wsPhone,
                                                              message: message
                                                            })
                                                          });
                                                          
                                                          const result = await response.json();
                                                          if (response.ok && result.success) {
                                                              showNotification('success', 'Mensaje de recordatorio enviado');
                                                          } else {
                                                              showNotification('error', `Error al enviar WhatsApp: ${result.error || 'Verifique la conexión.'}`);
                                                          }
                                                        } catch(err) {
                                                          showNotification('error', 'Fallo al comunicar con el servidor de WhatsApp');
                                                        }
                                                    }}
                                                    className="flex-1 py-2 bg-green-500 text-white rounded-xl font-bold text-sm hover:bg-green-600 transition-all flex items-center justify-center gap-2 shadow-sm"
                                                >
                                                    <MessageCircle className="w-4 h-4" />
                                                    Contactar
                                                </button>
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handlePayCredit(credit);
                                                    }}
                                                    className="flex-1 py-2 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-sm"
                                                    title="Marcar como pagado (sin recibo)"
                                                >
                                                    <CheckCircle2 className="w-4 h-4" />
                                                    Pagado
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    
                                    {credit.status === 'PAID' && credit.paid_at && (
                                        <div className="text-center py-2 bg-green-50 rounded-xl border border-green-100">
                                            <p className="text-[10px] font-bold text-green-600 uppercase">Pagado el {new Date(credit.paid_at).toLocaleString()}</p>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        )}
        
        {/* ... MODALS ... */}
        {selectedDebtOrder && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setSelectedDebtOrder(null)}>
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                    <div className="bg-slate-50 p-5 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">
                            <DollarSign className="w-5 h-5 text-green-500" />
                            Registrar Abono
                        </h3>
                        <button 
                            onClick={() => setSelectedDebtOrder(null)}
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200/50 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors"
                        >
                            <X className="w-4 h-4"/>
                        </button>
                    </div>
                    
                    <div className="p-6 space-y-6">
                        <div className="text-center bg-red-50/50 p-4 rounded-2xl border border-red-100">
                            <h2 className="text-xl font-black text-slate-800 mb-1">{selectedDebtOrder.customer.name}</h2>
                            <div className="flex items-center justify-center gap-2 text-red-600">
                                <span className="text-xs font-bold uppercase tracking-wider">Deuda Actual:</span>
                                <span className="text-lg font-black">
                                    ${((selectedDebtOrder.totalAmount ?? (selectedDebtOrder.finalPrice || selectedDebtOrder.estimatedCost || 0)) - (selectedDebtOrder.payments?.reduce((a,b)=>a+b.amount,0)||0)).toLocaleString()}
                                </span>
                            </div>
                        </div>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2 block ml-1">Monto a Abonar</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">$</span>
                                    <input 
                                        type="number" 
                                        autoFocus 
                                        className="w-full pl-10 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-2xl font-black text-slate-800 outline-none focus:bg-white focus:ring-4 focus:ring-green-500/20 focus:border-green-500 transition-all" 
                                        placeholder="0.00" 
                                        value={paymentAmount} 
                                        onChange={e => setPaymentAmount(e.target.value)} 
                                    />
                                </div>
                            </div>
                            
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2 block ml-1">Método de Pago</label>
                                <div className="relative">
                                    <select 
                                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:bg-white focus:ring-4 focus:ring-green-500/20 focus:border-green-500 transition-all appearance-none" 
                                        value={paymentMethod} 
                                        onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                                    >
                                        <option value="CASH">💵 Efectivo</option>
                                        <option value="TRANSFER">🏦 Transferencia</option>
                                        <option value="CARD">💳 Tarjeta</option>
                                    </select>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                        <ArrowDownRight className="w-4 h-4" />
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <button 
                            onClick={handleCustomerDebtPayment} 
                            disabled={isProcessingPayment || !paymentAmount} 
                            className="w-full py-4 bg-green-500 text-white font-black rounded-2xl shadow-lg shadow-green-500/30 hover:bg-green-600 hover:shadow-green-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm uppercase tracking-wider"
                        >
                            {isProcessingPayment ? (
                                <Loader2 className="w-5 h-5 animate-spin"/>
                            ) : (
                                <>
                                    <CheckCircle2 className="w-5 h-5"/> 
                                    Confirmar Abono
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Confirmation Dialog */}
        {confirmationDialog && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                    <div className={`p-8 text-center ${confirmationDialog.type === 'danger' ? 'bg-red-50/50' : (confirmationDialog.type === 'warning' ? 'bg-amber-50/50' : 'bg-blue-50/50')}`}>
                        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border ${confirmationDialog.type === 'danger' ? 'bg-red-100 text-red-600 border-red-200' : (confirmationDialog.type === 'warning' ? 'bg-amber-100 text-amber-600 border-amber-200' : 'bg-blue-100 text-blue-600 border-blue-200')}`}>
                            <AlertCircle className="w-10 h-10" />
                        </div>
                        <h3 className="text-2xl font-black text-slate-800 mb-3 tracking-tight">{confirmationDialog.title}</h3>
                        <p className="text-slate-500 font-medium whitespace-pre-wrap leading-relaxed">{confirmationDialog.message}</p>
                    </div>
                    <div className="p-5 flex gap-3 bg-white border-t border-slate-100">
                        <button 
                            onClick={() => setConfirmationDialog(null)}
                            className="flex-1 py-3.5 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-colors text-sm uppercase tracking-wider"
                        >
                            {confirmationDialog.cancelLabel || 'CANCELAR'}
                        </button>
                        <button 
                            onClick={confirmationDialog.onConfirm}
                            className={`flex-1 py-3.5 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 text-sm uppercase tracking-wider ${confirmationDialog.type === 'danger' ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30 hover:shadow-red-500/50' : (confirmationDialog.type === 'warning' ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/30 hover:shadow-amber-500/50' : 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/30 hover:shadow-blue-500/50')}`}
                        >
                            {confirmationDialog.confirmLabel || 'CONFIRMAR'}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Prompt Modal */}
        {promptModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                    <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                        <div>
                            <h3 className="text-xl font-black text-slate-800 tracking-tight">{promptModal.title}</h3>
                            <p className="text-slate-500 font-medium mt-1 text-sm">{promptModal.message}</p>
                        </div>
                        <button 
                            onClick={() => setPromptModal(null)}
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200/50 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors shrink-0"
                        >
                            <X className="w-4 h-4"/>
                        </button>
                    </div>
                    <div className="p-6 space-y-5">
                        {promptModal.fields.map(field => (
                            <div key={field.key}>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2 ml-1">
                                    {field.label}
                                </label>
                                <input
                                    type={field.type}
                                    defaultValue={field.defaultValue}
                                    id={`prompt-${field.key}`}
                                    className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all font-bold text-slate-800 outline-none"
                                    autoFocus={promptModal.fields[0].key === field.key}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            const values: Record<string, string> = {};
                                            promptModal.fields.forEach(f => {
                                                const el = document.getElementById(`prompt-${f.key}`) as HTMLInputElement;
                                                values[f.key] = el.value;
                                            });
                                            promptModal.onConfirm(values);
                                        }
                                    }}
                                />
                            </div>
                        ))}
                    </div>
                    <div className="p-5 flex gap-3 bg-white border-t border-slate-100">
                        <button 
                            onClick={() => setPromptModal(null)}
                            className="flex-1 py-3.5 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-colors text-sm uppercase tracking-wider"
                        >
                            CANCELAR
                        </button>
                        <button 
                            onClick={() => {
                                const values: Record<string, string> = {};
                                promptModal.fields.forEach(f => {
                                    const el = document.getElementById(`prompt-${f.key}`) as HTMLInputElement;
                                    values[f.key] = el.value;
                                });
                                promptModal.onConfirm(values);
                            }}
                            className="flex-1 py-3.5 bg-blue-500 text-white font-black rounded-2xl shadow-lg shadow-blue-500/30 hover:bg-blue-600 hover:shadow-blue-500/50 transition-all active:scale-95 text-sm uppercase tracking-wider"
                        >
                            CONFIRMAR
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Credit Payment Modal */}
        {payingCredit && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setPayingCredit(null)}>
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                    <div className="bg-slate-50 p-5 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                            Pago de Crédito
                        </h3>
                        <button 
                            onClick={() => setPayingCredit(null)}
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200/50 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors"
                        >
                            <X className="w-4 h-4"/>
                        </button>
                    </div>
                    <div className="p-6 space-y-6">
                        <div className="text-center bg-green-50/50 p-4 rounded-2xl border border-green-100">
                            <h2 className="text-xl font-black text-slate-800 mb-1">{payingCredit.client_name}</h2>
                            <div className="flex items-center justify-center gap-2 text-green-600">
                                <span className="text-xs font-bold uppercase tracking-wider">Monto a Pagar:</span>
                                <span className="text-2xl font-black">
                                    ${payingCredit.amount.toLocaleString()}
                                </span>
                            </div>
                        </div>
                        
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block ml-1">Método de Pago</label>
                            <div className="grid grid-cols-3 gap-3">
                                {[
                                    { id: 'CASH', label: 'Efectivo', icon: Banknote },
                                    { id: 'TRANSFER', label: 'Transf.', icon: Smartphone },
                                    { id: 'CARD', label: 'Tarjeta', icon: CreditCard }
                                ].map(m => (
                                    <button
                                        key={m.id}
                                        onClick={() => setCreditPaymentMethod(m.id as PaymentMethod)}
                                        className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all duration-200 ${creditPaymentMethod === m.id ? 'border-green-500 bg-green-50 text-green-700 shadow-md shadow-green-500/10 scale-105' : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200 hover:bg-slate-50'}`}
                                    >
                                        <m.icon className={`w-6 h-6 ${creditPaymentMethod === m.id ? 'text-green-600' : 'text-slate-400'}`} />
                                        <span className="text-[10px] font-black uppercase tracking-wider">{m.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="pt-2">
                            <button 
                                onClick={confirmCreditPayment} 
                                disabled={isProcessingCredit} 
                                className="w-full py-4 bg-green-500 text-white font-black rounded-2xl shadow-lg shadow-green-500/30 hover:bg-green-600 hover:shadow-green-500/50 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm uppercase tracking-wider"
                            >
                                {isProcessingCredit ? (
                                    <Loader2 className="w-5 h-5 animate-spin"/>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-5 h-5"/> 
                                        CONFIRMAR PAGO
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Closing Details Modal */}
        {selectedClosing && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <div>
                            <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                                <FileText className="w-6 h-6 text-blue-500" />
                                Detalle de Cierre
                            </h2>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">ID: {selectedClosing.id}</p>
                        </div>
                        <button onClick={() => setSelectedClosing(null)} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-200/50 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-6 bg-white">
                        {isLoadingDetails ? (
                            <div className="flex justify-center items-center h-full py-20">
                                <div className="flex flex-col items-center gap-4">
                                    <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
                                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Cargando detalles...</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-8">
                                {/* Summary Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 flex flex-col justify-center">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Sistema</p>
                                        <p className="text-3xl font-black text-slate-800">${selectedClosing.systemTotal.toLocaleString()}</p>
                                    </div>
                                    <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100 flex flex-col justify-center">
                                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Total Real (Conteo)</p>
                                        <p className="text-3xl font-black text-blue-700">${selectedClosing.actualTotal.toLocaleString()}</p>
                                    </div>
                                    <div className={`p-5 rounded-2xl border flex flex-col justify-center ${selectedClosing.difference === 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                                        <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${selectedClosing.difference === 0 ? 'text-green-600' : 'text-red-600'}`}>Diferencia</p>
                                        <p className={`text-3xl font-black ${selectedClosing.difference === 0 ? 'text-green-700' : 'text-red-700'}`}>${selectedClosing.difference.toLocaleString()}</p>
                                    </div>
                                </div>

                                {selectedClosing.notes && (
                                    <div className="bg-yellow-50/50 p-5 rounded-2xl border border-yellow-100">
                                        <p className="text-[10px] font-black text-yellow-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                                            <AlertCircle className="w-4 h-4" />
                                            Notas del Cierre
                                        </p>
                                        <p className="text-slate-700 font-medium text-sm leading-relaxed">{selectedClosing.notes}</p>
                                    </div>
                                )}
                                {selectedClosing.updated_at && (
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">
                                        Última actualización: {new Date(selectedClosing.updated_at).toLocaleString()}
                                    </div>
                                )}

                                {/* Payments Table */}
                                <div>
                                    <h3 className="font-black text-slate-800 mb-4 flex items-center gap-2 text-lg">
                                        <ListFilter className="w-5 h-5 text-blue-500" />
                                        Pagos Consolidados <span className="text-slate-400 text-sm font-bold">({closingDetails.length})</span>
                                    </h3>
                                    <div className="border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/50 p-2 space-y-2 max-h-[400px] overflow-y-auto">
                                        {closingDetails.length === 0 ? (
                                            <div className="text-center py-12 text-slate-400 flex flex-col items-center justify-center">
                                                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                                    <Search className="w-8 h-8 text-slate-300" />
                                                </div>
                                                <p className="text-sm font-bold">No hay pagos registrados en este cierre.</p>
                                            </div>
                                        ) : (
                                            closingDetails.map((p: any, idx: number) => {
                                                const isRefund = p.amount < 0 || p.is_refund;
                                                const methodTranslated = p.method === 'CASH' ? 'Efectivo' : p.method === 'TRANSFER' ? 'Transferencia' : p.method === 'CARD' ? 'Tarjeta' : p.method;
                                                const dateObj = new Date(Number(p.date));
                                                
                                                let dateStr = '';
                                                if (isNaN(dateObj.getTime())) {
                                                    dateStr = new Date(p.date).toLocaleString();
                                                } else {
                                                    const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                                    const dateOnlyStr = dateObj.toLocaleDateString();
                                                    dateStr = `${timeStr} - ${dateOnlyStr}`;
                                                }
                                                
                                                const contextOrder = orders.find(o => o.id === p.order_id);
                                                const displayId = contextOrder?.readable_id 
                                                    ? contextOrder.readable_id 
                                                    : (['PRODUCT_SALE', 'VENTA_PRODUCTO'].includes(p.order_id) ? `V-${p.order_readable_id || p.id?.slice(-4)}` 
                                                    : (['EXPENSE', 'GASTO_LOCAL', 'GASTO_FLOTANTE', 'MANUAL_TX'].includes(p.order_id) ? `G-${p.order_readable_id || p.id?.slice(-4)}` 
                                                    : p.order_readable_id || p.order_id?.slice(-4)));
                                                const displayModel = contextOrder?.deviceModel || p.order_model || '';
                                                
                                                return (
                                                <div 
                                                    key={idx} 
                                                    className={`p-4 rounded-2xl border flex justify-between items-center transition-all group cursor-pointer hover:shadow-lg hover:-translate-y-0.5 ${isRefund ? 'bg-red-50/50 border-red-100 hover:border-red-200' : 'bg-white border-slate-100 hover:border-slate-200'}`}
                                                    onClick={() => {
                                                        if (p.order_id && !['PRODUCT_SALE', 'VENTA_PRODUCTO', 'EXPENSE', 'GASTO_LOCAL', 'GASTO_FLOTANTE', 'MANUAL_TX'].includes(p.order_id)) {
                                                            window.location.href = `/orders/${p.order_id}`;
                                                        } else {
                                                            setSelectedPaymentDetails(p);
                                                        }
                                                    }}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${isRefund ? 'bg-red-100 border-red-200 text-red-600' : 'bg-green-100 border-green-200 text-green-600'}`}>
                                                            {isRefund ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                                                        </div>

                                                        <div>
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className="text-[10px] font-black text-slate-500 bg-slate-200/50 px-2 py-0.5 rounded-md flex items-center gap-1 uppercase tracking-wider">
                                                                    <MapPin className="w-3 h-3" /> {p.order_branch || 'T4'}
                                                                </span>
                                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                                    {dateStr}
                                                                </span>
                                                            </div>
                                                            <div className="font-black text-slate-800 flex items-center gap-2 text-sm">
                                                                #{displayId}
                                                                {displayModel && <span className="text-xs font-bold text-slate-400 truncate max-w-[150px] bg-slate-100 px-2 py-0.5 rounded-md">{displayModel}</span>}
                                                            </div>
                                                            <div className="text-[10px] font-bold text-slate-500 flex items-center gap-1 mt-1 uppercase tracking-wider">
                                                                <User className="w-3 h-3" /> {p.cashier_name || 'Sistema'}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="text-right flex items-center gap-4">
                                                        <div className="flex flex-col items-end gap-1">
                                                            <span className={`text-xl font-black ${isRefund ? 'text-red-600' : 'text-slate-800'}`}>
                                                                ${Math.abs(p.amount).toLocaleString()}
                                                            </span>
                                                            <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md ${
                                                                p.method === 'CASH' ? 'bg-green-100 text-green-700' : 
                                                                p.method === 'TRANSFER' ? 'bg-blue-100 text-blue-700' : 
                                                                p.method === 'CARD' ? 'bg-purple-100 text-purple-700' : 
                                                                'bg-slate-100 text-slate-700'
                                                            }`}>
                                                                {methodTranslated}
                                                            </span>
                                                        </div>
                                                        {canAdminister && (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleEditClosedPayment(p.id, p.amount); }}
                                                                className="p-2.5 bg-slate-100 hover:bg-blue-100 text-slate-400 hover:text-blue-600 rounded-xl transition-colors"
                                                                title="Editar Monto"
                                                            >
                                                                <Edit2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        {selectedPaymentDetails && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setSelectedPaymentDetails(null)}>
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                    <div className="bg-slate-50 p-5 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="font-black text-slate-800 flex items-center gap-2 text-lg">
                            <Info className="w-5 h-5 text-blue-500"/> Detalle del Movimiento
                        </h3>
                        <button onClick={() => setSelectedPaymentDetails(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200/50 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors">
                            <X className="w-4 h-4"/>
                        </button>
                    </div>
                    
                    <div className="p-6 space-y-6">
                        {/* Header Amount */}
                        <div className="text-center bg-slate-50/50 p-6 rounded-3xl border border-slate-100">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Monto Total</p>
                            <h2 className={`text-5xl font-black tracking-tight ${selectedPaymentDetails.amount < 0 || selectedPaymentDetails.is_refund ? 'text-red-500' : 'text-slate-800'}`}>
                                ${Math.abs(selectedPaymentDetails.amount).toLocaleString()}
                            </h2>
                            {selectedPaymentDetails.is_refund && (
                                <span className="inline-block mt-3 px-4 py-1.5 bg-red-100 text-red-600 text-[10px] font-black rounded-full uppercase tracking-widest">
                                    Reembolso / Devolución
                                </span>
                            )}
                        </div>

                        {/* Details Grid */}
                        <div className="grid grid-cols-2 gap-4 bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Orden</p>
                                <p className="font-bold text-slate-700 text-sm bg-slate-50 px-3 py-1.5 rounded-lg inline-block">
                                    {orders.find(o => o.id === selectedPaymentDetails.order_id)?.readable_id 
                                        ? `#${orders.find(o => o.id === selectedPaymentDetails.order_id)?.readable_id}`
                                        : (['PRODUCT_SALE', 'VENTA_PRODUCTO'].includes(selectedPaymentDetails.order_id) ? `V-${selectedPaymentDetails.order_readable_id || selectedPaymentDetails.id?.slice(-4)}` 
                                        : (['EXPENSE', 'GASTO_LOCAL', 'GASTO_FLOTANTE', 'MANUAL_TX'].includes(selectedPaymentDetails.order_id) ? `G-${selectedPaymentDetails.order_readable_id || selectedPaymentDetails.id?.slice(-4)}` 
                                        : `#${selectedPaymentDetails.order_readable_id || selectedPaymentDetails.order_id?.slice(-4)}`))}
                                </p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Fecha</p>
                                <p className="font-bold text-slate-700 text-sm">
                                    {new Date(selectedPaymentDetails.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    <span className="block text-xs text-slate-500 font-medium">{new Date(selectedPaymentDetails.date).toLocaleDateString()}</span>
                                </p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Método</p>
                                <p className="font-bold text-slate-700 text-sm">
                                    {selectedPaymentDetails.method === 'CASH' ? 'Efectivo' : 
                                     selectedPaymentDetails.method === 'TRANSFER' ? 'Transferencia' : 
                                     selectedPaymentDetails.method === 'CARD' ? 'Tarjeta' : selectedPaymentDetails.method}
                                </p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Cajero</p>
                                <p className="font-bold text-slate-700 text-sm flex items-center gap-1.5">
                                    <User className="w-3.5 h-3.5 text-slate-400" />
                                    {selectedPaymentDetails.cashier_name}
                                </p>
                            </div>
                            <div className="col-span-2 pt-2 border-t border-slate-100">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Modelo / Dispositivo</p>
                                <p className="font-bold text-slate-700 text-sm truncate">{selectedPaymentDetails.order_model || 'N/A'}</p>
                            </div>
                             <div className="col-span-2">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Cliente</p>
                                <p className="font-bold text-slate-700 text-sm truncate">{selectedPaymentDetails.order_customer || 'N/A'}</p>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 pt-2">
                            <button 
                                onClick={() => {
                                    setSelectedPaymentDetails(null);
                                    navigate(`/orders/${selectedPaymentDetails.order_id}`);
                                }}
                                className="flex-1 py-4 bg-blue-500 text-white rounded-2xl font-black shadow-lg shadow-blue-500/30 hover:bg-blue-600 hover:shadow-blue-500/50 transition-all active:scale-95 flex items-center justify-center gap-2 text-sm uppercase tracking-wider"
                            >
                                <ExternalLink className="w-4 h-4"/> Ver Orden Completa
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {selectedCredit && (
            <CreditDetailsModal
                credit={selectedCredit}
                onClose={() => setSelectedCredit(null)}
                onContact={() => {}}
                onAbono={() => {
                    navigate('/pos', { 
                        state: { 
                            creditAbono: {
                                id: selectedCredit.id,
                                clientName: selectedCredit.client_name,
                                clientPhone: selectedCredit.client_phone,
                                amount: selectedCredit.amount,
                                orderId: selectedCredit.order_id
                            }
                        } 
                    });
                }}
                currentUser={currentUser}
            />
        )}

        {/* Transaction Details Modal */}
        {selectedTransaction && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setSelectedTransaction(null)}>
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                    <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                            <Receipt className="w-5 h-5 text-blue-500" />
                            Detalles del Movimiento
                        </h2>
                        <button onClick={() => setSelectedTransaction(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200/50 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    
                    <div className="p-6 space-y-6">
                        <div className="flex items-center justify-between bg-slate-50/50 p-5 rounded-3xl border border-slate-100">
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Monto</p>
                                <p className={`text-4xl font-black tracking-tight ${selectedTransaction.amount < 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                    {selectedTransaction.amount < 0 ? '-' : '+'}${Math.abs(selectedTransaction.amount).toLocaleString()}
                                </p>
                            </div>
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${selectedTransaction.amount < 0 ? 'bg-red-100 text-red-600 border border-red-200' : 'bg-emerald-100 text-emerald-600 border border-emerald-200'}`}>
                                {selectedTransaction.amount < 0 ? <ArrowDownRight className="w-8 h-8" /> : <ArrowUpRight className="w-8 h-8" />}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Fecha y Hora</p>
                                <p className="font-bold text-slate-700 text-sm">
                                    {new Date(selectedTransaction.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    <span className="block text-xs text-slate-500 font-medium">{new Date(selectedTransaction.created_at).toLocaleDateString()}</span>
                                </p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Método</p>
                                <p className="font-bold text-slate-700 text-sm">
                                    {selectedTransaction.method === 'CASH' ? 'Efectivo' :
                                     selectedTransaction.method === 'CARD' ? 'Tarjeta' :
                                     selectedTransaction.method === 'TRANSFER' ? 'Transferencia' : 'Otro'}
                                </p>
                            </div>
                            <div className="col-span-2 pt-2 border-t border-slate-100">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">ID Transacción</p>
                                <p className="font-mono text-slate-500 text-xs break-all bg-slate-50 p-2 rounded-lg border border-slate-100">{selectedTransaction.id}</p>
                            </div>
                            {selectedTransaction.order_id && !['EXPENSE', 'GASTO_LOCAL', 'GASTO_FLOTANTE', 'PRODUCT_SALE', 'VENTA_PRODUCTO'].includes(selectedTransaction.order_id) && (
                                <div className="col-span-2">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">ID Orden</p>
                                    <p className="font-mono text-slate-500 text-xs break-all bg-slate-50 p-2 rounded-lg border border-slate-100">{selectedTransaction.order_id}</p>
                                </div>
                            )}
                            <div className="pt-2 border-t border-slate-100">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Cajero</p>
                                <p className="font-bold text-slate-700 text-sm flex items-center gap-1.5">
                                    <User className="w-3.5 h-3.5 text-slate-400" />
                                    {selectedTransaction.cashier_name}
                                </p>
                            </div>
                            <div className="pt-2 border-t border-slate-100">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Sucursal</p>
                                <p className="font-bold text-slate-700 text-sm flex items-center gap-1.5">
                                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                    {selectedTransaction.order_branch || selectedTransaction.branch || 'T4'}
                                </p>
                            </div>
                            {selectedTransaction.order_customer && (
                                <div className="col-span-2 pt-2 border-t border-slate-100">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Cliente</p>
                                    <p className="font-bold text-slate-700 text-sm">{selectedTransaction.order_customer}</p>
                                </div>
                            )}
                            {selectedTransaction.description && (
                                <div className="col-span-2 pt-2 border-t border-slate-100">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Descripción</p>
                                    <p className="font-bold text-slate-700 text-sm bg-slate-50 p-3 rounded-xl border border-slate-100">{selectedTransaction.description}</p>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        {selectedTransaction.order_id && !['EXPENSE', 'GASTO_LOCAL', 'GASTO_FLOTANTE', 'PRODUCT_SALE', 'VENTA_PRODUCTO'].includes(selectedTransaction.order_id) && (
                            <div className="flex gap-3 pt-2">
                                <button 
                                    onClick={() => {
                                        setSelectedTransaction(null);
                                        navigate(`/orders/${selectedTransaction.order_id}`);
                                    }}
                                    className="flex-1 py-4 bg-blue-500 text-white rounded-2xl font-black shadow-lg shadow-blue-500/30 hover:bg-blue-600 hover:shadow-blue-500/50 transition-all active:scale-95 flex items-center justify-center gap-2 text-sm uppercase tracking-wider"
                                >
                                    <ExternalLink className="w-4 h-4"/> Ver Orden Completa
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export const CashRegister = CashRegisterComponent;
