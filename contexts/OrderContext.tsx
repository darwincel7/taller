
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { auditService } from '../services/auditService';
import { supabase } from '../services/supabase';
import { orderService } from '../services/orderService';
import { useAuth } from './AuthContext';
import { 
  RepairOrder, AppNotification, 
  OrderStatus, LogType, Payment, RequestStatus, TransferStatus, ActionType,
  DashboardStats, ReturnRequest, OrderType, ExternalRepairRequest, CashClosing, PointRequest, Expense
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
  updateOrderStatus: (id: string, status: OrderStatus, note?: string, technician?: string) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
  searchOrder: (term: string) => Promise<void>;
  validateOrder: (id: string, validatorName: string) => Promise<void>;
  
  // Legacy Cash Logic
  addPayments: (orderId: string, payments: Payment[]) => Promise<void>;
  editPayment: (orderId: string, paymentId: string, updates: Partial<Payment>) => Promise<void>;
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
  resolveTechMessage: (orderId: string, userName?: string) => Promise<void>;
  
  updateOrderFinancials: (id: string, updates: Partial<RepairOrder>) => Promise<void>;
  createWarrantyOrder: (originalOrder: RepairOrder, reason: string, type?: 'WARRANTY' | 'QUALITY', userName?: string) => Promise<string>;
  debatePoints: (orderId: string, userName: string) => Promise<void>;
  
  requestExternalRepair: (orderId: string, workshop: 'BRENY NIZAO' | 'JUNIOR BARON' | 'OTRO', reason: string, userName: string) => Promise<void>;
  resolveExternalRepair: (orderId: string, approve: boolean, userName: string) => Promise<void>;
  receiveFromExternal: (orderId: string, notes: string, userName: string) => Promise<void>;
  recordOrderLog: (id: string, actionType: ActionType, message: string, metadata?: any, logType?: LogType, userName?: string) => Promise<void>;
  
  // Parts Requests
  addPartRequest: (orderId: string, partName: string, userName: string) => Promise<void>;
  resolvePartRequest: (orderId: string, requestId: string, status: RequestStatus, details?: { source?: string, price?: number, notes?: string }, userName?: string) => Promise<void>;

  // Filters & Search
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  statusFilter: OrderStatus[];
  setStatusFilter: (status: OrderStatus[]) => void;
  branchFilter: string | undefined;
  setBranchFilter: (branch: string | undefined) => void;
  
  // UI Persistence
  filterTab: string;
  setFilterTab: (tab: string) => void;
  viewMode: 'CARDS' | 'TABLE';
  setViewMode: (mode: 'CARDS' | 'TABLE') => void;
  sortBy: string;
  setSortBy: (sort: string) => void;
  externalFilter: string;
  setExternalFilter: (filter: string) => void;
}

const OrderContext = createContext<OrderContextType | undefined>(undefined);

// No longer using strict whitelist to avoid missing custom states or Store items.
// Using 'neq' logic instead.

