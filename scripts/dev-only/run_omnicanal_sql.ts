import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = "https://ruwcektpadeqovwtdixd.supabase.co";
const supabaseKey = "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";

const supabase = createClient(supabaseUrl, supabaseKey);

async function runSQL() {
  const sql = fs.readFileSync('setup_omnicanal_indexes_security.sql', 'utf-8');
  
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql }); // Note: exec_sql parameter could be sql_string or sql_query, we'll try sql_string which we saw in run_wa_sql.ts. Let me use sql_string.
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
