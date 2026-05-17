// @ts-check
import { createClient } from '@supabase/supabase-js';

const PROVIDED_URL = "https://ruwcektpadeqovwtdixd.supabase.co"; 
const PROVIDED_KEY = process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_"; // Make sure to provide service key if anon key isn't enough to update without RLS blocking, but actually anon key blocks updates unless authenticated!

// Wait, I can't use anon key to update without being logged in if RLS is enabled!
console.log("Will use RLS bypass if needed, wait, we have SUPABASE_SERVICE_ROLE_KEY if we run inside the server.")