export const OrderProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser, users } = useAuth();
  const queryClient = useQueryClient();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const [statusFilter, setStatusFilter] = useState<OrderStatus[]>([]);
  const [branchFilter, setBranchFilter] = useState<string | undefined>(undefined);

  // UI Persistence States
  const [filterTab, setFilterTab] = useState<string>(() => sessionStorage.getItem('darwin_filter_tab') || 'TALLER');
  const [viewMode, setViewMode] = useState<'CARDS' | 'TABLE'>(() => (localStorage.getItem('darwin_list_view') as 'CARDS' | 'TABLE') || 'TABLE');
  const [sortBy, setSortBy] = useState<string>(() => sessionStorage.getItem('darwin_sort_by') || 'PRIORITY');
  const [externalFilter, setExternalFilter] = useState<string>(() => sessionStorage.getItem('darwin_external_filter') || 'ALL');

  useEffect(() => { sessionStorage.setItem('darwin_filter_tab', filterTab); }, [filterTab]);
  useEffect(() => { localStorage.setItem('darwin_list_view', viewMode); }, [viewMode]);
  useEffect(() => { sessionStorage.setItem('darwin_sort_by', sortBy); }, [sortBy]);
  useEffect(() => { sessionStorage.setItem('darwin_external_filter', externalFilter); }, [externalFilter]);

  // --- QUERIES ---
  
  // Infinite query for orders list
  const {
    data: ordersData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingOrders,
    refetch: refetchOrders
  } = useInfiniteQuery({
    queryKey: ['orders', { status: statusFilter, branch: branchFilter, search: debouncedSearchTerm }],
    queryFn: ({ pageParam = 0 }) => orderService.getOrders({ 
      page: pageParam, 
      status: statusFilter, 
      branch: branchFilter, 
      searchTerm: debouncedSearchTerm 
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => lastPage.hasMore ? allPages.length : undefined,
  });

  const orders = useMemo(() => {
    return ordersData?.pages.flatMap(page => page.data) || [];
  }, [ordersData]);

  // Dashboard stats query
  const { data: stats } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: () => orderService.getDashboardStats(),
    refetchInterval: 1000 * 60 * 5, // Refetch every 5 minutes
  });

  // --- MUTATIONS ---

  const addOrderMutation = useMutation({
    mutationFn: orderService.createOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['ordersWithPartRequests'] });
      queryClient.invalidateQueries({ queryKey: ['crmData'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      showNotification('success', 'Orden creada correctamente');
    },
    onError: (error: any) => {
      showNotification('error', `Error al crear orden: ${error.message}`);
    }
  });

  const updateOrderMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string, updates: Partial<RepairOrder> }) => 
      orderService.updateOrder(id, updates),
    onSuccess: (data) => {
      // Optimistically update ordersWithPartRequests
      queryClient.setQueryData(['ordersWithPartRequests'], (oldData: RepairOrder[] | undefined) => {
        if (!oldData) return oldData;
        return oldData.map(order => order.id === data.id ? data : order);
      });
      
      // Also update paginated orders
      queryClient.setQueryData(['orders'], (oldData: any) => {
        if (!oldData || !oldData.pages) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            data: page.data.map((order: RepairOrder) => order.id === data.id ? data : order)
          }))
        };
      });

      queryClient.setQueryData(['order', data.id], data);

      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['ordersWithPartRequests'] });
      queryClient.invalidateQueries({ queryKey: ['order', data.id] });
      queryClient.invalidateQueries({ queryKey: ['crmData'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
    onError: (error: any) => {
      showNotification('error', `Error al actualizar orden: ${error.message}`);
    }
  });

  const deleteOrderMutation = useMutation({
    mutationFn: orderService.deleteOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['ordersWithPartRequests'] });
      queryClient.invalidateQueries({ queryKey: ['crmData'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      showNotification('success', 'Orden eliminada');
    },
    onError: (error: any) => {
      showNotification('error', `Error al eliminar orden: ${error.message}`);
    }
  });

  // --- HELPERS ---

  const showNotification = useCallback((type: 'success' | 'error', message: string) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { type, message, id }]);
    setTimeout(() => { setNotifications(prev => prev.filter(n => n.id !== id)); }, 5000);
  }, []);

  const clearNotification = useCallback((id: number) => {
      setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // Realtime subscription
  useEffect(() => {
    if (!supabase) return;

    const channel = supabase.channel('orders_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        // Invalidate queries to trigger refetch
        queryClient.invalidateQueries({ queryKey: ['orders'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const fetchOrderById = useCallback(async (id: string) => {
    // Try to find in cache first
    const cachedOrder = orders.find(o => o.id === id || o.readable_id?.toString() === id);
    if (cachedOrder) return cachedOrder;

    try {
      return await orderService.getOrderById(id);
    } catch (e) {
      return undefined;
    }
  }, [orders]);

  const searchOrder = useCallback(async (term: string) => {
    setSearchTerm(term);
  }, []);

  const loadMoreOrders = useCallback(async () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // --- ACTIONS (Refactored to use mutations or direct calls) ---

  const updateOrderDetails = useCallback(async (id: string, updates: Partial<RepairOrder>, auditReason?: string) => {
    let currentOrder = orders.find(o => o.id === id);
    if (!currentOrder) {
      try {
        currentOrder = await orderService.getOrderById(id);
      } catch (e) {
        console.error("Error fetching order for updateOrderDetails:", e);
      }
    }
    if (!currentOrder) return;

    // Logic for logs (kept from original)
    const logsToCreate: any[] = [];
    if (updates.imei && updates.imei !== currentOrder.imei) logsToCreate.push({ action: 'IMEI_CHANGED', msg: `🆔 IMEI Modificado: ${currentOrder.imei} -> ${updates.imei}`, type: 'WARNING' });
    // ... (rest of the log logic can be simplified or kept)
    
    // For now, let's keep it simple and just update
    if (updates.status) {
      const wasCompleted = currentOrder.status === OrderStatus.REPAIRED || currentOrder.status === OrderStatus.RETURNED;
      const isCompleted = updates.status === OrderStatus.REPAIRED || updates.status === OrderStatus.RETURNED;
      if (wasCompleted && !isCompleted) {
          updates.pointsAwarded = 0;
          updates.pointRequest = null as any;
          updates.pointsEarnedBy = null as any;
          updates.pointsSplit = null as any;
          updates.originalPointsAwarded = null as any;
      }
    }
    await updateOrderMutation.mutateAsync({ id, updates });
  }, [orders, updateOrderMutation]);

  const updateOrderStatus = useCallback(async (id: string, status: OrderStatus, note?: string, technician?: string) => {
    let order = orders.find(o => o.id === id);
    if (!order) {
      try { order = await orderService.getOrderById(id); } catch (e) { console.error(e); }
    }
    if (!order) return;
    
    const updates: Partial<RepairOrder> = { status };
    
    const wasCompleted = order.status === OrderStatus.REPAIRED || order.status === OrderStatus.RETURNED;
    const isCompleted = status === OrderStatus.REPAIRED || status === OrderStatus.RETURNED;
    if (wasCompleted && !isCompleted) {
        updates.pointsAwarded = 0;
        updates.pointRequest = null as any;
        updates.pointsEarnedBy = null as any;
        updates.pointsSplit = null as any;
        updates.originalPointsAwarded = null as any;
    }

    if (note) {
      updates.history = [...(order.history || []), { 
        date: new Date().toISOString(), 
        status, 
        note, 
        technician: technician || 'Sistema', 
        logType: LogType.INFO 
      }];
    }
    await updateOrderMutation.mutateAsync({ id, updates });
  }, [orders, updateOrderMutation]);

  const addOrderLog = useCallback(async (id: string, status: OrderStatus, note: string, technician?: string, logType: LogType = LogType.INFO) => {
    let order = orders.find(o => o.id === id);
    if (!order) {
      try {
        order = await orderService.getOrderById(id);
      } catch (e) {
        console.error("Error fetching order for addOrderLog:", e);
      }
    }
    if (!order) return;
    const newHistory = [...(order.history || []), { date: new Date().toISOString(), status, note, technician: technician || 'Sistema', logType }];
    await updateOrderMutation.mutateAsync({ id, updates: { history: newHistory } });
    
    // Global Audit Log
    if (technician && technician !== 'Sistema') {
        const user = users.find(u => u.name === technician);
        auditService.recordLog(
            user || { id: 'system', name: technician },
            'ORDER_LOG',
            note,
            id,
            'ORDER',
            id,
            { status, logType }
        ).catch(console.error);
    }
  }, [orders, updateOrderMutation, users]);

  const recordOrderLog = useCallback(async (id: string, actionType: string, message: string, metadata?: any, logType: LogType = LogType.INFO, userName: string = 'Sistema') => {
    let order = orders.find(o => o.id === id);
    if (!order) {
      try {
        order = await orderService.getOrderById(id);
      } catch (e) {
        console.error("Error fetching order for recordOrderLog:", e);
      }
    }
    if (!order) return;
    const newHistory = [...(order.history || []), { date: new Date().toISOString(), status: order.status, note: message, technician: userName, logType, action_type: actionType, metadata }];
    await updateOrderMutation.mutateAsync({ id, updates: { history: newHistory } });

    // Global Audit Log
    const user = users.find(u => u.name === userName);
    auditService.recordLog(
        user || { id: 'system', name: userName },
        actionType,
        message,
        id,
        'ORDER',
        id,
        metadata
    ).catch(console.error);
  }, [orders, updateOrderMutation, users]);

  // ... (Other functions like addPayments, etc. should also be refactored to use mutations)
  
  const deleteOrder = useCallback(async (id: string) => {
    await deleteOrderMutation.mutateAsync(id);
  }, [deleteOrderMutation]);

  const addOrder = useCallback(async (order: RepairOrder) => {
    return await addOrderMutation.mutateAsync(order);
  }, [addOrderMutation]);

  const addPayments = useCallback(async (orderId: string, newPayments: Payment[]) => {
    let order = orders.find(o => o.id === orderId);
    if (!order) {
      try {
        order = await orderService.getOrderById(orderId);
      } catch (e) {
        console.error("Error fetching order for addPayments:", e);
      }
    }
    if (!order) {
      throw new Error("Orden no encontrada al intentar registrar el abono.");
    }

    if (order.status === OrderStatus.RETURNED) {
      throw new Error("No se pueden agregar pagos a una orden ya entregada.");
    }

    const updatedPayments = [...(order.payments || []), ...newPayments];
    const newLogs = newPayments.map(p => {
      let logNote = "";
      let logType: LogType = LogType.SUCCESS;
      let actionType = 'PAYMENT_ADDED';
      
      if (p.method === 'CREDIT') { 
          logNote = `📝 CRÉDITO: $${Math.abs(p.amount)}`; 
          logType = LogType.WARNING; 
          actionType = 'CREDIT_ADDED';
      } 
      else if (p.amount < 0 || p.isRefund) { 
          logNote = `💸 REEMBOLSO: -$${Math.abs(p.amount)}`; 
          logType = LogType.DANGER; 
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

    // 1. Insert into order_payments table
    const { error: insertError } = await supabase.from('order_payments').insert(
      newPayments.map(p => ({
        id: p.id,
        order_id: orderId,
        amount: p.amount,
        method: p.method,
        cashier_id: p.cashierId,
        cashier_name: p.cashierName,
        is_refund: p.isRefund || false,
        created_at: typeof p.date === 'string' ? new Date(p.date).getTime() : p.date,
        closing_id: p.closingId || null
      }))
    );

    if (insertError) {
      console.error("Error inserting payments:", insertError);
      if (insertError.message.includes('row-level security')) {
        throw new Error(`Error de seguridad en la base de datos (RLS). Por favor, ejecuta el código SQL V15 en Supabase para solucionarlo.`);
      }
      throw new Error(`Error al registrar pago: ${insertError.message}`);
    }

    // 2. Update order history and payments JSONB
    await updateOrderMutation.mutateAsync({ id: orderId, updates: { history: updatedHistory, payments: updatedPayments } });
  }, [orders, updateOrderMutation]);

  const editPayment = useCallback(async (orderId: string, paymentId: string, updates: Partial<Payment>) => {
    let order = orders.find(o => o.id === orderId);
    if (!order) {
      try {
        order = await orderService.getOrderById(orderId);
      } catch (e) {
        console.error("Error fetching order for editPayment:", e);
      }
    }
    if (!order || !order.payments) {
      throw new Error("Orden no encontrada al intentar editar el pago.");
    }
    
    // Update order_payments table
    const dbUpdates: any = {};
    if (updates.amount !== undefined) dbUpdates.amount = updates.amount;
    if (updates.method !== undefined) dbUpdates.method = updates.method;
    if (updates.isRefund !== undefined) dbUpdates.is_refund = updates.isRefund;
    
    if (Object.keys(dbUpdates).length > 0) {
      const { error } = await supabase.from('order_payments').update(dbUpdates).eq('id', paymentId);
      if (error) {
        console.error("Error updating payment:", error);
        throw new Error(`Error al editar pago: ${error.message}`);
      }
    }
    
    // To ensure UI updates, update local cache and JSONB immediately:
    const updatedPayments = order.payments.map(p => p.id === paymentId ? { ...p, ...updates } : p);
    await updateOrderMutation.mutateAsync({ id: orderId, updates: { payments: updatedPayments } });
  }, [orders, updateOrderMutation]);

  const getDashboardStats = useCallback(async (): Promise<DashboardStats> => {
    return stats || { total: 0, priorities: 0, pending: 0, inRepair: 0, repaired: 0, returned: 0, storeStock: 0, totalRevenue: 0, totalExpenses: 0, totalProfit: 0, revenueByBranch: { t1: 0, t4: 0 } };
  }, [stats]);

  const fetchCashierActiveOrders = useCallback(async (cashierIds: string[]) => {
    console.log("fetchCashierActiveOrders relying on realtime");
  }, []);

  const resolveReturn = useCallback(async (id: string, approve: boolean, approverName: string) => {
    let o = orders.find(x => x.id === id);
    if (!o) {
      try { o = await orderService.getOrderById(id); } catch (e) { console.error(e); }
    }
    if (!o || !o.returnRequest) return;
    const updatedRequest: ReturnRequest = { ...o.returnRequest, status: approve ? RequestStatus.APPROVED : RequestStatus.REJECTED, approvedBy: approverName };
    const updates: Partial<RepairOrder> = { returnRequest: updatedRequest };
    if (approve) {
      updates.status = OrderStatus.REPAIRED;
      updates.isRepairSuccessful = false;
      updates.finalPrice = o.returnRequest.diagnosticFee || 0;
      updates.estimatedCost = o.returnRequest.diagnosticFee || 0;
      updates.pointsAwarded = 0;
    }
    
    updates.history = [...(o.history || []), {
      date: new Date().toISOString(),
      status: updates.status || o.status,
      note: approve ? `✅ Devolución sin reparar aprobada por ${approverName}` : `❌ Devolución sin reparar rechazada por ${approverName}`,
      technician: approverName,
      logType: approve ? LogType.SUCCESS : LogType.DANGER,
      action_type: approve ? 'RETURN_APPROVED' as ActionType : 'RETURN_REJECTED' as ActionType
    }];
    
    await updateOrderMutation.mutateAsync({ id, updates });
  }, [orders, updateOrderMutation]);

  const initiateTransfer = useCallback(async (orderId: string, targetBranch: string, userName: string) => {
    let order = orders.find(o => o.id === orderId);
    if (!order) {
      try { order = await orderService.getOrderById(orderId); } catch (e) { console.error(e); }
    }
    if (!order) return;

    const updates: Partial<RepairOrder> = { transferStatus: TransferStatus.PENDING, transferTarget: targetBranch };
    
    // NUNCA quitamos la asignación al trasladar.
    // El técnico que trabajó la orden debe conservar su etiqueta y sus puntos.

    updates.history = [...(order.history || []), {
      date: new Date().toISOString(),
      status: order.status,
      note: `🚚 Traslado iniciado hacia ${targetBranch}`,
      technician: userName,
      logType: LogType.WARNING,
      action_type: 'ORDER_TRANSFERRED' as ActionType
    }];
    await updateOrderMutation.mutateAsync({ id: orderId, updates });
  }, [orders, updateOrderMutation]);

  const confirmTransfer = useCallback(async (orderId: string, userName: string) => {
    let order = orders.find(o => o.id === orderId);
    if (!order) {
      try { order = await orderService.getOrderById(orderId); } catch (e) { console.error(e); }
    }
    if (!order) return;

    const updates: Partial<RepairOrder> = { currentBranch: order.transferTarget || undefined, transferStatus: TransferStatus.COMPLETED, transferTarget: null };
    updates.history = [...(order.history || []), {
      date: new Date().toISOString(),
      status: order.status,
      note: `✅ Traslado recibido en ${order.transferTarget}`,
      technician: userName,
      logType: LogType.SUCCESS,
      action_type: 'ORDER_TRANSFERRED' as ActionType
    }];
    await updateOrderMutation.mutateAsync({ id: orderId, updates });
  }, [orders, updateOrderMutation]);

  const assignOrder = useCallback(async (orderId: string, userId: string, userName: string, currentStatus: OrderStatus = OrderStatus.PENDING) => {
    let order = orders.find(o => o.id === orderId);
    if (!order) {
      try { order = await orderService.getOrderById(orderId); } catch (e) { console.error(e); }
    }
    if (!order) return false;

    const updates: Partial<RepairOrder> = { assignedTo: userId };
    if (currentStatus === OrderStatus.PENDING) updates.status = OrderStatus.DIAGNOSIS;
    
    // Si la orden ya está completada, no debemos borrar los puntos del técnico anterior
    // al reasignarla, a menos que se cambie el estado.
    
    updates.history = [...(order.history || []), {
      date: new Date().toISOString(),
      status: updates.status || order.status,
      note: `👤 Orden asignada a ${userName}`,
      technician: userName,
      logType: LogType.INFO,
      action_type: 'ORDER_ASSIGNED' as ActionType
    }];

    await updateOrderMutation.mutateAsync({ id: orderId, updates });
    return true;
  }, [orders, updateOrderMutation]);

  const requestAssignment = useCallback(async (orderId: string, targetUserId: string, targetUserName: string, requesterName: string) => {
    let order = orders.find(o => o.id === orderId);
    if (!order) {
      try { order = await orderService.getOrderById(orderId); } catch (e) { console.error(e); }
    }
    if (!order) return;

    const updates: Partial<RepairOrder> = { pending_assignment_to: targetUserId };
    updates.history = [...(order.history || []), {
      date: new Date().toISOString(),
      status: order.status,
      note: `🔄 Solicitud de traspaso a ${targetUserName}`,
      technician: requesterName,
      logType: LogType.WARNING,
      action_type: 'ASSIGNMENT_REQUESTED' as ActionType
    }];
    await updateOrderMutation.mutateAsync({ id: orderId, updates });
  }, [orders, updateOrderMutation]);

  const resolveAssignmentRequest = useCallback(async (orderId: string, accept: boolean, userId: string, userName: string) => {
    let order = orders.find(o => o.id === orderId);
    if (!order) {
      try { order = await orderService.getOrderById(orderId); } catch (e) { console.error(e); }
    }
    if (!order) return;

    const updates: Partial<RepairOrder> = { pending_assignment_to: null };
    if (accept) updates.assignedTo = userId;
    
    updates.history = [...(order.history || []), {
      date: new Date().toISOString(),
      status: order.status,
      note: accept ? `✅ Traspaso aceptado por ${userName}` : `❌ Traspaso rechazado por ${userName}`,
      technician: userName,
      logType: accept ? LogType.SUCCESS : LogType.DANGER,
      action_type: accept ? 'ORDER_ASSIGNED' as ActionType : 'ASSIGNMENT_REJECTED' as ActionType
    }];
    await updateOrderMutation.mutateAsync({ id: orderId, updates });
  }, [orders, updateOrderMutation]);

  const requestReturn = useCallback(async (orderId: string, reason: string, fee: number, requesterName: string) => {
    let order = orders.find(o => o.id === orderId);
    if (!order) {
      try { order = await orderService.getOrderById(orderId); } catch (e) { console.error(e); }
    }
    if (!order) return;

    const request: ReturnRequest = { reason, diagnosticFee: fee, requestedBy: requesterName, requestedAt: Date.now(), status: RequestStatus.PENDING };
    const updates: Partial<RepairOrder> = { returnRequest: request };
    updates.history = [...(order.history || []), {
      date: new Date().toISOString(),
      status: order.status,
      note: `⚠️ Solicitud de devolución sin reparar: ${reason}`,
      technician: requesterName,
      logType: LogType.WARNING,
      action_type: 'RETURN_REQUESTED' as ActionType
    }];
    await updateOrderMutation.mutateAsync({ id: orderId, updates });
  }, [orders, updateOrderMutation]);

  const sendTechMessage = useCallback(async (orderId: string, message: string, senderName: string) => {
    let order = orders.find(o => o.id === orderId);
    if (!order) {
      try { order = await orderService.getOrderById(orderId); } catch (e) { console.error(e); }
    }
    if (!order) return;

    const updates: Partial<RepairOrder> = { techMessage: { message, sender: senderName, timestamp: Date.now(), pending: true } };
    updates.history = [...(order.history || []), {
      date: new Date().toISOString(),
      status: order.status,
      note: `💬 Mensaje técnico: ${message}`,
      technician: senderName,
      logType: LogType.INFO,
      action_type: 'NOTE_ADDED' as ActionType
    }];
    await updateOrderMutation.mutateAsync({ id: orderId, updates });
  }, [orders, updateOrderMutation]);

  const resolveTechMessage = useCallback(async (orderId: string, userName: string = 'Sistema') => {
    let order = orders.find(o => o.id === orderId);
    if (!order) {
      try { order = await orderService.getOrderById(orderId); } catch (e) { console.error(e); }
    }
    if (order?.techMessage) {
      const updates: Partial<RepairOrder> = { techMessage: { ...order.techMessage, pending: false } };
      updates.history = [...(order.history || []), {
        date: new Date().toISOString(),
        status: order.status,
        note: `✅ Mensaje técnico marcado como leído por ${userName}`,
        technician: userName,
        logType: LogType.SUCCESS,
        action_type: 'NOTE_ADDED' as ActionType
      }];
      await updateOrderMutation.mutateAsync({ id: orderId, updates });
    }
  }, [orders, updateOrderMutation]);

  const updateOrderFinancials = useCallback(async (id: string, updates: Partial<RepairOrder>) => {
    await updateOrderMutation.mutateAsync({ id, updates });
  }, [updateOrderMutation]);

  const createWarrantyOrder = useCallback(async (originalOrder: RepairOrder, reason: string, type: 'WARRANTY' | 'QUALITY' = 'WARRANTY', userName: string = 'Sistema'): Promise<string> => {
    const newId = `INV-${Math.floor(10000 + Math.random() * 90000)}`;
    const isWarranty = type === 'WARRANTY';
    const logMsg = isWarranty ? '🛡️ INGRESO POR GARANTÍA' : '✨ REINGRESO POR REVISIÓN/CALIDAD';
    const techNotePrefix = isWarranty ? '[GARANTÍA]' : '[REVISIÓN/CALIDAD]';
    
    const warrantyOrder: any = { 
        ...originalOrder, 
        id: newId,
        orderType: isWarranty ? OrderType.WARRANTY : OrderType.REPAIR, 
        relatedOrderId: originalOrder.id, 
        status: OrderStatus.PENDING, 
        createdAt: Date.now(), 
        deadline: Date.now() + 48 * 60 * 60 * 1000, 
        history: [{ date: new Date().toISOString(), status: OrderStatus.PENDING, note: logMsg, technician: userName, logType: LogType.WARNING }], 
        estimatedCost: 0, 
        finalPrice: 0, 
        totalAmount: 0,
        partsCost: 0, 
        payments: [], 
        expenses: [], 
        technicianNotes: `${techNotePrefix} Razón: ${reason}`, 
        pointsAwarded: 0, 
        pointRequest: null, 
        pointsEarnedBy: null,
        pointsSplit: null,
        originalPointsAwarded: null,
        assignedTo: null, 
        pending_assignment_to: null, 
        isValidated: false, 
        completedAt: undefined,
        techMessage: undefined,
        returnRequest: undefined,
        refundRequest: undefined,
        proposedEstimate: undefined,
        isDiagnosticFee: false,
        repairOutcomeReason: undefined,
        transferTarget: undefined,
        transferStatus: undefined,
        partRequests: undefined,
        externalRepair: undefined,
        approvalAckPending: false,
        holdReason: undefined
    };
    
    // Remove properties that should be generated by the database
    delete warrantyOrder.readable_id;
    
    const createdOrder = await addOrderMutation.mutateAsync(warrantyOrder);
    
    // Add history log to original order
    const originalLogMsg = isWarranty 
        ? `🛡️ Se generó reingreso por GARANTÍA (Ref: ${createdOrder?.readable_id ? `#${createdOrder.readable_id}` : newId})` 
        : `✨ Se generó reingreso por REVISIÓN/CALIDAD (Ref: ${createdOrder?.readable_id ? `#${createdOrder.readable_id}` : newId})`;
    
    await updateOrderMutation.mutateAsync({
        id: originalOrder.id,
        updates: {
            history: [
                ...originalOrder.history,
                {
                    date: new Date().toISOString(),
                    status: originalOrder.status,
                    note: originalLogMsg,
                    technician: userName,
                    logType: LogType.WARNING
                }
            ]
        }
    });

    return createdOrder?.id || newId;
  }, [addOrderMutation, updateOrderMutation]);

  const debatePoints = useCallback(async (orderId: string, userName: string) => {
    let order = orders.find(o => o.id === orderId);
    if (!order) {
      try { order = await orderService.getOrderById(orderId); } catch (e) { console.error(e); }
    }
    if (!order || !order.pointRequest) return;
    const updatedRequest: PointRequest = { ...order.pointRequest, status: RequestStatus.DEBATED, approvedBy: userName };
    
    const updates: Partial<RepairOrder> = { 
      pointRequest: updatedRequest, 
      techMessage: { message: "⚠️ PUNTOS EN DEBATE: Por favor contacta a supervisión.", sender: userName, timestamp: Date.now(), pending: true } 
    };
    
    updates.history = [...(order.history || []), {
      date: new Date().toISOString(),
      status: order.status,
      note: `⚠️ Puntos en debate por ${userName}`,
      technician: userName,
      logType: LogType.WARNING,
      action_type: 'NOTE_ADDED' as ActionType
    }];
    
    await updateOrderMutation.mutateAsync({ id: orderId, updates });
  }, [orders, updateOrderMutation]);

  const requestExternalRepair = useCallback(async (orderId: string, workshop: 'BRENY NIZAO' | 'JUNIOR BARON' | 'OTRO', reason: string, userName: string) => {
    let order = orders.find(o => o.id === orderId);
    if (!order) {
      try { order = await orderService.getOrderById(orderId); } catch (e) { console.error(e); }
    }
    if (!order) return;

    const request: ExternalRepairRequest = { targetWorkshop: workshop, reason, requestedBy: userName, requestedAt: Date.now(), status: RequestStatus.PENDING };
    const updates: Partial<RepairOrder> = { externalRepair: request };
    updates.history = [...(order.history || []), {
      date: new Date().toISOString(),
      status: order.status,
      note: `🔄 Solicitud de reparación externa a ${workshop}: ${reason}`,
      technician: userName,
      logType: LogType.WARNING,
      action_type: 'EXTERNAL_REPAIR_REQUESTED' as ActionType
    }];
    await updateOrderMutation.mutateAsync({ id: orderId, updates });
  }, [orders, updateOrderMutation]);

  const resolveExternalRepair = useCallback(async (orderId: string, approve: boolean, userName: string) => {
    let order = orders.find(o => o.id === orderId);
    if (!order) {
      try { order = await orderService.getOrderById(orderId); } catch (e) { console.error(e); }
    }
    if (!order || !order.externalRepair) return;
    const updatedRequest: ExternalRepairRequest = { ...order.externalRepair, status: approve ? RequestStatus.APPROVED : RequestStatus.REJECTED, approvedBy: userName };
    const updates: Partial<RepairOrder> = { externalRepair: updatedRequest };
    if (approve) { updates.status = OrderStatus.EXTERNAL; updates.assignedTo = null; }
    
    updates.history = [...(order.history || []), {
      date: new Date().toISOString(),
      status: updates.status || order.status,
      note: approve ? `✅ Reparación externa aprobada por ${userName}` : `❌ Reparación externa rechazada por ${userName}`,
      technician: userName,
      logType: approve ? LogType.SUCCESS : LogType.DANGER,
      action_type: approve ? 'EXTERNAL_REPAIR_APPROVED' as ActionType : 'EXTERNAL_REPAIR_REJECTED' as ActionType
    }];
    await updateOrderMutation.mutateAsync({ id: orderId, updates });
  }, [orders, updateOrderMutation]);

  const receiveFromExternal = useCallback(async (orderId: string, notes: string, userName: string) => {
    let order = orders.find(o => o.id === orderId);
    if (!order) {
      try { order = await orderService.getOrderById(orderId); } catch (e) { console.error(e); }
    }
    if (!order) return;

    const updates: Partial<RepairOrder> = { status: OrderStatus.DIAGNOSIS, assignedTo: null, currentBranch: 'T4', externalRepair: undefined };
    updates.history = [...(order.history || []), {
      date: new Date().toISOString(),
      status: updates.status || order.status,
      note: `📥 Equipo recibido de reparación externa. Notas: ${notes}`,
      technician: userName,
      logType: LogType.SUCCESS,
      action_type: 'EXTERNAL_REPAIR_RECEIVED' as ActionType
    }];
    await updateOrderMutation.mutateAsync({ id: orderId, updates });
  }, [orders, updateOrderMutation]);

  const validateOrder = useCallback(async (id: string, validatorName: string) => {
    let order = orders.find(o => o.id === id);
    if (!order) {
      try { order = await orderService.getOrderById(id); } catch (e) { console.error(e); }
    }
    if (!order) return;

    const updates: Partial<RepairOrder> = { isValidated: true };
    updates.history = [...(order.history || []), {
      date: new Date().toISOString(),
      status: order.status,
      note: `✅ Orden validada por ${validatorName}`,
      technician: validatorName,
      logType: LogType.SUCCESS,
      action_type: 'ORDER_VALIDATED' as ActionType
    }];
    await updateOrderMutation.mutateAsync({ id, updates });
  }, [orders, updateOrderMutation]);

  const addPartRequest = useCallback(async (orderId: string, partName: string, userName: string) => {
    let order = orders.find(o => o.id === orderId);
    if (!order) {
      try { order = await orderService.getOrderById(orderId); } catch (e) { console.error(e); }
    }
    if (!order) return;
    const newRequest: any = { id: `req-${Date.now()}`, orderId: order.id, partName, requestedBy: userName, requestedAt: Date.now(), status: RequestStatus.PENDING, orderReadableId: order.readable_id?.toString() || order.id.slice(0, 6), orderModel: order.deviceModel, orderType: order.orderType };
    const updatedRequests = [...(order.partRequests || []), newRequest];
    
    const updates: Partial<RepairOrder> = { partRequests: updatedRequests };
    updates.history = [...(order.history || []), {
      date: new Date().toISOString(),
      status: order.status,
      note: `🔧 Solicitud de pieza: ${partName}`,
      technician: userName,
      logType: LogType.WARNING,
      action_type: 'PART_REQUESTED' as ActionType
    }];
    await updateOrderMutation.mutateAsync({ id: orderId, updates });
  }, [orders, updateOrderMutation]);

  const resolvePartRequest = useCallback(async (orderId: string, requestId: string, status: RequestStatus, details: { source?: string, price?: number, notes?: string } = {}, userName: string = 'Sistema') => {
    let order = orders.find(o => o.id === orderId);
    if (!order) {
      try { order = await orderService.getOrderById(orderId); } catch (e) { console.error(e); }
    }
    if (!order || !order.partRequests) return;
    const partName = order.partRequests.find(r => r.id === requestId)?.partName || 'Desconocida';
    const updatedRequests = order.partRequests.map(r => r.id === requestId ? { ...r, status, foundAt: Date.now(), foundBy: userName, ...details } : r);
    const updates: Partial<RepairOrder> = { partRequests: updatedRequests };
    
    let note = '';
    let logType = LogType.INFO;
    if (status === RequestStatus.FOUND) {
      note = `✅ Pieza encontrada: ${partName} (${details.source || 'Sin origen'})`;
      logType = LogType.SUCCESS;
    } else if (status === RequestStatus.NOT_FOUND) {
      note = `❌ Pieza NO encontrada: ${partName}`;
      logType = LogType.DANGER;
    } else if (status === RequestStatus.ORDERED) {
      note = `📦 Pieza ordenada: ${partName}`;
      logType = LogType.WARNING;
    }
    
    const baseHistory = [...(order.history || []), {
      date: new Date().toISOString(),
      status: order.status,
      note,
      technician: userName,
      logType,
      action_type: 'PART_REQUEST_RESOLVED' as ActionType
    }];

    if (status === RequestStatus.FOUND && details.price && details.price > 0) {
      const newExpense: Expense = { id: `exp-${Date.now()}`, description: `Pieza: ${partName}`, amount: details.price, date: Date.now(), addedBy: userName };
      updates.expenses = [...(order.expenses || []), newExpense];
      
      // Log the expense addition
      updates.history = [...baseHistory, {
        date: new Date().toISOString(),
        status: order.status,
        note: `💸 GASTO AGREGADO (Pieza): ${newExpense.description} ($${details.price})`,
        technician: userName,
        logType: LogType.INFO,
        action_type: ActionType.EXPENSE_ADDED,
        metadata: { description: newExpense.description, amount: details.price }
      }];
    } else {
      updates.history = baseHistory;
    }
    await updateOrderMutation.mutateAsync({ id: orderId, updates });
  }, [orders, updateOrderMutation]);

  return (
    <OrderContext.Provider value={{ 
        orders, notifications, isConnected: true, hasPendingSync: false,
        loadMoreOrders, hasMore: !!hasNextPage, isLoadingOrders,
        fetchOrderById, addOrder, updateOrderDetails, addOrderLog, updateOrderStatus, deleteOrder,
        addPayments, editPayment, fetchCashierActiveOrders,
        getDashboardStats, showNotification, clearNotification, searchOrder,
        resolveReturn, 
        initiateTransfer, confirmTransfer, assignOrder, requestAssignment, resolveAssignmentRequest, requestReturn, sendTechMessage, resolveTechMessage, updateOrderFinancials, createWarrantyOrder,
        validateOrder, debatePoints,
        requestExternalRepair, resolveExternalRepair, receiveFromExternal,
        recordOrderLog,
        addPartRequest, resolvePartRequest,
        searchTerm, setSearchTerm, statusFilter, setStatusFilter, branchFilter, setBranchFilter,
        filterTab, setFilterTab, viewMode, setViewMode, sortBy, setSortBy, externalFilter, setExternalFilter
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
