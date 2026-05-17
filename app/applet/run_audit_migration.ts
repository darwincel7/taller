import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function run() {
  const sql = fs.readFileSync('supabase/migrations/99992_store_audits.sql', 'utf8');
  const { data, error } = await supabase.rpc('exec_sql', { sql });
  if (error && error.message.includes('function "exec_sql" does not exist')) {
       console.log('Use other way');
  } else {
       console.log('Result:', error || 'Success');
  }
}
run();
