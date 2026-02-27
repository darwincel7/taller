
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../services/supabase';
import { 
  RepairOrder, AppNotification, 
  OrderStatus, LogType, Payment, 
  DashboardStats, ReturnRequest, OrderType, ExternalRepairRequest, CashClosing, PointRequest
} from '../types';

interface OrderContextType {
  orders: RepairOrder[];
  notifications: AppNotification[];
  isConnected: boolean;
  hasPendingSync: boolean;
  
  // Pagination
  loadMoreOrders: () => Promise<void>;
  hasMore: boolean;
  isLoadingOrders: boolean;

  // Orders CRUD
  fetchOrderById: (id: string) => Promise<RepairOrder | undefined>;
  addOrder: (order: RepairOrder) => Promise<RepairOrder | null>;
  updateOrderDetails: (id: string, updates: Partial<RepairOrder>, auditReason?: string) => Promise<void>;
  addOrderLog: (id: string, status: OrderStatus, note: string, technician?: string, logType?: LogType) => Promise<void>;
  updateOrderStatus: (id: string, status: OrderStatus, note?: string) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
  searchOrder: (term: string) => Promise<void>;
  validateOrder: (id: string, validatorName: string) => Promise<void>;
  
  // Legacy Cash Logic
  addPayments: (orderId: string, payments: Payment[]) => Promise<void>;
  editPayment: (orderId: string, paymentId: string, updates: Partial<Payment>) => Promise<void>;
  performCashClosing: (cashierIds: string, systemTotal: number, actualTotal: number, adminId: string, paymentIds: string[]) => Promise<void>;
  fetchCashierActiveOrders: (cashierIds: string[]) => Promise<void>;
  
  // Dashboard RPC
  getDashboardStats: () => Promise<DashboardStats>;
  
  // UI Helpers
  showNotification: (type: 'success' | 'error', message: string) => void;
  clearNotification: (id: number) => void;
  
  // Logistics
  resolveReturn: (id: string, approve: boolean, approverName: string) => Promise<void>;
  initiateTransfer: (orderId: string, targetBranch: string, userName: string) => Promise<void>;
  confirmTransfer: (orderId: string, userName: string) => Promise<void>;
  assignOrder: (orderId: string, userId: string, userName: string, currentStatus?: OrderStatus) => Promise<boolean>;
  requestAssignment: (orderId: string, targetUserId: string, targetUserName: string, requesterName: string) => Promise<void>;
  resolveAssignmentRequest: (orderId: string, accept: boolean, userId: string, userName: string) => Promise<void>;
  requestReturn: (orderId: string, reason: string, fee: number, requesterName: string) => Promise<void>;
  
  // Legacy Messages
  sendTechMessage: (orderId: string, message: string, senderName: string) => Promise<void>;
  resolveTechMessage: (orderId: string) => Promise<void>;
  
  updateOrderFinancials: (id: string, updates: Partial<RepairOrder>) => Promise<void>;
  createWarrantyOrder: (originalOrder: RepairOrder, reason: string) => Promise<string>;
  debatePoints: (orderId: string, userName: string) => Promise<void>;
  
  requestExternalRepair: (orderId: string, workshop: 'BRENY NIZAO' | 'JUNIOR BARON' | 'OTRO', reason: string, userName: string) => Promise<void>;
  resolveExternalRepair: (orderId: string, approve: boolean, userName: string) => Promise<void>;
  receiveFromExternal: (orderId: string, notes: string, userName: string) => Promise<void>;
  recordOrderLog: (id: string, actionType: string, message: string, metadata?: any, logType?: LogType, userName?: string) => Promise<void>;
}

const OrderContext = createContext<OrderContextType | undefined>(undefined);

// No longer using strict whitelist to avoid missing custom states or Store items.
// Using 'neq' logic instead.

