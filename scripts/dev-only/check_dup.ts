import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://ruwcektpadeqovwtdixd.supabase.co";
const finalUrl = supabaseUrl.startsWith('http') ? supabaseUrl : `https://${supabaseUrl}.supabase.co`;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";

const supabase = createClient(finalUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.rpc('diagnostic_crm_duplicates');
  console.log("Diag:", JSON.stringify({ data, error }, null, 2));
  
  const { data: d2, error: e2 } = await supabase.rpc('merge_crm_contact_duplicates', { dry_run: false });
  console.log("Merge Exec:", JSON.stringify({ data: d2, error: e2 }, null, 2));
}
run();
