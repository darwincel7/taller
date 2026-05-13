import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: storeItems } = await supabase.from('inventory_parts').select('*').like('category', '%PENDING_ACCEPTANCE%').order('created_at', { ascending: false }).limit(5);
  console.log("PENDING ACCEPTANCE ITEMS:", storeItems);
  
  const { data: recentOrders } = await supabase.from('orders').select('id, readable_id, status, "orderType"').eq('orderType', 'STORE').order('created_at', { ascending: false }).limit(5);
  console.log("RECENT STORE ORDERS:", recentOrders);
}
run();
