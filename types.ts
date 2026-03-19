
export enum TransactionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  CONSOLIDATED = 'CONSOLIDATED'
}

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

export enum ExpenseDestination {
  WORKSHOP = 'WORKSHOP',
  STORE = 'STORE'
}

export enum OrderStatus {
  PENDING = 'Pendiente',
  DIAGNOSIS = 'En Diagnóstico',
  WAITING_APPROVAL = 'Esperando Aprobación',
  IN_REPAIR = 'En Reparación',
  ON_HOLD = 'En Pausa',
  EXTERNAL = 'En Taller Externo',
  QC_PENDING = 'Control Calidad',
  REPAIRED = 'Reparado',
  RETURNED = 'Entregado',
  CANCELED = 'Cancelado'
}

export enum PriorityLevel {
  LOW = 'Baja',
  NORMAL = 'Normal',
  HIGH = 'Alta',
  CRITICAL = 'Crítica'
}

export enum UserRole {
  ADMIN = 'Admin',
  SUB_ADMIN = 'Sub-Admin',
  TECHNICIAN = 'Técnico',
  Cajera = 'Cajera',
  CASHIER = 'Cajera',
  MONITOR = 'Monitor'
}

export enum OrderType {
  REPAIR = 'Reparación Cliente',
  STORE = 'RECIBIDOS',
  WARRANTY = 'Garantía Externa',
  PART_ONLY = 'Pieza Independiente'
}

export enum RequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  DEBATED = 'DEBATED',
  FOUND = 'FOUND',
  NOT_FOUND = 'NOT_FOUND',
  ORDERED = 'ORDERED'
}

export enum AuditStatus {
  PENDING = 'PENDING',
  MISSING = 'MISSING',
  REVIEW = 'REVIEW',
  FOUND = 'FOUND',
  WAITING_RESPONSE = 'WAITING_RESPONSE',
  WAITING_PART = 'WAITING_PART',
  READY = 'READY',
  ALREADY_LEFT = 'ALREADY_LEFT'
}

export enum TransferStatus {
  NONE = 'NONE',
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED'
}

export interface Customer {
  id?: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  createdAt?: number;
  totalSpent?: number;
  visitCount?: number;
  lastVisit?: number;
}

export type PaymentMethod = 'CASH' | 'TRANSFER' | 'CARD' | 'CREDIT';

export interface Payment {
  id: string;
  amount: number;
  method: PaymentMethod;
  date: number;
  cashierId: string;
  cashierName: string;
  isRefund?: boolean;
  notes?: string;
  reconciled?: boolean;
  closingId?: string;
  orderId?: string;
  orderModel?: string;
  orderReadableId?: number;
  orderCustomer?: string;
  orderBranch?: string;
}

export interface CashClosing {
  id: string;
  cashierId: string;
  adminId: string;
  timestamp: number;
  systemTotal: number;
  actualTotal: number;
  difference: number;
  notes?: string;
  updated_at?: string;
}

export interface DebtLog {
  id: string;
  cashierId: string;
  amount: number;
  type: 'SHORTAGE' | 'SURPLUS' | 'PAYMENT' | 'FORGIVENESS';
  timestamp: number;
  adminId: string;
  note: string;
  closingId?: string;
}

export interface RefundRequest {
  amount: number;
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: number;
  status: RequestStatus;
  approvedBy?: string;
  approvedAt?: number;
}

export interface ReturnRequest {
    reason: string;
    diagnosticFee: number;
    requestedBy: string;
    requestedAt: number;
    status: RequestStatus;
    approvedBy?: string;
}

export interface ExternalRepairRequest {
    targetWorkshop: 'BRENY NIZAO' | 'JUNIOR BARON' | 'OTRO';
    reason: string;
    requestedBy: string;
    requestedAt: number;
    status: RequestStatus;
    approvedBy?: string;
}

export interface PointSplit {
    primaryTechId: string;
    primaryPoints: number;
    secondaryTechId: string;
    secondaryPoints: number;
}

export interface PointRequest {
    requestedPoints: number;
    reason: string;
    status: RequestStatus;
    approvedBy?: string;
    splitProposal?: PointSplit;
    requestedAt?: number;
}

export interface PartRequest {
    id: string;
    orderId?: string;
    partName: string;
    requestedBy: string;
    requestedAt: number;
    status: RequestStatus;
    foundAt?: number;
    foundBy?: string;
    source?: string;
    price?: number;
    notes?: string;
    orderReadableId?: string; // Snapshot for easier display
    orderModel?: string;      // Snapshot
    orderType?: OrderType;    // Snapshot
    imei?: string;            // Snapshot
}

