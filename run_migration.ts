import { createClient } from "@supabase/supabase-js";
const PROVIDED_URL = "https://ruwcektpadeqovwtdixd.supabase.co"; 
const PROVIDED_KEY = "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";

const supabase = createClient(PROVIDED_URL, PROVIDED_KEY);

const sql = `
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

ALTER TABLE public.store_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all access for authenticated users on store_audits" ON public.store_audits;
CREATE POLICY "Enable all access for authenticated users on store_audits" ON public.store_audits FOR ALL TO authenticated USING (true) WITH CHECK (true);
`;

async function run() {
  const { data, error } = await supabase.rpc("exec_sql", { sql });
  if (error) {
      console.log(error);
  } else {
      console.log("Result:", data || "Success");
  }
}
run();
