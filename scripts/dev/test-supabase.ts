import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function testSupabase() {
    console.log("URL:", process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL);
    // Don't log full key for security, just prefix
    const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
    console.log("KEY prefix:", key ? key.substring(0, 10) + "..." : "missing");

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://qpswvwhhrvsayllepdgy.supabase.co"; // updated to user's project ID from screenshot
    // Wait, the project ID in the screenshot is "qpswvwhhrvsayllepdgy". Let's check our .env.example
    
    const supabase = createClient(
        supabaseUrl,
        key || "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_" // This looks like an AI studio key, likely wrong for their actual custom Supabase project!
    );
    
    try {
        const { data, error } = await supabase.from('users').select('id').limit(1);
        if (error) {
            console.error("Supabase Error:", error.message);
        } else {
            console.log("Success! Connected to Supabase.", data);
        }
    } catch (e) {
        console.error("Fetch Exception:", e);
    }
}

testSupabase();
