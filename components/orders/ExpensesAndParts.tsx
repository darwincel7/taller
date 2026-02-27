
import React from 'react';
import { OrderFinancials } from '../OrderFinancials';
import { RepairOrder, Expense } from '../../types';

interface ExpensesAndPartsProps {
  order: RepairOrder;
  expenses: Expense[];
  setExpenses: (val: Expense[]) => void;
  finalPriceInput: string;
  setFinalPriceInput: (val: string) => void;
  canViewAccounting: boolean;
  canEdit: boolean;
  onAddExpense: (desc: string, amount: number) => Promise<void>;
  onRemoveExpense: (id: string) => Promise<void>;
  onEditExpense: (id: string, desc: string, amount: number) => Promise<void>;
  handleUpdatePrice: (reason?: string) => void;
}

export const ExpensesAndParts: React.FC<ExpensesAndPartsProps> = ({
  order,
  expenses,
  setExpenses,
  finalPriceInput,
  setFinalPriceInput,
  canViewAccounting,
  canEdit,
  onAddExpense,
  onRemoveExpense,
  onEditExpense,
  handleUpdatePrice
}) => {
  return (
    <div className="h-full">
      <OrderFinancials 
        order={order} 
        expensesList={expenses}
        setExpensesList={setExpenses}
        canViewAccounting={canViewAccounting}
        handleUpdate={handleUpdatePrice}
        finalPriceInput={finalPriceInput}
        setFinalPriceInput={setFinalPriceInput}
        isSaving={false}
        onAddExpense={onAddExpense}
        onRemoveExpense={onRemoveExpense}
        onEditExpense={onEditExpense}
        canEdit={canEdit}
      />
    </div>
  );
};
