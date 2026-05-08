-- Fix missing expenses that were assigned to orders but stuck in PENDING status
UPDATE public.accounting_transactions
SET status = 'COMPLETED'
WHERE source IN ('ORDER', 'STORE', 'FLOATING') AND status = 'PENDING';
