import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://ruwcektpadeqovwtdixd.supabase.co";
const supabaseKey = "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('accounting_transactions').select('order_id').limit(1);
  console.log("data:", data);
  console.log("error:", error);
}
check();
