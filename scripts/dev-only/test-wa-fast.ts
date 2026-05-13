import { connectToWhatsApp, getWhatsAppStatus } from "./server/whatsapp.js";

async function run() {
    console.log("Starting WA...");
    connectToWhatsApp(true).catch(e => console.error("WA ERR", e));
    setTimeout(() => {
        console.log("Status after 5s:", getWhatsAppStatus());
        process.exit(0);
    }, 5000);
}
run();
