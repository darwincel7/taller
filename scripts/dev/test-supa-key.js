async function testSupabaseKey() {
    const url = "https://ruwcektpadeqovwtdixd.supabase.co/rest/v1/users?limit=1";
    const key = "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";
    try {
        const res = await fetch(url, { 
            method: 'OPTIONS',
            headers: {
                'Origin': 'http://localhost:3000',
                'Access-Control-Request-Method': 'GET',
                'Access-Control-Request-Headers': 'apikey, authorization'
            }
        });
        console.log("OPTIONS Status:", res.status);
        console.log("OPTIONS Headers:", Object.fromEntries(res.headers.entries()));
        
        const res2 = await fetch(url, { 
            headers: { 
                'apikey': key,
                'Authorization': `Bearer ${key}`
            } 
        });
        console.log("GET Status:", res2.status);
        console.log("GET Body:", await res2.text());
        console.log("GET Headers:", Object.fromEntries(res2.headers.entries()));
    } catch (e) {
        console.error("Fetch failed:", e);
    }
}
testSupabaseKey();
