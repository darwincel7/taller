-- Fix missing expenses that were assigned to orders but stuck in PENDING status
UPDATE public.accounting_transactions
SET status = 'COMPLETED'
WHERE source = 'ORDER' AND status = 'PENDING';

-- Also fix any STORE expenses that were approved but status is still PENDING
UPDATE public.accounting_transactions
SET status = 'COMPLETED'
WHERE source = 'STORE' AND approval_status = 'APPROVED' AND status = 'PENDING';
