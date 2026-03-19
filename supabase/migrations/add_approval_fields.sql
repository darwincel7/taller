-- Add approval_status and expense_destination to accounting_transactions
ALTER TABLE accounting_transactions ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'APPROVED';
ALTER TABLE accounting_transactions ADD COLUMN IF NOT EXISTS expense_destination text DEFAULT 'STORE';

-- Add approval_status to floating_expenses
ALTER TABLE floating_expenses ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'PENDING';
