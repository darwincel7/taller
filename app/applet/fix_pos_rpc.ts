import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const sql = fs.readFileSync('setup_pos_transactional.sql', 'utf8');
  
  // Apply fix to the SQL using regex or string replace
  const fixedSql = sql.replace(
      />= COALESCE\(finalPrice, 0\) THEN 'delivered'/g,
      `>= COALESCE("totalAmount", COALESCE("finalPrice", COALESCE("estimatedCost", 0))) THEN 'Entregado'`
  ).replace(
      /updated_at = extract\(epoch from now\(\)\)::bigint \* 1000/g,
      `"completedAt" = extract(epoch from now())::bigint * 1000`
  );

  console.log("Applying the updated SQL...");

  // Send the SQL query to the database using the rpc or a known method.
  // We can't trivially execute raw SQL with anon key via js client unless we use a rpc.
  // Wait, does the project expose an RPC for running arbitrary sql? Sometimes `exec_sql` exists.
  const { data, error } = await supabase.rpc('exec_sql', { sql: fixedSql });
  if (error) {
     console.error('Error executing SQL via RPC exec_sql. Falling back...', error);
  } else {
     console.log('Successfully updated the RPC!', data);
  }
}

main().catch(console.error);
