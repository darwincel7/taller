-- Add invoice_number and is_duplicate to floating_expenses
ALTER TABLE floating_expenses ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE floating_expenses ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT false;
