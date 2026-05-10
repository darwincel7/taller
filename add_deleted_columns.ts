import { supabase } from './services/supabase';

async function updateDb() {
  const sql = `
  ALTER TABLE public.inventory_parts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
  ALTER TABLE public.inventory_parts ADD COLUMN IF NOT EXISTS deleted_by uuid;
  ALTER TABLE public.inventory_parts ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
  `;
  const { error } = await supabase.rpc('exec_sql', { sql_string: sql });
  if (error) console.error("Error direct exec:", error);
  else console.log("Added deleted columns successfully!");
}
updateDb();
