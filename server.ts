import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Server is running" });
  });

  // Placeholder for WhatsApp Notification API
  app.post("/api/notifications/whatsapp", async (req, res) => {
    const { phone, message, orderId } = req.body;
    
    console.log(`[WhatsApp API] Request to send message to ${phone}: ${message}`);
    
    // Here we will eventually integrate UltraMsg, Twilio, or Meta API
    // For now, we simulate a successful send
    
    const WHATSAPP_PROVIDER = process.env.WHATSAPP_PROVIDER || 'MOCK';
    
    try {
      if (WHATSAPP_PROVIDER === 'MOCK') {
        console.log("WhatsApp API not configured yet. Triggering manual fallback...");
        return res.json({ success: false, provider: 'MOCK', error: "API not configured" });
      }
      
      // Future integration logic goes here
      res.json({ success: true, message: "Message sent (placeholder)" });
    } catch (error: any) {
      console.error("Error sending WhatsApp message:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("/*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
