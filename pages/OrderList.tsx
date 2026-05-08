
import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOrders } from '../contexts/OrderContext';
import { useAuth } from '../contexts/AuthContext';
import { OrderStatus, RepairOrder, UserRole, RequestStatus, LogType, TransferStatus, OrderType } from '../types';
import { sendWhatsAppNotification } from '../services/notificationService';
import { Loader2, RefreshCw, Smartphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DbFixModal } from '../components/DbFixModal';
import { fetchActionRequiredOrders } from '../services/alertsService';
import { ConfirmApprovalModal } from '../components/ConfirmApprovalModal';

// Modular Components
import { OrderFilters } from '../components/orders/OrderFilters';
import { OrderCard } from '../components/orders/OrderCard';
import { OrderTable } from '../components/orders/OrderTable';
import { ActionPanel } from '../components/orders/ActionPanel';
import { ExternalOrderCard } from '../components/orders/ExternalOrderCard';
import { useFilteredOrders } from '../hooks/useFilteredOrders';

export const OrderList: React.FC = () => {
  const { 
    assignOrder, confirmTransfer, validateOrder, updateOrderDetails, 
    updateOrderStatus, resolveExternalRepair, loadMoreOrders, hasMore, 
    isLoadingOrders, addOrderLog, debatePoints, setStatusFilter
  } = useOrders();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const { processedOrders, counts } = useFilteredOrders();
  const { filterTab, viewMode } = useOrders();

  const [managingAlert, setManagingAlert] = useState<{ order: RepairOrder, type: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDbFixModal, setShowDbFixModal] = useState(false);
  const [previewOrder, setPreviewOrder] = useState<RepairOrder | null>(null);
  const [previewPos, setPreviewPos] = useState({ x: 0, y: 0 });

  // BUDGET APPROVAL STATE
  const [showConfirmApproval, setShowConfirmApproval] = useState(false);
  const [selectedOrderForApproval, setSelectedOrderForApproval] = useState<RepairOrder | null>(null);

  useEffect(() => {
    if (filterTab === 'TALLER') {
      setStatusFilter([]); 
    } else if (filterTab === 'HISTORIAL') {
      setStatusFilter([OrderStatus.RETURNED]);
    } else {
      setStatusFilter([]);
    }
  }, [filterTab, setStatusFilter]);

  const { data: rawAlertsData } = useQuery({
      queryKey: ['action-required-orders', currentUser?.role, currentUser?.id, currentUser?.branch, managingAlert?.order?.id || 'none', showConfirmApproval],
      queryFn: () => currentUser ? fetchActionRequiredOrders(currentUser.role, currentUser.id, currentUser.branch || 'T4') : Promise.resolve([]),
      enabled: !!currentUser,
      refetchInterval: 30000,
  });

  const rawAlerts = rawAlertsData || [];

  const alertOrders = useMemo(() => {
      if (!currentUser || !rawAlerts) return [];
      return rawAlerts.map(o => {
          let type = ''; 
          if (o.pending_assignment_to === currentUser.id) type = 'ASSIGNMENT_REQUEST';
          else if (o.techMessage?.pending === true && (currentUser.role === UserRole.ADMIN || o.assignedTo === currentUser.id)) type = 'TECH_MESSAGE';
          else if (o.approvalAckPending && o.assignedTo === currentUser.id) type = 'APPROVED_ACK';
          else if (o.transferStatus === TransferStatus.PENDING && (currentUser.role === UserRole.ADMIN || (currentUser.role !== UserRole.TECHNICIAN && o.transferTarget === (currentUser.branch || 'T4')))) type = 'TRANSFER';
          else if (o.pointRequest?.status === RequestStatus.PENDING && (currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.MONITOR)) type = 'POINTS';
          else if (o.returnRequest?.status === RequestStatus.PENDING && currentUser.role !== UserRole.TECHNICIAN) type = 'RETURN_REQUEST';
          else if (o.externalRepair?.status === RequestStatus.PENDING && currentUser.role !== UserRole.TECHNICIAN) type = 'EXTERNAL_REQUEST';
          else if (o.isValidated === false && currentUser.role !== UserRole.TECHNICIAN) type = 'VALIDATE';
          else if (o.status === OrderStatus.WAITING_APPROVAL && (currentUser.role !== UserRole.TECHNICIAN || o.assignedTo === currentUser.id)) type = 'BUDGET';

          if (!type) {
               if (o.status === OrderStatus.WAITING_APPROVAL) type = 'BUDGET';
               else type = 'GENERIC_ALERT';
          }
          return { ...o, alertType: type };
      }).filter(o => {
          if (o.alertType === 'BUDGET' && currentUser.role === UserRole.TECHNICIAN && o.assignedTo !== currentUser.id) return false;
          if (o.alertType === 'TECH_MESSAGE' && currentUser.role !== UserRole.ADMIN && o.assignedTo !== currentUser.id) return false;
          return true;
      });
  }, [currentUser, rawAlerts]);

  const handleClaim = async (e: React.MouseEvent, orderId: string) => {
    e.stopPropagation();
    if (!currentUser) return;
    const targetOrder = processedOrders.find(o => o.id === orderId) || alertOrders.find(o => o.id === orderId);
    
    if (targetOrder?.transferStatus === TransferStatus.PENDING) {
        alert("🚫 ACCIÓN BLOQUEADA\n\nEsta orden está en proceso de traslado entre sucursales.");
        return;
    }
    if (confirm("¿Asignarte esta orden para comenzar el diagnóstico?")) {
      try { await assignOrder(orderId, currentUser.id, currentUser.name); } catch (e) { setShowDbFixModal(true); }
    }
  };

  const handleBudgetResponse = async (order: RepairOrder, approve: boolean) => {
      if (!currentUser) return;
      if (approve) {
          setSelectedOrderForApproval(order);
          setShowConfirmApproval(true);
      } else {
          if (confirm('¿Rechazar presupuesto y devolver a diagnóstico?')) {
              await updateOrderStatus(order.id, OrderStatus.DIAGNOSIS, '❌ Presupuesto RECHAZADO por cliente. Volviendo a diagnóstico.', currentUser?.name);
              
              if (order.orderType === OrderType.REPAIR || order.orderType === OrderType.WARRANTY) {
                  const updatedOrder = { ...order, status: OrderStatus.DIAGNOSIS };
                  sendWhatsAppNotification(updatedOrder, OrderStatus.DIAGNOSIS);
              }
              
              setManagingAlert(null);
          }
      }
  };

  const handleConfirmApproval = async (amount: string, instructions: string) => {
      if (!selectedOrderForApproval || !currentUser || isProcessing) return;
      setIsProcessing(true);
      try {
          const currentNotes = selectedOrderForApproval.technicianNotes || '';
          const updatedNotes = instructions.trim() ? `${currentNotes}\n\n[APROBACIÓN (${currentUser.name})]: ${instructions}` : currentNotes;

          await updateOrderDetails(selectedOrderForApproval.id, { 
              status: OrderStatus.IN_REPAIR, 
              finalPrice: parseFloat(amount), 
              approvalAckPending: true,
              technicianNotes: updatedNotes
          });
          await addOrderLog(selectedOrderForApproval.id, OrderStatus.IN_REPAIR, '✅ Presupuesto APROBADO por cliente. Reparación iniciada.', currentUser?.name, LogType.SUCCESS);
          
          if (selectedOrderForApproval.orderType === OrderType.REPAIR || selectedOrderForApproval.orderType === OrderType.WARRANTY) {
              const updatedOrder = { ...selectedOrderForApproval, status: OrderStatus.IN_REPAIR };
              sendWhatsAppNotification(updatedOrder, OrderStatus.IN_REPAIR);
          }
          
          setShowConfirmApproval(false);
          setSelectedOrderForApproval(null);
          setManagingAlert(null);
      } catch (e) {
          console.warn(e);
          alert('Error al aprobar presupuesto');
      } finally {
          setIsProcessing(false);
      }
  };

  const handlePointsResponse = async (order: RepairOrder, approve: boolean) => {
      if (!order || !order.pointRequest || !currentUser || isProcessing) return;
      setIsProcessing(true);
      setManagingAlert(null); 
      try {
        if (approve) {
            const updates: Partial<RepairOrder> = { 
                pointsAwarded: order.pointRequest.requestedPoints, 
                pointsEarnedBy: order.pointsEarnedBy || order.assignedTo || undefined, // LOCK IT IN
                pointRequest: { ...order.pointRequest, status: RequestStatus.APPROVED, approvedBy: currentUser.name },
                status: OrderStatus.REPAIRED
            };
            if (order.pointRequest.splitProposal) updates.pointsSplit = order.pointRequest.splitProposal;
            await updateOrderDetails(order.id, updates);
            await addOrderLog(order.id, OrderStatus.REPAIRED, `✅ Puntos APROBADOS (${order.pointRequest.requestedPoints}) por ${currentUser.name}.`, currentUser.name, LogType.SUCCESS);
            
            // Send WhatsApp notification
            const updatedOrder = { ...order, ...updates };
            sendWhatsAppNotification(updatedOrder, OrderStatus.REPAIRED);
        } else {
            // DO NOT set pointsAwarded to 0 on rejection. Keep current points.
            await updateOrderDetails(order.id, { pointRequest: { ...order.pointRequest, status: RequestStatus.REJECTED, approvedBy: currentUser.name } });
            await addOrderLog(order.id, order.status, `❌ Solicitud de puntos RECHAZADA por ${currentUser.name}. Los puntos previos se conservan.`, currentUser.name, LogType.DANGER);
        }
      } catch(e) { console.warn(e); } finally { setIsProcessing(false); }
  };

  const handleQuickAction = async (order: RepairOrder, type: string) => {
    if (!currentUser) return;
    if (type === 'POINTS' || type === 'TECH_MESSAGE' || type === 'BUDGET' || type === 'ASSIGNMENT_REQUEST' || type === 'RETURN_REQUEST') {
        navigate(`/orders/${order.id}`);
        return;
    }
    
    if (isProcessing) return;
    setManagingAlert({ order, type });
    setIsProcessing(true);
    
    try {
      if (type === 'TRANSFER') await confirmTransfer(order.id, currentUser.name);
      if (type === 'VALIDATE') await validateOrder(order.id, currentUser.name);
      if (type === 'APPROVED_ACK') await updateOrderDetails(order.id, { approvalAckPending: false });
      if (type === 'EXTERNAL_REQUEST') await resolveExternalRepair(order.id, true, currentUser.name);
      setManagingAlert(null);
    } catch (e) { setShowDbFixModal(true); } finally { setIsProcessing(false); setManagingAlert(null); }
  };

  const handlePreviewHover = (e: React.MouseEvent, order: RepairOrder) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setPreviewPos({ x: rect.right + 10, y: rect.top });
      setPreviewOrder(order);
  };

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto pb-20 font-sans bg-slate-50 min-h-screen relative">
      {showDbFixModal && <DbFixModal onClose={() => setShowDbFixModal(false)} />}
      
      {previewOrder && (
        <div 
          className="fixed z-[100] bg-white rounded-xl shadow-2xl border border-slate-200 p-4 w-72 animate-in fade-in zoom-in-95 duration-200 pointer-events-none" 
          style={{ top: Math.min(window.innerHeight - 300, previewPos.y), left: Math.min(window.innerWidth - 300, previewPos.x) }}
        >
          <div className="h-40 bg-slate-100 rounded-lg overflow-hidden mb-3 border border-slate-100">
            {previewOrder.devicePhoto ? <img src={previewOrder.devicePhoto} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><Smartphone className="w-12 h-12"/></div>}
          </div>
          <h4 className="font-black text-slate-800 text-sm mb-1">{previewOrder.deviceModel}</h4>
          <p className="text-xs text-slate-500 mb-2 font-bold">{previewOrder.customer.name}</p>
          <div className="text-[10px] text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 line-clamp-3">{previewOrder.deviceIssue}</div>
        </div>
      )}

      <OrderFilters onDbFix={() => setShowDbFixModal(true)} counts={counts} />

      <ActionPanel 
        alertOrders={alertOrders}
        currentUser={currentUser}
        isProcessing={isProcessing}
        managingAlert={managingAlert}
        onPointsResponse={handlePointsResponse}
        onDebatePoints={(id) => debatePoints(id, currentUser?.name || 'Sistema')}
        onBudgetResponse={handleBudgetResponse}
        onQuickAction={handleQuickAction}
        onConfirmTransfer={(id) => confirmTransfer(id, currentUser?.name || 'Sistema')}
        onUpdateOrderDetails={updateOrderDetails}
        onAddOrderLog={(id, status, note, type) => addOrderLog(id, status, note, currentUser?.name || 'Sistema', type)}
      />

      {showConfirmApproval && selectedOrderForApproval && (
          <ConfirmApprovalModal 
              defaultAmount={selectedOrderForApproval.proposedEstimate || selectedOrderForApproval.estimatedCost}
              onConfirm={handleConfirmApproval}
              onCancel={() => { if(!isProcessing) { setShowConfirmApproval(false); setSelectedOrderForApproval(null); } }}
              isLoading={isProcessing}
          />
      )}

      <div className="space-y-8">
        {isLoadingOrders && processedOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
                <p className="text-slate-400 font-bold animate-pulse">Cargando órdenes...</p>
            </div>
        ) : (
            <>
                {processedOrders.length === 0 ? (
                    <div className="text-center py-20 opacity-50">
                        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Smartphone className="w-8 h-8 text-slate-300" />
                        </div>
                        <p className="text-slate-500 font-bold text-lg">No se encontraron órdenes.</p>
                        <p className="text-xs text-slate-400 mt-1">Intenta ajustar los filtros o la búsqueda.</p>
                    </div>
                ) : (
                    filterTab === 'EXTERNAL' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {processedOrders.map(order => <ExternalOrderCard key={order.id} order={order} />)}
                        </div>
                    ) : (
                        viewMode === 'CARDS' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {processedOrders.map(order => <OrderCard key={order.id} order={order} onClaim={handleClaim} />)}
                            </div>
                        ) : (
                            <OrderTable 
                              list={processedOrders} 
                              onClaim={handleClaim} 
                              onPreviewHover={handlePreviewHover} 
                              onPreviewLeave={() => setPreviewOrder(null)} 
                            />
                        )
                    )
                )}

                {hasMore && (
                    <div className="flex justify-center py-8">
                        <button 
                            onClick={() => loadMoreOrders()} 
                            disabled={isLoadingOrders}
                            className="px-8 py-3 bg-white border border-slate-200 rounded-2xl font-black text-slate-700 hover:bg-slate-50 shadow-sm flex items-center gap-2 disabled:opacity-50"
                        >
                            {isLoadingOrders ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                            CARGAR MÁS ÓRDENES
                        </button>
                    </div>
                )}
            </>
        )}
      </div>
    </div>
  );
};
