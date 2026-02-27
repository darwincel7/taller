
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
  WARRANTY = 'Garantía Externa'
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
  note?: string;
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
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedBy?: string;
  approvedAt?: number;
}

export interface ReturnRequest {
    reason: string;
    diagnosticFee: number;
    requestedBy: string;
    requestedAt: number;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    approvedBy?: string;
}

export interface ExternalRepairRequest {
    targetWorkshop: 'BRENY NIZAO' | 'JUNIOR BARON' | 'OTRO';
    reason: string;
    requestedBy: string;
    requestedAt: number;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
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
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DEBATED';
    approvedBy?: string;
    splitProposal?: PointSplit;
    requestedAt?: number;
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
}

// --- NEW: CENTRALIZED CUSTOMER ---
export interface Customer {
  id?: string; // UUID from DB
  name: string;
  phone: string;
  email?: string;
  totalSpent?: number;
  visitCount?: number;
  lastVisit?: number;
}

export type LogType = 'INFO' | 'SUCCESS' | 'WARNING' | 'DANGER' | 'REVERSAL' | 'EXPENSE' | 'EDIT';

export enum ActionType {
  ORDER_CREATED = 'ORDER_CREATED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  ASSIGNMENT_CHANGED = 'ASSIGNMENT_CHANGED',
  TRANSFER_REQUESTED = 'TRANSFER_REQUESTED',
  TRANSFER_COMPLETED = 'TRANSFER_COMPLETED',
  INFO_UPDATED = 'INFO_UPDATED',
  DIAGNOSIS_UPDATED = 'DIAGNOSIS_UPDATED',
  EXPENSE_ADDED = 'EXPENSE_ADDED',
  EXPENSE_REMOVED = 'EXPENSE_REMOVED',
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
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  ACCESSORIES_UPDATED = 'ACCESSORIES_UPDATED',
  IMEI_CHANGED = 'IMEI_CHANGED',
  MODEL_CHANGED = 'MODEL_CHANGED',
  PRIORITY_CHANGED = 'PRIORITY_CHANGED',
  DEADLINE_CHANGED = 'DEADLINE_CHANGED',
  BUDGET_PROPOSED = 'BUDGET_PROPOSED',
  BUDGET_RESOLVED = 'BUDGET_RESOLVED',
  VALIDATION_COMPLETED = 'VALIDATION_COMPLETED'
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
  description: string;
  amount: number;
  date: number;
  inventoryPartId?: string; // Link to inventory
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
  assignedTo?: string | null;
  pending_assignment_to?: string | null;
  
  estimatedCost: number;
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
  transferStatus?: 'NONE' | 'PENDING' | 'COMPLETED';

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
