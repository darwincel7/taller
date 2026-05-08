-- Fix existing accounting_transactions that were approved or rejected but status is still PENDING

-- 1. If approval_status is 'APPROVED', set status to 'COMPLETED'
UPDATE public.accounting_transactions
SET status = 'COMPLETED'
WHERE approval_status = 'APPROVED' AND status = 'PENDING';

-- 2. If approval_status is 'REJECTED', set status to 'CANCELLED'
UPDATE public.accounting_transactions
SET status = 'CANCELLED'
WHERE approval_status = 'REJECTED' AND status = 'PENDING';

-- 3. If source is 'ORDER' and it's not rejected, it should probably be 'COMPLETED'
-- because ORDER expenses are implicitly approved by the cashier who assigned them
-- Wait, let's just leave them as PENDING if approval_status is 'PENDING',
-- because my new get_payments_flat will include PENDING expenses anyway.
