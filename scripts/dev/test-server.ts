import fetch from 'node-fetch';

async function test() {
    console.log("Calling /api/whatsapp/connect...");
    const res = await fetch('http://localhost:3000/api/whatsapp/connect', { method: 'POST' });
    const data = await res.json() as any;
    console.log("Connect response:", { status: data.status, hasQr: !!data.qr });
    
    console.log("Polling status...");
    for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const res2 = await fetch('http://localhost:3000/api/whatsapp/status');
        const data2 = await res2.json() as any;
        console.log(`Status ${i}:`, { status: data2.status, hasQr: !!data2.qr, qrStart: data2.qr ? data2.qr.substring(0, 50) : null });
    }
}
test();