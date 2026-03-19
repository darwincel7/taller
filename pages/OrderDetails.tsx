
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { orderService } from '../services/orderService';
import { useOrders } from '../contexts/OrderContext';
import { useAuth } from '../contexts/AuthContext';
import { 
  RepairOrder, OrderStatus, UserRole, PriorityLevel, OrderType, Expense, PointSplit, LogType, HistoryLog, ActionType, RequestStatus, TransferStatus, TransactionStatus, ApprovalStatus, ExpenseDestination
} from '../types';
import { 
  ArrowLeft, Printer, MessageCircle, AlertTriangle, 
  CheckCircle2, XCircle, Wrench, User, Calendar, 
  Smartphone, Lock, Share2, Save, Trash2, Reply, ShieldAlert,
  ThumbsUp, UserCheck, MapPin, Truck, History, ArrowRightLeft, DollarSign, Wallet, FileText,
  Maximize2, X, AlertCircle, HandCoins, Crown, Split, Ban, ArrowRight, Users, Check, Hand, BellRing, Minus, Plus, Trophy, Tag, Send, Loader2, Sparkles, Zap, Phone, MessageSquare, ShieldCheck, ShoppingBag, Package, RotateCcw
} from 'lucide-react';
import { StatusTimeline } from '../components/StatusTimeline';
import { OrderFinancials } from '../components/OrderFinancials';
import { OrderInfoEdit } from '../components/OrderInfoEdit';
import { PreDeliveryCheckModal } from '../components/modals/PreDeliveryCheckModal';
import { DeliveryModal } from '../components/DeliveryModal';
import { ProposalModal } from '../components/ProposalModal';
import { printInvoice, printSticker } from '../services/invoiceService';
import { sendWhatsAppNotification } from '../services/notificationService';
import { chatWithDarwin } from '../services/geminiService';
import { finalizeDelivery } from '../services/deliveryService';
import { accountingService } from '../services/accountingService';
import { auditService } from '../services/auditService';
import { supabase } from '../services/supabase';

// --- CANONICAL ROOT IMPORTS ---
import { ControlPanel } from '../components/ControlPanel'; 
import { TechnicalSheet } from '../components/orders/TechnicalSheet';
import { StageBar } from '../components/orders/StageBar';
import { ProgressNotes } from '../components/orders/ProgressNotes';
import { ExpensesAndParts } from '../components/orders/ExpensesAndParts';
import { DetailedHistory } from '../components/orders/DetailedHistory';
import { CustomerHistorySummary } from '../components/orders/CustomerHistorySummary';
import { OrderBanners } from '../components/orders/OrderBanners';

import { ConfirmApprovalModal } from '../components/ConfirmApprovalModal';
import { UnrepairableModal } from '../components/modals/UnrepairableModal';
import { PointsRequestModal } from '../components/modals/PointsRequestModal';
import { SendTechMessageModal } from '../components/modals/SendTechMessageModal';
import { AssignTechModal } from '../components/modals/AssignTechModal';
import { ExternalRepairModal } from '../components/modals/ExternalRepairModal';
import { RequestPartModal } from '../components/modals/RequestPartModal';
import { DbFixModal } from '../components/DbFixModal';
import { CustomerSelectModal } from '../components/modals/CustomerSelectModal';
import { WarrantyReasonModal } from '../components/modals/WarrantyReasonModal';

