import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
if (!process.env.VITE_SUPABASE_URL) {
  process.env.VITE_SUPABASE_URL = 'https://ruwcektpadeqovwtdixd.supabase.co';
}
// wait wait wait I can't hardcode the key.
