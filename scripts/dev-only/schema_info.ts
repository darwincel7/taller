import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function runSQL() {
  const sql = `
  SELECT table_name, column_name, data_type 
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
  AND table_name IN ('cash_movements', 'v_sales_unified', 'accounting_transactions', 'floating_expenses', 'client_credits', 'credit_payments');
  `;
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  if (error) {
     const { data: d2, error: e2 } = await supabase.rpc('exec_sql', { sql_string: sql });
     console.log(e2 || d2);
  } else {
     console.log(data);
  }
}
runSQL();
