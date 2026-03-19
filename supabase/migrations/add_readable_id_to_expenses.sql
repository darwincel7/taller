-- 1. Add readable_id to floating_expenses
ALTER TABLE public.floating_expenses ADD COLUMN IF NOT EXISTS readable_id bigint;

-- Create sequence for floating_expenses readable_id
CREATE SEQUENCE IF NOT EXISTS floating_expenses_readable_id_seq START 1000;

-- Function to auto-assign readable_id to floating_expenses
CREATE OR REPLACE FUNCTION public.assign_floating_expense_readable_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.readable_id IS NULL THEN
    NEW.readable_id := nextval('floating_expenses_readable_id_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for floating_expenses
DROP TRIGGER IF EXISTS trg_assign_floating_expense_readable_id ON public.floating_expenses;
CREATE TRIGGER trg_assign_floating_expense_readable_id
BEFORE INSERT ON public.floating_expenses
FOR EACH ROW
EXECUTE FUNCTION public.assign_floating_expense_readable_id();

-- 2. Add readable_id, branch, and method to accounting_transactions
ALTER TABLE public.accounting_transactions ADD COLUMN IF NOT EXISTS readable_id bigint;
ALTER TABLE public.accounting_transactions ADD COLUMN IF NOT EXISTS branch text;
ALTER TABLE public.accounting_transactions ADD COLUMN IF NOT EXISTS method text;

-- Create sequence for accounting_transactions readable_id
CREATE SEQUENCE IF NOT EXISTS accounting_transactions_readable_id_seq START 5000;

-- Function to auto-assign readable_id to accounting_transactions
CREATE OR REPLACE FUNCTION public.assign_accounting_transaction_readable_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.readable_id IS NULL THEN
    NEW.readable_id := nextval('accounting_transactions_readable_id_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for accounting_transactions
DROP TRIGGER IF EXISTS trg_assign_accounting_transaction_readable_id ON public.accounting_transactions;
CREATE TRIGGER trg_assign_accounting_transaction_readable_id
BEFORE INSERT ON public.accounting_transactions
FOR EACH ROW
EXECUTE FUNCTION public.assign_accounting_transaction_readable_id();

-- 3. Update existing records with readable_id if they are null
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT id FROM public.floating_expenses WHERE readable_id IS NULL LOOP
    UPDATE public.floating_expenses SET readable_id = nextval('floating_expenses_readable_id_seq') WHERE id = rec.id;
  END LOOP;
  
  FOR rec IN SELECT id FROM public.accounting_transactions WHERE readable_id IS NULL LOOP
    UPDATE public.accounting_transactions SET readable_id = nextval('accounting_transactions_readable_id_seq') WHERE id = rec.id;
  END LOOP;
END $$;
