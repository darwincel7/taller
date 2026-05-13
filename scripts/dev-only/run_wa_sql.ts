import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = "https://ruwcektpadeqovwtdixd.supabase.co";
const supabaseKey = "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";

const supabase = createClient(supabaseUrl, supabaseKey);

async function runSQL() {
  const sql = fs.readFileSync('setup_wa_tables.sql', 'utf-8');
  
  const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql });
  if (error) {
    console.error('Error executing SQL via RPC:', error);
  } else {
    console.log('SQL executed successfully', data);
  }
}
runSQL();
