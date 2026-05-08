async function pingSupabase() {
    try {
        const url = "https://ruwcektpadeqovwtdixd.supabase.co/rest/v1/";
        const key = "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";
        console.log(`Pinging ${url}...`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const tsStart = Date.now();
        const res = await fetch(url, {
            headers: { 'apikey': key },
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        console.log(`Status: ${res.status} (Took ${Date.now() - tsStart}ms)`);
        if (!res.ok) {
            console.log("Error body:", await res.text());
        }
    } catch(e) {
        console.error("Ping failed:", e.message);
    }
}
pingSupabase();
