async function checkCORS() {
    try {
        const url = "https://ruwcektpadeqovwtdixd.supabase.co/rest/v1/users?limit=1";
        
        console.log("Checking OPTIONS (CORS preflight)...");
        const res = await fetch(url, { 
            method: 'OPTIONS',
            headers: { 
                'Origin': 'https://ais-pre-cuyc7u4mq3k2dufz45gazf-17409595897.us-west1.run.app',
                'Access-Control-Request-Method': 'GET'
            } 
        });
        console.log("OPTIONS Status:", res.status);
        console.log("OPTIONS Headers:", Object.fromEntries(res.headers.entries()));
    } catch(e) {
        console.error("CORS check failed:", e.message);
    }
}
checkCORS();
