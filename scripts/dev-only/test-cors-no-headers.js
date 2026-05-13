async function testCORSNoHeaders() {
    const url = "https://ruwcektpadeqovwtdixd.supabase.co/rest/v1/";
    try {
        const res = await fetch(url, { 
            method: 'GET',
            headers: {
                'Origin': 'https://ais-pre-cuyc7u4mq3k2dufz45gazf-17409595897.us-west1.run.app'
            }
        });
        console.log("No headers GET Status:", res.status);
    } catch (e) {
        console.error("Fetch failed:", e);
    }
}
testCORSNoHeaders();
