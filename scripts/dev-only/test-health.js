async function checkDbHealth() {
    try {
        const url = "https://ruwcektpadeqovwtdixd.supabase.co/rest/v1/users?limit=1";
        const key = "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";
        
        console.log("Checking DB Read...");
        let res = await fetch(url, { headers: { 'apikey': key } });
        console.log("READ Status:", res.status, await res.text());

        console.log("Checking DB Write...");
        res = await fetch("https://ruwcektpadeqovwtdixd.supabase.co/rest/v1/users", {
            method: 'POST',
            headers: { 
                'apikey': key,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                id: "test-health-" + Date.now(),
                name: "Health Check", 
                active: false
            })
        });
        console.log("WRITE Status:", res.status, await res.text());
        
    } catch(e) {
        console.error("Health check failed:", e.message);
    }
}
checkDbHealth();
