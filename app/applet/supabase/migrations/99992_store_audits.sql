-- Create store audits table
CREATE TABLE IF NOT EXISTS public.store_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id TEXT NOT NULL,
    auditor_id TEXT NOT NULL,
    auditor_name TEXT NOT NULL,
    total_items INT NOT NULL,
    found_items INT NOT NULL,
    missing_items INT NOT NULL,
    left_items INT NOT NULL,
    pending_items INT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    items_state JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- RLS
ALTER TABLE public.store_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for authenticated users on store_audits" ON public.store_audits;
CREATE POLICY "Enable read access for authenticated users on store_audits" ON public.store_audits FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Enable insert access for authenticated users on store_audits" ON public.store_audits;
CREATE POLICY "Enable insert access for authenticated users on store_audits" ON public.store_audits FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Enable update access for authenticated users on store_audits" ON public.store_audits;
CREATE POLICY "Enable update access for authenticated users on store_audits" ON public.store_audits FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable delete access for authenticated users on store_audits" ON public.store_audits;
CREATE POLICY "Enable delete access for authenticated users on store_audits" ON public.store_audits FOR DELETE TO authenticated USING (true);
