import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string, 
  process.env.VITE_SUPABASE_ANON_KEY as string
);

async function checkPending() {
    const { data } = await supabase.from('inventory_parts').select('*').order('created_at', { ascending: false }).limit(5);
    console.log(JSON.stringify(data, null, 2));
}

checkPending();
