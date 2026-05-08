async function pingSupabaseRoot() {
    try {
        const url = "https://ruwcektpadeqovwtdixd.supabase.co/rest/v1/users";
        const key = "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";
        console.log(`Pinging ${url}...`);
        const res = await fetch(url, { headers: { 'apikey': key } });
        console.log(`Status: ${res.status}`);
        if (!res.ok) console.log("Body:", await res.text());
        else console.log("Success! Data length:", (await res.json()).length);
    } catch(e) { console.error("Ping failed:", e.message); }
}
pingSupabaseRoot();
