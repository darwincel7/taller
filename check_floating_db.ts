import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://ruwcektpadeqovwtdixd.supabase.co";
const supabaseKey = "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, count, error } = await supabase
    .from('floating_expenses')
    .select('*', { count: 'exact' })
    .neq('description', 'RECEIPT_UPLOAD_TRIGGER')
    .eq('approval_status', 'APPROVED');
    
  console.log("Count with APPROVED:", count);
  console.log("Data:", data);
  console.log("Error:", error);
}

run();
