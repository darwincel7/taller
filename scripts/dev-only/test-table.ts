async function testTable() {
    const supabaseUrl = "https://ruwcektpadeqovwtdixd.supabase.co";
    const supabaseKey = "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_"; // Wait, is this the public key for TALLER DARWIN?
    
    try {
        const response = await fetch(`${supabaseUrl}/rest/v1/users?select=id&limit=1`, {
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
            }
        });
        console.log("Status:", response.status);
        const text = await response.text();
        console.log("Response:", text.substring(0, 200));
    } catch (e) {
        console.error("Fetch Exception:", e.message);
    }
}
testTable();
