import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://ruwcektpadeqovwtdixd.supabase.co";
const finalUrl = supabaseUrl.startsWith('http') ? supabaseUrl : `https://${supabaseUrl || "ruwcektpadeqovwtdixd"}.supabase.co`;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";

const supabase = createClient(finalUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('orders').select('*').limit(2);
  console.log(JSON.stringify({ data, error }, null, 2));
}
run();
