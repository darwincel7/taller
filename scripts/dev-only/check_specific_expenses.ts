import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ruwcektpadeqovwtdixd.supabase.co';
const supabaseKey = 'sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log("Checking for specific expenses...");
  
  const { data, error } = await supabase
    .from('accounting_transactions')
    .select('id, description, amount, status, created_at, source, order_id, branch, invoice_number, is_duplicate')
    .in('amount', [-4000, -250, -950, -700, -5950])
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error(error);
    return;
  }
  
  console.log(JSON.stringify(data, null, 2));
}

check();
