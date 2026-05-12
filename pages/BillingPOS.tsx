import React, { useState, useMemo, useEffect } from 'react';
import { Search, ShoppingCart, CreditCard, Banknote, Smartphone, Plus, Trash2, Receipt, Calculator, X, User as UserIcon, Tag, ArrowRight, CheckCircle2, ArrowDownToLine, Loader2, ShieldAlert, Clock, XCircle, RefreshCw, Building2, ChevronDown, ChevronUp, Package, Minus, FileText, Bookmark, Save, List, Camera, Check, AlertTriangle } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useOrders } from '../contexts/OrderContext';
import { useAuth } from '../contexts/AuthContext';
import { useInventory } from '../contexts/InventoryContext';
import { OrderStatus, PaymentMethod, RepairOrder, Payment, ActionType, TransactionStatus, LogType, OrderType, PriorityLevel } from '../types';
import { ExpenseModal } from '../components/pos/ExpenseModal';
import { finalizeDelivery } from '../services/deliveryService';
import { printInvoice } from '../services/invoiceService';
import { auditService } from '../services/auditService';
import { accountingService } from '../services/accountingService';
import { supabase } from '../services/supabase';
import { CameraCapture } from '../components/CameraCapture';
import { PendingExpensesWidget } from '../components/pos/PendingExpensesWidget';
import { PosReturnModal } from './PosReturnModal';
import { toast } from 'sonner';
import { DbFixModal } from '../components/DbFixModal';

interface CartItem {
  id: string;
  type: 'ORDER' | 'PRODUCT' | 'CREDIT_ABONO';
  title: string;
  subtitle: string;
  amount: number;
  quantity?: number;
  partCost?: number;
  originalPrice?: number; // Added to track discounts
  maxAmount?: number; // For orders, you can't pay more than the balance
  originalOrder?: RepairOrder;
  creditInfo?: any; // For CREDIT_ABONO
  imageUrl?: string;
  returnOriginalOrderId?: string;
  returnExpenseId?: string;
  returnPartId?: string;
}

