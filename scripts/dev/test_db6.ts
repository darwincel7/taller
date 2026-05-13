import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log('No keys');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: q1, error: e1 } = await supabase.from('v_sales_unified').select('*').gte('created_at', '2026-05-12T00:00:00.000Z');
    console.log("Unified Sales:", e1, q1?.length, "rows");
    if(q1?.length) console.log(q1);

    const { data: q2, error: e2 } = await supabase.from('accounting_transactions').select('*').gte('transaction_date', '2026-05-12');
    console.log("Acc:", e2, q2?.length, "rows");
    if(q2?.length) console.log(q2.map(i => ({id: i.id, amount: i.amount, source: i.source, desc: i.description})));
}
run();
