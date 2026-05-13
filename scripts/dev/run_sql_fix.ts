import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = "https://ruwcektpadeqovwtdixd.supabase.co";
const supabaseKey = "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";

const supabase = createClient(supabaseUrl, supabaseKey);

async function runSQL() {
  const sql = fs.readFileSync('supabase/migrations/9999_fix_sales_unified_profit_dashboard.sql', 'utf-8');
  
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  if (error) {
    const { data: d2, error: e2 } = await supabase.rpc('exec_sql', { sql_string: sql });
    if (e2) {
       console.error('Error executing SQL via RPC:', e2);
    } else {
       console.log('SQL executed successfully using sql_string', d2);
    }
  } else {
    console.log('SQL executed successfully using sql_query', data);
  }
}
runSQL();
