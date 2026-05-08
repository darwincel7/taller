import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://ruwcektpadeqovwtdixd.supabase.co";
const supabaseKey = "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, count, error } = await supabase
    .from('floating_expenses')
    .select('*', { count: 'exact' })
    .neq('description', 'RECEIPT_UPLOAD_TRIGGER');
    
  console.log("Count ALL:", count);
}

run();
