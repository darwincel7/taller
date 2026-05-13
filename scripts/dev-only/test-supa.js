async function checkSupabase() {
    const url = "https://ruwcektpadeqovwtdixd.supabase.co/rest/v1/users?select=id&limit=1";
    const key = "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";
    try {
        const res = await fetch(url, { headers: { 'apikey': key } });
        console.log("Status:", res.status);
        console.log("Body:", await res.text());
    } catch (e) {
        console.error("Fetch failed:", e);
    }
}
checkSupabase();
