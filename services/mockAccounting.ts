import { FinancialKPIs, CashflowData, ExpenseDistribution, AccountingTransaction } from '../types';

// Mock Data
const MOCK_TRANSACTIONS: AccountingTransaction[] = [
  { id: '1', amount: 1500, transaction_date: '2023-10-05', description: 'Venta iPhone 13', category_id: 'income-sales', vendor: 'Cliente Final', created_at: new Date().toISOString() },
  { id: '2', amount: 300, transaction_date: '2023-10-06', description: 'Reparación Pantalla', category_id: 'income-services', vendor: 'Cliente Final', created_at: new Date().toISOString() },
  { id: '3', amount: -500, transaction_date: '2023-10-07', description: 'Compra Pantallas', category_id: 'expense-purchases', vendor: 'Proveedor A', created_at: new Date().toISOString() },
  { id: '4', amount: -1200, transaction_date: '2023-10-01', description: 'Alquiler Local', category_id: 'expense-fixed', vendor: 'Inmobiliaria', created_at: new Date().toISOString() },
  { id: '5', amount: -200, transaction_date: '2023-10-10', description: 'Internet', category_id: 'expense-fixed', vendor: 'ISP', created_at: new Date().toISOString() },
  { id: '6', amount: -150, transaction_date: '2023-10-12', description: 'Materiales Limpieza', category_id: 'expense-variable', vendor: 'Supermercado', created_at: new Date().toISOString() },
];

export const mockAccountingService = {
  getKPIs: async (): Promise<FinancialKPIs> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    return {
      current_income: 15400,
      current_expenses: 8200,
      net_profit: 7200,
      prev_income: 12000,
      prev_expenses: 7500,
      growth_income: 28.3
    };
  },

  getCashflow: async (): Promise<CashflowData[]> => {
    await new Promise(resolve => setTimeout(resolve, 600));
    return [
      { month: 'May', income: 9000, expenses: 6000 },
      { month: 'Jun', income: 11000, expenses: 7000 },
      { month: 'Jul', income: 10500, expenses: 6500 },
      { month: 'Aug', income: 13000, expenses: 8000 },
      { month: 'Sep', income: 12000, expenses: 7500 },
      { month: 'Oct', income: 15400, expenses: 8200 },
    ];
  },

  getExpenseDistribution: async (): Promise<ExpenseDistribution[]> => {
    await new Promise(resolve => setTimeout(resolve, 400));
    return [
      { category_name: 'Compras (Repuestos)', total_amount: 4500 },
      { category_name: 'Sueldos', total_amount: 2500 },
      { category_name: 'Gastos Fijos', total_amount: 1200 },
      { category_name: 'Gastos Variables', total_amount: 500 },
    ];
  },

  getTransactions: async (): Promise<AccountingTransaction[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return MOCK_TRANSACTIONS;
  },

  addTransaction: async (transaction: Omit<AccountingTransaction, 'id' | 'created_at'>): Promise<AccountingTransaction> => {
    await new Promise(resolve => setTimeout(resolve, 800));
    const newTransaction = {
      ...transaction,
      id: Math.random().toString(36).substr(2, 9),
      created_at: new Date().toISOString()
    };
    MOCK_TRANSACTIONS.unshift(newTransaction);
    return newTransaction;
  }
};