export interface UserPermissions {
  canViewAccounting: boolean;
  canEditExpenses: boolean;
  canDeliverOrder: boolean;
  canManageDiscounts: boolean;
  canProcessRefunds: boolean;
  canCreateOrders: boolean;
  canValidateOrders: boolean;
  canAssignOrders: boolean;
  canDeleteOrders: boolean;
  canEditOrderDetails: boolean;
  canChangeDeadline: boolean;
  canChangePriority: boolean;
  canReopenOrders: boolean;
  canManageWarranties: boolean;
  canTransferStore: boolean;
  canManageInventory: boolean;
  canDeleteInventory: boolean;
  canViewInventoryCost: boolean;
  canManageTeam: boolean;
  canViewActivityLog: boolean;
  canExportData: boolean;
  canViewGlobalOrders: boolean;
  canManageBudgets: boolean;
  canEditPayments: boolean;
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  avatar?: string;
  phone?: string;          
  specialization?: string; 
  branch?: string;
  permissions?: UserPermissions;
  active?: boolean;
  email?: string;
}

// --- NEW: CENTRALIZED CUSTOMER ---

export enum LogType {
  INFO = 'INFO',
  SUCCESS = 'SUCCESS',
  WARNING = 'WARNING',
  DANGER = 'DANGER',
  REVERSAL = 'REVERSAL',
  EXPENSE = 'EXPENSE',
  EDIT = 'EDIT'
}

export enum ActionType {
  ORDER_CREATED = 'ORDER_CREATED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  ASSIGNMENT_CHANGED = 'ASSIGNMENT_CHANGED',
  TRANSFER_REQUESTED = 'TRANSFER_REQUESTED',
  TRANSFER_COMPLETED = 'TRANSFER_COMPLETED',
  TRANSFER_REJECTED = 'TRANSFER_REJECTED',
  INFO_UPDATED = 'INFO_UPDATED',
  DIAGNOSIS_UPDATED = 'DIAGNOSIS_UPDATED',
  EXPENSE_ADDED = 'EXPENSE_ADDED',
  EXPENSE_EDITED = 'EXPENSE_EDITED',
  EXPENSE_REMOVED = 'EXPENSE_REMOVED',
  EXPENSE_ASSIGNED = 'EXPENSE_ASSIGNED',
  DELETE_FLOATING_EXPENSE = 'DELETE_FLOATING_EXPENSE',
  CREATE_FLOATING_EXPENSE = 'CREATE_FLOATING_EXPENSE',
  TRANSACTION_ADDED = 'TRANSACTION_ADDED',
  TRANSACTION_DELETED = 'TRANSACTION_DELETED',
  TRANSACTION_EDITED = 'TRANSACTION_EDITED',
  OBLIGATION_PAID = 'OBLIGATION_PAID',
  CASH_CLOSING_PERFORMED = 'CASH_CLOSING_PERFORMED',
  CASH_CLOSING_DELETED = 'CASH_CLOSING_DELETED',
  CASH_CLOSING_UPDATED = 'CASH_CLOSING_UPDATED',
  CASH_DEBT_PAID = 'CASH_DEBT_PAID',
  CASH_CLEAR_FORCED = 'CASH_CLEAR_FORCED',
  CASH_PAYMENT_EDITED = 'CASH_PAYMENT_EDITED',
  PAYMENT_ADDED = 'PAYMENT_ADDED',
  PAYMENT_EDITED = 'PAYMENT_EDITED',
  RETURN_REQUESTED = 'RETURN_REQUESTED',
  RETURN_APPROVED = 'RETURN_APPROVED',
  RETURN_REJECTED = 'RETURN_REJECTED',
  RETURN_RESOLVED = 'RETURN_RESOLVED',
  WARRANTY_CREATED = 'WARRANTY_CREATED',
  EXTERNAL_REPAIR_REQUESTED = 'EXTERNAL_REPAIR_REQUESTED',
  EXTERNAL_REPAIR_RESOLVED = 'EXTERNAL_REPAIR_RESOLVED',
  POINTS_REQUESTED = 'POINTS_REQUESTED',
  POINTS_RESOLVED = 'POINTS_RESOLVED',
  NOTIFICATION_SENT = 'NOTIFICATION_SENT',
  RECEIPT_PRINTED = 'RECEIPT_PRINTED',
  SECURITY_ALERT = 'SECURITY_ALERT',
  NOTE_ADDED = 'NOTE_ADDED',
  NOTE_UPDATED = 'NOTE_UPDATED',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  ACCESSORIES_UPDATED = 'ACCESSORIES_UPDATED',
  IMEI_CHANGED = 'IMEI_CHANGED',
  MODEL_CHANGED = 'MODEL_CHANGED',
  PRIORITY_CHANGED = 'PRIORITY_CHANGED',
  DEADLINE_CHANGED = 'DEADLINE_CHANGED',
  BUDGET_PROPOSED = 'BUDGET_PROPOSED',
  BUDGET_RESOLVED = 'BUDGET_RESOLVED',
  BUDGET_APPROVED = 'BUDGET_APPROVED',
  APPROVAL_ACKNOWLEDGED = 'APPROVAL_ACKNOWLEDGED',
  POINTS_APPROVED = 'POINTS_APPROVED',
  POINTS_REJECTED = 'POINTS_REJECTED',
  POINTS_AUTO_APPROVED = 'POINTS_AUTO_APPROVED',
  PRICE_UPDATED = 'PRICE_UPDATED',
  COST_UPDATED = 'COST_UPDATED',
  TARGET_PRICE_UPDATED = 'TARGET_PRICE_UPDATED',
  PHONE_UPDATED = 'PHONE_UPDATED',
  VALIDATION_COMPLETED = 'VALIDATION_COMPLETED',
  WORKSHOP_AUDIT_SUBMITTED = 'WORKSHOP_AUDIT_SUBMITTED',
  ORDER_DELETED = 'ORDER_DELETED',
  ORDER_TRANSFERRED = 'ORDER_TRANSFERRED',
  ORDER_ASSIGNED = 'ORDER_ASSIGNED',
  ASSIGNMENT_REQUESTED = 'ASSIGNMENT_REQUESTED',
  ASSIGNMENT_REJECTED = 'ASSIGNMENT_REJECTED',
  EXTERNAL_REPAIR_APPROVED = 'EXTERNAL_REPAIR_APPROVED',
  EXTERNAL_REPAIR_REJECTED = 'EXTERNAL_REPAIR_REJECTED',
  EXTERNAL_REPAIR_RECEIVED = 'EXTERNAL_REPAIR_RECEIVED',
  ORDER_VALIDATED = 'ORDER_VALIDATED',
  PART_REQUESTED = 'PART_REQUESTED',
  PART_REQUEST_RESOLVED = 'PART_REQUEST_RESOLVED',
  BUDGET_REJECTED = 'BUDGET_REJECTED',
  DIAGNOSTIC_FEE_ADDED = 'DIAGNOSTIC_FEE_ADDED',
  INVENTORY_ADDED = 'INVENTORY_ADDED',
  INVENTORY_EDITED = 'INVENTORY_EDITED',
  INVENTORY_DELETED = 'INVENTORY_DELETED',
  INVENTORY_STOCK_UPDATED = 'INVENTORY_STOCK_UPDATED',
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_DELETED = 'USER_DELETED',
  PERMISSIONS_UPDATED = 'PERMISSIONS_UPDATED',
  SETTINGS_UPDATED = 'SETTINGS_UPDATED',
}

