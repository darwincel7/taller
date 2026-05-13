import { createClient } from '@supabase/supabase-js';

async function testViteUrl() {
    const supabaseUrl = "https://ruwcektpadeqovwtdixd.supabase.co";
    const supabaseKey = "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_"; // This is clearly a placeholder/fake key
    
    console.log("Testing:", supabaseUrl);
    
    try {
        const response = await fetch(`${supabaseUrl}/rest/v1/?apikey=${supabaseKey}`);
        console.log("Status:", response.status);
        const text = await response.text();
        console.log("Response:", text.substring(0, 200));
    } catch (e) {
        console.error("Fetch Exception:", e.message);
    }
}

testViteUrl();
