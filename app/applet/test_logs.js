import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: logs } = await supabase.from('audit_logs').select('*').limit(3).eq('action', 'INVENTORY_EXTRACTION');
  console.log(logs);
}
run();
