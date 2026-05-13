import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ruwcektpadeqovwtdixd.supabase.co';
const supabaseKey = 'sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('accounting_transactions')
    .select('*')
    .eq('order_id', 'INV-31736') // Order #500
    .order('created_at', { ascending: true });

  if (error) {
    console.error(error);
    return;
  }
  
  console.log(JSON.stringify(data, null, 2));
}

check();
