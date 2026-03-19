import React, { useState, useMemo, useEffect } from 'react';
import { Search, ShoppingCart, CreditCard, Banknote, Smartphone, Plus, Trash2, Receipt, Calculator, X, User as UserIcon, Tag, ArrowRight, CheckCircle2, ArrowDownToLine, Loader2, ShieldAlert } from 'lucide-react';
import { useOrders } from '../contexts/OrderContext';
import { useAuth } from '../contexts/AuthContext';
import { OrderStatus, PaymentMethod, RepairOrder, Payment, ActionType, TransactionStatus, LogType } from '../types';
import { ExpenseModal } from '../components/pos/ExpenseModal';
import { finalizeDelivery } from '../services/deliveryService';
import { printInvoice } from '../services/invoiceService';
import { auditService } from '../services/auditService';
import { accountingService } from '../services/accountingService';
import { supabase } from '../services/supabase';

interface CartItem {
  id: string;
  type: 'ORDER' | 'PRODUCT';
  title: string;
  subtitle: string;
  amount: number;
  maxAmount?: number; // For orders, you can't pay more than the balance
  originalOrder?: RepairOrder;
}

export const BillingPOS: React.FC = () => {
  const { addPayments, showNotification, recordOrderLog } = useOrders();
  const { currentUser } = useAuth();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  
  // Payment state
  const [paymentMethods, setPaymentMethods] = useState<{method: PaymentMethod, amount: number}[]>([
    { method: 'CASH', amount: 0 }
  ]);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  const [pendingOrders, setPendingOrders] = useState<RepairOrder[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // New states for Tender and Handover modals
  const [showTenderModal, setShowTenderModal] = useState(false);
  const [tenderAmount, setTenderAmount] = useState<number>(0);
  const [handoverData, setHandoverData] = useState<{ type: 'DELIVERY' | 'REFUND', amount: number, orders: { id: string, readableId: string }[] } | null>(null);

  // Server-side search for orders
  useEffect(() => {
    if (!searchTerm.trim()) {
      setPendingOrders([]);
      return;
    }

    const fetchOrders = async () => {
      setIsSearching(true);
      try {
        const term = searchTerm.trim().toLowerCase();
        
        let query = supabase
          .from('orders')
          .select('*')
          .limit(100);
          
        if (currentUser?.branch) {
          query = query.eq('currentBranch', currentUser.branch);
        }
          
        if (/^\d+$/.test(term)) {
          if (term.length <= 9) {
            query = query.or(`readable_id.eq.${term},id.ilike.%${term}%,imei.ilike.%${term}%,customer->>phone.ilike.%${term}%`);
          } else {
            query = query.or(`id.ilike.%${term}%,imei.ilike.%${term}%,customer->>phone.ilike.%${term}%`);
          }
        } else {
          query = query.or(`id.ilike.%${term}%,customer->>name.ilike.%${term}%,customer->>phone.ilike.%${term}%,deviceModel.ilike.%${term}%,imei.ilike.%${term}%`);
        }

        const { data, error } = await query;
        
        if (error) throw error;
        
        // Filter out orders that have no balance and are not REPAIRED
        const filtered = (data as RepairOrder[]).filter(o => {
          const totalPaid = (o.payments || []).reduce((sum, p) => sum + p.amount, 0);
          const orderTotal = o.finalPrice || o.estimatedCost || 0;
          const balance = orderTotal - totalPaid;
          
          if (o.status === OrderStatus.CANCELED || o.status === OrderStatus.RETURNED) {
            // Only show if there's a negative balance (refund due)
            return balance < 0;
          }
          
          if (balance <= 0 && o.status !== OrderStatus.REPAIRED) return false;
          return true;
        });

        setPendingOrders(filtered);
      } catch (err) {
        console.error("Error searching orders:", err);
      } finally {
        setIsSearching(false);
      }
    };

    const timer = setTimeout(fetchOrders, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const cartTotal = cart.reduce((sum, item) => sum + item.amount, 0);
  const paymentTotal = paymentMethods.reduce((sum, p) => sum + p.amount, 0);
  const cashAmount = paymentMethods.filter(p => p.method === 'CASH').reduce((sum, p) => sum + p.amount, 0);
  const balanceDue = cartTotal - paymentTotal;

  // Auto-fill first payment method when cart changes
  useEffect(() => {
    if (paymentMethods.length === 1 && paymentMethods[0].amount === 0 && cartTotal > 0) {
      setPaymentMethods([{ ...paymentMethods[0], amount: cartTotal }]);
    } else if (cartTotal === 0) {
      setPaymentMethods([{ method: 'CASH', amount: 0 }]);
    }
  }, [cartTotal]);

  const addToCart = (order: RepairOrder) => {
    if (cart.some(item => item.id === order.id)) {
      showNotification('error', 'Esta orden ya está en el carrito');
      return;
    }
    
    const totalPaid = (order.payments || []).reduce((sum, p) => sum + p.amount, 0);
    const orderTotal = order.finalPrice || order.estimatedCost || 0;
    const balance = orderTotal - totalPaid;
    
    if (cart.length > 0) {
      const isCartRefund = cart[0].amount < 0;
      const isNewItemRefund = balance < 0;
      if (isCartRefund !== isNewItemRefund) {
        showNotification('error', 'No se pueden mezclar cobros y devoluciones en la misma transacción.');
        return;
      }
    }
    
    setCart([...cart, {
      id: order.id,
      type: 'ORDER',
      title: `Orden #${order.readable_id || order.id.slice(-4)} - ${order.deviceModel}`,
      subtitle: order.customer.name,
      amount: balance,
      maxAmount: balance,
      originalOrder: order
    }]);
    
    setSearchTerm('');
  };

  const addQuickProduct = () => {
    if (cart.length > 0 && cart[0].amount < 0) {
      showNotification('error', 'No se pueden mezclar cobros y devoluciones en la misma transacción.');
      return;
    }
    const priceStr = prompt('Precio del accesorio/venta rápida:');
    if (!priceStr) return;
    const price = parseFloat(priceStr);
    if (isNaN(price) || price <= 0) return;
    
    const desc = prompt('Descripción (Ej. Cable USB, Vidrio Templado):') || 'Venta Rápida';
    
    setCart([...cart, {
      id: `PROD-${Date.now()}`,
      type: 'PRODUCT',
      title: desc,
      subtitle: 'Venta Directa',
      amount: price
    }]);
  };

  const removeFromCart = (id: string) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const updateCartItemAmount = (id: string, newAmount: number) => {
    setCart(cart.map(item => {
      if (item.id === id) {
        if (item.maxAmount !== undefined) {
          if (item.maxAmount < 0) {
            // For refunds, amount must be between maxAmount and 0
            const validAmount = Math.max(item.maxAmount, Math.min(0, newAmount));
            return { ...item, amount: validAmount };
          } else {
            // For charges, amount must be between 0 and maxAmount
            const validAmount = Math.max(0, Math.min(newAmount, item.maxAmount));
            return { ...item, amount: validAmount };
          }
        }
        return { ...item, amount: Math.max(0, newAmount) };
      }
      return item;
    }));
  };

  const handlePaymentMethodChange = (index: number, field: 'method' | 'amount', value: any) => {
    const newMethods = [...paymentMethods];
    newMethods[index] = { ...newMethods[index], [field]: value };
    setPaymentMethods(newMethods);
  };

  const addPaymentMethod = () => {
    setPaymentMethods([...paymentMethods, { method: 'CARD', amount: Math.max(0, balanceDue) }]);
  };

  const removePaymentMethod = (index: number) => {
    setPaymentMethods(paymentMethods.filter((_, i) => i !== index));
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    
    const isRefund = cartTotal < 0;
    
    if (paymentTotal <= 0 && !isRefund && cartTotal !== 0) {
      showNotification('error', 'Ingrese un monto de pago válido.');
      return;
    }

    // Pre-open print windows to avoid popup blockers
    const printWindows = new Map<string, Window | null>();
    cart.forEach(item => {
      if (item.type === 'ORDER' && item.originalOrder) {
        printWindows.set(item.id, window.open('about:blank', '_blank'));
      }
    });

    setIsProcessing(true);
    try {
      // Create payments array from paymentMethods
      const paymentsToRecord: Payment[] = isRefund
        ? [{
            id: crypto.randomUUID(),
            amount: cartTotal, // Negative amount for refund
            method: paymentMethods[0]?.method || 'CASH',
            date: Date.now(),
            cashierId: currentUser?.id || 'unknown',
            cashierName: currentUser?.name || 'Cajero',
            isRefund: true
          }]
        : cartTotal === 0 ? [] : paymentMethods.map(pm => ({
            id: crypto.randomUUID(),
            amount: pm.amount,
            method: pm.method,
            date: Date.now(),
            cashierId: currentUser?.id || 'unknown',
            cashierName: currentUser?.name || 'Cajero',
            isRefund: false
          }));

      // Process each item in the cart
      for (const item of cart) {
        if (item.type === 'ORDER' && item.originalOrder) {
          // Calculate how much of the total payment goes to this order
          let remainingAmountForOrder = item.amount;
          const orderPayments: Payment[] = [];
          let actualPaidForThisItem = 0;
          
          if (isRefund) {
            const refundAmount = remainingAmountForOrder;
            orderPayments.push({
              ...paymentsToRecord[0],
              id: crypto.randomUUID(),
              amount: refundAmount
            });
            actualPaidForThisItem = refundAmount;
          } else {
            for (const pm of paymentsToRecord) {
              if (remainingAmountForOrder <= 0) break;
              if (pm.amount > 0) {
                const amountToTake = Math.min(pm.amount, remainingAmountForOrder);
                orderPayments.push({
                  ...pm,
                  id: crypto.randomUUID(),
                  amount: amountToTake
                });
                pm.amount -= amountToTake;
                remainingAmountForOrder -= amountToTake;
                actualPaidForThisItem += amountToTake;
              }
            }
          }

          if (item.amount > 0 && actualPaidForThisItem === 0) continue; // Skip if nothing was paid for this item and it had a balance

          // Record accounting for order payments (if not a refund, which is handled below)
          if (!isRefund && actualPaidForThisItem > 0) {
            for (const op of orderPayments) {
              await accountingService.addTransaction({
                amount: op.amount,
                description: `Pago Orden #${item.originalOrder.readable_id || item.originalOrder.id} (${op.method})`,
                transaction_date: new Date().toISOString().split('T')[0],
                created_by: currentUser?.id || 'system',
                status: TransactionStatus.COMPLETED,
                source: 'STORE',
                order_id: item.originalOrder.id
              });
            }
          }

          // If the order is fully paid, we finalize delivery. Otherwise, it's just a deposit.
          const totalPaidBefore = (item.originalOrder.payments || []).reduce((sum, p) => sum + p.amount, 0);
          const newTotalPaid = totalPaidBefore + actualPaidForThisItem;
          const orderTotal = item.originalOrder.finalPrice || item.originalOrder.estimatedCost || 0;
          const isFullyPaid = newTotalPaid >= orderTotal;

          if (isRefund) {
            // Record expense for refund
            await accountingService.addTransaction({
              amount: -Math.abs(actualPaidForThisItem), // negative for expense
              description: `Devolución de Saldo - Orden #${item.originalOrder.readable_id || item.originalOrder.id}`,
              transaction_date: new Date().toISOString().split('T')[0],
              created_by: currentUser?.id || 'system',
              status: TransactionStatus.COMPLETED,
              source: 'STORE'
            });

            // If the order is CANCELED or RETURNED, we just add the payment.
            // If it's not RETURNED yet, we finalize delivery? Usually refunds happen when returning.
            // Let's finalize delivery if it's not already RETURNED or CANCELED.
            if (item.originalOrder.status === OrderStatus.REPAIRED) {
              const updatedOrder = await finalizeDelivery(
                item.originalOrder, 
                orderPayments, 
                currentUser!, 
                addPayments, 
                recordOrderLog
              );
              
              if (currentUser) {
                await auditService.recordLog(
                  { id: currentUser.id, name: currentUser.name },
                  ActionType.PAYMENT_ADDED,
                  `Devolución de saldo y entrega desde POS para Orden #${item.originalOrder.readable_id || item.originalOrder.id}: $${Math.abs(actualPaidForThisItem)}`,
                  item.originalOrder.id
                );
              }
              
              setTimeout(() => {
                try { printInvoice(updatedOrder, printWindows.get(item.id)); } catch(e) { console.error(e); }
              }, 100);
            } else {
              await addPayments(item.originalOrder.id, orderPayments);
              
              if (currentUser) {
                await auditService.recordLog(
                  { id: currentUser.id, name: currentUser.name },
                  ActionType.PAYMENT_ADDED,
                  `Devolución de saldo desde POS para Orden #${item.originalOrder.readable_id || item.originalOrder.id}: $${Math.abs(actualPaidForThisItem)}`,
                  item.originalOrder.id
                );
              }
              
              const orderToPrint = { ...item.originalOrder, payments: [...(item.originalOrder.payments || []), ...orderPayments] };
              setTimeout(() => {
                try { printInvoice(orderToPrint, printWindows.get(item.id)); } catch(e) { console.error(e); }
              }, 100);
            }

          } else if (isFullyPaid && item.originalOrder.status === OrderStatus.REPAIRED) {
            // Finalize delivery
            const updatedOrder = await finalizeDelivery(
              item.originalOrder, 
              orderPayments, 
              currentUser!, 
              addPayments, 
              recordOrderLog
            );
            
            if (currentUser) {
              await auditService.recordLog(
                { id: currentUser.id, name: currentUser.name },
                actualPaidForThisItem > 0 ? ActionType.PAYMENT_ADDED : ActionType.INFO_UPDATED,
                actualPaidForThisItem > 0 
                  ? `Pago final y entrega desde POS para Orden #${item.originalOrder.readable_id || item.originalOrder.id}: $${actualPaidForThisItem}`
                  : `Entrega de equipo sin cobro (saldo $0) desde POS para Orden #${item.originalOrder.readable_id || item.originalOrder.id}`,
                item.originalOrder.id
              );
            }

            // Print invoice
            setTimeout(() => {
              try { printInvoice(updatedOrder, printWindows.get(item.id)); } catch(e) { console.error(e); }
            }, 100);

          } else {
            // Just a deposit
            await addPayments(item.originalOrder.id, orderPayments);
            
            if (currentUser) {
              await auditService.recordLog(
                { id: currentUser.id, name: currentUser.name },
                ActionType.PAYMENT_ADDED,
                `Abono desde POS para Orden #${item.originalOrder.readable_id || item.originalOrder.id}: $${actualPaidForThisItem}`,
                item.originalOrder.id
              );
            }

            // Print invoice with updated payments
            const orderToPrint = { ...item.originalOrder, payments: [...(item.originalOrder.payments || []), ...orderPayments] };
            setTimeout(() => {
              try { printInvoice(orderToPrint, printWindows.get(item.id)); } catch(e) { console.error(e); }
            }, 100);
          }
        } else if (item.type === 'PRODUCT') {
          // For direct sales, we record the income/expense in the accounting system
          let remainingAmountForProduct = item.amount;
          let actualPaidForThisItem = 0;
          
          if (isRefund) {
            actualPaidForThisItem = remainingAmountForProduct;
            await accountingService.addTransaction({
              amount: -Math.abs(actualPaidForThisItem), // negative for expense
              description: `Devolución Producto: ${item.title} (POS)`,
              transaction_date: new Date().toISOString().split('T')[0],
              created_by: currentUser?.id || 'system',
              status: TransactionStatus.COMPLETED,
              source: 'STORE',
              branch: currentUser?.branch || 'T4',
              method: 'CASH' // Refunds are usually cash in this POS
            });
          } else {
            for (const pm of paymentsToRecord) {
              if (remainingAmountForProduct <= 0) break;
              if (pm.amount > 0) {
                const amountToTake = Math.min(pm.amount, remainingAmountForProduct);
                
                await accountingService.addTransaction({
                  amount: amountToTake,
                  description: `Venta Directa POS: ${item.title} (${pm.method})`,
                  transaction_date: new Date().toISOString().split('T')[0],
                  created_by: currentUser?.id || 'system',
                  status: TransactionStatus.COMPLETED,
                  source: 'STORE',
                  branch: currentUser?.branch || 'T4',
                  method: pm.method
                });
                
                pm.amount -= amountToTake;
                remainingAmountForProduct -= amountToTake;
                actualPaidForThisItem += amountToTake;
              }
            }
          }

          // Add audit log for product sale/return
          if (currentUser && actualPaidForThisItem !== 0) {
            await auditService.recordLog(
              { id: currentUser.id, name: currentUser.name },
              actualPaidForThisItem > 0 ? ActionType.PAYMENT_ADDED : ActionType.TRANSACTION_DELETED,
              `${actualPaidForThisItem > 0 ? 'Venta' : 'Devolución'} de producto: ${item.title} ($${Math.abs(actualPaidForThisItem)}) - Sucursal: ${currentUser.branch || 'T4'}`,
              'PRODUCT_SALE'
            );
          }
        }
      }
      
      const isDelivery = cart.some(i => i.type === 'ORDER' && i.originalOrder && i.originalOrder.status === OrderStatus.REPAIRED && (i.originalOrder.payments?.reduce((s,p)=>s+p.amount,0) || 0) + i.amount >= (i.originalOrder.finalPrice || i.originalOrder.estimatedCost || 0));
      
      if (isRefund) {
        const refundOrders = cart.filter(i => i.type === 'ORDER');
        if (refundOrders.length > 0) {
          setHandoverData({ 
            type: 'REFUND', 
            amount: Math.abs(cartTotal), 
            orders: refundOrders.map(o => ({ id: o.id, readableId: o.originalOrder?.readable_id?.toString() || o.id.slice(-4) })) 
          });
        } else {
          finishTransaction();
        }
      } else if (isDelivery || cartTotal === 0) {
        // Find all orders that are being delivered (REPAIRED and fully paid)
        const deliveredOrders = cart.filter(i => {
          if (i.type !== 'ORDER' || !i.originalOrder) return false;
          const isRepairedAndPaid = i.originalOrder.status === OrderStatus.REPAIRED && ((i.originalOrder.payments?.reduce((s,p)=>s+p.amount,0) || 0) + i.amount >= (i.originalOrder.finalPrice || i.originalOrder.estimatedCost || 0));
          return isRepairedAndPaid;
        });
        
        if (deliveredOrders.length > 0) {
          setHandoverData({ 
            type: 'DELIVERY', 
            amount: 0, 
            orders: deliveredOrders.map(o => ({ id: o.id, readableId: o.originalOrder?.readable_id?.toString() || o.id.slice(-4) })) 
          });
        } else {
          finishTransaction();
        }
      } else {
        finishTransaction();
      }
      
    } catch (error: any) {
      console.error("Error en POS:", error);
      showNotification('error', `Error al procesar el cobro: ${error.message}`);
      
      // Close pre-opened windows on error
      printWindows.forEach(win => {
        if (win && !win.closed) {
          win.close();
        }
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const finishTransaction = () => {
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      setCart([]);
      setPaymentMethods([{ method: 'CASH', amount: 0 }]);
    }, 3000);
  };

  const confirmHandover = async () => {
    if (!handoverData) return;
    
    try {
      if (handoverData.type === 'DELIVERY') {
        await Promise.all(handoverData.orders.map(order => 
          recordOrderLog(order.id, ActionType.INFO_UPDATED, `✅ Equipo entregado físicamente al cliente en mostrador.`, undefined, LogType.SUCCESS, currentUser?.name)
        ));
      } else {
        await Promise.all(handoverData.orders.map(order => 
          recordOrderLog(order.id, ActionType.INFO_UPDATED, `✅ Devolución de $${handoverData.amount} realizada al cliente.`, undefined, LogType.SUCCESS, currentUser?.name)
        ));
      }
    } catch (e) {
      console.error(e);
    }
    
    setHandoverData(null);
    finishTransaction();
  };

  const isRefund = cartTotal < 0;
  const isAbono = cart.some(item => item.maxAmount !== undefined && Math.abs(item.amount) < Math.abs(item.maxAmount)) || (paymentTotal > 0 && paymentTotal < cartTotal);
  const isOverpaid = paymentTotal > cartTotal;
  const canCheckout = cart.length > 0 && !isProcessing && (isRefund || paymentTotal > 0 || cartTotal === 0);
  
  const initiateCheckout = () => {
    if (!canCheckout) return;
    
    // Only show tender modal if we are charging money and there is a CASH payment
    if (cartTotal > 0 && cashAmount > 0) {
      setTenderAmount(cashAmount);
      setShowTenderModal(true);
    } else {
      handleCheckout();
    }
  };

  const isNotReady = (status: OrderStatus) => ![OrderStatus.REPAIRED, OrderStatus.RETURNED, OrderStatus.CANCELED].includes(status);
  const hasNotReadyOrder = cart.some(item => item.type === 'ORDER' && item.originalOrder && isNotReady(item.originalOrder.status));
  const hasPendingNotifications = cart.some(item => item.type === 'ORDER' && item.originalOrder && (item.originalOrder.techMessage?.pending || item.originalOrder.returnRequest?.status === 'PENDING'));

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto h-[calc(100vh-80px)] flex flex-col font-sans">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tighter flex items-center gap-4">
            <div className="p-3 bg-emerald-500/10 rounded-2xl">
              <Calculator className="w-8 h-8 md:w-10 md:h-10 text-emerald-600" />
            </div>
            Punto de Venta
          </h1>
          <p className="text-slate-500 font-medium mt-2 text-lg">Terminal de facturación y cobro rápido.</p>
        </div>
        
        <button 
          onClick={() => setShowExpenseModal(true)}
          className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 px-6 py-3.5 rounded-2xl font-bold flex items-center gap-3 transition-all border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md"
        >
          <ArrowDownToLine className="w-5 h-5 text-red-500" />
          Registrar Salida
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 flex-1 min-h-0">
        
        {/* LEFT PANEL: Search & Quick Items */}
        <div className="flex-1 flex flex-col gap-6 min-h-0">
          {/* Giant Search Bar */}
          <div className="relative group z-20">
            <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
              {isSearching ? (
                <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
              ) : (
                <Search className="w-7 h-7 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
              )}
            </div>
            <input 
              autoFocus
              type="text"
              placeholder="Buscar orden por ID, Cliente, Teléfono o IMEI..."
              className="w-full pl-16 pr-6 py-5 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-3xl text-xl outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all shadow-sm font-medium text-slate-800 dark:text-white placeholder:text-slate-400"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && searchTerm.trim()) {
                  e.preventDefault();
                  const term = searchTerm.trim().toLowerCase();
                  
                  // If we already have results from the debounced search, check them first
                  if (pendingOrders.length > 0) {
                    const exactMatch = pendingOrders.find(o => 
                      o.readable_id?.toString().toLowerCase() === term || 
                      o.id.toLowerCase() === term
                    );
                    if (exactMatch) {
                      addToCart(exactMatch);
                      return;
                    } else if (pendingOrders.length === 1) {
                      addToCart(pendingOrders[0]);
                      return;
                    }
                  }

                  // If no match in pendingOrders (e.g. fast scanner input), do a direct query
                  setIsSearching(true);
                  try {
                    let query = supabase
                      .from('orders')
                      .select('*')
                      .limit(10);
                      
                    if (currentUser?.branch) {
                      query = query.eq('currentBranch', currentUser.branch);
                    }
                      
                    if (/^\d+$/.test(term)) {
                      if (term.length <= 9) {
                        query = query.or(`readable_id.eq.${term},id.ilike.%${term}%,imei.ilike.%${term}%,customer->>phone.ilike.%${term}%`);
                      } else {
                        query = query.or(`id.ilike.%${term}%,imei.ilike.%${term}%,customer->>phone.ilike.%${term}%`);
                      }
                    } else {
                      query = query.or(`id.ilike.%${term}%,customer->>name.ilike.%${term}%,customer->>phone.ilike.%${term}%,deviceModel.ilike.%${term}%,imei.ilike.%${term}%`);
                    }

                    const { data, error } = await query;
                    
                    if (!error && data && data.length > 0) {
                      const filtered = (data as RepairOrder[]).filter(o => {
                        const totalPaid = (o.payments || []).reduce((sum, p) => sum + p.amount, 0);
                        const orderTotal = o.finalPrice || o.estimatedCost || 0;
                        const balance = orderTotal - totalPaid;
                        if (o.status === OrderStatus.CANCELED || o.status === OrderStatus.RETURNED) return balance < 0;
                        if (balance <= 0 && o.status !== OrderStatus.REPAIRED) return false;
                        return true;
                      });

                      const exactMatch = filtered.find(o => 
                        o.readable_id?.toString().toLowerCase() === term || 
                        o.id.toLowerCase() === term
                      );

                      if (exactMatch) {
                        addToCart(exactMatch);
                      } else if (filtered.length === 1) {
                        addToCart(filtered[0]);
                      } else {
                        showNotification('error', 'No se encontró una orden exacta lista para cobrar.');
                      }
                    } else {
                      showNotification('error', 'Orden no encontrada.');
                    }
                  } catch (err) {
                    console.error("Error direct search:", err);
                  } finally {
                    setIsSearching(false);
                  }
                }
              }}
            />
            
            {/* Search Results Dropdown */}
            {searchTerm && (
              <div className="absolute top-full left-0 right-0 mt-4 bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden z-50 max-h-[400px] flex flex-col">
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Resultados de búsqueda</p>
                </div>
                <div className="overflow-y-auto p-2 custom-scrollbar">
                  {isSearching ? (
                    <div className="p-8 text-center">
                      <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                      </div>
                      <p className="text-slate-500 font-medium">Buscando órdenes...</p>
                    </div>
                  ) : pendingOrders.length === 0 ? (
                    <div className="p-8 text-center">
                      <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Search className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                      </div>
                      <p className="text-slate-500 font-medium">No se encontraron órdenes pendientes.</p>
                    </div>
                  ) : (
                    pendingOrders.map(order => {
                      const totalPaid = (order.payments || []).reduce((sum, p) => sum + p.amount, 0);
                      const orderTotal = order.finalPrice || order.estimatedCost || 0;
                      const balance = orderTotal - totalPaid;
                      
                      return (
                        <div 
                          key={order.id}
                          onClick={() => addToCart(order)}
                          className="flex items-center justify-between p-4 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-2xl cursor-pointer transition-all group border border-transparent hover:border-emerald-100 dark:hover:border-emerald-500/20 mb-1"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-500 dark:text-slate-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors shadow-sm">
                              <Smartphone className="w-6 h-6" />
                            </div>
                            <div>
                              <p className="font-black text-slate-800 dark:text-white text-lg tracking-tight">
                                #{order.readable_id || order.id.slice(-4)} <span className="text-slate-300 dark:text-slate-600 font-medium mx-2">|</span> {order.deviceModel}
                              </p>
                              <p className="text-sm text-slate-500 flex items-center gap-1.5 font-medium mt-0.5">
                                <UserIcon className="w-4 h-4" /> {order.customer.name}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Saldo Pendiente</p>
                            <p className="font-black text-emerald-600 text-xl">${balance.toLocaleString()}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Quick Actions Bento */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 z-10">
            <button 
              onClick={addQuickProduct}
              className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-blue-200 dark:hover:border-blue-500/30 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all flex flex-col items-start gap-4 group text-left"
            >
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Tag className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 dark:text-white text-lg">Venta Rápida</h3>
                <p className="text-sm text-slate-500 font-medium mt-1">Accesorios o servicios sin orden</p>
              </div>
            </button>
            {/* Future quick actions can go here */}
          </div>
        </div>

        {/* RIGHT PANEL: Cart (Standard Theme) */}
        <div className="w-full lg:w-[420px] xl:w-[480px] bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl flex flex-col overflow-hidden shrink-0 border border-slate-200 dark:border-slate-800 relative z-10">
          {/* Decorative top glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-4 bg-emerald-500/20 blur-2xl rounded-full pointer-events-none"></div>

          {/* Cart Header */}
          <div className="p-6 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 relative z-10">
            <h2 className="font-black text-xl text-slate-900 dark:text-white flex items-center gap-3 tracking-tight">
              <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center">
                <Receipt className="w-5 h-5 text-emerald-500" />
              </div>
              Ticket de Cobro
            </h2>
            <span className="bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-lg text-sm font-bold border border-emerald-200 dark:border-emerald-500/20">
              {cart.length} items
            </span>
          </div>

          {(hasNotReadyOrder || hasPendingNotifications) && (
            <div className="bg-amber-500 text-white p-3 text-sm font-bold flex items-center gap-2 justify-center relative z-10">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <span>
                Atención: Hay órdenes que no están listas o tienen notificaciones pendientes.
              </span>
            </div>
          )}

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar relative z-10">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-600 space-y-4">
                <ShoppingCart className="w-20 h-20 opacity-50" />
                <p className="font-medium text-center text-lg text-slate-400 dark:text-slate-500">El carrito está vacío.</p>
              </div>
            ) : (
              cart.map(item => (
                <div key={item.id} className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/50 relative group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <button 
                    onClick={() => removeFromCart(item.id)}
                    className="absolute -top-3 -right-3 bg-red-500 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg hover:bg-red-600 hover:scale-110"
                  >
                    <X className="w-4 h-4 font-bold" />
                  </button>
                  
                  <div className="mb-4 pr-4">
                    <p className="font-bold text-slate-900 dark:text-white text-lg leading-tight tracking-tight">{item.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold mt-1.5 tracking-wider">{item.subtitle}</p>
                  </div>
                  
                  <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700/50">
                    <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      {item.amount < 0 ? 'A Devolver' : 'A Cobrar'}
                    </span>
                    <div className={`flex items-center gap-2 bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 focus-within:border-emerald-500/50 transition-colors ${item.amount < 0 ? 'border-orange-500/50 focus-within:border-orange-500/50' : ''}`}>
                      <span className={`${item.amount < 0 ? 'text-orange-500' : 'text-emerald-500'} font-bold pl-3`}>$</span>
                      <input 
                        type="number"
                        value={item.amount || ''}
                        onChange={(e) => updateCartItemAmount(item.id, parseFloat(e.target.value) || 0)}
                        className={`w-28 text-right font-black text-xl bg-transparent outline-none pr-3 ${item.amount < 0 ? 'text-orange-500' : 'text-slate-900 dark:text-white'}`}
                      />
                    </div>
                  </div>
                  {item.type === 'ORDER' && item.originalOrder && isNotReady(item.originalOrder.status) && (
                    <div className="mt-4 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 p-3 rounded-xl text-sm font-medium flex items-start gap-2 border border-amber-200/50 dark:border-amber-800/50">
                      <ShieldAlert className="w-5 h-5 shrink-0" />
                      <p>Esta orden aún no está lista. Solo se registrará el pago, no se entregará el equipo.</p>
                    </div>
                  )}
                  {item.maxAmount !== undefined && Math.abs(item.amount) < Math.abs(item.maxAmount) && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400/80 font-bold text-right mt-3">
                      Quedará un saldo de ${Math.abs(item.maxAmount - item.amount).toLocaleString()}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Checkout Section */}
          <div className="p-6 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-200 dark:border-slate-800 backdrop-blur-xl relative z-10">
            
            {/* Totals */}
            <div className="flex justify-between items-end mb-6">
              <span className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest text-sm">Total a Cobrar</span>
              <span className="text-5xl font-black text-slate-900 dark:text-white tracking-tighter">${cartTotal.toLocaleString()}</span>
            </div>

            {/* Payment Methods */}
            {cart.length > 0 && cartTotal !== 0 && (
              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    {isRefund ? 'Método de Devolución' : 'Métodos de Pago'}
                  </p>
                  {!isRefund && (
                    <button 
                      onClick={addPaymentMethod}
                      className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1.5 rounded-lg transition-colors border border-emerald-100 dark:border-transparent"
                    >
                      <Plus className="w-3 h-3" /> Dividir
                    </button>
                  )}
                </div>
                
                {isRefund ? (
                  <div className="flex items-center gap-2">
                    <select 
                      value={paymentMethods[0]?.method || 'CASH'}
                      onChange={(e) => handlePaymentMethodChange(0, 'method', e.target.value)}
                      className="flex-1 bg-white dark:bg-slate-900 border border-orange-200 dark:border-orange-700/50 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-orange-500/50 appearance-none"
                    >
                      <option value="CASH" className="text-black">Efectivo</option>
                      <option value="CARD" className="text-black">Tarjeta</option>
                      <option value="TRANSFER" className="text-black">Transferencia</option>
                    </select>
                    <div className="relative w-36 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 rounded-xl flex items-center justify-end pr-4 py-3.5">
                      <span className="text-orange-500 font-black text-lg">
                        ${Math.abs(cartTotal).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ) : (
                  paymentMethods.map((pm, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select 
                        value={pm.method}
                        onChange={(e) => handlePaymentMethodChange(idx, 'method', e.target.value)}
                        className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-emerald-500/50 appearance-none"
                      >
                        <option value="CASH" className="text-black">Efectivo</option>
                        <option value="CARD" className="text-black">Tarjeta</option>
                        <option value="TRANSFER" className="text-black">Transferencia</option>
                      </select>
                      <div className="relative w-36">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-bold">$</span>
                        <input 
                          type="number"
                          value={pm.amount || ''}
                          onChange={(e) => handlePaymentMethodChange(idx, 'amount', parseFloat(e.target.value) || 0)}
                          className="w-full pl-8 pr-4 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-lg font-black text-slate-900 dark:text-white outline-none text-right focus:border-emerald-500/50"
                        />
                      </div>
                      {paymentMethods.length > 1 && (
                        <button onClick={() => removePaymentMethod(idx)} className="p-3.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/20 rounded-xl transition-colors">
                          <X className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  ))
                )}
                
                {!isRefund && balanceDue !== 0 && (
                  <div className={`mt-4 p-4 rounded-xl border ${
                    balanceDue > 0 
                      ? (isAbono ? 'bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/20 text-purple-600 dark:text-purple-400' : 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20 text-amber-600 dark:text-amber-400')
                      : 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                  } flex justify-between items-center`}>
                    <span className="text-xs font-bold uppercase tracking-wider">
                      {balanceDue > 0 ? (isAbono ? 'Quedará pendiente' : 'Falta cubrir') : 'Cambio a devolver'}
                    </span>
                    <span className="font-black text-xl">
                      ${Math.abs(balanceDue).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Action Button */}
            <button 
              onClick={initiateCheckout}
              disabled={!canCheckout}
              className={`w-full py-5 rounded-2xl font-black text-xl flex items-center justify-center gap-3 transition-all
                ${!canCheckout 
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed' 
                  : isRefund
                    ? 'bg-orange-500 hover:bg-orange-400 text-white shadow-lg shadow-orange-500/30 hover:scale-[1.02] active:scale-[0.98]'
                    : hasNotReadyOrder
                      ? 'bg-amber-500 hover:bg-amber-400 text-white shadow-lg shadow-amber-500/30 hover:scale-[1.02] active:scale-[0.98]'
                      : isAbono 
                        ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/30 hover:scale-[1.02] active:scale-[0.98]'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/30 hover:scale-[1.02] active:scale-[0.98]'
                }
              `}
            >
              {isProcessing ? (
                <span className="flex items-center gap-2"><div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin"/> Procesando...</span>
              ) : showSuccess ? (
                <span className="flex items-center gap-2"><CheckCircle2 className="w-7 h-7"/> ¡Operación Exitosa!</span>
              ) : isRefund ? (
                <span className="flex items-center gap-2"><ArrowDownToLine className="w-7 h-7"/> {hasNotReadyOrder ? 'Devolver Dinero (No Entregar)' : cart.some(i => i.type === 'ORDER' && i.originalOrder && [OrderStatus.RETURNED, OrderStatus.CANCELED].includes(i.originalOrder.status)) ? 'Devolver Dinero' : 'Devolver Dinero y Entregar'}</span>
              ) : hasNotReadyOrder ? (
                <span className="flex items-center gap-2"><Receipt className="w-7 h-7"/> Registrar Pago Anticipado</span>
              ) : isAbono ? (
                <span className="flex items-center gap-2"><Receipt className="w-7 h-7"/> Abonar (No Entregar)</span>
              ) : cart.some(i => i.type === 'ORDER') ? (
                <span className="flex items-center gap-2"><Receipt className="w-7 h-7"/> {cartTotal === 0 ? 'Entregar Equipo' : 'Cobrar y Entregar Equipo'}</span>
              ) : (
                <span className="flex items-center gap-2"><Receipt className="w-7 h-7"/> Cobrar e Imprimir</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {showExpenseModal && (
        <ExpenseModal 
          onClose={() => setShowExpenseModal(false)}
          onSuccess={() => {
            setShowExpenseModal(false);
            showNotification('success', 'Gasto registrado correctamente');
          }}
        />
      )}

      {/* Tender Modal (Calculadora de Cambio) */}
      {showTenderModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Monto Recibido</h3>
              <p className="text-slate-500 font-medium mb-6">Total a cobrar en efectivo: ${cashAmount.toLocaleString()}</p>
              
              <div className="relative mb-6">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-bold text-2xl">$</span>
                <input 
                  autoFocus
                  type="number"
                  value={tenderAmount || ''}
                  onChange={(e) => setTenderAmount(parseFloat(e.target.value) || 0)}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && tenderAmount >= cashAmount) {
                      setShowTenderModal(false);
                      handleCheckout();
                    }
                  }}
                  className="w-full pl-10 pr-4 py-4 bg-slate-50 dark:bg-slate-800 border-2 border-emerald-500/30 rounded-2xl text-3xl font-black text-slate-900 dark:text-white outline-none text-center focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 transition-all"
                />
              </div>
              
              <div className={`p-4 rounded-2xl mb-6 ${tenderAmount >= cashAmount ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400'}`}>
                <p className="text-sm font-bold uppercase tracking-wider mb-1">Cambio a devolver</p>
                <p className="text-4xl font-black">${Math.max(0, tenderAmount - cashAmount).toLocaleString()}</p>
              </div>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowTenderModal(false)}
                  className="flex-1 py-4 rounded-xl font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    setShowTenderModal(false);
                    handleCheckout();
                  }}
                  disabled={tenderAmount < cashAmount}
                  className="flex-1 py-4 rounded-xl font-bold text-white bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-emerald-500/30"
                >
                  Confirmar (Enter)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Handover Modal (Confirmación Física) */}
      {handoverData && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200">
            <div className="p-8 text-center">
              <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 ${handoverData.type === 'DELIVERY' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-500' : 'bg-red-100 dark:bg-red-500/20 text-red-500'}`}>
                {handoverData.type === 'DELIVERY' ? <Smartphone className="w-12 h-12" /> : <Banknote className="w-12 h-12" />}
              </div>
              
              <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
                {handoverData.type === 'DELIVERY' ? '¿Entregaste el equipo?' : '¿Devolviste el dinero?'}
              </h3>
              <p className="text-slate-500 font-medium mb-8 text-lg">
                {handoverData.type === 'DELIVERY' 
                  ? `Confirma que entregaste físicamente ${handoverData.orders.length > 1 ? 'los equipos de las órdenes' : 'el equipo de la orden'} #${handoverData.orders.map(o => o.readableId).join(', #')} al cliente.` 
                  : `Confirma que realizaste la devolución de $${handoverData.amount.toLocaleString()} al cliente por ${handoverData.orders.length > 1 ? 'las órdenes' : 'la orden'} #${handoverData.orders.map(o => o.readableId).join(', #')}.`}
              </p>
              
              <button 
                autoFocus
                onClick={confirmHandover}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmHandover(); }}
                className={`w-full py-5 rounded-2xl font-black text-xl text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98] ${handoverData.type === 'DELIVERY' ? 'bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/30' : 'bg-red-500 hover:bg-red-400 shadow-red-500/30'}`}
              >
                Sí, Confirmar (Enter)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
