-- Auditoria de Eventos Financieros

CREATE TABLE IF NOT EXISTS public.financial_audit_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    source_table text NOT NULL,
    source_id text NOT NULL,
    event_type text NOT NULL,
    amount numeric NOT NULL,
    user_id text,
    branch text,
    details jsonb,
    created_at timestamptz DEFAULT now()
);

-- Crear funcion / trigger para registrar cada movimiento de dinero
-- Podriamos crear triggers para cash_movements, accounting_transactions
-- pero quizas sea mas facil solo crear la tabla y loggear desde el backend / rpc

CREATE OR REPLACE FUNCTION audit_financial_event() RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME = 'cash_movements' THEN
        INSERT INTO financial_audit_logs (source_table, source_id, event_type, amount, user_id, branch, details)
        VALUES ('cash_movements', NEW.id::text, NEW.movement_type, NEW.amount, NEW.cashier_id, NEW.branch, NEW.metadata);
    ELSIF TG_TABLE_NAME = 'accounting_transactions' THEN
        IF NEW.status = 'COMPLETED' THEN
            INSERT INTO financial_audit_logs (source_table, source_id, event_type, amount, user_id, branch, details)
            VALUES ('accounting_transactions', NEW.id::text, 'EXPENSE', NEW.amount, NEW.created_by, NEW.branch, jsonb_build_object('description', NEW.description));
        END IF;
    ELSIF TG_TABLE_NAME = 'client_credits' THEN
        INSERT INTO financial_audit_logs (source_table, source_id, event_type, amount, user_id, branch, details)
        VALUES ('client_credits', NEW.id::text, NEW.status, NEW.amount, NEW.contact_id::text, NEW.branch_id, jsonb_build_object('type', NEW.type));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_audit_cash_movements ON cash_movements;
CREATE TRIGGER trigger_audit_cash_movements
    AFTER INSERT OR UPDATE ON cash_movements
    FOR EACH ROW EXECUTE FUNCTION audit_financial_event();

DROP TRIGGER IF EXISTS trigger_audit_accounting_transactions ON accounting_transactions;
CREATE TRIGGER trigger_audit_accounting_transactions
    AFTER INSERT OR UPDATE ON accounting_transactions
    FOR EACH ROW EXECUTE FUNCTION audit_financial_event();

DROP TRIGGER IF EXISTS trigger_audit_client_credits ON client_credits;
CREATE TRIGGER trigger_audit_client_credits
    AFTER INSERT OR UPDATE ON client_credits
    FOR EACH ROW EXECUTE FUNCTION audit_financial_event();
