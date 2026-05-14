import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://ruwcektpadeqovwtdixd.supabase.co";
const finalUrl = supabaseUrl.startsWith('http') ? supabaseUrl : `https://${supabaseUrl}.supabase.co`;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";

const supabase = createClient(finalUrl, supabaseKey);

async function run() {
  const file1 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/crm_diagnostics_and_merge.sql'), 'utf-8');
  await supabase.rpc('exec_sql', { sql_string: file1 });

  const file2 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/crm_indexes.sql'), 'utf-8');
  await supabase.rpc('exec_sql', { sql_string: file2 });

  console.log("Applied SQL");
}
run();
