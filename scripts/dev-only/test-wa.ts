import { connectToWhatsApp, getWhatsAppStatus } from "./server/whatsapp.js";

async function test() {
    console.log("Connecting...");
    await connectToWhatsApp(true);
    let attempts = 0;
    while(attempts < 10) {
        console.log(getWhatsAppStatus());
        await new Promise(r => setTimeout(r, 2000));
        attempts++;
    }
}
test();
