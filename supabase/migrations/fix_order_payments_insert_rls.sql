-- Fix RLS for order_payments to allow INSERT
ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.order_payments;
CREATE POLICY "Enable insert for authenticated users" 
ON public.order_payments FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.order_payments;
CREATE POLICY "Enable all access for authenticated users" 
ON public.order_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
