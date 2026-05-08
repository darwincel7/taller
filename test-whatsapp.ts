import { connectToWhatsApp, getWhatsAppStatus } from './server/whatsapp.js';

async function test() {
    console.log("Connecting...");
    await connectToWhatsApp(true);
    
    for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log("Status:", getWhatsAppStatus());
    }
    process.exit(0);
}
test();