export interface HistoryLog {
  date: string;
  status: OrderStatus;
  note: string;
  technician?: string;
  logType?: LogType;
  
  // New Fields for Detailed Logging
  action_type?: string; // String to allow flexibility or ActionType enum
  actor_user_id?: string;
  actor_role?: string;
  actor_branch?: string;
  metadata?: any; // JSON for before/after, amounts, etc.
}

export interface Expense {
  id: string;
  readable_id?: number; // Added for reference number
  description: string;
  amount: number;
  date: number;
  inventoryPartId?: string; // Link to inventory
  receiptUrl?: string; // Link to the uploaded receipt image
  sharedReceiptId?: string; // ID to link multiple expenses from the same receipt
  invoiceNumber?: string; // Added for invoice/receipt number
  addedBy?: string; // User who added the expense
  isExternal?: boolean; // Indicates if this expense originated from a floating expense
  is_duplicate?: boolean; // Indicates if the invoice number is a duplicate
}

export interface FloatingExpense {
  id: string;
  readable_id?: number;
  description: string;
  amount: number;
  receipt_url?: string;
  shared_receipt_id?: string;
  invoice_number?: string;
  created_by?: string;
  created_at?: string;
  branch_id?: string;
  closing_id?: string;
  approval_status?: ApprovalStatus;
  is_duplicate?: boolean;
}

export interface AuditLog {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  details: string;
  order_id?: string;
  created_at: number;
}

export interface InventoryPart {
  id: string;
  name: string;
  stock: number;
  min_stock: number;
  cost: number;
  price: number;
  category?: string;
}