export const BillingPOS: React.FC = () => {
  const { addPayments, showNotification, recordOrderLog, addOrder } = useOrders();
  const { currentUser, users } = useAuth();
  const { consumePart } = useInventory();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { inventory, fetchInventory } = useInventory();
  
  const [selectedSalespersonId, setSelectedSalespersonId] = useState<string>(currentUser?.id || '');

  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutResult, setCheckoutResult] = useState<{change: number, message: string} | null>(null);
  
  // Handle credit abono from navigation state
  useEffect(() => {
    if (location.state?.creditAbono) {
      const { id, clientName, clientPhone, amount, orderId } = location.state.creditAbono;
      setCart([{
        id: `abono-${id}`,
        type: 'CREDIT_ABONO',
        title: `Abono a Crédito: ${clientName}`,
        subtitle: `Deuda Total: $${amount.toLocaleString()}`,
        amount: 0, // User will input the amount they want to pay
        maxAmount: amount,
        creditInfo: { id, client_name: clientName, client_phone: clientPhone, amount, order_id: orderId }
      }]);
      // Clear state to prevent re-adding on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);
  
  // Payment state
  const [paymentMethods, setPaymentMethods] = useState<{method: PaymentMethod, amount: number}[]>([
    { method: 'CASH', amount: 0 }
  ]);
  
  const [cambiazoDetails, setCambiazoDetails] = useState({
    deviceModel: '',
    storage: '',
    battery: '',
    deviceIssue: '',
    deviceCondition: 'Sin observaciones',
    devicePassword: '',
    imei: '',
    accessories: '',
    devicePhoto: ''
  });
  const [isCambiazoModalMinimized, setIsCambiazoModalMinimized] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  const [savedQuotes, setSavedQuotes] = useState<{id: string, date: number, customer: any, cart: any[], salespersonId?: string, salespersonName?: string, paymentMethods?: any[], creditClientInfo?: any}[]>(() => {
    try {
      const q = localStorage.getItem('pos_saved_quotes');
      return q ? JSON.parse(q) : [];
    } catch { return []; }
  });
  const [showQuotesModal, setShowQuotesModal] = useState(false);
  const [currentQuoteId, setCurrentQuoteId] = useState<string | null>(null);

  const saveQuote = () => {
    if (cart.length === 0) {
      showNotification('error', 'El carrito está vacío');
      return;
    }
    if (!selectedCustomer) {
      showNotification('error', 'Selecciona o registra un cliente para guardar la cotización');
      return;
    }
    const salesp = users?.find(u => u.id === selectedSalespersonId) || currentUser;
    let updated;
    if (currentQuoteId) {
      // Update existing
      updated = savedQuotes.map(q => q.id === currentQuoteId ? {
        ...q,
        date: Date.now(),
        customer: selectedCustomer,
        cart: cart,
        salespersonId: salesp?.id,
        salespersonName: salesp?.name,
        paymentMethods: paymentMethods,
        creditClientInfo: creditClientInfo
      } : q);
      showNotification('success', 'Cotización Actualizada');
    } else {
      const newQuote = {
          id: `COT-${Date.now().toString().slice(-4)}`,
          date: Date.now(),
          customer: selectedCustomer,
          cart: cart,
          salespersonId: salesp?.id,
          salespersonName: salesp?.name,
          paymentMethods: paymentMethods,
          creditClientInfo: creditClientInfo
      };
      updated = [newQuote, ...savedQuotes];
      showNotification('success', 'Cotización Guardada');
    }
    setSavedQuotes(updated);
    localStorage.setItem('pos_saved_quotes', JSON.stringify(updated));
    setCart([]);
    setSelectedCustomer(null);
    setCurrentQuoteId(null);
  };

  const loadQuote = (quoteId: string) => {
    const q = savedQuotes.find(x => x.id === quoteId);
    if (q) {
        setCart(q.cart);
        if (q.customer) setSelectedCustomer(q.customer);
        if (q.salespersonId) setSelectedSalespersonId(q.salespersonId);
        if (q.paymentMethods && q.paymentMethods.length > 0) setPaymentMethods(q.paymentMethods);
        if (q.creditClientInfo) setCreditClientInfo(q.creditClientInfo);
        setCurrentQuoteId(quoteId);
        // Do not delete the quote
        setShowQuotesModal(false);
    }
  };

  const discardQuote = (quoteId: string) => {
    const updated = savedQuotes.filter(x => x.id !== quoteId);
    setSavedQuotes(updated);
    localStorage.setItem('pos_saved_quotes', JSON.stringify(updated));
    if (currentQuoteId === quoteId) {
       setCurrentQuoteId(null);
       setCart([]);
       setSelectedCustomer(null);
    }
  };

  const clearCart = () => {
    setCart([]);
    setSelectedCustomer(null);
    setCurrentQuoteId(null);
  };

  const [isProcessing, setIsProcessing] = useState(false);
  const [showDbFixModal, setShowDbFixModal] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);

  const handleAddReturnItem = (productName: string, amountToRefund: number, partCost: number, originalOrderId: string, readableId: string, expenseId?: string, partId?: string) => {
    setCart(prev => {
      // create a new cart item with negative amount
      const returnItem: CartItem = {
         id: `ret-${Date.now()}`,
         type: 'PRODUCT',
         title: `Devolución: ${productName}`,
         subtitle: `De Orden #${readableId}`,
         amount: -Math.abs(amountToRefund),
         originalPrice: -Math.abs(amountToRefund),
         partCost: -Math.abs(partCost || 0),
         returnOriginalOrderId: originalOrderId,
         returnExpenseId: expenseId,
         returnPartId: partId
      };
      return [...prev, returnItem];
    });
    showNotification('success', 'Devolución agregada al carrito');
  };

  const [pendingOrders, setPendingOrders] = useState<RepairOrder[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [customerSearch, setCustomerSearch] = useState('');
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [customerOptions, setCustomerOptions] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<{name: string, phone: string, address?: string} | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', phone: '', address: '' });
  
  const [searchContext, setSearchContext] = useState<'ORDER' | 'INVENTORY'>('ORDER');
  const [pendingInventory, setPendingInventory] = useState<any[]>([]);

  // New states for Tender and Handover modals
  const [showTenderModal, setShowTenderModal] = useState(false);
  const [tenderAmount, setTenderAmount] = useState<number>(0);
  const [creditClientInfo, setCreditClientInfo] = useState<{ name: string, phone: string } | null>(null);
  const [creditDueDate, setCreditDueDate] = useState<string>(() => {
    const date = new Date();
    date.setDate(date.getDate() + 7); // Default 7 days
    return date.toISOString().split('T')[0];
  });

  // Prompt Modal State
  const [promptModal, setPromptModal] = useState<{
    title: string;
    message: string;
    fields: { key: string, label: string, type: string, defaultValue?: string }[];
    onConfirm: (values: Record<string, string>) => void;
  } | null>(null);

  const [handoverData, setHandoverData] = useState<{ type: 'DELIVERY' | 'REFUND', amount: number, orders: { id: string, readableId: string }[] } | null>(null);

  const [cashExpenses, setCashExpenses] = useState<any[]>([]);
  const [isLoadingExpenses, setIsLoadingExpenses] = useState(false);
  const [isExpensesExpanded, setIsExpensesExpanded] = useState(false);

  const expenseTotals = useMemo(() => {
    return cashExpenses.reduce((acc, curr) => {
      if (curr.approval_status !== 'REJECTED') {
        acc.total += curr.amount;
      }
      if (curr.approval_status === 'APPROVED') {
        acc.approved += curr.amount;
      } else if (curr.approval_status === 'PENDING') {
        acc.pending += curr.amount;
      }
      return acc;
    }, { total: 0, approved: 0, pending: 0 });
  }, [cashExpenses]);

  const handleDismissExpense = async (expense: any) => {
    // Guidelines: avoid window.confirm. We'll just perform the action or use a notification.
    // For now, I'll just remove the confirm as it's a dismissal action.
    
    try {
      const { error } = await supabase
        .from(expense.table)
        .update({ closing_id: 'dismissed' })
        .eq('id', expense.id);
        
      if (error) throw error;
      
      showNotification('success', "Gasto limpiado correctamente.");
      fetchCashExpenses();
    } catch (err) {
      console.warn("Error dismissing expense:", err);
      showNotification('error', "Error al limpiar el gasto.");
    }
  };

  const fetchCashExpenses = async () => {
    if (!currentUser) return;
    setIsLoadingExpenses(true);
    try {
      const [floatingRes, accountingRes] = await Promise.all([
        supabase
          .from('floating_expenses')
          .select('*')
          .eq('created_by', currentUser.id)
          .is('closing_id', null)
          .gte('created_at', '2026-03-19T00:00:00Z'),
        supabase
          .from('accounting_transactions')
          .select('*')
          .eq('created_by', currentUser.id)
          .lt('amount', 0)
          .is('closing_id', null)
          .gte('created_at', '2026-03-19T00:00:00Z')
      ]);

      const floating = (floatingRes.data || []).map(e => ({ ...e, expenseType: 'ORDER', table: 'floating_expenses' }));
      const accounting = (accountingRes.data || []).map(e => ({ 
        ...e, 
        expenseType: e.source === 'ORDER' ? 'ORDER' : 'LOCAL', 
        amount: Math.abs(e.amount),
        table: 'accounting_transactions'
      }));
      
      const combined = [...floating, ...accounting].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      
      setCashExpenses(combined);
    } catch (err) {
      console.warn("Error fetching cash expenses:", err);
    } finally {
      setIsLoadingExpenses(false);
    }
  };

  useEffect(() => {
    fetchCashExpenses();

    // Real-time subscription for expenses
    if (!currentUser) return;

    const floatingChannel = supabase.channel('floating_expenses_pos')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'floating_expenses',
        filter: `created_by=eq.${currentUser.id}`
      }, () => fetchCashExpenses())
      .subscribe();

    const accountingChannel = supabase.channel('accounting_transactions_pos')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'accounting_transactions',
        filter: `created_by=eq.${currentUser.id}`
      }, () => fetchCashExpenses())
      .subscribe();

    return () => {
      supabase.removeChannel(floatingChannel);
      supabase.removeChannel(accountingChannel);
    };
  }, [currentUser?.id]);

  // Real-time search for Customers
  useEffect(() => {
    if (!customerSearch.trim()) {
      setCustomerOptions([]);
      return;
    }
    const fetchCustomers = async () => {
      setIsSearchingCustomer(true);
      try {
        const term = customerSearch.trim().toLowerCase();
        
        // Let's try customers table first
        const { data: customerData, error: customerError } = await supabase
          .from('customers')
          .select('*')
          .or(`name.ilike.%${term}%,phone.ilike.%${term}%`)
          .limit(10);
          
        let options = [];
        const phoneSet = new Set();
        
        if (customerData && customerData.length > 0) {
          customerData.forEach(c => {
            options.push(c);
            phoneSet.add(c.phone);
          });
        }
        
        // Then orders table as fallback for legacy customers
        if (options.length < 10) {
          const { data: orderData } = await supabase
            .from('orders')
            .select('customer')
            .or(`customer->>name.ilike.%${term}%,customer->>phone.ilike.%${term}%`)
            .limit(20);
            
          if (orderData) {
            orderData.forEach((row: any) => {
              const c = row.customer;
              if (c && c.phone && !phoneSet.has(c.phone)) {
                options.push(c);
                phoneSet.add(c.phone);
              }
            });
          }
        }
        
        setCustomerOptions(options.slice(0, 10));
      } catch (err) {} finally { setIsSearchingCustomer(false); }
    };
    const timer = setTimeout(fetchCustomers, 300);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  // Server-side search for orders or inventory
  useEffect(() => {
    if (!searchTerm.trim()) {
      setPendingOrders([]);
      setPendingInventory([]);
      return;
    }

    const fetchOrdersOrInventory = async () => {
      setIsSearching(true);
      try {
        const term = searchTerm.trim().toLowerCase();
        
        if (searchContext === 'ORDER') {
          let query = supabase
            .from('orders')
            .select('*')
            .limit(100);
            
          if (currentUser?.branch) {
            query = query.eq('currentBranch', currentUser.branch);
          }
            
          if (/^\d+$/.test(term)) {
            if (term.length <= 9) {
              query = query.or(`readable_id.eq.${term},id.ilike.%${term}%,imei.ilike.%${term}%,customer->>phone.ilike.%${term}%,devicePassword.ilike.%${term}%`);
            } else {
              query = query.or(`id.ilike.%${term}%,imei.ilike.%${term}%,customer->>phone.ilike.%${term}%`);
            }
          } else {
            query = query.or(`id.ilike.%${term}%,customer->>name.ilike.%${term}%,customer->>phone.ilike.%${term}%,deviceModel.ilike.%${term}%,imei.ilike.%${term}%,deviceIssue.ilike.%${term}%,devicePassword.ilike.%${term}%`);
          }

          const { data, error } = await query;
          
          if (error) throw error;
          
          // Filter out orders that have no balance and are not REPAIRED
          const filtered = (data as RepairOrder[]).filter(o => {
            if (o.orderType === OrderType.STORE) return false;
            const totalPaid = (o.payments || []).reduce((sum, p) => sum + p.amount, 0);
            const orderTotal = o.totalAmount ?? (o.finalPrice || o.estimatedCost || 0);
            const balance = orderTotal - totalPaid;
            
            if (o.status === OrderStatus.CANCELED || o.status === OrderStatus.RETURNED) {
              // Only show if there's a negative balance (refund due)
              return balance < 0;
            }
            
            if (balance <= 0 && o.status !== OrderStatus.REPAIRED) return false;
            return true;
          });

          setPendingOrders(filtered);
        } else {
          // INVENTORY search
          const words = term.split(/\s+/).filter(w => w.length > 0);
          const validItems = inventory.filter(item => {
            if (item.stock <= 0) return false;
            try {
              const cat = JSON.parse(item.category || '{}');
              if (cat?.type !== 'STORE_ITEM' || cat?.status !== 'AVAILABLE') return false;
              
              let searchString = `${item.id} ${item.name} ${item.category}`.toLowerCase();
              
              // Include parent readable_id for non-cellphone items
              if (cat.parentId && Object.keys(cat).includes('isCellphone') && cat.isCellphone === false) {
                 const parent = inventory.find(i => i.id === cat.parentId);
                 if (parent) searchString += ` ${parent.category?.toLowerCase() || ''}`;
              } else if (cat.parentId && !Object.keys(cat).includes('isCellphone')) {
                 // Fallback for older items before isCellphone flag
                 const parent = inventory.find(i => i.id === cat.parentId);
                 if (parent) searchString += ` ${parent.category?.toLowerCase() || ''}`;
              }

              return words.every(w => searchString.includes(w));
            } catch(e) {
              return false;
            }
          });
          
          setPendingInventory(validItems.slice(0, 40));
        }
      } catch (err) {
        console.warn("Error searching pos:", err);
      } finally {
        setIsSearching(false);
      }
    };

    const timer = setTimeout(fetchOrdersOrInventory, 400);
    return () => clearTimeout(timer);
  }, [searchTerm, searchContext]);

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

  const addToCartInventory = (part: any) => {
    if (cart.some(item => item.id === part.id)) {
      setCart(prev => prev.map(item => {
        if (item.id === part.id) {
          const newQty = (item.quantity || 1) + 1;
          return {
            ...item,
            quantity: newQty,
            amount: (item.originalPrice || 0) * newQty
          };
        }
        return item;
      }));
      setSearchTerm('');
      setPendingInventory([]);
      return;
    }
    
    let subtitle = 'Inventario';
    try {
        const cat = JSON.parse(part.category || '{}');
        if (cat.imei) subtitle = `IMEI: ${cat.imei}`;
        
        let readable = cat.readable_id;
        if (!readable && cat.parentId) {
            const parent = inventory.find((i: any) => i.id === cat.parentId);
            if (parent) {
                const pc = JSON.parse(parent.category || '{}');
                readable = pc.readable_id || pc.readableId;
            }
        }
        
        if (readable) subtitle = `Ref: ${readable} - ` + subtitle;
    } catch(e) {}
    
    setCart(prev => [{
      id: part.id,
      title: part.name,
      subtitle: subtitle,
      amount: part.price || 0,
      partCost: part.cost || 0,
      originalPrice: part.price || 0,
      type: 'PRODUCT',
      amountIn: part.price || 0,
      imageUrl: part.imageUrl,
      quantity: 1
    }, ...prev]);
    
    setSearchTerm('');
    setPendingInventory([]);
  };

  const addToCart = (order: RepairOrder) => {
    if (cart.some(item => item.id === order.id)) {
      showNotification('error', 'Esta orden ya está en el carrito');
      return;
    }
    
    if (order.orderType === OrderType.STORE) {
      showNotification('error', 'Los equipos recibidos no se pueden facturar por el Punto de Venta. Deben entregarse desde los detalles de la orden.');
      return;
    }

    let orderTotal = order.totalAmount ?? (order.finalPrice ?? (order.estimatedCost || 0));

    const totalPaid = (order.payments || []).reduce((sum, p) => sum + p.amount, 0);
    const balance = orderTotal - totalPaid;
    
    if (cart.length > 0) {
      const isCartRefund = cart[0].amount < 0;
      const isNewItemRefund = balance < 0;
      if (isCartRefund !== isNewItemRefund) {
        showNotification('error', 'No se pueden mezclar cobros y devoluciones en la misma transacción.');
        return;
      }
    }
    
    // Auto-select customer if not already selected
    if (!selectedCustomer && order.customer) {
      setSelectedCustomer(order.customer);
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
    
    setPromptModal({
      title: 'Venta Rápida / Accesorio',
      message: 'Ingrese los detalles de la venta:',
      fields: [
        { key: 'price', label: 'Precio', type: 'number' },
        { key: 'desc', label: 'Descripción (Ej. Cable USB, Vidrio Templado)', type: 'text', defaultValue: 'Venta Rápida' }
      ],
      onConfirm: (values) => {
        const priceStr = values.price;
        const price = parseFloat(priceStr);
        if (isNaN(price) || price <= 0) {
          showNotification('error', 'Precio inválido');
          return;
        }

        const desc = values.desc || 'Venta Rápida';
        
        setCart(prev => [...prev, {
          id: `PROD-${Date.now()}`,
          type: 'PRODUCT',
          title: desc,
          subtitle: 'Venta Directa',
          amount: price,
          originalPrice: price
        }]);
        setPromptModal(null);
      }
    });
  };

  const removeFromCart = (id: string) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const updateCartItemAmount = (id: string, newAmount: number) => {
    setCart(cart.map(item => {
      if (item.id === id) {
        if (item.maxAmount != null) {
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

  const handleCheckout = async (overrideCreditInfo?: {name: string, phone: string}) => {
    if (isProcessing) return;
    if (cart.length === 0) return;

    if (!selectedCustomer && !overrideCreditInfo && !location.state?.creditAbono) {
      showNotification('error', 'Debe seleccionar un perfil de cliente para facturar.');
      return;
    }
    
    
    const hasCreditPayment = paymentMethods.some(pm => pm.method === 'CREDIT' && pm.amount > 0);
    const isRefund = cartTotal < 0;
    if (paymentTotal <= 0 && !isRefund && cartTotal !== 0) {
      showNotification('error', 'Ingrese un monto de pago válido.');
      return;
    }

    // Phase 7: Validar stock localmente antes de enviar
    const productItemsInCart = cart.filter(i => i.type === 'PRODUCT');
    for (const item of productItemsInCart) {
        if (item.id && !item.id.startsWith('PROD-')) { // Sólo si es un producto real con UUID
            const invItem = inventory.find(i => i.id === item.id);
            if (invItem && invItem.stock <= 0) {
                showNotification('error', `El artículo ${item.title} se ha agotado. Refresque el inventario.`);
                setIsProcessing(false);
                return;
            }
        }
    }

    // Check for credit info
    const hasCredit = paymentMethods.some(pm => pm.method === 'CREDIT' && pm.amount > 0);
    const currentCreditInfo = overrideCreditInfo || creditClientInfo || (selectedCustomer ? { name: selectedCustomer.name, phone: selectedCustomer.phone } : null);
    if (hasCredit && !currentCreditInfo) {
      setPromptModal({
        title: 'Información de Crédito',
        message: 'Por favor ingrese los datos del cliente para el crédito:',
        fields: [
          { key: 'name', label: 'Nombre del Cliente', type: 'text', defaultValue: 'Cliente POS' },
          { key: 'phone', label: 'Teléfono', type: 'text' }
        ],
        onConfirm: (values) => {
          const newInfo = { name: values.name || 'Cliente POS', phone: values.phone || '' };
          setCreditClientInfo(newInfo);
          setPromptModal(null);
          setTimeout(() => handleCheckout(newInfo), 100);
        }
      });
      return;
    }

    setIsProcessing(true);
    
    // Pre-open print windows to avoid popup blockers
    const printWindows = new Map<string, Window | null>();
    cart.forEach(item => {
      if ((item.type === 'ORDER' && item.originalOrder) || item.type === 'CREDIT_ABONO') {
        printWindows.set(item.id, window.open('about:blank', '_blank') || null);
      }
    });

    let productPrintWindow: Window | null = null;
    if (cart.some(i => i.type === 'PRODUCT')) {
      productPrintWindow = window.open('about:blank', '_blank') || null;
    }

    try {
      // 1. Prepare Transaction Payload
      const idempotencyKey = `pos-${currentUser?.id}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      const cambiazoPaymentAmount = paymentMethods.find(pm => pm.method === 'CAMBIAZO')?.amount || 0;
      if (cambiazoPaymentAmount > 0 && !cambiazoDetails.deviceModel) {
        showNotification('error', 'El modelo del equipo es obligatorio para procesar el Cambiazo.');
        setIsProcessing(false);
        printWindows.forEach(w => w?.close());
        productPrintWindow?.close();
        setIsCambiazoModalMinimized(false);
        return;
      }
      
      const payload: any = {
        customer_id: ((selectedCustomer as any)?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test((selectedCustomer as any).id)) ? (selectedCustomer as any).id : null,
        raw_customer_id: (selectedCustomer as any)?.id || null,
        customer_name: (selectedCustomer as any)?.name || currentCreditInfo?.name || null,
        customer_phone: (selectedCustomer as any)?.phone || currentCreditInfo?.phone || null,
        seller_id: currentUser?.id,
        seller_name: currentUser?.name || 'Vendedor POS',
        branch: currentUser?.branch || 'T4',
        total: cartTotal,
        discount: 0,
        idempotency_key: idempotencyKey,
        credit_due_date: creditDueDate,
        items: cart.map(item => ({
          type: item.type,
          id: item.id,
          name: item.title,
          quantity: item.quantity || 1,
          price: item.amount,
          cost: item.partCost || 0,
          total_price: item.amount,
          returnOriginalOrderId: item.returnOriginalOrderId,
          returnExpenseId: item.returnExpenseId,
          returnPartId: item.returnPartId
        })),
        payments: paymentMethods.filter(pm => pm.amount !== 0).map(pm => ({
          method: pm.method,
          amount: pm.amount,
          date: Date.now(),
          cashierId: currentUser?.id,
          cashierName: currentUser?.name
        })),
        credit_info: currentCreditInfo,
        metadata: {
          source: 'NEW_POS_TRANSACTIONAL_V1',
          customer: selectedCustomer
        }
      };

      if (cambiazoPaymentAmount > 0) {
        payload.received_items = [{
          name: cambiazoDetails.deviceModel,
          value: cambiazoPaymentAmount,
          details: cambiazoDetails
        }];
      }

      // 2. Call Transactional RPC
      const { data: rpcResult, error: rpcError } = await supabase.rpc('pos_checkout_transaction', {
        p_payload: payload
      });

      if (rpcError) throw rpcError;
      if (!rpcResult?.success) throw new Error(rpcResult?.error || rpcResult?.message || 'Error en la transacción');

      // 3. Post-Transaction Tasks (Client Side only)
      // Print Receipts & UI Feedback
      for (const item of cart) {
        if (item.type === 'ORDER' && item.originalOrder) {
          const updatedOrder = { ...item.originalOrder, status: OrderStatus.RETURNED }; // Simulated for print
          try { printInvoice(updatedOrder as any, printWindows.get(item.id), 'FINAL'); } catch(e) {}
        }
        else if (item.type === 'PRODUCT') {
           // We could generate a generic invoice here for products
        }
      }

      if (productPrintWindow && rpcResult.sale_id) {
         // Generate consolidated invoice for products using sale_id info
         // (For now using current cart state to keep it fast)
         const dummyOrder: any = {
           id: rpcResult.sale_id,
           readable_id: `POS-${rpcResult.sale_id.slice(0,4)}`,
           customer: selectedCustomer || { name: 'Cliente POS', phone: 'S/N' },
           deviceModel: 'Venta de Productos',
           orderType: OrderType.PART_ONLY,
           totalAmount: cartTotal,
           payments: payload.payments,
           expenses: cart.filter(c => c.type === 'PRODUCT').map(c => ({ description: c.title, cost: c.amount, price: c.amount }))
         };
         try { printInvoice(dummyOrder, productPrintWindow, 'FINAL'); } catch(e) {}
      }

      // Finalize UI
      finishTransaction();
      showNotification('success', 'Venta procesada correctamente (Transacción Segura)');
      await fetchInventory();
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['client_credits'] });
      queryClient.invalidateQueries({ queryKey: ['cash_movements'] });
      queryClient.invalidateQueries({ queryKey: ['cashings'] });

    } catch (error: any) {
      console.error("Transactional POS Error:", error);
      showNotification('error', `Error al procesar el cobro: ${error.message}`);
      if (error.message && (error.message.includes('relation') || error.message.includes('column') || error.message.includes('constraint'))) {
         setShowDbFixModal(true);
      }
      // Close windows on error
      printWindows.forEach(w => w?.close());
      productPrintWindow?.close();
    } finally {
      setIsProcessing(false);
    }
  };

  const finishTransaction = () => {
    setShowSuccess(true);
    // Capture the change if it was a cash tender
    if (tenderAmount > cashAmount) {
      setCheckoutResult({ 
        change: tenderAmount - cashAmount, 
        message: '¡Venta realizada con éxito! No olvides entregar el cambio.' 
      });
    } else {
      setCheckoutResult(null);
    }
    
    if (currentQuoteId) {
      const updated = savedQuotes.filter(x => x.id !== currentQuoteId);
      setSavedQuotes(updated);
      localStorage.setItem('pos_saved_quotes', JSON.stringify(updated));
      setCurrentQuoteId(null);
    }

    setCart([]);
    setPaymentMethods([{ method: 'CASH', amount: 0 }]);
    setCreditClientInfo(null);
    
    // Auto-dismiss logic removed so the user can manually confirm the transaction finish.
    // They must click CERRAR or press ESC.
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
      console.warn(e);
    }
    
    setHandoverData(null);
    finishTransaction();
  };

  const isRefund = cartTotal < 0;
  const isAbono = cart.some(item => item.maxAmount != null && Math.abs(item.amount) < Math.abs(item.maxAmount)) || (paymentTotal > 0 && paymentTotal < cartTotal);
  const isOverpaid = paymentTotal > cartTotal;
  const canCheckout = cart.length > 0 && !!selectedCustomer && !isProcessing && (isRefund || paymentTotal > 0 || cartTotal === 0);
  
  const initiateCheckout = () => {
    if (!canCheckout) return;
    
    if (!selectedCustomer) {
      showNotification('error', 'Debes seleccionar un cliente');
      return;
    }
    
    // Only show tender modal if we are charging money and there is a CASH payment OR if doing an inventory sale (to prompt for invoice)
    const hasProducts = cart.some(i => i.type === 'PRODUCT');
    if ((cartTotal > 0 && cashAmount > 0) || hasProducts) {
      setTenderAmount(cashAmount);
      setShowTenderModal(true);
    } else {
      handleCheckout();
    }
  };

  const isNotReady = (status: OrderStatus) => ![OrderStatus.REPAIRED, OrderStatus.RETURNED, OrderStatus.CANCELED].includes(status);
  const hasNotReadyOrder = cart.some(item => item.type === 'ORDER' && item.originalOrder && isNotReady(item.originalOrder.status));
  const hasPendingNotifications = cart.some(item => item.type === 'ORDER' && item.originalOrder && (item.originalOrder.techMessage?.pending || item.originalOrder.returnRequest?.status === 'PENDING'));

  if (currentUser?.role === 'Monitor') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] p-8 text-center">
        <ShieldAlert className="w-16 h-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-2">Acceso Denegado</h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-md">
          Tu rol de Monitor no tiene permisos para acceder al Punto de Venta.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto h-[calc(100vh-80px)] flex flex-col font-sans">
      <PendingExpensesWidget expenses={cashExpenses.filter(e => e.approval_status === 'PENDING')} />
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tighter flex items-center gap-4">
            <div className="p-3 bg-emerald-500/10 rounded-2xl">
              <Calculator className="w-8 h-8 md:w-10 md:h-10 text-emerald-600" />
            </div>
            Punto de Venta
          </h1>
          <div className="flex items-center gap-4 mt-2">
            <p className="text-slate-500 font-medium text-lg">Terminal de facturación y cobro rápido.</p>
            <button onClick={() => setShowDbFixModal(true)} className="text-[10px] bg-amber-100 text-amber-700 font-bold px-3 py-1.5 rounded-lg uppercase tracking-widest hover:bg-amber-200 transition-colors border border-amber-200 shadow-sm flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Fix Cambiazo (V30)
            </button>
          </div>
        </div>
        
      <div className="flex gap-3">
        <button 
           onClick={() => setShowReturnModal(true)}
           className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 px-6 py-3.5 rounded-2xl font-bold flex items-center gap-3 transition-all border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md"
         >
           <Search className="w-5 h-5 text-indigo-500" />
           Facturas
         </button>
        <button 
          onClick={() => setShowExpenseModal(true)}
          className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 px-6 py-3.5 rounded-2xl font-bold flex items-center gap-3 transition-all border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md"
        >
          <ArrowDownToLine className="w-5 h-5 text-red-500" />
          Gasto de Caja
        </button>
      </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 flex-1 min-h-0">
        
        {/* LEFT PANEL: Search & Quick Items */}
        <div className="flex-1 flex flex-col gap-6 min-h-0">
          
          {/* Toggle Orders vs Inventory */}
          <div className="flex gap-2 relative z-20 bg-slate-100 p-1 rounded-2xl dark:bg-slate-800/50">
            <button
              onClick={() => { setSearchContext('ORDER'); setSearchTerm(''); setPendingOrders([]); setPendingInventory([]); }}
              className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                searchContext === 'ORDER' 
                  ? 'bg-white dark:bg-slate-700 text-emerald-600 shadow-sm' 
                  : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700/50'
              }`}
            >
              <Smartphone className="w-5 h-5" />
              Órdenes de Taller
            </button>
            <button
              onClick={() => { setSearchContext('INVENTORY'); setSearchTerm(''); setPendingOrders([]); setPendingInventory([]); }}
              className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                searchContext === 'INVENTORY' 
                  ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm' 
                  : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700/50'
              }`}
            >
              <Tag className="w-5 h-5" />
              Artículos
            </button>
          </div>

          {/* Giant Search Bar */}
          <div className="relative group z-30">
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
              placeholder={searchContext === 'ORDER' ? "Buscar orden por ID, Factura, Cliente, Teléfono, Producto o IMEI..." : "Buscar pieza en inventario..."}
              className="w-full pl-16 pr-6 py-5 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-3xl text-xl outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all shadow-sm font-medium text-slate-800 dark:text-white placeholder:text-slate-400"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && searchTerm.trim()) {
                  e.preventDefault();
                  const term = searchTerm.trim().toLowerCase();
                  
                  if (searchContext === 'ORDER') {
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

                    // If no match in pendingOrders, do a direct query
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
                          if (o.orderType === OrderType.STORE) return false;
                          const totalPaid = (o.payments || []).reduce((sum, p) => sum + p.amount, 0);
                          const orderTotal = o.totalAmount ?? (o.finalPrice || o.estimatedCost || 0);
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
                      console.warn("Error direct search:", err);
                    } finally {
                      setIsSearching(false);
                    }
                  } else {
                    // INVENTORY direct find
                    if (pendingInventory.length > 0) {
                      const exactMatch = pendingInventory.find(p => (p.id.toLowerCase() === term || p.name.toLowerCase() === term) && !cart.some(c => c.id === p.id));
                      if (exactMatch) {
                        addToCartInventory(exactMatch);
                        return;
                      } else if (pendingInventory.length === 1 && !cart.some(c => c.id === pendingInventory[0].id)) {
                        addToCartInventory(pendingInventory[0]);
                        return;
                      } else if (pendingInventory.length > 0 && pendingInventory.every(p => p.name === pendingInventory[0].name)) {
                        const available = pendingInventory.find(p => !cart.some(c => c.id === p.id));
                        if (available) {
                           addToCartInventory(available);
                           return;
                        }
                      }
                    }
                    
                    setIsSearching(true);
                    try {
                      const words = term.split(/\s+/).filter(w => w.length > 0);
                      const storeData = inventory.filter(item => {
                        if (item.stock <= 0) return false;
                        try {
                          const cat = JSON.parse(item.category || '{}');
                          if (cat?.type !== 'STORE_ITEM' || cat?.status !== 'AVAILABLE') return false;
                          
                          let searchString = `${item.id} ${item.name} ${item.category}`.toLowerCase();
                          if (cat.parentId && Object.keys(cat).includes('isCellphone') && cat.isCellphone === false) {
                             const parent = inventory.find(i => i.id === cat.parentId);
                             if (parent) searchString += ` ${parent.category?.toLowerCase() || ''}`;
                          } else if (cat.parentId && !Object.keys(cat).includes('isCellphone')) {
                             const parent = inventory.find(i => i.id === cat.parentId);
                             if (parent) searchString += ` ${parent.category?.toLowerCase() || ''}`;
                          }

                          return words.every(w => searchString.includes(w));
                        } catch(e) { return false; }
                      });
                        
                      if (storeData.length > 0) {
                          const exactMatch = storeData.find(p => (p.id.toLowerCase() === term || p.name.toLowerCase() === term) && !cart.some(c => c.id === p.id));
                          if (exactMatch) {
                            addToCartInventory(exactMatch);
                          } else if (storeData.length === 1 && !cart.some(c => c.id === storeData[0].id)) {
                            addToCartInventory(storeData[0]);
                          } else if (storeData.length > 0 && storeData.every(p => p.name === storeData[0].name)) {
                            // If all results have the exact same name, just pick the first one not in cart
                            const available = storeData.find(p => !cart.some(c => c.id === p.id));
                            if (available) {
                                addToCartInventory(available);
                            } else {
                                showNotification('error', 'No hay más unidades disponibles de este artículo.');
                            }
                          } else {
                            showNotification('error', 'Se encontraron varios resultados. Por favor, selecciona de la lista.');
                          }
                        } else {
                           showNotification('error', 'Artículo no encontrado.');
                        }
                    } catch (err) {} finally { setIsSearching(false); }
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
                      <p className="text-slate-500 font-medium">Buscando...</p>
                    </div>
                  ) : searchContext === 'ORDER' ? (
                    pendingOrders.length === 0 ? (
                      <div className="p-8 text-center">
                        <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
                          <Search className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                        </div>
                        <p className="text-slate-500 font-medium">No se encontraron órdenes pendientes.</p>
                      </div>
                    ) : (
                      pendingOrders.map(order => {
                        const totalPaid = (order.payments || []).reduce((sum, p) => sum + p.amount, 0);
                        const orderTotal = order.totalAmount ?? (order.finalPrice || order.estimatedCost || 0);
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
                    )
                  ) : (
                    // INVENTORY RESULTS
                    pendingInventory.length === 0 ? (
                      <div className="p-8 text-center">
                        <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
                          <Tag className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                        </div>
                        <p className="text-slate-500 font-medium">No se encontraron artículos.</p>
                      </div>
                    ) : (
                      Object.values(pendingInventory.reduce((acc: any, part: any) => {
                        let imei = '';
                        try {
                           imei = JSON.parse(part.category || '{}').imei || '';
                        } catch(e) {}
                        const key = `${part.name}-${part.price}-${imei}`;
                        if (!acc[key]) {
                            acc[key] = { ...part, availableCount: part.stock || 1, items: [part] };
                        } else {
                            acc[key].availableCount += part.stock || 1;
                            acc[key].items.push(part);
                        }
                        return acc;
                      }, {})).map((group: any) => {
                        let imeiStr = '';
                        let readable = '';
                        try { 
                           const c = JSON.parse(group.category || '{}');
                           imeiStr = c.imei || ''; 
                           readable = c.readable_id || c.readableId || '';
                           if (!readable && c.parentId) {
                               const parent = inventory.find((i: any) => i.id === c.parentId);
                               if (parent) {
                                   const pc = JSON.parse(parent.category || '{}');
                                   readable = pc.readable_id || pc.readableId || '';
                               }
                           }
                        } catch(e) {}
                        return (
                        <div 
                          key={group.id}
                          onClick={() => {
                            const available = group.items.find((i: any) => !cart.some(c => c.id === i.id));
                            addToCartInventory(available || group.items[0]);
                          }}
                          className="flex items-center justify-between p-4 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-2xl cursor-pointer transition-all group border border-transparent hover:border-blue-100 dark:hover:border-blue-500/20 mb-1"
                        >
                          <div className="flex items-center gap-4">
                            <div className="relative shrink-0">
                              <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-500 dark:text-slate-400 group-hover:bg-blue-500 group-hover:text-white transition-colors shadow-sm overflow-hidden">
                                {group.imageUrl ? (
                                   <img src={group.imageUrl} alt={group.name} className="w-full h-full object-cover mix-blend-multiply dark:mix-blend-normal" />
                                ) : (
                                  <Tag className="w-6 h-6" />
                                )}
                              </div>
                              {group.availableCount > 1 && (
                                <span className="absolute -top-2 -right-2 bg-blue-500 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-white dark:border-slate-800 z-10">
                                  {group.availableCount}
                                </span>
                              )}
                            </div>
                            <div>
                              <p className="font-black text-slate-800 dark:text-white text-lg tracking-tight flex items-center gap-2">
                                {group.name}
                                {imeiStr && <span className="bg-amber-100 text-amber-700 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-md text-nowrap">SN: {imeiStr}</span>}
                                {readable && <span className="bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md tracking-widest text-nowrap"># {readable}</span>}
                              </p>
                              <p className="text-sm text-slate-500 flex items-center gap-1.5 font-medium mt-0.5">
                                <span className={`w-2 h-2 rounded-full ${group.stock > 0 ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                Stock: {group.availableCount > 1 ? group.availableCount : group.stock}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Precio</p>
                            <p className="font-black text-blue-600 text-xl">${(group.price || 0).toLocaleString()}</p>
                          </div>
                        </div>
                        );
                      })
                    )
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Quick Actions Bento */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 relative mb-4">
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

          {/* Miniature Cart Items */}
          {cart.length > 0 && (
            <div className="relative mb-4 bg-white/50 dark:bg-slate-900/50 p-4 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 pl-1">Añadidos Recientemente</p>
              <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-2">
                {cart.map((item, idx) => (
                  <div key={item.id + idx} className="shrink-0 bg-white dark:bg-slate-800 p-2 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col max-w-[140px] shadow-sm relative group cursor-pointer hover:border-indigo-300 transition-colors">
                     <div className="w-full aspect-square bg-slate-50 dark:bg-slate-900 rounded-xl flex items-center justify-center mb-2 overflow-hidden relative">
                       {item.imageUrl ? (
                         <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover mix-blend-multiply dark:mix-blend-normal" />
                       ) : (
                         <Package className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                       )}
                       <div 
                         onClick={(e) => { e.stopPropagation(); removeFromCart(item.id); }}
                         className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"
                       >
                         <Trash2 className="w-3 h-3" />
                       </div>
                     </div>
                     <div className="px-1">
                       <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{item.title}</p>
                       <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 mt-0.5">${item.amount.toLocaleString()}</p>
                     </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cashier Expenses Section */}
          <div className={`mt-auto pt-4 flex flex-col transition-all duration-300 ${isExpensesExpanded ? 'flex-1 min-h-0' : 'shrink-0'}`}>
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col min-h-0 overflow-hidden">
              {/* Totals Summary Bar */}
              {isExpensesExpanded && cashExpenses.length > 0 && (
                <div className="px-6 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex gap-4 text-[10px] font-bold uppercase tracking-widest">
                  <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Confirmado: ${expenseTotals.approved.toLocaleString()}
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
                    Pendiente: ${expenseTotals.pending.toLocaleString()}
                  </div>
                </div>
              )}

              {isExpensesExpanded && (
                <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar border-b border-slate-100 dark:border-slate-800">
                  {cashExpenses.length === 0 ? (
                    <div className="h-32 flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 italic text-sm text-center px-6">
                      <Receipt className="w-8 h-8 mb-2 opacity-20" />
                      <p>No hay salidas registradas en este turno.</p>
                      <p className="text-[10px] mt-1 font-bold uppercase tracking-wider opacity-50">Se limpiarán al cerrar caja</p>
                    </div>
                  ) : (
                    <>
                      {/* PENDING EXPENSES */}
                      {cashExpenses.filter(e => e.approval_status === 'PENDING').length > 0 && (
                        <div>
                          <h3 className="text-xs font-bold text-amber-600 dark:text-amber-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            Gastos Pendientes de Consolidar
                          </h3>
                          <div className="space-y-3">
                            {cashExpenses.filter(e => e.approval_status === 'PENDING').map((expense) => (
                              <div 
                                key={expense.id} 
                                className="bg-amber-50/50 dark:bg-amber-900/10 p-4 rounded-2xl border border-amber-100 dark:border-amber-900/30 flex items-center justify-between group hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all"
                              >
                                <div className="flex items-center gap-4">
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                    expense.expenseType === 'ORDER' 
                                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' 
                                      : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600'
                                  }`}>
                                    {expense.expenseType === 'ORDER' ? <Smartphone className="w-5 h-5" /> : <Building2 className="w-5 h-5" />}
                                  </div>
                                  <div>
                                    <p className="font-bold text-slate-800 dark:text-white text-sm line-clamp-1">{expense.description}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className="text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                        Pendiente
                                      </span>
                                      <span className="text-[10px] text-slate-400 font-medium">
                                        {new Date(expense.created_at).toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' })} • {new Date(expense.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="font-black text-amber-600 dark:text-amber-400 text-lg">-${expense.amount.toLocaleString()}</p>
                                  <div className="flex justify-end mt-1">
                                    <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* CONSOLIDATED EXPENSES */}
                      {cashExpenses.filter(e => e.approval_status !== 'PENDING').length > 0 && (
                        <div>
                          <h3 className="text-xs font-bold text-emerald-600 dark:text-emerald-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4" />
                            Gastos Consolidados
                          </h3>
                          <div className="space-y-3">
                            {cashExpenses.filter(e => e.approval_status !== 'PENDING').map((expense) => (
                              <div 
                                key={expense.id} 
                                className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between group hover:bg-white dark:hover:bg-slate-800 transition-all"
                              >
                                <div className="flex items-center gap-4">
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                    expense.expenseType === 'ORDER' 
                                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' 
                                      : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600'
                                  }`}>
                                    {expense.expenseType === 'ORDER' ? <Smartphone className="w-5 h-5" /> : <Building2 className="w-5 h-5" />}
                                  </div>
                                  <div>
                                    <p className="font-bold text-slate-800 dark:text-white text-sm line-clamp-1">{expense.description}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${
                                        expense.approval_status === 'APPROVED' 
                                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                          : expense.approval_status === 'REJECTED'
                                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                          : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                                      }`}>
                                        {expense.approval_status === 'APPROVED' ? 'Confirmado' : expense.approval_status === 'REJECTED' ? 'Rechazado' : 'Pendiente'}
                                      </span>
                                      <span className="text-[10px] text-slate-400 font-medium">
                                        {new Date(expense.created_at).toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' })} • {new Date(expense.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="font-black text-red-600 dark:text-red-400 text-lg">-${expense.amount.toLocaleString()}</p>
                                  <div className="flex justify-end mt-1">
                                    {expense.approval_status === 'APPROVED' ? (
                                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                    ) : expense.approval_status === 'REJECTED' ? (
                                      <button 
                                        onClick={() => handleDismissExpense(expense)}
                                        className="text-red-500 hover:text-red-700 transition-colors"
                                        title="Limpiar gasto rechazado"
                                      >
                                        <XCircle className="w-4 h-4" />
                                      </button>
                                    ) : (
                                      <Clock className="w-4 h-4 text-slate-300 animate-pulse" />
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Header */}
              <div 
                className={`p-6 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors`}
                onClick={() => setIsExpensesExpanded(!isExpensesExpanded)}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-500/10 rounded-xl">
                    <ArrowDownToLine className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-800 dark:text-white leading-none">
                      Salidas de Caja
                    </h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Turno Actual</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right hidden sm:block">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      {isExpensesExpanded ? 'Total a Descontar' : 'Gastos sin consolidar'}
                    </p>
                    <p className="text-lg font-black text-red-600 dark:text-red-400">
                      -${expenseTotals.total.toLocaleString()}
                    </p>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); fetchCashExpenses(); }}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-400"
                    title="Actualizar"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoadingExpenses ? 'animate-spin' : ''}`} />
                  </button>
                  <div className="p-2 text-slate-400">
                    {isExpensesExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="w-full lg:w-[320px] xl:w-[360px] flex flex-col gap-4 shrink-0 z-20">
          
          {/* Customer Selection Profile */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-[1.5rem] shadow-sm relative z-30">
            <div className="flex items-center gap-2 mb-2">
              <UserIcon className="w-4 h-4 text-blue-500" />
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Perfil del Cliente
              </h2>
            </div>
            
            {selectedCustomer ? (
              <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-500/20 p-3 rounded-2xl">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center shrink-0">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-xs text-slate-800 dark:text-white leading-tight truncate">{selectedCustomer.name}</h3>
                    <p className="text-[10px] text-slate-500 truncate">{selectedCustomer.phone}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedCustomer(null)}
                  className="p-1.5 shrink-0 text-slate-400 hover:bg-white dark:hover:bg-slate-800 rounded-full transition-colors hover:text-red-500 shadow-sm"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : isCreatingCustomer ? (
              <div className="space-y-2.5 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-slate-700 dark:text-slate-300 text-xs">Nuevo Cliente</span>
                  <button onClick={() => setIsCreatingCustomer(false)} className="text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5"/></button>
                </div>
                <input 
                  autoFocus
                  placeholder="Nombre completo" 
                  value={newCustomerForm.name}
                  onChange={e => setNewCustomerForm({...newCustomerForm, name: e.target.value})}
                  className="w-full px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none focus:border-blue-500" 
                />
                <input 
                  placeholder="Teléfono" 
                  value={newCustomerForm.phone}
                  onChange={e => setNewCustomerForm({...newCustomerForm, phone: e.target.value})}
                  className="w-full px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none focus:border-blue-500" 
                />
                <input 
                  placeholder="Dirección (Opcional)" 
                  value={newCustomerForm.address}
                  onChange={e => setNewCustomerForm({...newCustomerForm, address: e.target.value})}
                  className="w-full px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none focus:border-blue-500" 
                />
                <button 
                  onClick={() => {
                    if (!newCustomerForm.name.trim() || !newCustomerForm.phone.trim()) {
                      showNotification('error', 'Nombre y teléfono son obligatorios');
                      return;
                    }
                    setSelectedCustomer({ 
                      name: newCustomerForm.name.trim(), 
                      phone: newCustomerForm.phone.trim(), 
                      address: newCustomerForm.address.trim() 
                    });
                    setIsCreatingCustomer(false);
                    setNewCustomerForm({ name: '', phone: '', address: '' });
                  }}
                  className="w-full py-2 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs transition-colors mt-1"
                >
                  Guardar y Seleccionar
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    {isSearchingCustomer ? (
                      <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Buscar cliente (Nombre o Teléfono)..."
                    className="w-full pl-9 pr-3 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 transition-all font-bold text-sm text-slate-800 dark:text-white shadow-sm"
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setShowCustomerDropdown(true);
                    }}
                    onFocus={() => setShowCustomerDropdown(true)}
                  />
                  
                  {showCustomerDropdown && (customerOptions.length > 0 || (customerSearch.trim() && !isSearchingCustomer)) && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="max-h-60 overflow-y-auto">
                        {customerOptions.length > 0 ? (
                          customerOptions.map((c, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                setSelectedCustomer(c);
                                setCustomerSearch('');
                                setShowCustomerDropdown(false);
                              }}
                              className="w-full text-left p-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex flex-col border-b border-slate-100 dark:border-slate-800 last:border-0 transition-colors group"
                            >
                              <span className="font-bold text-xs text-slate-800 dark:text-white group-hover:text-blue-600 transition-colors">{c.name}</span>
                              <span className="text-[10px] text-slate-500">{c.phone}</span>
                            </button>
                          ))
                        ) : !isSearchingCustomer && (
                          <div className="p-4 text-center">
                            <p className="text-slate-500 text-xs font-bold mb-3">No se encontraron resultados</p>
                            <button
                              onClick={() => {
                                setNewCustomerForm({ ...newCustomerForm, phone: customerSearch });
                                setIsCreatingCustomer(true);
                                setShowCustomerDropdown(false);
                              }}
                              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-black transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-1.5"
                            >
                              <Plus className="w-4 h-4" /> CREAR PERFIL NUEVO
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                
                {!customerSearch.trim() && (
                  <button
                    onClick={() => setIsCreatingCustomer(true)}
                    className="w-full py-3 bg-slate-50 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-blue-900/20 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-blue-500 transition-all rounded-2xl font-bold text-xs flex items-center justify-center gap-2 group"
                  >
                    <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" /> 
                    REGISTRAR NUEVO CLIENTE
                  </button>
                )}
              </div>
            ) }
          </div>

          {/* RIGHT PANEL: Cart (Standard Theme) */}
          <div className="flex-1 bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl flex flex-col overflow-hidden relative z-10">
          {/* Decorative top glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-4 bg-emerald-500/20 blur-2xl rounded-full pointer-events-none"></div>

          {/* Cart Header */}
          <div className="p-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 relative z-10 shrink-0">
            <h2 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-3 tracking-tight">
              <div className="w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center">
                <Receipt className="w-4 h-4 text-emerald-500" />
              </div>
              Ticket de Cobro
            </h2>
            <span className="bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-2.5 py-1 rounded-lg text-xs font-bold border border-emerald-200 dark:border-emerald-500/20 shadow-sm">
              {cart.length} items
            </span>
          </div>

          {(hasNotReadyOrder || hasPendingNotifications) && (
            <div className="bg-amber-500 text-white p-2 text-xs font-bold flex items-center gap-2 justify-center relative z-10 shrink-0">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>
                Atención: Hay órdenes que no están listas o tienen notificaciones.
              </span>
            </div>
          )}

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar relative z-10">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-600 space-y-4 relative">
                <ShoppingCart className="w-16 h-16 opacity-50" />
                <p className="font-medium text-center text-base text-slate-400 dark:text-slate-500">El carrito está vacío.</p>
              </div>
            ) : (
              cart.map(item => (
                <div key={item.id} className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/50 relative group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-sm">
                  <button 
                    onClick={() => removeFromCart(item.id)}
                    className="absolute -top-2.5 -right-2.5 bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-md hover:bg-red-600 hover:scale-110"
                  >
                    <X className="w-3.5 h-3.5 font-bold" />
                  </button>
                  
                  <div className="flex gap-3 mb-3 pr-3">
                    {item.imageUrl && (
                      <div className="w-10 h-10 rounded-lg bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0">
                         <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover mix-blend-multiply dark:mix-blend-normal" />
                      </div>
                    )}
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white text-base leading-tight tracking-tight">{item.title} {item.quantity && item.quantity > 1 ? `(x${item.quantity})` : ''}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold mt-1 tracking-wider">{item.subtitle}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-700/50">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      {item.amount < 0 ? 'A Devolver' : 'A Cobrar'}
                    </span>
                    <div className={`flex items-center gap-1.5 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700 focus-within:border-emerald-500/50 transition-colors ${item.amount < 0 ? 'border-orange-500/50 focus-within:border-orange-500/50' : ''}`}>
                      <span className={`${item.amount < 0 ? 'text-orange-500' : 'text-emerald-500'} font-bold pl-2 text-sm`}>$</span>
                      <input 
                        type="number"
                        value={item.amount || ''}
                        onChange={(e) => updateCartItemAmount(item.id, parseFloat(e.target.value) || 0)}
                        className={`w-24 text-right font-black text-lg bg-transparent outline-none pr-2 ${item.amount < 0 ? 'text-orange-500' : 'text-slate-900 dark:text-white'}`}
                      />
                    </div>
                  </div>
                  {item.type === 'ORDER' && item.originalOrder && isNotReady(item.originalOrder.status) && (
                    <div className="mt-3 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 p-2.5 rounded-xl text-[11px] font-medium flex items-start gap-2 border border-amber-200/50 dark:border-amber-800/50">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <p>Esta orden aún no está lista. Solo se registrará el pago.</p>
                    </div>
                  )}
                  {item.maxAmount != null && Math.abs(item.amount) < Math.abs(item.maxAmount) && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400/80 font-bold text-right mt-2">
                      Quedará un saldo de ${Math.abs(item.maxAmount - item.amount).toLocaleString()}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Checkout Section */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-200 dark:border-slate-800 backdrop-blur-xl relative z-10 shrink-0">
            
            <div className="mb-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1 flex items-center shadow-sm">
                <div className="px-2.5 shrink-0 text-slate-400">
                    <UserIcon className="w-3.5 h-3.5" />
                </div>
                <select
                   className="w-full bg-transparent p-1.5 text-xs font-bold text-slate-800 dark:text-white outline-none cursor-pointer"
                   value={selectedSalespersonId}
                   onChange={(e) => setSelectedSalespersonId(e.target.value)}
                   disabled={!!currentQuoteId}
                >
                   <option value="">-- Seleccionar Vendedor/a --</option>
                   {users?.map(u => (
                      <option key={u.id} value={u.id} className="text-black">{u.name} ({u.role})</option>
                   ))}
                </select>
            </div>

            <div className="flex gap-2 mb-4">
               <button 
                 onClick={() => setShowQuotesModal(true)} 
                 className="flex-1 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all text-xs"
               >
                 <List className="w-3.5 h-3.5"/> 
                 Ver Cotizaciones ({savedQuotes.length})
               </button>
               {cart.length > 0 && (currentQuoteId ? (
                 <>
                   <button 
                     onClick={saveQuote}
                     disabled={!selectedCustomer}
                     className={`flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all text-xs ${
                       !selectedCustomer 
                         ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed'
                         : 'bg-blue-100 hover:bg-blue-200 dark:bg-blue-500/20 dark:hover:bg-blue-500/30 text-blue-700 dark:text-blue-400'
                     }`}
                   >
                     <Save className="w-3.5 h-3.5"/> 
                     Actualizar
                   </button>
                   <button 
                     onClick={clearCart} 
                     title="Limpiar"
                     className="w-8 flex items-center justify-center bg-red-100 hover:bg-red-200 dark:bg-red-500/20 dark:hover:bg-red-500/30 text-red-600 rounded-lg font-bold transition-all text-xs shrink-0"
                   >
                     <X className="w-4 h-4"/>
                   </button>
                 </>
               ) : (
                 <button 
                   onClick={saveQuote} 
                   disabled={!selectedCustomer}
                   className={`flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all text-xs ${
                     !selectedCustomer 
                       ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed'
                       : 'bg-amber-100 hover:bg-amber-200 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 text-amber-700 dark:text-amber-400'
                   }`}
                 >
                   <Save className="w-3.5 h-3.5"/> 
                   Crear Cotización
                 </button>
               ))}
            </div>

            {/* Totals */}
            <div className="flex justify-between items-end mb-4">
              <span className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest text-[10px]">Total a Cobrar</span>
              <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter leading-none">${cartTotal.toLocaleString()}</span>
            </div>

            {/* Payment Methods */}
            {cart.length > 0 && cartTotal !== 0 && (
              <div className="space-y-2.5 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    {isRefund ? 'Método de Devolución' : 'Métodos de Pago'}
                  </p>
                  {!isRefund && (
                    <button 
                      onClick={addPaymentMethod}
                      className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded transition-colors border border-emerald-100 dark:border-transparent"
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
                      className="flex-1 bg-white dark:bg-slate-900 border border-orange-200 dark:border-orange-700/50 rounded-lg px-3 py-2.5 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-orange-500/50 appearance-none shadow-sm"
                    >
                      <option value="CASH" className="text-black">Efectivo</option>
                      <option value="CARD" className="text-black">Tarjeta</option>
                      <option value="TRANSFER" className="text-black">Transferencia</option>
                    </select>
                    <div className="relative w-28 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 rounded-lg flex items-center justify-end pr-3 py-2.5 shadow-sm">
                      <span className="text-orange-500 font-black text-base">
                        ${Math.abs(cartTotal).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ) : (
                  paymentMethods.map((pm, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <select 
                        value={pm.method}
                        onChange={(e) => handlePaymentMethodChange(idx, 'method', e.target.value)}
                        className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-emerald-500/50 appearance-none shadow-sm"
                      >
                        <option value="CASH" className="text-black">Efectivo</option>
                        <option value="CARD" className="text-black">Tarjeta</option>
                        <option value="TRANSFER" className="text-black">Transferencia</option>
                        <option value="CREDIT" className="text-black">Crédito (Fiao)</option>
                        <option value="CAMBIAZO" className="text-black">Cambiazo</option>
                      </select>
                      <div className="relative w-28 shadow-sm">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-bold text-xs">$</span>
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
                
                {paymentMethods.some(pm => pm.method === 'CREDIT') && (
                  <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl">
                    <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                      <Clock className="w-4 h-4" /> Fecha límite de pago
                    </p>
                    <input 
                      type="date"
                      value={creditDueDate}
                      onChange={(e) => setCreditDueDate(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-blue-500"
                    />
                  </div>
                )}

                {paymentMethods.some(pm => pm.method === 'CAMBIAZO') && (
                  <div className="mt-4 p-4 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 rounded-xl space-y-3">
                    <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 font-bold mb-2">
                      <Smartphone className="w-4 h-4 inline mr-1" /> Completa los detalles del equipo flotantes (izquierda).
                    </p>
                  </div>
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
            {!selectedCustomer && cart.length > 0 && (
              <div className="mb-3 text-center">
                <span className="text-xs font-bold text-red-500 bg-red-50 dark:bg-red-500/10 px-3 py-1.5 rounded-lg inline-block">
                  Paso requerido: Selecciona el perfil del cliente arriba
                </span>
              </div>
            )}
            <button 
              onClick={initiateCheckout}
              disabled={!canCheckout}
              className={`w-full py-3.5 rounded-xl font-black text-lg flex items-center justify-center gap-2 transition-all
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
                <span className="flex items-center gap-2"><div className="w-5 h-5 border-[3px] border-white/30 border-t-white rounded-full animate-spin"/> Procesando...</span>
              ) : showSuccess ? (
                <span className="flex items-center gap-2"><CheckCircle2 className="w-6 h-6"/> ¡Exitosa!</span>
              ) : isRefund ? (
                <span className="flex items-center gap-2"><ArrowDownToLine className="w-6 h-6"/> {hasNotReadyOrder ? 'Devolver (No Entregar)' : cart.some(i => i.type === 'ORDER' && i.originalOrder && [OrderStatus.RETURNED, OrderStatus.CANCELED].includes(i.originalOrder.status)) ? 'Devolver Dinero' : 'Devolver y Entregar'}</span>
              ) : hasNotReadyOrder ? (
                <span className="flex items-center gap-2"><Receipt className="w-6 h-6"/> Registrar Pago Anticipado</span>
              ) : isAbono ? (
                <span className="flex items-center gap-2"><Receipt className="w-6 h-6"/> Abonar (No Entregar)</span>
              ) : cart.some(i => i.type === 'ORDER') ? (
                <span className="flex items-center gap-2"><Receipt className="w-6 h-6"/> {cartTotal === 0 ? 'Entregar Equipo' : 'Cobrar y Entregar Equipo'}</span>
              ) : (
                <span className="flex items-center gap-2"><Receipt className="w-6 h-6"/> Cobrar e Imprimir</span>
              )}
            </button>
          </div>
        </div>
        </div>
      </div>

      {showDbFixModal && <DbFixModal onClose={() => setShowDbFixModal(false)} />}

      {/* Global Success Overlay */}
      {showSuccess && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-emerald-500/90 dark:bg-emerald-600/90 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setShowSuccess(false)}>
          <div className="text-center text-white p-8 max-w-md animate-in zoom-in duration-500" onClick={(e) => e.stopPropagation()}>
            <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-sm border-4 border-white/30">
              <CheckCircle2 className="w-12 h-12 text-white" />
            </div>
            <h2 className="text-5xl font-black mb-4 tracking-tighter">¡VENTA EXITOSA!</h2>
            <p className="text-xl font-bold opacity-90 mb-8">
              {checkoutResult?.message || 'La transacción ha sido procesada correctamente.'}
            </p>
            
            {checkoutResult && checkoutResult.change > 0 && (
              <div className="bg-white/20 backdrop-blur-md rounded-[2.5rem] p-8 border-4 border-white/30 shadow-2xl mb-8 transform -rotate-2">
                <p className="text-sm font-black uppercase tracking-widest mb-2 opacity-80">Cambio (Vuelto):</p>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-3xl font-black opacity-60">$</span>
                  <p className="text-7xl font-black tracking-tighter">{checkoutResult.change.toLocaleString()}</p>
                </div>
              </div>
            )}
            
            <button 
              onClick={() => { setShowSuccess(false); setCheckoutResult(null); setTenderAmount(0); }}
              className="px-12 py-5 bg-white text-emerald-600 rounded-2xl font-black text-2xl hover:bg-opacity-95 transition-all shadow-2xl active:scale-95 flex items-center justify-center gap-3 mx-auto"
            >
              CERRAR (ESC)
            </button>
          </div>
        </div>
      )}

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
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowTenderModal(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 text-center">
              <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Monto Recibido</h3>
              <p className="text-slate-500 font-medium mb-6">Total a cobrar en efectivo: ${cashAmount.toLocaleString()}</p>
              
              <div className="relative mb-6">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-bold text-2xl">$</span>
                <input 
                  autoFocus={!cart.some(i => i.type === 'PRODUCT')}
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
              
              <div className={`p-6 rounded-3xl mb-6 shadow-inner ${tenderAmount >= cashAmount ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-2 border-emerald-500/20' : 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-2 border-red-500/20'}`}>
                <p className="text-sm font-black uppercase tracking-widest mb-2 opacity-70">Cambio a devolver</p>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-2xl font-bold opacity-50">$</span>
                  <p className="text-6xl font-black tracking-tighter animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {Math.max(0, tenderAmount - cashAmount).toLocaleString()}
                  </p>
                </div>
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

      {/* Prompt Modal */}
      {promptModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setPromptModal(null)}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
                  <div className="p-6 bg-slate-50 border-b border-slate-100">
                      <h3 className="text-xl font-black text-slate-900">{promptModal.title}</h3>
                      <p className="text-slate-500 font-medium mt-1">{promptModal.message}</p>
                  </div>
                  <div className="p-6 space-y-4">
                      {promptModal.fields.map(field => (
                          <div key={field.key}>
                              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                                  {field.label}
                              </label>
                              <input
                                  type={field.type}
                                  defaultValue={field.defaultValue}
                                  id={`prompt-${field.key}`}
                                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-indigo-500 focus:ring-0 transition-all font-bold text-slate-900"
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
                  <div className="p-4 flex gap-3 bg-slate-50 border-t border-slate-100">
                      <button 
                          onClick={() => setPromptModal(null)}
                          className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors"
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
                          className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95"
                      >
                          CONFIRMAR
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Handover Modal (Confirmación Física) */}
      {handoverData && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setHandoverData(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
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

      {/* Cambiazo Floating Window */}
      {paymentMethods.some(pm => pm.method === 'CAMBIAZO') && (
        <div className={`fixed left-4 bottom-4 z-[999] transition-all duration-300 ease-in-out bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-500/20 shadow-[0_10px_40px_-10px_rgba(79,70,229,0.3)] rounded-2xl overflow-hidden flex flex-col ${isCambiazoModalMinimized ? 'w-64 h-14' : 'w-80 sm:w-96'}`}>
          {isCambiazoModalMinimized ? (
            <div 
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/20 w-full h-full"
                onClick={() => setIsCambiazoModalMinimized(false)}
            >
                <div className="flex items-center gap-2">
                   <Smartphone className="w-5 h-5 text-indigo-500 animate-pulse"/>
                   <span className="font-bold text-slate-800 dark:text-white">Cambiazo Activo</span>
                </div>
                <ChevronUp className="w-5 h-5 text-slate-400"/>
            </div>
          ) : (
            <div className="flex flex-col flex-1 max-h-[85vh]">
                <div className="flex items-center justify-between p-4 border-b border-indigo-100 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-500/10 shrink-0">
                    <h3 className="font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-2">
                        <Smartphone className="w-5 h-5"/>
                        Info de Equipo - Cambiazo
                    </h3>
                    <button onClick={() => setIsCambiazoModalMinimized(true)} className="text-indigo-400 hover:text-indigo-600 bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-500/20 w-8 h-8 rounded-lg flex items-center justify-center transition-colors">
                        <Minus className="w-5 h-5"/>
                    </button>
                </div>
                <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar bg-slate-50/30 dark:bg-slate-900/50 flex-1 relative">
                   <p className="text-xs text-slate-500 font-medium">Este formulario debe ser llenado para ingresar el dispositivo como STORE_PRODUCT y STORE_ITEM.</p>
                   
                   <div className="space-y-4">
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 flex items-center gap-1"><Tag className="w-3 h-3 text-indigo-400"/> Modelo del Equipo*</label>
                            <input type="text" value={cambiazoDetails.deviceModel} onChange={e => setCambiazoDetails({...cambiazoDetails, deviceModel: e.target.value})} placeholder="Ej. iPhone 12 Pro Max" className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 dark:text-white shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"/>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Almacenamiento</label>
                                <input type="text" value={cambiazoDetails.storage} onChange={e => setCambiazoDetails({...cambiazoDetails, storage: e.target.value})} placeholder="Ej. 128GB" className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 dark:text-white shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"/>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Batería %</label>
                                <input type="number" min="0" max="100" value={cambiazoDetails.battery} onChange={e => setCambiazoDetails({...cambiazoDetails, battery: e.target.value})} placeholder="100" className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 dark:text-white shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"/>
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Condición Física</label>
                            <input type="text" value={cambiazoDetails.deviceCondition} onChange={e => setCambiazoDetails({...cambiazoDetails, deviceCondition: e.target.value})} placeholder="Rayones en pantalla..." className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 dark:text-white shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"/>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Clave de Acceso</label>
                            <input type="text" value={cambiazoDetails.devicePassword} onChange={e => setCambiazoDetails({...cambiazoDetails, devicePassword: e.target.value})} placeholder="123456" className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 dark:text-white shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"/>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">IMEI / Serie</label>
                            <input type="text" value={cambiazoDetails.imei} onChange={e => setCambiazoDetails({...cambiazoDetails, imei: e.target.value})} placeholder="35..." className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 dark:text-white shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"/>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Fallas Declaradas</label>
                            <textarea value={cambiazoDetails.deviceIssue} onChange={e => setCambiazoDetails({...cambiazoDetails, deviceIssue: e.target.value})} placeholder="Ej. El puerto de carga falla a veces." rows={2} className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 dark:text-white shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all resize-none"></textarea>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Accesorios Recibidos</label>
                            <input type="text" value={cambiazoDetails.accessories} onChange={e => setCambiazoDetails({...cambiazoDetails, accessories: e.target.value})} placeholder="Caja, cargador, audífonos..." className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 dark:text-white shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"/>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block flex items-center gap-1"><Camera className="w-3 h-3 text-indigo-400"/> FOTO EVIDENCIA</label>
                            {cambiazoDetails.devicePhoto ? (
                                <div className="relative rounded-2xl overflow-hidden border-2 border-indigo-200 h-48 group">
                                    <img src={cambiazoDetails.devicePhoto} className="w-full h-full object-cover" />
                                    <button type="button" onClick={() => setCambiazoDetails({...cambiazoDetails, devicePhoto: ''})} className="absolute top-2 right-2 bg-red-600 text-white p-1.5 rounded-full shadow-lg hover:scale-110 transition"><Trash2 className="w-4 h-4"/></button>
                                </div>
                            ) : (
                                <button type="button" onClick={() => setShowCamera(true)} className="w-full h-24 border-2 border-dashed border-indigo-200 rounded-xl flex flex-col items-center justify-center text-indigo-400 hover:text-indigo-600 hover:border-indigo-400 hover:bg-slate-50/50 transition-all gap-1">
                                    <Camera className="w-6 h-6 opacity-50"/>
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Tomar Foto</span>
                                </button>
                            )}
                        </div>
                   </div>
                   
                   <div className="pt-2">
                       <button 
                           onClick={() => {
                               if (!cambiazoDetails.deviceModel) {
                                   toast.error("El modelo del equipo es obligatorio");
                                   return;
                               }
                               setIsCambiazoModalMinimized(true);
                               toast.success("Información del equipo confirmada", {
                                   style: { background: '#4f46e5', color: 'white' },
                                   icon: <Check className="w-5 h-5" />
                               });
                           }}
                           className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-95 flex items-center justify-center gap-2"
                       >
                           <Check className="w-5 h-5"/> CONFIRMAR DATOS
                       </button>
                   </div>
                </div>
            </div>
          )}
        </div>
      )}

      {/* Camera Modal for Cambiazo */}
      {showCamera && (
        <CameraCapture 
            onCapture={(img) => setCambiazoDetails({ ...cambiazoDetails, devicePhoto: img })} 
            onClose={() => setShowCamera(false)} 
        />
      )}

      {/* Quotes Modal */}
      {showQuotesModal && (
        <div className="fixed inset-0 z-[900] flex justify-center items-center p-4" onClick={() => setShowQuotesModal(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowQuotesModal(false)} />
          
          {/* Modal Content */}
          <div className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200 relative z-10">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900 z-10 shrink-0">
              <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                <Bookmark className="w-6 h-6 text-amber-500" />
                Cotizaciones Guardadas
              </h2>
              <button 
                onClick={() => setShowQuotesModal(false)} 
                className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 border items-center justify-center text-slate-500 hover:text-red-500 hover:bg-red-50 transition-colors flex shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              {savedQuotes.length === 0 ? (
                <div className="py-20 text-center">
                  <Bookmark className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                  <p className="text-xl font-bold text-slate-400">No hay cotizaciones guardadas.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {savedQuotes.map(q => (
                    <div key={q.id} className="border border-slate-200 dark:border-slate-800 rounded-3xl p-5 hover:border-amber-400 dark:hover:border-amber-500/50 hover:shadow-lg transition-all bg-white dark:bg-slate-800 flex flex-col gap-4 group cursor-default">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-slate-800 dark:text-white">{q.id}</span>
                            <span className="text-[10px] font-bold px-2 py-1 bg-amber-100 text-amber-700 rounded-lg">Cotización</span>
                          </div>
                          <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5"/> {new Date(q.date).toLocaleString()}</span>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); discardQuote(q.id); }} className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-700 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 flex flex-center items-center justify-center transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 flex items-center justify-center shrink-0">
                          <UserIcon className="w-5 h-5"/>
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 dark:text-white line-clamp-1 text-sm">{q.customer?.name || 'Cliente Genérico'}</p>
                          <p className="text-xs text-slate-500 font-medium">{q.customer?.phone || 'S/N'}</p>
                        </div>
                      </div>

                      <div className="flex-1">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700 pb-2 mb-2">Artículos ({q.cart.length})</p>
                        <div className="space-y-1.5 max-h-24 overflow-y-auto custom-scrollbar pr-2">
                          {q.cart.map((c, i) => (
                            <div key={i} className="flex justify-between items-center text-sm">
                              <span className="text-slate-600 dark:text-slate-300 line-clamp-1">{c.title}</span>
                              <span className="font-bold text-slate-800 dark:text-white shrink-0">${c.amount.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-end mt-auto">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total</p>
                          <p className="text-xl font-black text-slate-900 dark:text-white">${q.cart.reduce((a,b)=>a+b.amount,0).toLocaleString()}</p>
                        </div>
                        <button onClick={() => loadQuote(q.id)} className="px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 hover:shadow-lg hover:shadow-slate-500/20 transition-all flex items-center gap-2">
                          <ArrowDownToLine className="w-4 h-4"/>
                          Retomar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showReturnModal && (
        <PosReturnModal
          onClose={() => setShowReturnModal(false)}
          onAddReturnItem={handleAddReturnItem}
        />
      )}

    </div>
  );
};
