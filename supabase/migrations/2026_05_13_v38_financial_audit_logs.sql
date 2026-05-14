-- Migration V38: Certificacion y Blindaje
-- 1. Crear tabla central de auditoría financiera
CREATE TABLE IF NOT EXISTS public.financial_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL, -- 'SALE_CREATED', 'CREDIT_CREATED', 'CAMBIAZO_CREATED', 'EXPENSE_CREATED', 'CASH_REGISTER_CLOSED', 'REFUND_PROCESSED', 'RECONCILIATION_WARNING'
    description TEXT,
    amount NUMERIC DEFAULT 0,
    branch_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.financial_audit_logs ENABLE ROW LEVEL SECURITY;

-- Politicas
DROP POLICY IF EXISTS "Enable read access for authenticated users on financial audit" ON public.financial_audit_logs;
CREATE POLICY "Enable read access for authenticated users on financial audit" 
ON public.financial_audit_logs FOR SELECT 
TO authenticated 
USING (true);

DROP POLICY IF EXISTS "Enable insert access for authenticated users on financial audit" ON public.financial_audit_logs;
CREATE POLICY "Enable insert access for authenticated users on financial audit" 
ON public.financial_audit_logs FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- 2. Función genérica para registrar auditoría financiera
CREATE OR REPLACE FUNCTION public.log_financial_audit(
    p_event_type TEXT,
    p_description TEXT,
    p_amount NUMERIC,
    p_branch_id TEXT,
    p_user_id TEXT,
    p_details JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.financial_audit_logs (event_type, description, amount, branch_id, user_id, details)
    VALUES (p_event_type, p_description, p_amount, p_branch_id, p_user_id, p_details)
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger para ventas (Checkout / POS)
CREATE OR REPLACE FUNCTION public.trg_audit_order_payment()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Es un pago u orden en caja
        -- En ventas unificadas consideramos order_payments y cash_movements
        IF NEW.amount > 0 AND NOT COALESCE(NEW.is_refund, false) THEN
             PERFORM public.log_financial_audit('SALE_PAID'::TEXT, ('Pago de orden/venta POS recibida: ' || COALESCE(NEW.method, 'CASH'))::TEXT, NEW.amount::NUMERIC, ''::TEXT, NEW."cashierId"::TEXT, jsonb_build_object('order_id', NEW.order_id, 'payment_id', NEW.id, 'method', NEW.method));
        ELSIF NEW.amount < 0 OR NEW.is_refund THEN
             PERFORM public.log_financial_audit('REFUND_PROCESSED'::TEXT, ('Reembolso procesado en orden: ' || COALESCE(NEW.method, 'CASH'))::TEXT, NEW.amount::NUMERIC, ''::TEXT, NEW."cashierId"::TEXT, jsonb_build_object('order_id', NEW.order_id, 'payment_id', NEW.id, 'method', NEW.method));
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_audit_order_payment ON public.order_payments;
-- Not attaching trigger directly to avoid recursive calls and overhead when we process many rows. Instead, we can add it to the RPCs or add explicit calls.

-- Dado que estamos limitados con triggers sin contexto (branch), es mejor usar un trigger a nivel cash_movements
CREATE OR REPLACE FUNCTION public.trg_audit_cash_movement()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.movement_type LIKE '%SALE%' THEN
        PERFORM public.log_financial_audit('SALE_CREATED'::TEXT, ('Movimiento de Venta/Ingreso: ' || coalesce(NEW.description, ''))::TEXT, NEW.amount::NUMERIC, NEW.branch::TEXT, COALESCE(NEW.user_id, 'system')::TEXT, jsonb_build_object('movement_type', NEW.movement_type, 'id', NEW.id));
    ELSIF NEW.movement_type LIKE '%EXPENSE%' OR NEW.movement_type = 'MANUAL_OUT' THEN
        PERFORM public.log_financial_audit('EXPENSE_CREATED'::TEXT, ('Movimiento de Gasto/Salida: ' || coalesce(NEW.description, ''))::TEXT, NEW.amount::NUMERIC, NEW.branch::TEXT, COALESCE(NEW.user_id, 'system')::TEXT, jsonb_build_object('movement_type', NEW.movement_type, 'id', NEW.id));
    ELSIF NEW.movement_type LIKE '%CAMBIAZO%' THEN
        PERFORM public.log_financial_audit('CAMBIAZO_CREATED'::TEXT, ('Cambiazo procesado: ' || coalesce(NEW.description, ''))::TEXT, NEW.amount::NUMERIC, NEW.branch::TEXT, COALESCE(NEW.user_id, 'system')::TEXT, jsonb_build_object('movement_type', NEW.movement_type, 'id', NEW.id));
    ELSIF NEW.amount < 0 AND (NEW.description ILIKE '%dev%' OR NEW.description ILIKE '%refund%') THEN
        PERFORM public.log_financial_audit('REFUND_PROCESSED'::TEXT, ('Devolucion de efectivo: ' || coalesce(NEW.description, ''))::TEXT, NEW.amount::NUMERIC, NEW.branch::TEXT, COALESCE(NEW.user_id, 'system')::TEXT, jsonb_build_object('movement_type', NEW.movement_type, 'id', NEW.id));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_audit_cash_movement ON public.cash_movements;
CREATE TRIGGER trigger_audit_cash_movement
AFTER INSERT ON public.cash_movements
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_cash_movement();

-- 4. Trigger para creditos
CREATE OR REPLACE FUNCTION public.trg_audit_client_credits()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM public.log_financial_audit('CREDIT_CREATED'::TEXT, 'Credito (fiao) creado'::TEXT, NEW.amount::NUMERIC, NEW.branch_id::TEXT, NEW.created_by::TEXT, jsonb_build_object('client_id', NEW.client_id, 'id', NEW.id));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_audit_client_credits ON public.client_credits;
CREATE TRIGGER trigger_audit_client_credits
AFTER INSERT ON public.client_credits
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_client_credits();

-- 5. Trigger para Cierres de caja
CREATE OR REPLACE FUNCTION public.trg_audit_cash_closings()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM public.log_financial_audit('CASH_REGISTER_CLOSED'::TEXT, ('Cierre de caja completado (' || NEW.difference || ')')::TEXT, NEW."actualTotal"::NUMERIC, ''::TEXT, NEW."adminId"::TEXT, jsonb_build_object('expected', NEW."systemTotal", 'difference', NEW.difference, 'id', NEW.id, 'cashierId', NEW."cashierId"));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_audit_cash_registers ON public.cash_registers;
DROP TRIGGER IF EXISTS trigger_audit_cash_closings ON public.cash_closings;
CREATE TRIGGER trigger_audit_cash_closings
AFTER INSERT ON public.cash_closings
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_cash_closings();