export const OrderProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [orders, setOrders] = useState<RepairOrder[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isConnected, setIsConnected] = useState(true);
  const [hasPendingSync, setHasPendingSync] = useState(false);
  
  // PAGINATION STATE
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const PAGE_SIZE = 50;

  const saveToQueue = (order: RepairOrder) => {
      try {
          const currentQueue = JSON.parse(localStorage.getItem('darwin_pending_orders_v2') || '[]');
          if (!currentQueue.find((o: RepairOrder) => o.id === order.id)) {
              currentQueue.push(order);
              localStorage.setItem('darwin_pending_orders_v2', JSON.stringify(currentQueue));
              setHasPendingSync(true);
          }
      } catch (e) { console.error("Could not save to queue", e); }
  };

  const removeFromQueue = (orderId: string) => {
      try {
          const currentQueue = JSON.parse(localStorage.getItem('darwin_pending_orders_v2') || '[]');
          const newQueue = currentQueue.filter((o: RepairOrder) => o.id !== orderId);
          localStorage.setItem('darwin_pending_orders_v2', JSON.stringify(newQueue));
          if (newQueue.length === 0) setHasPendingSync(false);
      } catch (e) { console.error("Error removing from queue", e); }
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { type, message, id }]);
    setTimeout(() => { setNotifications(prev => prev.filter(n => n.id !== id)); }, 5000);
  };

  const clearNotification = (id: number) => {
      setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // --- ROBUST HYBRID FETCH (FIXED) ---
  const fetchOrders = async (pageIndex: number, reset = false) => {
    if (!supabase) return;
    setIsLoadingOrders(true);
    
    if (reset) {
        setPage(0);
        pageIndex = 0;
    }

    try {
        if (reset) {
            // QUERY 1: ACTIVE ORDERS (BROAD DEFINITION)
            // Fetch EVERYTHING that is NOT 'Entregado' AND NOT 'Cancelado'.
            const { data: activeData, error: activeError } = await supabase
                .from('orders')
                .select('*')
                .neq('status', OrderStatus.RETURNED) // 'Entregado'
                .neq('status', OrderStatus.CANCELED)
                .order('priority', { ascending: false }) 
                .order('createdAt', { ascending: false });

            if (activeError) throw activeError;

            // QUERY 2: HISTORY (Paged)
            // Only fetch finished orders with pagination
            const { data: historyData, error: historyError } = await supabase
                .from('orders')
                .select('*')
                .in('status', [OrderStatus.RETURNED, OrderStatus.CANCELED])
                .order('createdAt', { ascending: false })
                .range(0, PAGE_SIZE - 1);

            if (historyError) throw historyError;

            // Merge & Deduplicate
            const combined = [...(activeData || []), ...(historyData || [])];
            const uniqueMap = new Map();
            combined.forEach(o => uniqueMap.set(o.id, o));
            
            setOrders(Array.from(uniqueMap.values()));
            setHasMore((historyData?.length || 0) >= PAGE_SIZE);
            setIsConnected(true);

            // Check Queue
            const pending = JSON.parse(localStorage.getItem('darwin_pending_orders_v2') || '[]');
            if (pending.length > 0) setHasPendingSync(true);

        } else {
            // LOAD MORE: Only fetch deeper History
            const from = pageIndex * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;

            const { data: historyData, error: historyError } = await supabase
                .from('orders')
                .select('*')
                .in('status', [OrderStatus.RETURNED, OrderStatus.CANCELED])
                .order('createdAt', { ascending: false })
                .range(from, to);

            if (historyError) throw historyError;

            if (historyData && historyData.length > 0) {
                setOrders(prev => {
                    const currentIds = new Set(prev.map(o => o.id));
                    const uniqueNew = historyData.filter(o => !currentIds.has(o.id));
                    return [...prev, ...uniqueNew];
                });
            }
            setHasMore((historyData?.length || 0) >= PAGE_SIZE);
        }
    } catch (error) {
        console.error("Error fetching orders (Context):", error);
        // Fallback to basic fetch if complex query fails
        try {
             const { data: emergencyData } = await supabase
                .from('orders')
                .select('*')
                .order('createdAt', { ascending: false })
                .limit(50);
             if (emergencyData) setOrders(emergencyData as RepairOrder[]);
        } catch (e) {
             setIsConnected(false);
        }
    } finally {
        setIsLoadingOrders(false);
    }
  };

  const loadMoreOrders = async () => {
      if (!hasMore || isLoadingOrders) return;
      const nextPage = page + 1;
      setPage(nextPage);
      await fetchOrders(nextPage);
  };

  useEffect(() => {
      fetchOrders(0, true);
      
      if (supabase) {
          const channel = supabase.channel('main_db_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
                if (payload.eventType === 'INSERT') {
                    setOrders(prev => [payload.new as RepairOrder, ...prev]);
                } else if (payload.eventType === 'UPDATE') {
                    setOrders(prev => prev.map(o => o.id === payload.new.id ? { ...payload.new } as RepairOrder : o));
                } else if (payload.eventType === 'DELETE') {
                    setOrders(prev => prev.filter(o => o.id !== payload.old.id));
                }
            })
            .subscribe();
          return () => { supabase.removeChannel(channel); };
      }
  }, []);

  const searchOrder = async (term: string) => {
      if (!term || term.length < 3 || !supabase) return;
      const cleanTerm = term.trim();
      let query = supabase.from('orders').select('*').limit(50);
      
      if (/^\d+$/.test(cleanTerm)) { 
          query = query.or(`readable_id.eq.${cleanTerm},id.ilike.%${cleanTerm}%`); 
      } else { 
          query = query.or(`id.ilike.%${cleanTerm}%,customer->>name.ilike.%${cleanTerm}%,deviceModel.ilike.%${cleanTerm}%,imei.ilike.%${cleanTerm}%`); 
      }
      
      const { data, error } = await query;
      if (data && !error) {
          const newOrders = data as RepairOrder[];
          setOrders(prev => {
              const currentIds = new Set(prev.map(o => o.id));
              const uniqueNew = newOrders.filter(o => !currentIds.has(o.id));
              return [...uniqueNew, ...prev]; // Prepend matches
          });
      }
  };

  const addOrder = async (order: RepairOrder): Promise<RepairOrder | null> => {
    saveToQueue(order);
    setOrders(prev => [order, ...prev]);
    if (!supabase) return order;
    try {
        const { data, error } = await supabase.from('orders').insert([order]).select().single();
        if (error) return order;
        removeFromQueue(order.id);
        const createdOrder = data as RepairOrder;
        setOrders(prev => prev.map(o => o.id === order.id ? createdOrder : o));
        return createdOrder; 
    } catch (e) { return order; }
  };

  const validateOrder = async (id: string, validatorName: string) => { 
      await updateOrderDetails(id, { isValidated: true }); 
      await addOrderLog(id, OrderStatus.PENDING, "✅ Ingreso Validado por Administración", validatorName, 'SUCCESS'); 
  };

  const recordOrderLog = async (id: string, actionType: string, message: string, metadata?: any, logType: LogType = 'INFO', userName: string = 'Sistema') => {
      if (!supabase) return;
      const order = orders.find(o => o.id === id);
      const currentHistory = order?.history || [];
      
      const newLog = {
          date: new Date().toISOString(),
          status: order?.status || OrderStatus.PENDING,
          note: message,
          technician: userName,
          logType,
          action_type: actionType,
          actor_user_id: undefined,
          actor_role: undefined,
          actor_branch: undefined,
          metadata
      };

      const newHistory = [...currentHistory, newLog];
      const updates = { history: newHistory };
      
      // RESTORED OPTIMISTIC UPDATE
      setOrders(prev => prev.map(o => o.id === id ? { ...o, ...updates } : o));
      const { error } = await supabase.from('orders').update(updates).eq('id', id);
      if (error) {
          // Rollback on error
          setOrders(prev => prev.map(o => o.id === id ? order! : o));
          throw error;
      }
  };

  // Legacy wrapper
  const addOrderLog = async (id: string, status: OrderStatus, note: string, technician?: string, logType: LogType = 'INFO') => {
      await recordOrderLog(id, 'LEGACY_LOG', note, null, logType, technician);
  };

  const updateOrderDetails = async (id: string, updates: Partial<RepairOrder>, auditReason?: string) => {
    if (!supabase) return;
    
    // 1. Get Current Order State
    const currentOrder = orders.find(o => o.id === id);
    if (!currentOrder) return;

    // 2. Detect Changes (Anti-cambiazo & Audit)
    const logsToCreate: { action: string, msg: string, meta: any, type: LogType }[] = [];

    // A) Ficha Técnica
    if (updates.imei && updates.imei !== currentOrder.imei) {
        logsToCreate.push({ action: 'IMEI_CHANGED', msg: `🆔 IMEI Modificado: ${currentOrder.imei} -> ${updates.imei}`, meta: { before: currentOrder.imei, after: updates.imei }, type: 'WARNING' });
    }
    if (updates.deviceModel && updates.deviceModel !== currentOrder.deviceModel) {
        logsToCreate.push({ action: 'MODEL_CHANGED', msg: `📱 Modelo Modificado: ${currentOrder.deviceModel} -> ${updates.deviceModel}`, meta: { before: currentOrder.deviceModel, after: updates.deviceModel }, type: 'WARNING' });
    }
    if (updates.devicePassword && updates.devicePassword !== currentOrder.devicePassword) {
        logsToCreate.push({ action: 'PASSWORD_CHANGED', msg: `🔐 Contraseña/Patrón Actualizado`, meta: { changed: true }, type: 'INFO' });
    }
    if (updates.accessories && updates.accessories !== currentOrder.accessories) {
        logsToCreate.push({ action: 'ACCESSORIES_UPDATED', msg: `🎒 Accesorios Actualizados`, meta: { before: currentOrder.accessories, after: updates.accessories }, type: 'INFO' });
    }
    if (updates.priority && updates.priority !== currentOrder.priority) {
        logsToCreate.push({ action: 'PRIORITY_CHANGED', msg: `🔥 Prioridad Cambiada: ${currentOrder.priority} -> ${updates.priority}`, meta: { before: currentOrder.priority, after: updates.priority }, type: 'WARNING' });
    }
    if (updates.deadline && updates.deadline !== currentOrder.deadline) {
         const oldD = new Date(currentOrder.deadline).toLocaleString();
         const newD = new Date(updates.deadline).toLocaleString();
         logsToCreate.push({ action: 'DEADLINE_CHANGED', msg: `📅 Fecha Compromiso: ${oldD} -> ${newD}`, meta: { before: currentOrder.deadline, after: updates.deadline }, type: 'WARNING' });
    }

    // B) Status Change (if passed in updates)
    if (updates.status && updates.status !== currentOrder.status) {
         logsToCreate.push({ action: 'STATUS_CHANGED', msg: `Estado cambiado a ${updates.status}`, meta: { before: currentOrder.status, after: updates.status }, type: 'INFO' });
    }

    // C) Financials (Expenses/Parts) - Checking if array length changed or content changed
    if (updates.expenses) {
        const oldLen = currentOrder.expenses?.length || 0;
        const newLen = updates.expenses.length;
        if (newLen > oldLen) logsToCreate.push({ action: 'EXPENSE_ADDED', msg: `💸 Gasto Agregado`, meta: { count: newLen }, type: 'EXPENSE' });
        else if (newLen < oldLen) logsToCreate.push({ action: 'EXPENSE_REMOVED', msg: `🗑️ Gasto Eliminado`, meta: { count: newLen }, type: 'WARNING' });
    }

    // D) Explicit Audit Reason
    if (auditReason) {
        logsToCreate.push({ action: 'AUDIT_LOG', msg: auditReason, meta: null, type: 'WARNING' });
    }

    // 3. Apply Updates Locally
    const updatedOrder = { ...currentOrder, ...updates };
    
    // 4. Append Logs to History (Optimistic)
    const newHistoryLogs = logsToCreate.map(l => ({
        date: new Date().toISOString(),
        status: updatedOrder.status,
        note: l.msg,
        technician: 'Sistema', // Ideally passed in, but defaulting to Sistema for auto-logs
        logType: l.type,
        action_type: l.action,
        metadata: l.meta
    }));

    const finalHistory = [...(updatedOrder.history || []), ...newHistoryLogs];
    updatedOrder.history = finalHistory;

    // RESTORED OPTIMISTIC UPDATE
    setOrders(prev => prev.map(o => o.id === id ? updatedOrder : o));
    
    // 5. Persist to DB
    const { error } = await supabase.from('orders').update({ ...updates, history: finalHistory }).eq('id', id);
    if (error) {
        // Rollback on error
        setOrders(prev => prev.map(o => o.id === id ? currentOrder : o));
        throw error;
    }
  };

  const updateOrderStatus = async (id: string, status: OrderStatus, note?: string) => {
      if (!supabase) return;
      
      const order = orders.find(o => o.id === id);
      if (!order) return;

      const logNote = note || `Cambio de estado a ${status}`;
      
      const newLog = {
          date: new Date().toISOString(),
          status: status,
          note: logNote,
          technician: 'Sistema', 
          logType: 'INFO' as LogType,
          action_type: 'STATUS_CHANGED',
          metadata: { status }
      };

      const newHistory = [...(order.history || []), newLog];
      const updates = { status, history: newHistory };

      // Optimistic Update
      setOrders(prev => prev.map(o => o.id === id ? { ...o, ...updates } : o));

      const { error } = await supabase.from('orders').update(updates).eq('id', id);
      if (error) {
          setOrders(prev => prev.map(o => o.id === id ? order : o));
          throw error;
      }
  };
  
  const deleteOrder = async (id: string) => { if (!supabase) return; setOrders(prev => prev.filter(o => o.id !== id)); await supabase.from('orders').delete().eq('id', id); };
  
  const fetchOrderById = async (id: string) => { 
      let found = orders.find(o => o.id === id || o.readable_id?.toString() === id); 
      if (!found && supabase) { 
          const { data } = await supabase.from('orders').select('*').or(`id.eq.${id},readable_id.eq.${id}`).single(); 
          if (data) found = data as RepairOrder; 
      } 
      return found; 
  };

  const addPayments = async (orderId: string, newPayments: Payment[]) => {
      if (!supabase) return;
      const order = orders.find(o => o.id === orderId);
      if (!order) return;

      if (order.status === OrderStatus.RETURNED) {
          throw new Error("No se pueden agregar pagos a una orden ya entregada.");
      }

      // Idempotency Check: Prevent duplicate payments
      const existingIds = new Set((order.payments || []).map(p => p.id));
      for (const p of newPayments) {
          if (existingIds.has(p.id)) {
              throw new Error("Transacción duplicada detectada");
          }
      }

      const updatedPayments = [...(order.payments || []), ...newPayments];
      
      const newLogs = newPayments.map(p => {
          let logNote = "";
          let logType: LogType = 'SUCCESS';
          let actionType = 'PAYMENT_ADDED';
          
          if (p.method === 'CREDIT') { 
              logNote = `📝 CRÉDITO: $${Math.abs(p.amount)}`; 
              logType = 'WARNING'; 
              actionType = 'CREDIT_ADDED';
          } 
          else if (p.amount < 0 || p.isRefund) { 
              logNote = `💸 REEMBOLSO: -$${Math.abs(p.amount)}`; 
              logType = 'DANGER'; 
              actionType = 'REFUND_PROCESSED';
          } 
          else { 
              logNote = `💰 PAGO ${p.method}: $${Math.abs(p.amount)}`; 
          }
          
          return { 
              date: new Date().toISOString(), 
              status: order.status, 
              note: logNote, 
              technician: p.cashierName, 
              logType,
              action_type: actionType,
              metadata: { amount: p.amount, method: p.method, paymentId: p.id }
          };
      });
      
      const updatedHistory = [...(order.history || []), ...newLogs];
      // Removed manual setOrders to rely on Realtime Listener
      // setOrders(prev => prev.map(o => o.id === orderId ? { ...o, payments: updatedPayments, history: updatedHistory } : o));
      const { error } = await supabase.from('orders').update({ payments: updatedPayments, history: updatedHistory }).eq('id', orderId);
      if (error) throw error;
  };

  const editPayment = async (orderId: string, paymentId: string, updates: Partial<Payment>) => {
      if (!supabase) return;
      const order = orders.find(o => o.id === orderId);
      if (!order || !order.payments) return;
      const updatedPayments = order.payments.map(p => p.id === paymentId ? { ...p, ...updates } : p);
      await updateOrderDetails(orderId, { payments: updatedPayments });
  };

  const performCashClosing = async (cashierIds: string, systemTotal: number, actualTotal: number, adminId: string, paymentIds: string[]) => {
      if (!supabase) return;
      const closingId = `close-${Date.now()}`;
      
      const closing: CashClosing = { id: closingId, cashierId: cashierIds, adminId, timestamp: Date.now(), systemTotal, actualTotal, difference: actualTotal - systemTotal };
      await supabase.from('cash_closings').insert([closing]);
      
      for (const order of orders) {
          if (!order.payments) continue;
          const hasTargetPayment = order.payments.some(p => paymentIds.includes(p.id));
          if (hasTargetPayment) {
              const updatedPayments = order.payments.map(p => paymentIds.includes(p.id) ? { ...p, reconciled: true, closingId } : p);
              await supabase.from('orders').update({ payments: updatedPayments }).eq('id', order.id);
              // Removed manual setOrders to rely on Realtime Listener
              // setOrders(prev => prev.map(o => o.id === order.id ? { ...o, payments: updatedPayments } : o));
          }
      }
  };

  const getDashboardStats = async (): Promise<DashboardStats> => {
      const empty = { total: 0, priorities: 0, pending: 0, inRepair: 0, repaired: 0, returned: 0, storeStock: 0, totalRevenue: 0, totalExpenses: 0, totalProfit: 0, revenueByBranch: { t1: 0, t4: 0 } };
      if (!supabase) return empty;
      
      try {
          const { data, error } = await supabase.rpc('get_dashboard_stats_v2');
          if (error || !data) return empty;
          return {
              ...empty,
              total: data.total,
              totalRevenue: data.revenue,
              pending: data.pending,
              inRepair: data.inRepair,
              storeStock: data.storeStock
          };
      } catch (e) {
          return empty;
      }
  };

  const fetchCashierActiveOrders = async (cashierIds: string[]) => { 
      // await fetchOrders(0, true); // DISABLED to prevent freeze/loop
      console.log("fetchCashierActiveOrders disabled to rely on realtime");
  };

  const resolveReturn = async (id: string, approve: boolean, approverName: string) => { 
      if (!supabase) return; 
      const o = orders.find(x => x.id === id); 
      if (!o || !o.returnRequest) return; 
      const updatedRequest: ReturnRequest = { ...o.returnRequest, status: approve ? 'APPROVED' : 'REJECTED', approvedBy: approverName }; 
      const updates: Partial<RepairOrder> = { returnRequest: updatedRequest }; 
      if (approve) { updates.status = OrderStatus.REPAIRED; updates.isRepairSuccessful = false; updates.finalPrice = o.returnRequest.diagnosticFee || 0; updates.estimatedCost = o.returnRequest.diagnosticFee || 0; updates.pointsAwarded = 0; }
      await updateOrderDetails(id, updates); 
      const logNote = approve ? `✅ Devolución APROBADA. Costo Chequeo: $${o.returnRequest.diagnosticFee}` : `❌ Devolución RECHAZADA.`;
      await recordOrderLog(id, approve ? 'RETURN_APPROVED' : 'RETURN_REJECTED', logNote, { approved: approve, fee: o.returnRequest.diagnosticFee }, approve ? 'SUCCESS' : 'DANGER', approverName); 
  };

  const initiateTransfer = async (orderId: string, targetBranch: string, userName: string) => { 
      await updateOrderDetails(orderId, { transferStatus: 'PENDING', transferTarget: targetBranch, assignedTo: null }); 
      await recordOrderLog(orderId, 'TRANSFER_REQUESTED', `🚚 TRASLADO INICIADO hacia ${targetBranch}`, { target: targetBranch }, 'WARNING', userName); 
  };

  const confirmTransfer = async (orderId: string, userName: string) => { 
      const order = orders.find(o => o.id === orderId); 
      await updateOrderDetails(orderId, { currentBranch: order?.transferTarget || undefined, transferStatus: 'COMPLETED', transferTarget: null }); 
      await recordOrderLog(orderId, 'TRANSFER_COMPLETED', `📥 TRASLADO RECIBIDO`, { from: order?.currentBranch }, 'SUCCESS', userName); 
  };

  const assignOrder = async (orderId: string, userId: string, userName: string, currentStatus: OrderStatus = OrderStatus.PENDING) => { 
      const updates: any = { assignedTo: userId }; 
      let nextStatus = currentStatus; 
      if (currentStatus === OrderStatus.PENDING) { updates.status = OrderStatus.DIAGNOSIS; nextStatus = OrderStatus.DIAGNOSIS; } 
      await updateOrderDetails(orderId, updates); 
      await recordOrderLog(orderId, 'ASSIGNMENT_CHANGED', `👤 ASIGNADO A TÉCNICO: ${userName}`, { assignedTo: userId }, 'INFO', userName); 
      return true; 
  };
  
  const requestAssignment = async (orderId: string, targetUserId: string, targetUserName: string, requesterName: string) => { 
      await updateOrderDetails(orderId, { pending_assignment_to: targetUserId }); 
      await recordOrderLog(orderId, 'ASSIGNMENT_REQUESTED', `🔄 SOLICITUD TRASPASO hacia ${targetUserName}`, { targetUser: targetUserName }, 'WARNING', requesterName); 
  };

  const resolveAssignmentRequest = async (orderId: string, accept: boolean, userId: string, userName: string) => { 
      const updates: any = { pending_assignment_to: null }; 
      if (accept) updates.assignedTo = userId; 
      await updateOrderDetails(orderId, updates); 
      await recordOrderLog(orderId, accept ? 'ASSIGNMENT_ACCEPTED' : 'ASSIGNMENT_REJECTED', accept ? `✅ TRASPASO ACEPTADO` : `❌ TRASPASO RECHAZADO`, { accepted: accept }, accept ? 'SUCCESS' : 'DANGER', userName); 
  };

  const requestReturn = async (orderId: string, reason: string, fee: number, requesterName: string) => { 
      const request: ReturnRequest = { reason, diagnosticFee: fee, requestedBy: requesterName, requestedAt: Date.now(), status: 'PENDING' }; 
      await updateOrderDetails(orderId, { returnRequest: request }); 
      await recordOrderLog(orderId, 'RETURN_REQUESTED', `↩️ SOLICITUD DEVOLUCIÓN: ${reason}`, { reason, fee }, 'WARNING', requesterName); 
  };

  const sendTechMessage = async (orderId: string, message: string, senderName: string) => { await updateOrderDetails(orderId, { techMessage: { message, sender: senderName, timestamp: Date.now(), pending: true } }); };
  const resolveTechMessage = async (orderId: string) => { const order = orders.find(o => o.id === orderId); if (order?.techMessage) await updateOrderDetails(orderId, { techMessage: { ...order.techMessage, pending: false } }); };
  
  const updateOrderFinancials = async (id: string, updates: Partial<RepairOrder>) => { await updateOrderDetails(id, updates); };

  const createWarrantyOrder = async (originalOrder: RepairOrder, reason: string): Promise<string> => { const newId = `INV-${Math.floor(10000 + Math.random() * 90000)}`; const warrantyOrder: RepairOrder = { ...originalOrder, id: newId, readable_id: undefined, orderType: OrderType.WARRANTY, relatedOrderId: originalOrder.id, status: OrderStatus.PENDING, createdAt: Date.now(), deadline: Date.now() + 48 * 60 * 60 * 1000, history: [{ date: new Date().toISOString(), status: OrderStatus.PENDING, note: `🛡️ INGRESO POR GARANTÍA`, technician: 'Sistema', logType: 'WARNING' }], estimatedCost: 0, finalPrice: 0, partsCost: 0, payments: [], expenses: [], technicianNotes: `[GARANTÍA] Razón: ${reason}`, pointsAwarded: 0, pointRequest: undefined, assignedTo: null, pending_assignment_to: null, isValidated: false, completedAt: undefined }; await addOrder(warrantyOrder); return newId; };

  const debatePoints = async (orderId: string, userName: string) => {
      const order = orders.find(o => o.id === orderId);
      if (!order || !order.pointRequest) return;
      const updatedRequest: PointRequest = { ...order.pointRequest, status: 'DEBATED', approvedBy: userName };
      await updateOrderDetails(orderId, { 
          pointRequest: updatedRequest,
          techMessage: { message: "⚠️ PUNTOS EN DEBATE: Por favor contacta a supervisión.", sender: userName, timestamp: Date.now(), pending: true }
      });
      await recordOrderLog(orderId, 'POINTS_DEBATED', `⚠️ PUNTOS EN DEBATE por ${userName}`, { requested: order.pointRequest.requestedPoints }, 'WARNING', userName);
  };

  const requestExternalRepair = async (orderId: string, workshop: 'BRENY NIZAO' | 'JUNIOR BARON' | 'OTRO', reason: string, userName: string) => {
      const request: ExternalRepairRequest = { targetWorkshop: workshop, reason: reason, requestedBy: userName, requestedAt: Date.now(), status: 'PENDING' };
      await updateOrderDetails(orderId, { externalRepair: request });
      await recordOrderLog(orderId, 'EXTERNAL_REPAIR_REQUESTED', `🛠️ SOLICITUD ENVÍO A ${workshop}`, { workshop, reason }, 'WARNING', userName);
  };

  const resolveExternalRepair = async (orderId: string, approve: boolean, userName: string) => {
      const order = orders.find(o => o.id === orderId);
      if (!order || !order.externalRepair) return;
      const updatedRequest: ExternalRepairRequest = { ...order.externalRepair, status: approve ? 'APPROVED' : 'REJECTED', approvedBy: userName };
      const updates: Partial<RepairOrder> = { externalRepair: updatedRequest };
      if (approve) { updates.status = OrderStatus.EXTERNAL; updates.assignedTo = null; } 
      await updateOrderDetails(orderId, updates);
      await recordOrderLog(orderId, approve ? 'EXTERNAL_REPAIR_APPROVED' : 'EXTERNAL_REPAIR_REJECTED', approve ? `✅ ENVÍO APROBADO` : `❌ ENVÍO RECHAZADO`, { workshop: order.externalRepair.targetWorkshop }, approve ? 'SUCCESS' : 'DANGER', userName);
  };

  const receiveFromExternal = async (orderId: string, notes: string, userName: string) => {
      const updates: Partial<RepairOrder> = { 
          status: OrderStatus.DIAGNOSIS, // Return to diagnosis for checkup
          assignedTo: null, // Needs reassignment
          currentBranch: 'T4', // Return to main branch
          externalRepair: undefined // Clear external status
      };
      await updateOrderDetails(orderId, updates);
      await recordOrderLog(orderId, 'EXTERNAL_REPAIR_RETURNED', `📍 RETORNO DE TALLER EXTERNO. Nota: ${notes}`, { notes }, 'INFO', userName);
  };

  return (
    <OrderContext.Provider value={{ 
        orders, notifications, isConnected, hasPendingSync,
        loadMoreOrders, hasMore, isLoadingOrders,
        fetchOrderById, addOrder, updateOrderDetails, addOrderLog, updateOrderStatus, deleteOrder,
        addPayments, editPayment, performCashClosing, fetchCashierActiveOrders,
        getDashboardStats, showNotification, clearNotification, searchOrder,
        resolveReturn, 
        initiateTransfer, confirmTransfer, assignOrder, requestAssignment, resolveAssignmentRequest, requestReturn, sendTechMessage, resolveTechMessage, updateOrderFinancials, createWarrantyOrder,
        validateOrder, debatePoints,
        requestExternalRepair, resolveExternalRepair, receiveFromExternal,
        recordOrderLog
    }}>
      {children}
    </OrderContext.Provider>
  );
};

export const useOrders = () => {
  const context = useContext(OrderContext);
  if (!context) throw new Error('useOrders must be used within an OrderProvider');
  return context;
};
