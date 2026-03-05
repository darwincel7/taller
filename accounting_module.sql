-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables to ensure clean state
DROP TABLE IF EXISTS accounting_transactions;
DROP TABLE IF EXISTS accounting_categories;

-- 1. Accounting Categories Table
CREATE TABLE accounting_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
    parent_id UUID REFERENCES accounting_categories(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial categories
INSERT INTO accounting_categories (name, type) VALUES 
('Ventas', 'INCOME'),
('Servicios', 'INCOME'),
('Repuestos', 'EXPENSE'),
('Alquiler', 'EXPENSE'),
('Nómina', 'EXPENSE'),
('Marketing', 'EXPENSE'),
('Herramientas', 'EXPENSE'),
('Otros', 'EXPENSE');

-- 2. Accounting Transactions Table
CREATE TABLE accounting_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    amount NUMERIC(12, 2) NOT NULL,
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT NOT NULL,
    category_id UUID REFERENCES accounting_categories(id),
    vendor TEXT,
    receipt_url TEXT,
    
    -- New Fields for Consolidation Flow
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'CONSOLIDATED')) DEFAULT 'PENDING',
    order_id TEXT, 
    created_by UUID REFERENCES auth.users(id),
    source_department TEXT CHECK (source_department IN ('STORE', 'WORKSHOP')) DEFAULT 'WORKSHOP',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE accounting_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_transactions ENABLE ROW LEVEL SECURITY;

-- Policies
-- For this environment, we allow authenticated users to view categories (needed for UI)
-- But we restrict transactions modification to Admins (simulated by logic or specific role if available)
-- Since we don't have a guaranteed 'profiles' table with 'role' in this context, we'll use a permissive policy for now
-- but the architecture is designed for strictness.

CREATE POLICY "Allow read access to categories" ON accounting_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow all access to transactions" ON accounting_transactions FOR ALL TO authenticated USING (true);

-- RPC Function for Indirect Insert (Security Definer)
CREATE OR REPLACE FUNCTION add_pending_expense(
    p_amount NUMERIC,
    p_description TEXT,
    p_order_id TEXT,
    p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_category_id UUID;
    v_new_id UUID;
BEGIN
    -- Find 'Repuestos' category or default to first EXPENSE category
    SELECT id INTO v_category_id FROM accounting_categories WHERE name = 'Repuestos' LIMIT 1;
    IF v_category_id IS NULL THEN
        SELECT id INTO v_category_id FROM accounting_categories WHERE type = 'EXPENSE' LIMIT 1;
    END IF;

    INSERT INTO accounting_transactions (
        amount, description, category_id, status, order_id, created_by, source_department
    ) VALUES (
        -ABS(p_amount), -- Ensure negative
        p_description,
        v_category_id,
        'PENDING',
        p_order_id,
        p_user_id,
        'WORKSHOP'
    ) RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

-- RPC Functions for Dashboard (Updated)
-- get_cashflow_summary (Consolidated only)
CREATE OR REPLACE FUNCTION get_cashflow_summary()
RETURNS TABLE (month TEXT, income NUMERIC, expenses NUMERIC) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        TO_CHAR(DATE_TRUNC('month', transaction_date), 'Mon') as month,
        COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as income,
        COALESCE(ABS(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END)), 0) as expenses
    FROM accounting_transactions
    WHERE status = 'CONSOLIDATED' 
    AND transaction_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '5 months')
    GROUP BY DATE_TRUNC('month', transaction_date)
    ORDER BY DATE_TRUNC('month', transaction_date);
END;
$$ LANGUAGE plpgsql;

-- get_expense_distribution (Consolidated only)
CREATE OR REPLACE FUNCTION get_expense_distribution()
RETURNS TABLE (category_name TEXT, total_amount NUMERIC) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.name as category_name,
        ABS(SUM(t.amount)) as total_amount
    FROM accounting_transactions t
    JOIN accounting_categories c ON t.category_id = c.id
    WHERE t.status = 'CONSOLIDATED' 
    AND t.amount < 0 
    AND DATE_TRUNC('month', t.transaction_date) = DATE_TRUNC('month', CURRENT_DATE)
    GROUP BY c.name
    ORDER BY total_amount DESC;
END;
$$ LANGUAGE plpgsql;

-- get_financial_kpis (Consolidated only)
CREATE OR REPLACE FUNCTION get_financial_kpis()
RETURNS TABLE (
    current_income NUMERIC, current_expenses NUMERIC, net_profit NUMERIC,
    prev_income NUMERIC, prev_expenses NUMERIC, growth_income NUMERIC
) AS $$
DECLARE
    curr_inc NUMERIC; curr_exp NUMERIC;
    prev_inc NUMERIC; prev_exp NUMERIC;
BEGIN
    -- Current Month
    SELECT 
        COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0),
        COALESCE(ABS(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END)), 0)
    INTO curr_inc, curr_exp
    FROM accounting_transactions
    WHERE status = 'CONSOLIDATED'
    AND DATE_TRUNC('month', transaction_date) = DATE_TRUNC('month', CURRENT_DATE);

    -- Previous Month
    SELECT 
        COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0),
        COALESCE(ABS(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END)), 0)
    INTO prev_inc, prev_exp
    FROM accounting_transactions
    WHERE status = 'CONSOLIDATED'
    AND DATE_TRUNC('month', transaction_date) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month');

    RETURN QUERY SELECT
        curr_inc, curr_exp, (curr_inc - curr_exp),
        prev_inc, prev_exp,
        CASE WHEN prev_inc > 0 THEN ((curr_inc - prev_inc) / prev_inc) * 100 ELSE 0 END;
END;
$$ LANGUAGE plpgsql;
