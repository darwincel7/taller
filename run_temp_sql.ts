import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = "https://ruwcektpadeqovwtdixd.supabase.co";
const supabaseKey = "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";

const supabase = createClient(supabaseUrl, supabaseKey);

async function runSQL() {
  const sql = fs.readFileSync('temp_sql.txt', 'utf-8');
  
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  if (error) {
    const { data: d2, error: e2 } = await supabase.rpc('exec_sql', { sql_string: sql });
    if (e2) {
       console.error('Error:', e2);
    } else {
       console.log('Success string:', d2);
    }
  } else {
    console.log('Success query:', data);
  }
}
runSQL();
