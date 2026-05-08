import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: logs } = await supabase.from('audit_logs').select('*').limit(5).eq('action', 'INVENTORY_EXTRACTION');
  console.log('logs:', logs);
  if(logs && logs.length > 0) {
     const orderIds = logs.map(l => l.order_id).filter(Boolean);
     console.log('orderIds:', orderIds);
     const { data: orders } = await supabase.from('orders').select('id, readable_id').in('id', orderIds);
     console.log('orders:', orders);
  }
}
run();
