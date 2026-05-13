async function testLocalApi() {
    try {
        const res = await fetch("http://localhost:3000/api/whatsapp/status");
        console.log("Status:", res.status, await res.text());
    } catch(e) {
        console.error("Local API failed:", e);
    }
}
testLocalApi();
