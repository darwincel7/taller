async function testQZ() {
    try {
        const res = await fetch("http://localhost:3000/api/cert-qz");
        console.log("Cert:", res.status, (await res.text()).substring(0, 100));
        
        const res2 = await fetch("http://localhost:3000/api/sign-qz", {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({request: "test"})
        });
        console.log("Sign:", res2.status, (await res2.text()).substring(0, 50));
    } catch(e) {
        console.log("Error", e);
    }
}
testQZ();
