import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function run() {
  const sql = fs.readFileSync('supabase/migrations/2026_05_13_v38_financial_audit_logs.sql', 'utf8');
  const { data, error } = await supabase.rpc('exec_sql', { sql });
  console.log('Result:', error || 'Success');
}
run();