export interface WikiArticle {
  id: string;
  title: string;
  model: string;
  issue: string;
  solution: string;
  author: string;
  created_at: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface RepairOrder {
  id: string;
  readable_id?: number;
  orderType: OrderType;
  customer: Customer; // Now structured, can link to Customer Table
  customerId?: string; // Link to Customers Table
  deviceModel: string;
  deviceIssue: string;
  deviceCondition: string;
  devicePassword?: string;
  accessories?: string;
  imei?: string;
  devicePhoto?: string;
  status: OrderStatus;
  priority: PriorityLevel;
  createdAt: number;
  deadline: number;
  history: HistoryLog[];
  technicianNotes?: string;
  customerNotes?: string;
  assignedTo?: string | null;
  pending_assignment_to?: string | null;
  
  estimatedCost: number;
  totalAmount?: number;
  partsCost?: number;
  expenses?: Expense[];
  finalPrice?: number;
  isRepairSuccessful?: boolean;
  
  purchaseCost?: number;
  targetPrice?: number;
  deviceSource?: string;
  deviceStorage?: string;
  batteryHealth?: string;
  unlockStatus?: string;

  isValidated?: boolean;
  currentBranch?: string;
  originBranch?: string;
  transferTarget?: string | null;
  transferStatus?: TransferStatus;

  payments?: Payment[];
  refundRequest?: RefundRequest;

  pointsAwarded?: number;
  pointRequest?: PointRequest;
  pointsSplit?: PointSplit;

  completedAt?: number;
  relatedOrderId?: string;
  
  tempVideoId?: string;

  repairOutcomeReason?: string;
  isDiagnosticFee?: boolean;
  
  proposedEstimate?: string;
  proposalType?: 'MONETARY' | 'ACTION';
  returnRequest?: ReturnRequest;
  partRequests?: PartRequest[];

  externalRepair?: ExternalRepairRequest;

  approvalAckPending?: boolean;
  techMessage?: { message: string, sender: string, timestamp: number, pending: boolean }; // Deprecated in favor of InternalChat, kept for legacy
  
  holdReason?: string;
}

export interface AppNotification {
  id?: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

// UPDATED DASHBOARD STATS FOR RPC
export interface DashboardStats {
  total: number;
  priorities: number;
  pending: number;
  inRepair: number;
  repaired: number;
  returned: number;
  storeStock: number;
  totalRevenue: number;
  totalExpenses: number;
  totalProfit: number;
  // New breakdowns
  revenueByBranch: { t1: number, t4: number };
}

export interface NotificationResponse {
    success: boolean;
    method: 'API' | 'MANUAL';
    error?: string;
}

export interface InternalChatMessage {
  id: string;
  order_id: string;
  user_id: string;
  user_name: string;
  message: string;
  created_at: string;
}

// --- ACCOUNTING MODULE TYPES ---

export interface AccountingCategory {
  id: string;
  name: string;
  type: 'INCOME' | 'EXPENSE';
  parent_id?: string;
}

export interface AccountingTransaction {
  id: string;
  readable_id?: number;
  amount: number;
  transaction_date: string;
  description: string;
  category_id: string;
  vendor?: string;
  invoice_number?: string;
  receipt_url?: string;
  shared_receipt_id?: string;
  search_text?: string; // For AI Search
  created_at: string;
  status?: TransactionStatus;
  approval_status?: ApprovalStatus;
  expense_destination?: ExpenseDestination;
  source?: 'MANUAL' | 'ORDER' | 'STORE' | 'BANK' | 'FLOATING';
  order_id?: string;
  created_by?: string;
  category_name?: string; // Joined field
  closing_id?: string;
  branch?: string; // For POS reconciliation
  method?: PaymentMethod; // For POS reconciliation
  is_duplicate?: boolean;
}

export interface CashflowData {
  month: string;
  income: number;
  expenses: number;
  purchases?: number;
  isProjection?: boolean;
}

export interface ExpenseDistribution {
  category_name: string;
  total_amount: number;
}

export interface Obligation {
  id: string;
  name: string;
  type: 'LOAN' | 'FIXED_EXPENSE';
  amount: number; // Monthly payment amount
  totalAmount?: number; // Original total amount for loans
  remainingAmount?: number; // Remaining balance for loans
  interestRate?: number; // Annual interest rate
  dueDate: number; // Day of the month (1-31)
  status: 'ACTIVE' | 'PAID_OFF';
  createdAt: number;
  updatedAt: number;
}

export interface FinancialKPIs {
  current_income: number;
  current_expenses: number;
  current_purchases: number;
  net_profit: number;
  prev_income: number;
  prev_expenses: number;
  prev_purchases: number;
  growth_income: number;
}

export interface AIInsight {
  type: 'success' | 'warning' | 'info';
  message: string;
  metric?: string;
}

export interface AIChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}
