import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://ruwcektpadeqovwtdixd.supabase.co";
const finalUrl = supabaseUrl.startsWith('http') ? supabaseUrl : `https://${supabaseUrl}.supabase.co`;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";

const supabase = createClient(finalUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('crm_contacts').select('*').ilike('display_name', '%moises%');
  console.log("Contacts:", JSON.stringify(data, null, 2));
  
  const { data: c2 } = await supabase.from('crm_contact_identities').select('*').in('contact_id', data?.map(d => d.id) || []);
  console.log("Identities:", JSON.stringify(c2, null, 2));
  
  const { data: c3 } = await supabase.from('crm_conversations').select('*').in('contact_id', data?.map(d => d.id) || []);
  console.log("Conversations:", JSON.stringify(c3, null, 2));
}

run();
