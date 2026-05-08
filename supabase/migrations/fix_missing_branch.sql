UPDATE accounting_transactions
SET branch = 'T4'
WHERE branch IS NULL AND approval_status = 'PENDING';
