import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing credentials");
  process.exit(1);
}

const formattedUrl = supabaseUrl.startsWith('http') ? supabaseUrl : `https://${supabaseUrl}.supabase.co`;

const supabase = createClient(formattedUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('users').select('*');
  if (error) {
    console.error("Error fetching users:", error);
  } else {
    console.log("Users:", data);
  }
}

check();
