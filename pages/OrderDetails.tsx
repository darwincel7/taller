
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { orderService } from '../services/orderService';
import { useOrders } from '../contexts/OrderContext';
import { useAuth } from '../contexts/AuthContext';
import { useInventory } from '../contexts/InventoryContext';
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
import { WhatsAppVisualizer } from '../components/WhatsAppVisualizer';

export const OrderDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showDbFixModal, setShowDbFixModal] = useState(false);
  const [isWhatsAppVisualizerOpen, setIsWhatsAppVisualizerOpen] = useState(false);
  const { 
    orders,
    updateOrderDetails, updateOrderStatus, addOrderLog, showNotification, 
    addPayments, resolveReturn, deleteOrder, initiateTransfer, assignOrder, requestExternalRepair,
    resolveAssignmentRequest, validateOrder, confirmTransfer, resolveExternalRepair, receiveFromExternal,
    sendTechMessage, resolveTechMessage, debatePoints, recordOrderLog, requestAssignment,
    addPartRequest, createWarrantyOrder
  } = useOrders();
  
  const { currentUser, users } = useAuth();
  const { inventory, addInventoryPart, fetchInventory } = useInventory();

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
              return sum + (o.totalAmount ?? (o.finalPrice || o.estimatedCost || 0));
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
          let price = order.totalAmount ?? (order.finalPrice > 0 ? order.finalPrice : order.estimatedCost);
          if (price === 0 && order.orderType === OrderType.STORE && order.targetPrice) {
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
  const canDeliverStoreOrders = currentUser?.permissions?.canDeliverStoreOrders || isAdmin;
  const canDeliver = (currentUser?.permissions?.canDeliverOrder || isAdmin) && !isMonitor;
  const canViewAccounting = currentUser?.permissions?.canViewAccounting || isAdmin; 
  const canEditExpenses = currentUser?.permissions?.canEditExpenses || isAdmin;
  const canEditPrice = isAdmin || isMonitor;

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

      const statusOrder = [OrderStatus.PENDING, OrderStatus.DIAGNOSIS, OrderStatus.WAITING_APPROVAL, OrderStatus.IN_REPAIR, OrderStatus.ON_HOLD, OrderStatus.EXTERNAL, OrderStatus.QC_PENDING, OrderStatus.REPAIRED, OrderStatus.RETURNED, OrderStatus.CANCELED];
      const currentIndex = statusOrder.indexOf(order.status);
      const newIndex = statusOrder.indexOf(newStatus);

      if (newIndex < currentIndex && (order.status === OrderStatus.REPAIRED || order.status === OrderStatus.RETURNED)) {
          if (!isAdmin) {
              alert("🚫 Solo los administradores pueden retroceder una orden que ya está en Listo o Entregado.");
              return;
          }
          if (!confirm(`⚠️ Estás a punto de retroceder esta orden de ${order.status} a ${newStatus}. ¿Estás seguro?`)) {
              return;
          }
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
      
      if (order.orderType === OrderType.REPAIR || order.orderType === OrderType.WARRANTY) {
          const updatedOrder = { ...order, status: newStatus };
          sendWhatsAppNotification(updatedOrder, newStatus);
      }

      showNotification('success', `Estado cambiado a ${newStatus}`);
  };

  const handleSubmitPoints = async (points: number, reason: string, split?: PointSplit) => {
      if (isSubmittingPoints) return;
      setIsSubmittingPoints(true);
      try {
          // Warranty + >0 pts needs approval. Other types + >1 pt needs approval.
          const isAutoApproved = order.orderType === OrderType.WARRANTY 
              ? points === 0 
              : points <= 1;
          
          // Construct the log manually to avoid stale state race conditions
          const logMessage = isAutoApproved ? `✅ Finalizado. ${points} pts (Automático).` : `⚠️ Solicitud de ${points} pts enviada a revisión.`;
          const logType = isAutoApproved ? LogType.SUCCESS : LogType.WARNING;
          
          const finalStatus = isAutoApproved ? ((order.status === OrderStatus.RETURNED || order.status === OrderStatus.REPAIRED) ? order.status : OrderStatus.REPAIRED) : order.status;
          
          const newLog: HistoryLog = {
              date: new Date().toISOString(),
              status: finalStatus,
              note: logMessage,
              technician: currentUser?.name || 'Sistema',
              logType: logType,
              action_type: isAutoApproved ? ActionType.POINTS_AUTO_APPROVED : ActionType.POINTS_REQUESTED,
              metadata: { points, reason, split }
          };

          const currentHistory = order.history || [];
          const newHistory = [...currentHistory, newLog];

          const updates: Partial<RepairOrder> = {
              status: finalStatus, 
              completedAt: Date.now(),
              pointsAwarded: isAutoApproved ? points : order.pointsAwarded, // Keep existing if not auto-approved
              originalPointsAwarded: isAutoApproved ? ((order.status === OrderStatus.REPAIRED || order.status === OrderStatus.RETURNED) ? (order.originalPointsAwarded ?? order.pointsAwarded) : undefined) : order.originalPointsAwarded,
              pointsEarnedBy: (order.status === OrderStatus.REPAIRED || order.status === OrderStatus.RETURNED) ? order.pointsEarnedBy : (order.pointsEarnedBy || order.assignedTo || undefined),
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
          
          if(isAutoApproved) {
              const updatedOrder = { ...order, ...updates };
              sendWhatsAppNotification(updatedOrder, finalStatus);
          }
          else showNotification('success', 'Solicitud de puntos enviada');
      } catch (error) {
          console.warn("Error submitting points:", error);
          showNotification('error', 'Error al procesar la solicitud. Intente nuevamente.');
      } finally {
          setIsSubmittingPoints(false);
      }
  };

  const handleAddExpenses = async (expensesToAdd: {desc: string, amount: number, receiptUrl?: string, sharedReceiptId?: string, readableId?: number, isExternal?: boolean, closingId?: string, createdAt?: string, invoiceNumber?: string, vendor?: string, isDuplicate?: boolean, createdBy?: string, isInventory?: boolean, branchId?: string}[]) => {
      const newExps: Expense[] = [];
      let savedCount = 0;
      let errors: string[] = [];
      
      for (const [index, exp] of expensesToAdd.entries()) {
          let readableId: number | undefined = exp.readableId;
          let success = true;
          
          if (!exp.isInventory) {
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
                  vendor: exp.vendor || 'Taller',
                  status: TransactionStatus.COMPLETED, // Money left the register, so it's completed for cash register purposes
                  approval_status: exp.isExternal ? ApprovalStatus.APPROVED : ApprovalStatus.PENDING,
                  expense_destination: ExpenseDestination.WORKSHOP,
                  source: 'ORDER',
                  order_id: order.id,
                  created_by: exp.createdBy || currentUser?.id,
                  branch: exp.branchId || currentUser?.branch || 'T4',
                  receipt_url: exp.receiptUrl,
                  shared_receipt_id: exp.sharedReceiptId,
                  closing_id: exp.closingId,
                  created_at: exp.createdAt,
                  invoice_number: exp.invoiceNumber || undefined,
                  is_duplicate: exp.isDuplicate
                });
                
                if (transaction && transaction.readable_id) {
                    readableId = transaction.readable_id;
                }
              } catch (e: any) {
                console.warn("Error syncing expense to accounting:", e);
                errors.push(`${exp.desc}: ${e.message || 'Error desconocido'}`);
                success = false;
              }
          }
          
          if (success) {
              newExps.push({
                  id: (Date.now() + index).toString(),
                  readable_id: readableId,
                  description: exp.desc,
                  amount: exp.amount,
                  date: Date.now(),
                  receiptUrl: exp.receiptUrl,
                  sharedReceiptId: exp.sharedReceiptId,
                  invoiceNumber: exp.invoiceNumber,
                  vendor: exp.vendor,
                  addedBy: currentUser?.name,
                  isExternal: exp.isExternal,
                  is_duplicate: exp.isDuplicate
              });
              savedCount++;
          }
      }

      if (newExps.length > 0) {
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
      }

      if (errors.length > 0) {
          alert(`Se guardaron ${savedCount} de ${expensesToAdd.length} gastos en la orden.\nErrores:\n${errors.join('\n')}`);
      } else {
          alert(`Se guardaron correctamente los ${savedCount} gastos en la orden.`);
      }
  };

  const handleAddExpense = async (desc: string, amount: number, receiptUrl?: string, sharedReceiptId?: string, providedReadableId?: number, isExternal?: boolean, closingId?: string, createdAt?: string, invoiceNumber?: string, vendor?: string, isDuplicate?: boolean, createdBy?: string, isInventory?: boolean, branchId?: string) => { 
      let readableId: number | undefined = providedReadableId;
      
      // --- NEW ACCOUNTING LOGIC ---
      if (!isInventory) {
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
              vendor: vendor || 'Taller',
              status: TransactionStatus.COMPLETED, // Money left the register, so it's completed for cash register purposes
              approval_status: isExternal ? ApprovalStatus.APPROVED : ApprovalStatus.PENDING,
              expense_destination: ExpenseDestination.WORKSHOP,
              source: 'ORDER',
              order_id: order.id,
              created_by: createdBy || currentUser?.id,
              branch: branchId || currentUser?.branch || 'T4',
              receipt_url: receiptUrl, // Add receipt URL to accounting transaction if supported
              shared_receipt_id: sharedReceiptId,
              closing_id: closingId,
              created_at: createdAt,
              invoice_number: invoiceNumber || undefined,
              is_duplicate: isDuplicate
            });
            
            if (transaction && transaction.readable_id) {
                readableId = transaction.readable_id;
            }
          } catch (e: any) {
            console.warn("Error syncing expense to accounting:", e);
            alert(`Error al registrar el gasto en caja: ${e.message || 'Error desconocido'}`);
            return; // Stop execution if accounting fails
          }
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
          vendor,
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
                const originalInvoiceNumber = expenseToRemove.invoiceNumber ? expenseToRemove.invoiceNumber.split('-DUP-')[0] : null;
                await supabase.from('floating_expenses').insert([{
                  description: expenseToRemove.description,
                  amount: expenseToRemove.amount,
                  receipt_url: expenseToRemove.receiptUrl || null,
                  shared_receipt_id: expenseToRemove.sharedReceiptId || null,
                  created_by: currentUser?.id || null,
                  branch_id: order.currentBranch || 'T4',
                  approval_status: 'APPROVED', // Ya estaba aprobado si estaba en la orden
                  closing_id: deletedTx?.closing_id || null,
                  created_at: deletedTx?.created_at || new Date().toISOString(),
                  invoice_number: originalInvoiceNumber,
                  vendor: expenseToRemove.vendor || null,
                  is_duplicate: expenseToRemove.is_duplicate || false
                }]);
            }
          } catch (e) {
            console.warn("Error deleting expense from accounting or returning to floating:", e);
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
            console.warn("Error updating expense in accounting:", e);
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
      const oldPrice = order.totalAmount ?? (order.finalPrice > 0 ? order.finalPrice : order.estimatedCost);
      
      await updateOrderDetails(order.id, { finalPrice: newPrice, totalAmount: newPrice }); 
      
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
          console.warn("Error requesting part:", error);
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
              if (order.orderType === OrderType.REPAIR || order.orderType === OrderType.WARRANTY) {
                  const updatedOrder = { ...order, status: OrderStatus.DIAGNOSIS };
                  sendWhatsAppNotification(updatedOrder, OrderStatus.DIAGNOSIS);
              }
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
          
          if (order.orderType === OrderType.REPAIR || order.orderType === OrderType.WARRANTY) {
              const updatedOrder = { ...order, status: OrderStatus.IN_REPAIR };
              sendWhatsAppNotification(updatedOrder, OrderStatus.IN_REPAIR);
          }
          
          setShowConfirmApproval(false);
          showNotification('success', 'Aprobación registrada y enviada al técnico.');
      } catch (error) {
          console.warn(error);
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
              const newPoints = order.pointRequest.requestedPoints;
              const finalStatus = (order.status === OrderStatus.RETURNED || order.status === OrderStatus.REPAIRED) ? order.status : OrderStatus.REPAIRED;
              const newLog = {
                  date: new Date().toISOString(),
                  status: finalStatus,
                  note: `✅ Puntos APROBADOS (${newPoints}) por ${currentUser.name}.`,
                  technician: currentUser.name,
                  logType: LogType.SUCCESS,
                  action_type: ActionType.POINTS_APPROVED,
                  metadata: { points: newPoints }
              };
              
              const currentHistory = order.history || [];
              const newHistory = [...currentHistory, newLog];

              const updates: Partial<RepairOrder> = { 
                  pointsAwarded: newPoints, 
                  originalPointsAwarded: (order.status === OrderStatus.REPAIRED || order.status === OrderStatus.RETURNED) ? (order.originalPointsAwarded ?? order.pointsAwarded) : undefined,
                  pointsEarnedBy: (order.status === OrderStatus.REPAIRED || order.status === OrderStatus.RETURNED) ? order.pointsEarnedBy : (order.pointsEarnedBy || order.assignedTo || undefined), // Keep the tech who earned them
                  pointRequest: { ...order.pointRequest, status: RequestStatus.APPROVED, approvedBy: currentUser.name },
                  status: finalStatus,
                  history: newHistory
              };
              if (order.pointRequest.splitProposal) updates.pointsSplit = order.pointRequest.splitProposal;
              await updateOrderDetails(order.id, updates);
              const updatedOrder = { ...order, ...updates };
              sendWhatsAppNotification(updatedOrder, finalStatus);
          } else {
              const newLog = {
                  date: new Date().toISOString(),
                  status: order.status,
                  note: `❌ Solicitud de puntos RECHAZADA por ${currentUser.name}. Los puntos previos se conservan.`,
                  technician: currentUser.name,
                  logType: LogType.DANGER,
                  action_type: ActionType.POINTS_REJECTED,
                  metadata: { requested: order.pointRequest.requestedPoints, current: order.pointsAwarded }
              };
              
              const currentHistory = order.history || [];
              const newHistory = [...currentHistory, newLog];

              // DO NOT set pointsAwarded to 0 on rejection. Keep current points.
              await updateOrderDetails(order.id, { 
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
          const updates = { 
              status: OrderStatus.REPAIRED,
              finalPrice: fee,
              totalAmount: fee,
              returnRequest: { ...order.returnRequest, status: RequestStatus.APPROVED, approvedBy: currentUser.name },
              history: newHistory
          };
          await updateOrderDetails(order.id, updates);
          
          const updatedOrder = { ...order, ...updates };
          sendWhatsAppNotification(updatedOrder, OrderStatus.REPAIRED);
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

  const handleManualWhatsApp = () => {
    if (!order) return;
    setIsWhatsAppVisualizerOpen(true);
  };

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
              console.warn("Error updating customer directory:", err);
          }
      }

      const newLogs: any[] = [];

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
                  
                  newLogs.push({
                      date: new Date().toISOString(),
                      status: order.status,
                      note: `⏳ Tiempo límite actualizado: ${oldDate} ➔ ${newDate}`,
                      technician: currentUser?.name || 'Sistema',
                      logType: LogType.WARNING,
                      action_type: ActionType.DEADLINE_CHANGED,
                      metadata: { oldDeadline: order.deadline, newDeadline: dl }
                  });
              }
          }
      } else if (order.deadline) {
          updates.deadline = 0;
          const oldDate = new Date(order.deadline).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
          newLogs.push({
              date: new Date().toISOString(),
              status: order.status,
              note: `⏳ Tiempo límite eliminado (antes: ${oldDate})`,
              technician: currentUser?.name || 'Sistema',
              logType: LogType.WARNING,
              action_type: ActionType.DEADLINE_CHANGED,
              metadata: { oldDeadline: order.deadline, newDeadline: 0 }
          });
      }

      // LOG CHANGE OF PHONE
      if (editForm.customerPhone !== order.customer.phone) {
          newLogs.push({
              date: new Date().toISOString(),
              status: order.status,
              note: `📞 TELÉFONO ACTUALIZADO: ${order.customer.phone} ➔ ${editForm.customerPhone}`,
              technician: currentUser?.name || 'Sistema',
              logType: LogType.INFO,
              action_type: ActionType.PHONE_UPDATED,
              metadata: { oldPhone: order.customer.phone, newPhone: editForm.customerPhone }
          });
      }
      
      if (newLogs.length > 0) {
          updates.history = [...(order.history || []), ...newLogs];
          
          // Also record global audit logs
          for (const log of newLogs) {
              if (currentUser) {
                  auditService.recordLog(
                      { id: currentUser.id, name: currentUser.name },
                      log.action_type,
                      log.note,
                      order.id,
                      'ORDER',
                      order.id,
                      log.metadata
                  ).catch(console.warn);
              }
          }
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
          console.warn("Error creating warranty order:", error);
          showNotification('error', `Error al crear orden de reingreso: ${error.message}`);
      }
  };

  const handleStoreDelivery = async () => {
      if (!order || !currentUser || isProcessing) return;
      setIsProcessing(true);
      try {
          await finalizeDelivery(order, [], currentUser, addPayments, recordOrderLog);
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['order', order.id] });
          await fetchInventory();
          showNotification('success', 'Equipo movido a Inventario (Pendiente Aceptación)');
      } catch (error: any) {
          console.warn("Error entregando equipo a tienda:", error);
          showNotification('error', error.message || 'Error desconocido');
      } finally {
          setIsProcessing(false);
      }
  };

  const handleDeliverCheck = () => {
      if (!order) return;
      if (order.orderType === OrderType.STORE && !canDeliverStoreOrders) {
          showNotification('error', 'No tienes permiso para entregar equipos recibidos.');
          return;
      }

      const isCanceled = order.status === OrderStatus.CANCELED;
      const isPart = order.orderType === OrderType.PART_ONLY;

      if (order.orderType === OrderType.STORE) {
          const hasTargetPrice = order.targetPrice && order.targetPrice > 0;
          if (!isCanceled && !isPart && !hasPendingRequests && hasTargetPrice) {
              // Bypass modal and deliver store device directly to inventory with ONE CLICK
              handleStoreDelivery();
          } else {
              setShowPreDeliveryCheckModal(true);
          }
      } else {
          if (!hasPendingRequests && !isCanceled && !isPart) {
              setShowDeliveryModal(true);
          } else {
              setShowPreDeliveryCheckModal(true);
          }
      }
  };

  return (
    <div className="p-4 max-w-[1600px] mx-auto pb-24 font-sans bg-slate-50 min-h-screen">
        {/* Modals */}
        {showReturnModal && <UnrepairableModal onConfirm={handleRequestReturn} onCancel={() => setShowReturnModal(false)} />}
        {showPointsModal && <PointsRequestModal users={users} currentUser={currentUser} orderType={order.orderType} onConfirm={handleSubmitPoints} onCancel={() => setShowPointsModal(false)} isSubmitting={isSubmittingPoints} />}
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
                    if (isProcessing) return;
                    setIsProcessing(true);
                    try {
                        let orderToPrint = order;
                        
                        const currentTotal = order.totalAmount ?? (order.finalPrice ?? (order.estimatedCost || 0));
                        const newTotal = parseFloat(finalPriceInput) || 0;
                        if (newTotal !== currentTotal) {
                            await updateOrderDetails(order.id, { totalAmount: newTotal, finalPrice: newTotal });
                            if (currentUser) {
                                await auditService.recordLog(
                                    { id: currentUser.id, name: currentUser.name },
                                    ActionType.PRICE_UPDATED,
                                    `Precio actualizado durante ${isDepositMode ? 'abono' : 'entrega'}: $${currentTotal} -> $${newTotal}`,
                                    order.id
                                );
                            }
                            orderToPrint = { ...order, totalAmount: newTotal, finalPrice: newTotal };
                        }

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

                            orderToPrint = { ...orderToPrint, payments: [...(orderToPrint.payments || []), ...payments] };
                            showNotification('success', 'Abono registrado');
                            
                            setShowDeliveryModal(false);
                            setIsDepositMode(false);
                            
                            setTimeout(() => {
                                try { printInvoice(orderToPrint, printWindow, 'INTAKE'); } catch(e) { console.warn(e); }
                            }, 100);
                        } else {
                            // CRITICAL DELIVERY FLOW
                            const updatedOrder = await finalizeDelivery(orderToPrint, payments, currentUser!, addPayments, recordOrderLog);
                            queryClient.invalidateQueries({ queryKey: ['orders'] });
                            queryClient.invalidateQueries({ queryKey: ['order', order.id] });
                            await fetchInventory();
                            
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
                            const allPayments = updatedOrder.payments?.length > (orderToPrint.payments?.length || 0) 
                                ? updatedOrder.payments 
                                : [...(orderToPrint.payments || []), ...payments];
                            
                            orderToPrint = {
                                ...updatedOrder,
                                payments: allPayments
                            };

                            if (orderToPrint.orderType === OrderType.REPAIR || orderToPrint.orderType === OrderType.WARRANTY) {
                                sendWhatsAppNotification(orderToPrint, OrderStatus.RETURNED);
                            }

                            showNotification('success', 'Orden finalizada y entregada');
                            
                            setShowDeliveryModal(false);
                            setIsDepositMode(false);

                            // We intentionally do not navigate away so user can see outcome

                            setTimeout(() => {
                                try {
                                    printInvoice(orderToPrint, printWindow, 'FINAL');
                                } catch (printError) {
                                    console.warn("Error al imprimir:", printError);
                                }
                            }, 500);
                        }

                    } catch (error: any) {
                        console.warn("Error en proceso de entrega (onConfirm):", error);
                        showNotification('error', error.message || 'Error desconocido');
                        if (error.message && (error.message.includes('row-level security') || error.message.includes('RLS'))) {
                            setShowDbFixModal(true);
                        }
                    } finally {
                         console.log("--- FIN onConfirm ---");
                         setIsProcessing(false);
                    }
                }}
                onCancel={() => { setShowDeliveryModal(false); setIsDepositMode(false); }}
                isSaving={isProcessing}
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
                    
                    if (order.orderType === OrderType.REPAIR || order.orderType === OrderType.WARRANTY) {
                        const updatedOrder = { ...order, status: OrderStatus.WAITING_APPROVAL };
                        sendWhatsAppNotification(updatedOrder, OrderStatus.WAITING_APPROVAL);
                    }
                    
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
                 <button 
                   onClick={handleManualWhatsApp}
                   title="Enviar WhatsApp Manual"
                   className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-green-100 transition-colors"
                 >
                   <MessageSquare className="w-4 h-4"/>
                 </button>
                 <button 
                   onClick={() => printSticker(order)} 
                   data-track-action="PRINT_QR"
                   data-track-type="ORDER"
                   data-track-id={order.id}
                   className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-slate-50"
                 >
                   <Smartphone className="w-4 h-4"/> Etiqueta
                 </button>
                 <button 
                   onClick={() => printInvoice(order, null, 'INTAKE')} 
                   data-track-action="PRINT_INVOICE"
                   data-track-type="ORDER"
                   data-track-id={order.id}
                   className="bg-slate-800 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-slate-900"
                 >
                   <Printer className="w-4 h-4"/> Recibo
                 </button>
                 {(order.status === OrderStatus.REPAIRED || order.status === OrderStatus.RETURNED) && (
                   <button 
                     onClick={() => printInvoice(order, null, 'FINAL')} 
                     className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700"
                   >
                     <Printer className="w-4 h-4"/> Factura
                   </button>
                 )}
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
        {order.orderType === OrderType.PART_ONLY ? (
            <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm max-w-4xl mx-auto mt-6">
                <div className="mb-8 border-b border-slate-100 pb-6 flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                            <ShoppingBag className="w-6 h-6 text-emerald-500" />
                            Factura de Venta POS
                        </h2>
                        <p className="text-slate-500 mt-1 font-medium select-all">Factura generada el {new Date(order.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                        <span className="text-4xl font-black text-emerald-600">${order.totalAmount?.toLocaleString()}</span>
                        <p className="text-xs font-bold text-slate-400 uppercase mt-1">Monto Cobrado</p>
                    </div>
                </div>
                
                <div className="mb-8 space-y-4">
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <Tag className="w-4 h-4 text-slate-400" /> Artículos Vendidos
                    </h3>
                    <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden text-sm">
                        {order.expenses && order.expenses.length > 0 ? (
                            order.expenses.map((exp: any, i: number) => (
                                <div key={i} className="flex justify-between items-center p-4 border-b border-slate-200 last:border-0 hover:bg-white transition-colors">
                                    <div className="pr-4">
                                        <p className="font-bold text-slate-800">{exp.description}</p>
                                        {(exp.partId || exp.item_id) && <p className="text-xs text-slate-400 font-mono mt-0.5 select-all">SKU: {exp.partId || exp.item_id}</p>}
                                    </div>
                                    <div className="font-black text-slate-700 shrink-0">
                                        ${exp.cost.toLocaleString()}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-6 text-center text-slate-500 font-medium">No hay detalles de artículos o fue una venta genérica.</div>
                        )}
                    </div>
                </div>
                
                <div className="bg-amber-50 rounded-2xl p-6 border border-amber-200 text-amber-800">
                    <h4 className="font-bold mb-2 flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 opacity-70" /> Información Adicional
                    </h4>
                    <p className="text-sm font-medium leading-relaxed opacity-90">
                        Esta orden corresponde a una venta directa del inventario. No requiere diagnóstico, reparación ni proceso técnico.
                    </p>
                </div>
            </div>
        ) : (
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
                    canDeliverStoreOrders={canDeliverStoreOrders}
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
                    orderType={order.orderType as OrderType}
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
                            canEditPrice={canEditPrice}
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
        )}
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
        
        {isWhatsAppVisualizerOpen && order && (
          <WhatsAppVisualizer
            lead={order}
            onClose={() => setIsWhatsAppVisualizerOpen(false)}
            onSendMessage={async (text) => {
              const phone = order.customer?.phone?.replace(/\D/g, '');
              let messageSentStatus = 'sent';
              
              if (phone) {
                const wsPhone = phone.length === 10 ? `1${phone}` : phone;
                try {
                  const response = await fetch('/api/notifications/whatsapp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      phone: wsPhone,
                      message: text,
                      orderId: order.id
                    })
                  });
                  const result = await response.json();
                  if (!response.ok || !result.success) {
                    console.error('Failed to send WhatsApp message via API:', result.error);
                    messageSentStatus = 'failed';
                    alert(`Error al enviar mensaje: ${result.error || 'Problema de conexión'}`);
                  }
                } catch (error) {
                  console.error('Error sending WhatsApp message:', error);
                  messageSentStatus = 'failed';
                  alert('Error al enviar el mensaje. Revisa tu conexión.');
                }
              } else {
                messageSentStatus = 'failed';
              }
  
              const currentMetadata = order.metadata || {};
              const currentHistory = currentMetadata.whatsappHistory || [];
              
              const newMessage = {
                id: Date.now().toString(),
                sender: 'seller',
                text: text,
                timestamp: new Date().toISOString(),
                status: messageSentStatus
              };
              
              const updatedMetadata = { 
                ...currentMetadata, 
                whatsappHistory: [...currentHistory, newMessage]
              };
              
              await updateOrderDetails(order.id, { metadata: updatedMetadata });
            }}
          />
        )}
    </div>
  );
};