export const OrderDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showDbFixModal, setShowDbFixModal] = useState(false);
  const { 
    orders,
    updateOrderDetails, updateOrderStatus, addOrderLog, showNotification, 
    addPayments, resolveReturn, deleteOrder, initiateTransfer, assignOrder, requestExternalRepair,
    resolveAssignmentRequest, validateOrder, confirmTransfer, resolveExternalRepair, receiveFromExternal,
    sendTechMessage, resolveTechMessage, debatePoints, recordOrderLog, requestAssignment,
    addPartRequest, createWarrantyOrder
  } = useOrders();
  
  const { currentUser, users } = useAuth();

  // Fetch specific order data
  const { data: order, isLoading: isLoadingOrder } = useQuery({
    queryKey: ['order', id],
    queryFn: () => orderService.getOrderById(id!),
    enabled: !!id,
  });

  // Customer History Logic (Server-side)
  const { data: historyData, isLoading: isLoadingHistory } = useQuery({
    queryKey: ['customerHistory', order?.customer?.phone],
    queryFn: () => orderService.getCustomerHistory(order!.customer.phone),
    enabled: !!order?.customer?.phone && order.customer.phone.length >= 8
  });

  const customerHistory = useMemo(() => {
      if (!historyData || historyData.length === 0) return null;
      
      const totalSpent = historyData.reduce((sum, o) => {
          if (o.status === OrderStatus.RETURNED) {
              return sum + (o.finalPrice || o.estimatedCost || 0);
          }
          return sum;
      }, 0);

      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const abandoned = historyData.filter(o => 
          o.status !== OrderStatus.RETURNED && 
          o.status !== OrderStatus.CANCELED && 
          (o.createdAt || 0) < thirtyDaysAgo
      );
      
      const active = historyData.filter(o => 
          o.status !== OrderStatus.RETURNED && 
          o.status !== OrderStatus.CANCELED &&
          (o.createdAt || 0) >= thirtyDaysAgo
      );

      return {
          visits: historyData.length,
          totalSpent,
          abandoned: abandoned.length,
          active: active.length
      };
  }, [historyData]);

  const [isEditing, setIsEditing] = useState(false);

  // Handlers with useCallback
  const handleSaveDetails = useCallback(async (updates: Partial<RepairOrder>) => {
    if (!id) return;
    try {
      await updateOrderDetails(id, updates);
      setIsEditing(false);
      showNotification('success', 'Detalles actualizados');
    } catch (error) {
      showNotification('error', 'Error al guardar detalles');
    }
  }, [id, updateOrderDetails, showNotification]);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showPointsModal, setShowPointsModal] = useState(false); 
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showExternalModal, setShowExternalModal] = useState(false);
  const [showPartRequestModal, setShowPartRequestModal] = useState(false);
  const [isDepositMode, setIsDepositMode] = useState(false);
  const [showConfirmApproval, setShowConfirmApproval] = useState(false); 
  const [showTechMsgModal, setShowTechMsgModal] = useState(false);
  const [isSubmittingPoints, setIsSubmittingPoints] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPreDeliveryCheckModal, setShowPreDeliveryCheckModal] = useState(false);
  const [showCustomerSelect, setShowCustomerSelect] = useState(false);
  const [showWarrantyModal, setShowWarrantyModal] = useState(false);
  const [warrantyType, setWarrantyType] = useState<'WARRANTY' | 'QUALITY'>('WARRANTY');
  
  // Edit Form State
  const [editForm, setEditForm] = useState<any>({});
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [finalPriceInput, setFinalPriceInput] = useState('');
  const [note, setNote] = useState('');

  // 1. Optimized Fetch Logic (REMOVED - Derived from Context)

  // 2. Initialize Form Data
  useEffect(() => {
      if (order) {
          setNote(order.technicianNotes || '');
          setEditForm({
              customerName: order.customer.name,
              customerPhone: order.customer.phone,
              deviceModel: order.deviceModel,
              deviceIssue: order.deviceIssue,
              deviceCondition: order.deviceCondition,
              priority: order.priority,
              deadline: order.deadline ? (() => {
                  const d = new Date(order.deadline);
                  const year = d.getFullYear();
                  const month = String(d.getMonth() + 1).padStart(2, '0');
                  const day = String(d.getDate()).padStart(2, '0');
                  const hours = String(d.getHours()).padStart(2, '0');
                  const minutes = String(d.getMinutes()).padStart(2, '0');
                  return `${year}-${month}-${day}T${hours}:${minutes}`;
              })() : '',
              imei: order.imei,
              deviceStorage: order.deviceStorage,
              batteryHealth: order.batteryHealth,
              unlockStatus: order.unlockStatus,
              accessories: order.accessories,
              devicePassword: order.devicePassword
          });
          setExpenses(order.expenses || []);
          let price = order.finalPrice > 0 ? order.finalPrice : order.estimatedCost;
          if (order.finalPrice === 0 && order.orderType === OrderType.STORE && order.targetPrice) {
              price = order.targetPrice;
          }
          setFinalPriceInput(isNaN(price) ? '0' : price.toString());
      }
  }, [order]);

  const assignedUser = useMemo(() => users.find(u => u.id === order?.assignedTo), [order, users]);

  // Permissions & Variables
  const isTech = currentUser?.role === UserRole.TECHNICIAN;
  const isAdmin = currentUser?.role === UserRole.ADMIN;
  const isMonitor = currentUser?.role === UserRole.MONITOR;
  const canEdit = currentUser?.permissions?.canEditOrderDetails || isAdmin;
  const canDeliver = (currentUser?.permissions?.canDeliverOrder || isAdmin) && !isMonitor;
  const canViewAccounting = currentUser?.permissions?.canViewAccounting || isAdmin; 
  const canEditExpenses = currentUser?.permissions?.canEditExpenses || isAdmin;

  // Check for Pending Points Request
  const pendingPointRequest = order?.pointRequest && order.pointRequest.status === RequestStatus.PENDING;
  const canApprovePoints = isAdmin || isMonitor;

  // --- RESTORED HANDLERS ---

  // Check for Pending Requests (Blocking)
  const hasPendingRequests = useMemo(() => {
      if (!order) return false;
      return (
          (order.pointRequest && order.pointRequest.status === RequestStatus.PENDING) ||
          (order.returnRequest && order.returnRequest.status === RequestStatus.PENDING) ||
          (order.externalRepair && order.externalRepair.status === RequestStatus.PENDING) ||
          order.status === OrderStatus.WAITING_APPROVAL
          // Removed order.approvalAckPending from here because it blocks payments/deposits unnecessarily.
          // It's only meant to block the technician from starting repair until they acknowledge.
      );
  }, [order]);

  if (isLoadingOrder) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Orden no encontrada</h2>
        <button onClick={() => navigate('/dashboard')} className="text-blue-600 hover:underline">
          Volver al Dashboard
        </button>
      </div>
    );
  }

  const handleStatusChange = async (newStatus: OrderStatus) => {
      if (order.status === OrderStatus.CANCELED) {
          alert("🚫 Esta orden está Cancelada y no puede cambiar de estado.");
          return;
      }
      if (newStatus === OrderStatus.RETURNED) {
          handleDeliverCheck();
          return;
      }
      if (newStatus === OrderStatus.REPAIRED) {
          setShowPointsModal(true);
          return;
      }
      if (newStatus === OrderStatus.WAITING_APPROVAL) {
          setShowProposalModal(true);
          return;
      }
      await updateOrderStatus(order.id, newStatus, `🔄 Estado cambiado a ${newStatus} por ${currentUser?.name}`, currentUser?.name);
      showNotification('success', `Estado cambiado a ${newStatus}`);
  };

  const handleSubmitPoints = async (points: number, reason: string, split?: PointSplit) => {
      if (isSubmittingPoints) return;
      setIsSubmittingPoints(true);
      try {
          const isAutoApproved = points <= 1; // 0 or 1 point is auto-approved
          
          // Construct the log manually to avoid stale state race conditions
          const logMessage = isAutoApproved ? `✅ Finalizado. ${points} pts (Automático).` : `⚠️ Solicitud de ${points} pts enviada a revisión.`;
          const logType = isAutoApproved ? LogType.SUCCESS : LogType.WARNING;
          
          const newLog: HistoryLog = {
              date: new Date().toISOString(),
              status: isAutoApproved ? OrderStatus.REPAIRED : order.status,
              note: logMessage,
              technician: currentUser?.name || 'Sistema',
              logType: logType,
              action_type: isAutoApproved ? ActionType.POINTS_AUTO_APPROVED : ActionType.POINTS_REQUESTED,
              metadata: { points, reason, split }
          };

          const currentHistory = order.history || [];
          const newHistory = [...currentHistory, newLog];

          const updates: Partial<RepairOrder> = {
              status: isAutoApproved ? OrderStatus.REPAIRED : order.status, 
              completedAt: Date.now(),
              pointsAwarded: isAutoApproved ? points : undefined,
              pointRequest: {
                  requestedPoints: points,
                  reason,
                  splitProposal: split,
                  status: isAutoApproved ? RequestStatus.APPROVED : RequestStatus.PENDING,
                  approvedBy: isAutoApproved ? 'Sistema' : undefined,
                  requestedAt: Date.now()
              },
              history: newHistory // Pass history directly to avoid separate update
          };

          if (isAutoApproved && split) {
              updates.pointsSplit = split;
          }

          await updateOrderDetails(order.id, updates);
          
          setShowPointsModal(false);
          
          if(isAutoApproved) sendWhatsAppNotification(order, OrderStatus.REPAIRED);
          else showNotification('success', 'Solicitud de puntos enviada');
      } catch (error) {
          console.error("Error submitting points:", error);
          showNotification('error', 'Error al procesar la solicitud. Intente nuevamente.');
      } finally {
          setIsSubmittingPoints(false);
      }
  };

  const handleAddExpenses = async (expensesToAdd: {desc: string, amount: number, receiptUrl?: string, sharedReceiptId?: string, readableId?: number, isExternal?: boolean, closingId?: string, createdAt?: string, invoiceNumber?: string, isDuplicate?: boolean}[]) => {
      const newExps: Expense[] = [];
      
      for (const [index, exp] of expensesToAdd.entries()) {
          let readableId: number | undefined = exp.readableId;
          
          try {
            let catId = await accountingService.getCategoryIdByName('Repuestos');
            if (!catId) {
                catId = await accountingService.getCategoryIdByName('Compras');
            }

            const transaction = await accountingService.addTransaction({
              readable_id: readableId,
              amount: -Math.abs(exp.amount),
              transaction_date: exp.createdAt ? format(new Date(exp.createdAt), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
              description: `[Orden #${order.readable_id || order.id.slice(0,6)}] ${exp.desc}`,
              category_id: catId || undefined, 
              vendor: 'Taller',
              status: TransactionStatus.PENDING,
              approval_status: exp.isExternal ? ApprovalStatus.APPROVED : ApprovalStatus.PENDING,
              expense_destination: ExpenseDestination.WORKSHOP,
              source: 'ORDER',
              order_id: order.id,
              created_by: currentUser?.id,
              receipt_url: exp.receiptUrl,
              shared_receipt_id: exp.sharedReceiptId,
              closing_id: exp.closingId,
              created_at: exp.createdAt,
              invoice_number: exp.invoiceNumber,
              is_duplicate: exp.isDuplicate
            });
            
            if (transaction && transaction.readable_id) {
                readableId = transaction.readable_id;
            }
          } catch (e) {
            console.error("Error syncing expense to accounting:", e);
          }
          
          newExps.push({
              id: (Date.now() + index).toString(),
              readable_id: readableId,
              description: exp.desc,
              amount: exp.amount,
              date: Date.now(),
              receiptUrl: exp.receiptUrl,
              sharedReceiptId: exp.sharedReceiptId,
              invoiceNumber: exp.invoiceNumber,
              addedBy: currentUser?.name,
              isExternal: exp.isExternal,
              is_duplicate: exp.isDuplicate
          });
      }

      const newExpenses = [...expenses, ...newExps];
      await updateOrderDetails(order.id, { expenses: newExpenses });

      for (const exp of newExps) {
          await recordOrderLog(
              order.id,
              ActionType.EXPENSE_ADDED,
              `💸 GASTO AGREGADO: ${exp.description} ($${exp.amount})${exp.readable_id ? ` #${exp.readable_id}` : ''}`,
              { description: exp.description, amount: exp.amount, receiptUrl: exp.receiptUrl, sharedReceiptId: exp.sharedReceiptId, readableId: exp.readable_id },
              LogType.INFO,
              currentUser?.name
          );
      }
  };

  const handleAddExpense = async (desc: string, amount: number, receiptUrl?: string, sharedReceiptId?: string, providedReadableId?: number, isExternal?: boolean, closingId?: string, createdAt?: string, invoiceNumber?: string, isDuplicate?: boolean) => { 
      let readableId: number | undefined = providedReadableId;
      
      // --- NEW ACCOUNTING LOGIC ---
      try {
        let catId = await accountingService.getCategoryIdByName('Repuestos');
        if (!catId) {
            // Fallback to 'Compras' or create 'Repuestos'
            catId = await accountingService.getCategoryIdByName('Compras');
        }

        const transaction = await accountingService.addTransaction({
          readable_id: readableId,
          amount: -Math.abs(amount), // Expense is negative
          transaction_date: createdAt ? format(new Date(createdAt), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
          description: `[Orden #${order.readable_id || order.id.slice(0,6)}] ${desc}`,
          category_id: catId || undefined, 
          vendor: 'Taller',
          status: TransactionStatus.PENDING,
          approval_status: isExternal ? ApprovalStatus.APPROVED : ApprovalStatus.PENDING,
          expense_destination: ExpenseDestination.WORKSHOP,
          source: 'ORDER',
          order_id: order.id,
          created_by: currentUser?.id,
          receipt_url: receiptUrl, // Add receipt URL to accounting transaction if supported
          shared_receipt_id: sharedReceiptId,
          closing_id: closingId,
          created_at: createdAt,
          invoice_number: invoiceNumber,
          is_duplicate: isDuplicate
        });
        
        if (transaction && transaction.readable_id) {
            readableId = transaction.readable_id;
        }
      } catch (e) {
        console.error("Error syncing expense to accounting:", e);
      }

      const newExp: Expense = { 
          id: Date.now().toString(), 
          readable_id: readableId,
          description: desc, 
          amount, 
          date: Date.now(),
          receiptUrl,
          sharedReceiptId,
          invoiceNumber,
          addedBy: currentUser?.name,
          isExternal,
          is_duplicate: isDuplicate
      };
      const newExpenses = [...expenses, newExp];
      await updateOrderDetails(order.id, { expenses: newExpenses }); 
      
      await recordOrderLog(
          order.id,
          ActionType.EXPENSE_ADDED,
          `💸 GASTO AGREGADO: ${desc} ($${amount})${readableId ? ` #${readableId}` : ''}`,
          { description: desc, amount, receiptUrl, sharedReceiptId, readableId },
          LogType.INFO,
          currentUser?.name
      );
  };
  const handleRemoveExpense = async (eid: string) => { 
      const expenseToRemove = expenses.find(e => e.id === eid);
      const newExpenses = expenses.filter(e => e.id !== eid);
      await updateOrderDetails(order.id, { expenses: newExpenses }); 
      
      if (expenseToRemove) {
          // Delete from accounting
          try {
            const accountingDesc = `[Orden #${order.readable_id || order.id.slice(0,6)}] ${expenseToRemove.description}`;
            const deletedTx = await accountingService.deleteTransactionByOrderExpense(order.id, accountingDesc, expenseToRemove.amount);
            
            // Return to floating expenses (gastos en espera) ONLY if it was originally a floating expense
            if (expenseToRemove.isExternal) {
                await supabase.from('floating_expenses').insert([{
                  description: expenseToRemove.description,
                  amount: expenseToRemove.amount,
                  receipt_url: expenseToRemove.receiptUrl || null,
                  shared_receipt_id: expenseToRemove.sharedReceiptId || null,
                  created_by: currentUser?.id || null,
                  branch_id: order.currentBranch || 'T4',
                  approval_status: 'APPROVED', // Ya estaba aprobado si estaba en la orden
                  closing_id: deletedTx?.closing_id || null,
                  created_at: deletedTx?.created_at || new Date().toISOString()
                }]);
            }
          } catch (e) {
            console.error("Error deleting expense from accounting or returning to floating:", e);
          }

          await recordOrderLog(
              order.id,
              ActionType.EXPENSE_REMOVED,
              `🗑️ GASTO ELIMINADO: ${expenseToRemove.description} ($${expenseToRemove.amount})`,
              { expense: expenseToRemove },
              LogType.DANGER,
              currentUser?.name
          );
      }
  };
  const handleEditExpense = async (eid: string, desc: string, amount: number) => { 
      const oldExpense = expenses.find(e => e.id === eid);
      const newExpenses = expenses.map(e => e.id === eid ? { ...e, description: desc, amount } : e);
      await updateOrderDetails(order.id, { expenses: newExpenses }); 
      
      if (oldExpense && (oldExpense.description !== desc || oldExpense.amount !== amount)) {
          // Update in accounting
          try {
            const oldAccountingDesc = `[Orden #${order.readable_id || order.id.slice(0,6)}] ${oldExpense.description}`;
            const newAccountingDesc = `[Orden #${order.readable_id || order.id.slice(0,6)}] ${desc}`;
            await accountingService.updateTransactionByOrderExpense(order.id, oldAccountingDesc, oldExpense.amount, newAccountingDesc, amount);
          } catch (e) {
            console.error("Error updating expense in accounting:", e);
          }

          await recordOrderLog(
              order.id,
              ActionType.EXPENSE_EDITED,
              `✏️ GASTO EDITADO: ${oldExpense.description} ($${oldExpense.amount}) ➔ ${desc} ($${amount})`,
              { oldExpense, newDesc: desc, newAmount: amount },
              LogType.INFO,
              currentUser?.name
          );
      }
  };
  const handleUpdatePrice = async (reason?: string) => { 
      const newPrice = parseFloat(finalPriceInput);
      const oldPrice = order.finalPrice > 0 ? order.finalPrice : order.estimatedCost;
      
      await updateOrderDetails(order.id, { finalPrice: newPrice }); 
      
      if (newPrice !== oldPrice) {
          await recordOrderLog(
              order.id, 
              ActionType.PRICE_UPDATED, 
              `💰 PRECIO ACTUALIZADO: $${oldPrice} ➔ $${newPrice}. Razón: ${reason || 'Ajuste manual'}`, 
              { oldPrice, newPrice, reason }, 
              LogType.WARNING, 
              currentUser?.name
          );
      }
  };

  const handlePartRequest = async (partName: string) => {
      if (!order || !currentUser) return;
      try {
          await addPartRequest(order.id, partName, currentUser.name);
          setShowPartRequestModal(false);
          showNotification('success', 'Pieza solicitada correctamente');
      } catch (error) {
          console.error("Error requesting part:", error);
          showNotification('error', 'Error al solicitar la pieza. Intente nuevamente.');
      }
  };

  const handleRequestReturn = async (reason: string, fee: number) => {
      const request = {
          reason,
          diagnosticFee: fee,
          requestedBy: currentUser?.name || 'Técnico',
          requestedAt: Date.now(),
          status: RequestStatus.PENDING
      };
      // Si hay cobro de chequeo, actualizamos el precio final de una vez (o lo dejamos para la aprobación)
      // La instrucción dice: "Al solicitar devolución, el técnico debe indicar si se cobra chequeo y el monto".
      // "Al APROBAR la devolución... Actualizar el precio final de la orden al monto indicado".
      // Así que aquí solo guardamos la solicitud.
      
      await updateOrderDetails(order.id, { returnRequest: request });
      await addOrderLog(order.id, order.status, `⚠️ SOLICITUD DEVOLUCIÓN: ${reason}. Chequeo: $${fee}`, currentUser?.name, LogType.WARNING);
      setShowReturnModal(false);
      showNotification('success', 'Solicitud enviada a supervisión');
  };

  const handleBudgetResponse = async (approve: boolean) => {
      if (!order || !currentUser || isProcessing) return;
      if (approve) {
          setShowConfirmApproval(true);
      } else {
          setIsProcessing(true);
          try {
              await updateOrderStatus(order.id, OrderStatus.DIAGNOSIS, `❌ Presupuesto RECHAZADO por ${currentUser.name}.`, currentUser.name);
          } finally {
              setIsProcessing(false);
          }
      }
  };

  const handleConfirmApproval = async (finalAmount: string, instructions: string) => {
      if (!order || !currentUser || isProcessing) return;
      setIsProcessing(true);
      try {
          const newEstimate = parseFloat(finalAmount);
          const currentNotes = order.technicianNotes || '';
          const updatedNotes = instructions.trim() ? `${currentNotes}\n\n[APROBACIÓN (${currentUser.name})]: ${instructions}` : currentNotes;
          
          const newLog = {
              date: new Date().toISOString(),
              status: OrderStatus.IN_REPAIR,
              note: `✅ APROBADO: Presupuesto $${finalAmount}. Notas: ${instructions || 'Ninguna'}`,
              technician: currentUser.name,
              logType: LogType.SUCCESS,
              action_type: ActionType.BUDGET_APPROVED,
              metadata: { amount: finalAmount, instructions }
          };

          const currentHistory = order.history || [];
          const newHistory = [...currentHistory, newLog];

          await updateOrderDetails(order.id, { 
              status: OrderStatus.IN_REPAIR,
              estimatedCost: !isNaN(newEstimate) ? newEstimate : order.estimatedCost,
              finalPrice: !isNaN(newEstimate) ? newEstimate : order.finalPrice,
              totalAmount: !isNaN(newEstimate) ? newEstimate : (order.totalAmount || order.estimatedCost),
              technicianNotes: updatedNotes,
              approvalAckPending: true,
              history: newHistory
          });
          
          setShowConfirmApproval(false);
          showNotification('success', 'Aprobación registrada y enviada al técnico.');
      } catch (error) {
          console.error(error);
          showNotification('error', 'Error al aprobar presupuesto');
      } finally {
          setIsProcessing(false);
      }
  };

  const handlePointsResponse = async (approve: boolean) => {
      if (!order || !order.pointRequest || !currentUser || isProcessing) return;
      setIsProcessing(true);
      try {
          if (approve) {
              const newLog = {
                  date: new Date().toISOString(),
                  status: OrderStatus.REPAIRED,
                  note: `✅ Puntos APROBADOS (${order.pointRequest.requestedPoints}) por ${currentUser.name}.`,
                  technician: currentUser.name,
                  logType: LogType.SUCCESS,
                  action_type: ActionType.POINTS_APPROVED,
                  metadata: { points: order.pointRequest.requestedPoints }
              };
              
              const currentHistory = order.history || [];
              const newHistory = [...currentHistory, newLog];

              const updates: Partial<RepairOrder> = { 
                  pointsAwarded: order.pointRequest.requestedPoints, 
                  pointRequest: { ...order.pointRequest, status: RequestStatus.APPROVED, approvedBy: currentUser.name },
                  status: OrderStatus.REPAIRED,
                  history: newHistory
              };
              if (order.pointRequest.splitProposal) updates.pointsSplit = order.pointRequest.splitProposal;
              await updateOrderDetails(order.id, updates);
              sendWhatsAppNotification(order, OrderStatus.REPAIRED);
          } else {
              const newLog = {
                  date: new Date().toISOString(),
                  status: order.status,
                  note: `❌ Solicitud de puntos RECHAZADA por ${currentUser.name}.`,
                  technician: currentUser.name,
                  logType: LogType.DANGER,
                  action_type: ActionType.POINTS_REJECTED,
                  metadata: { requested: order.pointRequest.requestedPoints }
              };
              
              const currentHistory = order.history || [];
              const newHistory = [...currentHistory, newLog];

              await updateOrderDetails(order.id, { 
                  pointsAwarded: 0, 
                  pointRequest: { ...order.pointRequest, status: RequestStatus.REJECTED, approvedBy: currentUser.name },
                  history: newHistory
              });
          }
      } finally {
          setIsProcessing(false);
      }
  };

  const handleAckApproval = async () => {
      if(!order || !currentUser || isProcessing) return;
      setIsProcessing(true);
      try {
          // a) marcar la alerta como resuelta
          await updateOrderDetails(order.id, { approvalAckPending: false });
          // b) registrar historial
          await recordOrderLog(order.id, ActionType.APPROVAL_ACKNOWLEDGED, `🤓 TÉCNICO CONFIRMÓ INSTRUCCIONES: El técnico ${currentUser.name} ha leído y aceptado la aprobación.`, { technician: currentUser.name }, LogType.INFO, currentUser.name);
          // c) permitir continuar a la etapa siguiente (reparación) según lógica actual
          // (La lógica actual ya permite editar/avanzar si el estado es IN_REPAIR, que ya debería estar seteado al aprobar presupuesto)
          showNotification('success', 'Confirmado');
      } finally {
          setIsProcessing(false);
      }
  };

  const handleSendTechMessage = async (msg: string) => {
      if (!currentUser) return;
      await sendTechMessage(order.id, msg, currentUser.name);
      setShowTechMsgModal(false);
      showNotification('success', 'Mensaje enviado al técnico.');
  };

  const handleReadMessage = async () => {
      await resolveTechMessage(order.id, currentUser.name);
      showNotification('success', 'Mensaje marcado como leído');
  };

  const handleAssignmentResponse = async (accept: boolean) => {
      if (!order || !currentUser) return;
      await resolveAssignmentRequest(order.id, accept, currentUser.id, currentUser.name);
      showNotification('success', accept ? 'Orden aceptada' : 'Asignación rechazada');
  };

  const handleSelfAssign = async () => {
      if (!currentUser) return;
      if (confirm("¿Asignarte esta orden para comenzar el diagnóstico?")) {
          await assignOrder(order.id, currentUser.id, currentUser.name);
          showNotification('success', 'Orden asignada correctamente');
      }
  };

  const handleAssign = async (userId: string, name: string) => {
      // If I am a technician transferring to another technician, it must be a request
      if (currentUser?.role === UserRole.TECHNICIAN && userId !== currentUser.id) {
          await requestAssignment(order!.id, userId, name, currentUser.name);
          setShowAssignModal(false);
          showNotification('success', `Solicitud de traspaso enviada a ${name}`);
      } else {
          // Admin or self-assign (or other roles) can force assignment
          await assignOrder(order!.id, userId, name);
          
          // Record audit log
          if (currentUser) {
              await auditService.recordLog(
                  { id: currentUser.id, name: currentUser.name },
                  ActionType.ORDER_ASSIGNED,
                  `Orden #${order!.readable_id || order!.id} asignada a ${name}`,
                  order!.id
              );
          }

          setShowAssignModal(false);
          showNotification('success', `Asignado a ${name}`);
      }
  };

  const handleTransfer = async () => {
      if (hasPendingRequests) {
          alert("🚫 ACCIÓN BLOQUEADA\n\nNo se puede transferir la orden porque tiene solicitudes pendientes (Puntos, Devolución, Presupuesto, etc). Resuélvelas primero.");
          return;
      }
      const target = order.currentBranch === 'T1' ? 'T4' : 'T1';
      if(confirm(`¿Iniciar traslado hacia ${target}? El equipo quedará en tránsito.`)) {
          await initiateTransfer(order.id, target, currentUser?.name || 'Sistema');
          
          // Record audit log
          if (currentUser) {
              await auditService.recordLog(
                  { id: currentUser.id, name: currentUser.name },
                  ActionType.ORDER_TRANSFERRED,
                  `Orden #${order.readable_id || order.id} transferida hacia ${target}`,
                  order.id
              );
          }

          showNotification('success', 'Traslado iniciado');
      }
  };

  const handleTransferReceive = async () => {
      if(!order || !currentUser) return;
      await confirmTransfer(order.id, currentUser.name);
      showNotification('success', 'Equipo recibido en sucursal');
  };

  const handleTransferReject = async () => {
      if (!order || !currentUser) return;
      if (!confirm("¿Rechazar el traslado de este equipo?")) return;
      
      await updateOrderDetails(order.id, { 
          transferStatus: TransferStatus.NONE, 
          transferTarget: null 
      });
      await recordOrderLog(order.id, ActionType.TRANSFER_REJECTED, `🚫 TRASLADO RECHAZADO por ${currentUser.name}.`, {}, LogType.DANGER, currentUser.name);
      showNotification('success', 'Traslado rechazado.');
  };

  const handleClaimOrder = async () => {
      if (!order || !currentUser) return;
      if (confirm("¿Reclamar esta orden y asignártela?")) {
          await updateOrderDetails(order.id, { assignedTo: currentUser.id });
          await addOrderLog(order.id, order.status, `Orden reclamada por ${currentUser.name}`, currentUser.name, LogType.INFO);
          showNotification('success', 'Orden reclamada exitosamente');
      }
  };

  const handleReturnResponse = async (approve: boolean) => {
      if (!order || !order.returnRequest || !currentUser) return;
      
      if (approve) {
          const fee = order.returnRequest.diagnosticFee || 0;
          
          const newLog = {
              date: new Date().toISOString(),
              status: OrderStatus.REPAIRED,
              note: `✅ DEVOLUCIÓN APROBADA por ${currentUser.name}. Costo Chequeo: $${fee}`,
              technician: currentUser.name,
              logType: LogType.SUCCESS,
              action_type: ActionType.RETURN_APPROVED,
              metadata: { fee }
          };
          
          const currentHistory = order.history || [];
          const newHistory = [...currentHistory, newLog];

          // Apply fee, set status to REPAIRED (Ready for delivery), approve request
          await updateOrderDetails(order.id, { 
              status: OrderStatus.REPAIRED,
              finalPrice: fee,
              totalAmount: fee,
              returnRequest: { ...order.returnRequest, status: RequestStatus.APPROVED, approvedBy: currentUser.name },
              history: newHistory
          });
          showNotification('success', 'Devolución aprobada. Orden lista para entregar.');
      } else {
          const newLog = {
              date: new Date().toISOString(),
              status: order.status,
              note: `❌ Devolución RECHAZADA por ${currentUser.name}.`,
              technician: currentUser.name,
              logType: LogType.DANGER,
              action_type: ActionType.RETURN_REJECTED,
              metadata: {}
          };
          
          const currentHistory = order.history || [];
          const newHistory = [...currentHistory, newLog];

          await updateOrderDetails(order.id, { 
              returnRequest: { ...order.returnRequest, status: RequestStatus.REJECTED, approvedBy: currentUser.name },
              history: newHistory
          });
          showNotification('success', 'Solicitud de devolución rechazada.');
      }
  };

  const handleExternal = async (workshop: any, reason: string) => {
      await requestExternalRepair(order.id, workshop, reason, currentUser?.name || 'Sistema');
      setShowExternalModal(false);
      showNotification('success', 'Solicitud de envío externo registrada');
  };

  const handleExternalResponse = async (approve: boolean) => {
      if(!order || !currentUser) return;
      await resolveExternalRepair(order.id, approve, currentUser.name);
  };

  const handleReceiveExternal = async () => {
      if(!order || !currentUser) return;
      const note = prompt("Nota de recepción (Estado del equipo, costo, etc):");
      if (note === null) return; // Cancelled
      await receiveFromExternal(order.id, note || "Sin nota", currentUser.name);
      showNotification('success', 'Equipo recibido de taller externo');
  };

  // --- REQUIRED RESTORED HANDLERS ---

  const handleSaveChanges = async () => {
      if (!order) return;
      const updates: Partial<RepairOrder> = {
          customer: { ...order.customer, name: editForm.customerName, phone: editForm.customerPhone },
          deviceModel: editForm.deviceModel,
          deviceIssue: editForm.deviceIssue,
          deviceCondition: editForm.deviceCondition,
          priority: editForm.priority,
          imei: editForm.imei,
          deviceStorage: editForm.deviceStorage,
          batteryHealth: editForm.batteryHealth,
          unlockStatus: editForm.unlockStatus,
          accessories: editForm.accessories,
          devicePassword: editForm.devicePassword
      };
      
      // Update customer directory if linked
      if (order.customerId) {
          try {
              await supabase.from('customers').update({
                  name: editForm.customerName,
                  phone: editForm.customerPhone
              }).eq('id', order.customerId);
          } catch (err) {
              console.error("Error updating customer directory:", err);
          }
      }

      // LOG CHANGE OF DEADLINE
      if (editForm.deadline) {
          const [datePart, timePart] = editForm.deadline.split('T');
          if (datePart && timePart) {
              const [year, month, day] = datePart.split('-').map(Number);
              const [hours, minutes] = timePart.split(':').map(Number);
              const dl = new Date(year, month - 1, day, hours, minutes).getTime();
              
              if (!isNaN(dl) && dl !== order.deadline) {
                  updates.deadline = dl;
                  
                  // Log the change
                  const oldDate = order.deadline ? new Date(order.deadline).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : 'Sin fecha';
                  const newDate = new Date(dl).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
                  
                  await recordOrderLog(
                      order.id,
                      ActionType.DEADLINE_CHANGED,
                      `⏳ Tiempo límite actualizado: ${oldDate} ➔ ${newDate}`,
                      { oldDeadline: order.deadline, newDeadline: dl },
                      LogType.WARNING,
                      currentUser?.name
                  );
              }
          }
      }

      // LOG CHANGE OF PHONE
      if (editForm.customerPhone !== order.customer.phone) {
          await recordOrderLog(
              order.id, 
              ActionType.PHONE_UPDATED, 
              `📞 TELÉFONO ACTUALIZADO: ${order.customer.phone} ➔ ${editForm.customerPhone}`, 
              { oldPhone: order.customer.phone, newPhone: editForm.customerPhone }, 
              LogType.INFO, 
              currentUser?.name
          );
      }
      
      await updateOrderDetails(order.id, updates);
      setIsEditing(false);
      showNotification('success', 'Ficha técnica actualizada');
  };

  const handleDeposit = () => {
      setIsDepositMode(true);
      setShowDeliveryModal(true);
  };

  const handleManualUpdate = async () => { 
      if (!order) return;
      const oldNote = order.technicianNotes || '';
      const newNote = note.trim();
      if (newNote === oldNote) return;
      await updateOrderDetails(order.id, { technicianNotes: newNote });
      await recordOrderLog(order.id, ActionType.NOTE_ADDED, `📝 NOTA BITÁCORA: ${newNote}`, { note: newNote }, LogType.INFO, currentUser?.name);
      showNotification('success', 'Bitácora guardada');
  };

  const handleDelete = async () => {
      if(confirm('¿ESTÁ SEGURO? Esta acción es irreversible y eliminará todo el historial.')) {
          // Record audit log BEFORE deletion
          if (currentUser) {
              await auditService.recordLog(
                  { id: currentUser.id, name: currentUser.name },
                  ActionType.ORDER_DELETED,
                  `Orden eliminada: #${order.readable_id || order.id} (${order.deviceModel} - ${order.customer.name})`,
                  order.id
              );
          }
          await deleteOrder(order.id);
          navigate('/orders');
      }
  };

  const handleReopen = async (type: 'WARRANTY' | 'QUALITY') => {
      if (!order || !currentUser) return;
      setWarrantyType(type);
      setShowWarrantyModal(true);
  };

  const handleConfirmWarranty = async (reason: string) => {
      if (!order || !currentUser) return;
      try {
          const newOrderId = await createWarrantyOrder(order, reason, warrantyType, currentUser.name);
          setShowWarrantyModal(false);
          showNotification('success', 'Nueva orden de reingreso creada correctamente');
          navigate(`/orders/${newOrderId}`);
      } catch (error: any) {
          console.error("Error creating warranty order:", error);
          showNotification('error', `Error al crear orden de reingreso: ${error.message}`);
      }
  };

  const handleStoreDelivery = async () => {
      if (!order || !currentUser) return;
      try {
          const updatedOrder = await finalizeDelivery(order, [], currentUser, addPayments, recordOrderLog);
          showNotification('success', 'Equipo entregado a tienda exitosamente');
          navigate('/taller');
      } catch (error: any) {
          console.error("Error entregando equipo a tienda:", error);
          showNotification('error', error.message || 'Error desconocido');
      }
  };

  const handleDeliverCheck = () => {
      setShowPreDeliveryCheckModal(true);
  };

  return (
    <div className="p-4 max-w-[1600px] mx-auto pb-24 font-sans bg-slate-50 min-h-screen">
        {/* Modals */}
        {showReturnModal && <UnrepairableModal onConfirm={handleRequestReturn} onCancel={() => setShowReturnModal(false)} />}
        {showPointsModal && <PointsRequestModal users={users} currentUser={currentUser} onConfirm={handleSubmitPoints} onCancel={() => setShowPointsModal(false)} isSubmitting={isSubmittingPoints} />}
        {showAssignModal && <AssignTechModal users={users} onClose={() => setShowAssignModal(false)} onConfirm={handleAssign} />}
        {showExternalModal && <ExternalRepairModal onClose={() => setShowExternalModal(false)} onConfirm={handleExternal} />}
        {showConfirmApproval && (
            <ConfirmApprovalModal 
                defaultAmount={order.proposedEstimate || order.estimatedCost.toString()} 
                onConfirm={handleConfirmApproval} 
                onCancel={() => { if (!isProcessing) setShowConfirmApproval(false); }} 
                isLoading={isProcessing}
            />
        )}
        {showTechMsgModal && assignedUser && (
            <SendTechMessageModal 
                techName={assignedUser.name} 
                onSend={handleSendTechMessage} 
                onClose={() => setShowTechMsgModal(false)} 
            />
        )}
        {showPreDeliveryCheckModal && (
            <PreDeliveryCheckModal
                order={order}
                hasPendingRequests={hasPendingRequests}
                onClose={() => setShowPreDeliveryCheckModal(false)}
                onProceed={() => {
                    setShowPreDeliveryCheckModal(false);
                    if (order.orderType === OrderType.STORE) {
                        handleStoreDelivery();
                    } else {
                        setShowDeliveryModal(true);
                    }
                }}
            />
        )}
        {showDeliveryModal && (
            <DeliveryModal 
                finalPriceInput={finalPriceInput}
                setFinalPriceInput={setFinalPriceInput}
                alreadyPaid={(order.payments || []).reduce((acc, p) => acc + p.amount, 0)}
                onConfirm={async (payments, printWindow) => {
                    console.log("--- INICIO onConfirm (OrderDetails) ---");
                    try {
                        let orderToPrint = order;

                        if (isDepositMode) {
                            // Handle Deposit (Abono)
                            await addPayments(order.id, payments);
                            
                            // Record audit log
                            if (currentUser) {
                                const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
                                await auditService.recordLog(
                                    { id: currentUser.id, name: currentUser.name },
                                    ActionType.PAYMENT_ADDED,
                                    `Abono registrado para Orden #${order.readable_id || order.id}: $${totalAmount}`,
                                    order.id
                                );
                            }

                            orderToPrint = { ...order, payments: [...(order.payments || []), ...payments] };
                            showNotification('success', 'Abono registrado');
                            
                            setShowDeliveryModal(false);
                            setIsDepositMode(false);
                            
                            setTimeout(() => {
                                try { printInvoice(orderToPrint, printWindow); } catch(e) { console.error(e); }
                            }, 100);
                        } else {
                            // CRITICAL DELIVERY FLOW
                            const updatedOrder = await finalizeDelivery(order, payments, currentUser!, addPayments, recordOrderLog);
                            
                            // Record audit log
                            if (currentUser) {
                                const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
                                await auditService.recordLog(
                                    { id: currentUser.id, name: currentUser.name },
                                    ActionType.PAYMENT_ADDED,
                                    `Pago final y entrega para Orden #${order.readable_id || order.id}: $${totalAmount}`,
                                    order.id
                                );
                            }

                            // Construct temp order for printing (since we navigate away)
                            const allPayments = updatedOrder.payments?.length > (order.payments?.length || 0) 
                                ? updatedOrder.payments 
                                : [...(order.payments || []), ...payments];
                            
                            orderToPrint = {
                                ...updatedOrder,
                                payments: allPayments
                            };

                            showNotification('success', 'Orden finalizada y entregada');
                            
                            setShowDeliveryModal(false);
                            setIsDepositMode(false);

                            // NAVIGATE IMMEDIATELY (Prevent Freeze)
                            navigate('/taller');

                            setTimeout(() => {
                                try {
                                    printInvoice(orderToPrint, printWindow);
                                } catch (printError) {
                                    console.error("Error al imprimir:", printError);
                                }
                            }, 500);
                        }

                    } catch (error: any) {
                        console.error("Error en proceso de entrega (onConfirm):", error);
                        showNotification('error', error.message || 'Error desconocido');
                        if (error.message && (error.message.includes('row-level security') || error.message.includes('RLS'))) {
                            setShowDbFixModal(true);
                        }
                    } finally {
                         console.log("--- FIN onConfirm ---");
                    }
                }}
                onCancel={() => { setShowDeliveryModal(false); setIsDepositMode(false); }}
                isSaving={false}
                isReturn={order.status === OrderStatus.REPAIRED && order.returnRequest?.status === 'APPROVED'}
                isDeposit={isDepositMode}
            />
        )}
        {showProposalModal && (
             <ProposalModal 
                onConfirm={async (est, note, type) => {
                    await updateOrderDetails(order.id, { 
                        status: OrderStatus.WAITING_APPROVAL,
                        proposedEstimate: est,
                        proposalType: type,
                        technicianNotes: (order.technicianNotes || '') + `\n[PROPUESTA]: ${type === 'MONETARY' ? `$${est}` : 'AUTORIZACIÓN'}: ${note}`
                    });
                    setShowProposalModal(false);
                    showNotification('success', 'Propuesta enviada al cliente/monitor');
                }}
                onCancel={() => setShowProposalModal(false)}
             />
        )}

        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
            <button onClick={() => navigate(-1)} className="p-2 bg-white rounded-full shadow-sm hover:bg-slate-100"><ArrowLeft className="w-5 h-5"/></button>
            <div>
                <h1 className="text-3xl font-black text-slate-800 flex items-center gap-2 flex-wrap">
                    #{order.readable_id || order.id.slice(-4)}
                    {order.orderType === OrderType.STORE && <span className="bg-red-600 text-white px-2 py-1 rounded text-xs font-bold uppercase shadow-sm">RECIBIDO</span>}
                    {order.orderType === OrderType.PART_ONLY && <span className="bg-slate-600 text-white px-2 py-1 rounded text-xs font-bold uppercase shadow-sm">PIEZA INDEPENDIENTE</span>}
                    {order.orderType === OrderType.WARRANTY && <span className="bg-yellow-500 text-yellow-900 px-2 py-1 rounded text-xs font-bold uppercase shadow-sm">GARANTÍA</span>}
                    {order.relatedOrderId && order.orderType === OrderType.REPAIR && order.technicianNotes?.includes('[REVISIÓN/CALIDAD]') && <span className="bg-purple-600 text-white px-2 py-1 rounded text-xs font-bold uppercase shadow-sm">REVISIÓN DE CALIDAD</span>}
                    <span className="text-sm font-medium text-slate-400">/ {order.deviceModel}</span>
                    
                    {order.relatedOrderId && (
                        <button 
                            onClick={() => navigate(`/orders/${order.relatedOrderId}`)}
                            className="ml-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-full text-xs font-bold uppercase shadow-sm border border-slate-300 flex items-center gap-1.5 transition-colors"
                        >
                            <RotateCcw className="w-3.5 h-3.5" /> Ver Orden Original
                        </button>
                    )}
                </h1>
                <div className="flex items-center gap-3 text-sm mt-2 flex-wrap">
                    <span className="font-bold text-slate-500 uppercase">CLIENTE: {order.customer.name}</span>
                    <div className="flex items-center gap-1.5 bg-slate-800 px-3 py-1 rounded-full border border-slate-700 shadow-md">
                        <span className="font-black text-white uppercase text-xs tracking-wider">ORIGEN: {order.originBranch || order.currentBranch || 'T4'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-blue-100 px-3 py-1 rounded-full border border-blue-200 shadow-sm">
                        <span className="font-black text-blue-800 uppercase text-xs tracking-wider">ACTUAL: {order.currentBranch || 'T4'}</span>
                    </div>
                    {assignedUser ? (
                        <div className="flex items-center gap-1.5 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                            <span className="text-[10px] text-blue-400 font-bold uppercase">TÉCNICO:</span>
                            <span className="font-black text-blue-700 uppercase text-xs">{assignedUser.name}</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200 opacity-50">
                            <span className="text-[10px] text-slate-400 font-bold uppercase">SIN ASIGNAR</span>
                        </div>
                    )}
                </div>
            </div>
            <div className="ml-auto flex gap-2">
                 <button onClick={() => printSticker(order)} className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-slate-50"><Smartphone className="w-4 h-4"/> QR</button>
                 <button onClick={() => printInvoice(order)} className="bg-slate-800 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-slate-900"><Printer className="w-4 h-4"/> Recibo</button>
            </div>
        </div>

        {/* Customer History Summary */}
        {order.orderType !== OrderType.STORE && order.orderType !== OrderType.PART_ONLY && (
            isLoadingHistory ? (
                <div className="bg-white rounded-2xl p-4 border border-slate-200 flex items-center gap-3 animate-pulse">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                    <span className="text-sm font-medium text-slate-500">Cargando historial del cliente...</span>
                </div>
            ) : customerHistory && customerHistory.visits > 1 ? (
                <CustomerHistorySummary 
                    customerName={order.customer.name}
                    history={customerHistory}
                />
            ) : null
        )}

        {/* Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* LEFT COLUMN (3/12): Image, Ficha & Control Panel */}
            <div className="lg:col-span-3 space-y-6">
                <TechnicalSheet 
                    order={order}
                    isEditing={isEditing}
                    setIsEditing={setIsEditing}
                    editForm={editForm}
                    setEditForm={setEditForm}
                    isAdmin={isAdmin}
                    canEdit={canEdit}
                    canChangeDeadline={currentUser?.permissions?.canChangeDeadline}
                    onSave={handleSaveChanges}
                    onSearchCustomer={() => setShowCustomerSelect(true)}
                />

                <ControlPanel 
                    order={order}
                    isAdmin={isAdmin}
                    currentUser={currentUser}
                    canDeliver={canDeliver}
                    onReturn={() => setShowReturnModal(true)}
                    onDeliver={handleDeliverCheck}
                    onAssign={() => setShowAssignModal(true)}
                    onTransfer={handleTransfer}
                    onDeposit={handleDeposit}
                    onExternal={() => setShowExternalModal(true)}
                    onDelete={handleDelete}
                    onReopenWarranty={() => handleReopen('WARRANTY')}
                    onReopenQuality={() => handleReopen('QUALITY')}
                    onNotifyTech={() => setShowTechMsgModal(true)}
                    onReceiveExternal={handleReceiveExternal}
                    onAcceptAssignment={() => handleAssignmentResponse(true)}
                    onRejectAssignment={() => handleAssignmentResponse(false)}
                    onClaim={handleClaimOrder}
                    onRequestPart={() => setShowPartRequestModal(true)}
                />
            </div>

            {/* RIGHT COLUMN (9/12) */}
            <div className="lg:col-span-9 space-y-6">
                
                {/* Banners / Alerts */}
                <OrderBanners 
                    order={order}
                    currentUser={currentUser}
                    users={users}
                    isProcessing={isProcessing}
                    handlers={{
                        handleTransferReceive,
                        handleTransferReject,
                        handleReadMessage,
                        validateOrder,
                        handleExternalResponse,
                        handleReturnResponse,
                        handleAssignmentResponse,
                        handleBudgetResponse,
                        handleAckApproval,
                        handlePointsResponse,
                        debatePoints,
                        showNotification
                    }}
                />

                {/* 3. TIMELINE */}
                <StageBar 
                    currentStatus={order.status} 
                    onStepClick={(s) => (isTech || isAdmin) && !isMonitor ? handleStatusChange(s) : null} 
                    disabled={(!isTech && !isAdmin) || isMonitor} 
                    isReturn={order.returnRequest?.status === RequestStatus.APPROVED || order.returnRequest?.status === RequestStatus.PENDING}
                />

                {/* 4. NOTES ONLY (Chat Removed) */}
                <ProgressNotes 
                    note={note} 
                    setNote={setNote} 
                    onSave={handleManualUpdate} 
                />

                {/* 5. FINANCIALS & HISTORY */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    <div className="h-[750px]">
                        <ExpensesAndParts 
                            order={order}
                            expenses={expenses}
                            setExpenses={setExpenses}
                            finalPriceInput={finalPriceInput}
                            setFinalPriceInput={setFinalPriceInput}
                            canViewAccounting={canViewAccounting}
                            canEdit={canEditExpenses}
                            onAddExpense={handleAddExpense}
                            onAddExpenses={handleAddExpenses}
                            onRemoveExpense={handleRemoveExpense}
                            onEditExpense={handleEditExpense}
                            handleUpdatePrice={handleUpdatePrice}
                        />
                    </div>
                    <div className="h-[750px]">
                        <DetailedHistory 
                            history={order.history}
                        />
                    </div>
                </div>
            </div>
        </div>
        {showExternalModal && (
            <ExternalRepairModal 
                onClose={() => setShowExternalModal(false)}
                onConfirm={handleExternal}
            />
        )}
        {showPartRequestModal && (
            <RequestPartModal 
                onClose={() => setShowPartRequestModal(false)}
                onConfirm={handlePartRequest}
            />
        )}
        {showCustomerSelect && (
            <CustomerSelectModal
                onClose={() => setShowCustomerSelect(false)}
                onSelect={(customer) => {
                    setEditForm({
                        ...editForm,
                        customerId: customer.id,
                        customerName: customer.name,
                        customerPhone: customer.phone,
                    });
                    setShowCustomerSelect(false);
                }}
            />
        )}
        {showDbFixModal && <DbFixModal onClose={() => setShowDbFixModal(false)} />}
        {showWarrantyModal && (
            <WarrantyReasonModal 
                type={warrantyType}
                onConfirm={handleConfirmWarranty}
                onCancel={() => setShowWarrantyModal(false)}
            />
        )}
    </div>
  );
};
