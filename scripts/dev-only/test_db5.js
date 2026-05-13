import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
const envStr = fs.readFileSync('.env.example', 'utf8') + '\n' + (fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '');
let url, key;
envStr.split('\n').forEach(l => {
  if(l.startsWith('VITE_SUPABASE_URL=')) url = l.split('=')[1].trim();
  if(l.startsWith('VITE_SUPABASE_ANON_KEY=')) key = l.split('=')[1].trim();
});
const supabase = createClient(url, key);
async function run() {
  const { data: storeItems } = await supabase.from('inventory_parts').select('id, name, stock, category, created_at').order('created_at', { ascending: false }).limit(40);
  console.log("DB ITEMS:", storeItems.filter(i => i.category.includes('STORE_ITEM')));
  
  const { data: orders } = await supabase.from('orders').select('id, readable_id, status, "orderType"').eq('orderType', 'STORE').order('created_at', { ascending: false }).limit(5);
  console.log("RECENT STORE ORDERS:", orders);
}
run();
