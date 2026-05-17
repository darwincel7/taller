import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function run() {
  const { data, error } = await supabase.from('inventory_parts').select('id, name, created_at, category').limit(200);
  console.log(data?.filter(x => x.category?.includes('STORE_PURCHASE')).map(x => ({ name: x.name, created_at: x.created_at })));
}
run();
