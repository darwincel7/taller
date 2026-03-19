-- 1. Add new columns if they don't exist
ALTER TABLE accounting_transactions 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'COMPLETED' CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED')),
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'ORDER', 'STORE')),
ADD COLUMN IF NOT EXISTS order_id TEXT,
ADD COLUMN IF NOT EXISTS created_by TEXT;

-- 2. Add indexes
CREATE INDEX IF NOT EXISTS idx_accounting_status ON accounting_transactions(status);
CREATE INDEX IF NOT EXISTS idx_accounting_source ON accounting_transactions(source);
CREATE INDEX IF NOT EXISTS idx_accounting_order_id ON accounting_transactions(order_id);

-- 3. Update RPCs to only include COMPLETED transactions

-- Get Cashflow Summary (Last 6 months) - UPDATED
CREATE OR REPLACE FUNCTION get_cashflow_summary()
RETURNS TABLE (
    month TEXT,
    income NUMERIC,
    expenses NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        TO_CHAR(DATE_TRUNC('month', transaction_date), 'Mon') as month,
        COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as income,
        COALESCE(ABS(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END)), 0) as expenses
    FROM accounting_transactions
    WHERE transaction_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '5 months')
    AND status = 'COMPLETED' -- FILTER ADDED
    GROUP BY DATE_TRUNC('month', transaction_date)
    ORDER BY DATE_TRUNC('month', transaction_date);
END;
$$ LANGUAGE plpgsql;

-- Get Expense Distribution (Current Month) - UPDATED
CREATE OR REPLACE FUNCTION get_expense_distribution()
RETURNS TABLE (
    category_name TEXT,
    total_amount NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.name as category_name,
        ABS(SUM(t.amount)) as total_amount
    FROM accounting_transactions t
    JOIN accounting_categories c ON t.category_id = c.id
    WHERE t.amount < 0 
    AND DATE_TRUNC('month', t.transaction_date) = DATE_TRUNC('month', CURRENT_DATE)
    AND t.status = 'COMPLETED' -- FILTER ADDED
    GROUP BY c.name
    ORDER BY total_amount DESC;
END;
$$ LANGUAGE plpgsql;

-- Get Financial KPIs (Current Month vs Previous Month) - UPDATED
CREATE OR REPLACE FUNCTION get_financial_kpis()
RETURNS TABLE (
    current_income NUMERIC,
    current_expenses NUMERIC,
    net_profit NUMERIC,
    prev_income NUMERIC,
    prev_expenses NUMERIC,
    growth_income NUMERIC
) AS $$
DECLARE
    curr_inc NUMERIC;
    curr_exp NUMERIC;
    prev_inc NUMERIC;
    prev_exp NUMERIC;
BEGIN
    -- Current Month
    SELECT 
        COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0),
        COALESCE(ABS(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END)), 0)
    INTO curr_inc, curr_exp
    FROM accounting_transactions
    WHERE DATE_TRUNC('month', transaction_date) = DATE_TRUNC('month', CURRENT_DATE)
    AND status = 'COMPLETED'; -- FILTER ADDED

    -- Previous Month
    SELECT 
        COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0),
        COALESCE(ABS(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END)), 0)
    INTO prev_inc, prev_exp
    FROM accounting_transactions
    WHERE DATE_TRUNC('month', transaction_date) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
    AND status = 'COMPLETED'; -- FILTER ADDED

    RETURN QUERY SELECT
        curr_inc,
        curr_exp,
        (curr_inc - curr_exp),
        prev_inc,
        prev_exp,
        CASE WHEN prev_inc > 0 THEN ((curr_inc - prev_inc) / prev_inc) * 100 ELSE 0 END;
END;
$$ LANGUAGE plpgsql;
