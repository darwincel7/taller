import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ruwcektpadeqovwtdixd.supabase.co';
const supabaseKey = 'sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: logs } = await supabase.from('audit_logs').select('*').limit(10).order('created_at', { ascending: false });
  console.log('Logs:', logs);
  
  if (logs && logs.length > 0) {
     const orderIds = [...new Set(logs.map(l => l.order_id).filter(Boolean))];
     if (orderIds.length > 0) {
         console.log('OrderIDs:', orderIds);
         const { data: orders } = await supabase.from('orders').select('id, readable_id').in('id', orderIds);
         console.log('Orders:', orders);
     }
  }
}

run();
