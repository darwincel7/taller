import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import crypto from "crypto";
import fs from "fs";
import { createProxyMiddleware } from "http-proxy-middleware";
import { connectToWhatsApp, getWhatsAppStatus, logoutWhatsApp, sendWhatsAppMessage, reconnectWhatsApp, resetWhatsAppConnection, disconnectWhatsApp } from "./server/whatsapp.ts";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config({ override: true });

const getAiClient = () => {
    let key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("API Key not found in environment.");
    
    // Strip quotes if they were accidentally included and trim
    key = key.replace(/['"]/g, '').trim();
    
    return new GoogleGenAI({ apiKey: key });
};

// Global error handlers to prevent server crash on WhatsApp crypto errors
process.on('uncaughtException', (err) => {
  const errorMsg = err.message || String(err);
  if (errorMsg.includes('Unsupported state') || errorMsg.includes('unable to authenticate data') || errorMsg.includes('bad session') || errorMsg.includes('MAC')) {
    console.log('WhatsApp session out of sync. Resetting connection to recover...');
    resetWhatsAppConnection();
  } else {
    // Only warn to avoid UI popovers from background exceptions
    console.warn('Uncaught Exception:', err);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  const errorMsg = reason instanceof Error ? reason.message : String(reason);
  if (errorMsg.includes('Unsupported state') || errorMsg.includes('unable to authenticate data') || errorMsg.includes('bad session') || errorMsg.includes('MAC') || errorMsg.includes('conflict')) {
    console.log('WhatsApp session out of sync. Resetting connection to recover...');
    resetWhatsAppConnection();
  } else {
    // Only warn to avoid UI popovers from background promises
    console.warn('Unhandled Rejection at:', promise, 'reason:', reason);
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Antivirus/Cloudflare Proxy Bypass Tunnel
  // MUST BE BEFORE express.json() so the proxy can pipe the raw body streams.
  // If placed after, POST/PATCH requests will lose their body, fail at Supabase, and return Vite's HTML fallback.
  app.use('/api/supabase-tunnel', createProxyMiddleware({
    target: 'https://ruwcektpadeqovwtdixd.supabase.co',
    changeOrigin: true,
    ws: true, // proxy websockets for realtime
    pathRewrite: {
      '^/api/supabase-tunnel': '', // strip tunnel prefix
    },
    on: {
        proxyReqWs: (proxyReq, req, socket, options, head) => {
            // Essential for wss to upgrade properly
        },
        error: (err, req, res: any) => {
            console.warn("Supabase Proxy Issue:", err.message);
            if (res && res.writeHead) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Proxy Error', message: err.message }));
            }
        }
    }
  }));

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Initialize WhatsApp connection on server start
  connectToWhatsApp();

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Server is running" });
  });

  // QZ Tray Certificate Route
  app.get("/api/cert-qz", (req, res) => {
    const certificate = `-----BEGIN CERTIFICATE-----
MIIECzCCAvOgAwIBAgIGAZ01FxEIMA0GCSqGSIb3DQEBCwUAMIGiMQswCQYDVQQG
EwJVUzELMAkGA1UECAwCTlkxEjAQBgNVBAcMCUNhbmFzdG90YTEbMBkGA1UECgwS
UVogSW5kdXN0cmllcywgTExDMRswGQYDVQQLDBJRWiBJbmR1c3RyaWVzLCBMTEMx
HDAaBgkqhkiG9w0BCQEWDXN1cHBvcnRAcXouaW8xGjAYBgNVBAMMEVFaIFRyYXkg
RGVtbyBDZXJ0MB4XDTI2MDMyNzE1MzYzN1oXDTQ2MDMyNzE1MzYzN1owgaIxCzAJ
BgNVBAYTAlVTMQswCQYDVQQIDAJOWTESMBAGA1UEBwwJQ2FuYXN0b3RhMRswGQYD
VQQKDBJRWiBJbmR1c3RyaWVzLCBMTEMxGzAZBgNVBAsMElFaIEluZHVzdHJpZXMs
IExMQzEcMBoGCSqGSIb3DQEJARYNc3VwcG9ydEBxei5pbzEaMBgGA1UEAwwRUVog
VHJheSBEZW1vIENlcnQwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDU
/WnZHOtkH0+2BtVp3yTU2Aiu7JfXGGxpz2Nrn7g8Z6tZzBTMGGxVA1cC3JsRLy/M
LRUKAoaAajA5TIgv5hdvGf9G8oAC/wv9krLN+T9Y844ZeKdsccS1+guvx48y68T8
aAfffXDXMOuXUn8czm9BL6kaHKUrgPdaC63ePSlOUK/3gOq4z5lT6TkjvkMI7WYk
xZGCCp5F/wfKteDo8t0qsEy7Rq+b9u5Y0F0FeU+P7HxSMiYlbhf76fBVQzhqkSo1
RVKWCVwKOlmAwCKfq5synteiioL4dYoKhZ1r+0j7yNfAw8NpecHrmvFoIkaGXSDX
5hC2RYZWkyGFmIEfNaV/AgMBAAGjRTBDMBIGA1UdEwEB/wQIMAYBAf8CAQEwDgYD
VR0PAQH/BAQDAgEGMB0GA1UdDgQWBBSM/rw6PoNf30ueCGp8n8uuYlUxozANBgkq
hkiG9w0BAQsFAAOCAQEAE3EE7fb2XLZgn/Ycg3eJ6SbQh/GBJd0DFeX5Sw5hONFl
RymEuDkyRvFuAjP/4+xdt7zaZ3G/SjIoud5XPQb3dhVfQD77MlWCqCpbgRa63D1V
oSw3BGHDF7hb4TXyRjrA8Ayc9XEqSPdU3YDvqJgMu3SaMymmJdQAtibRWPSvM8Ad
OWJ6fLp+wIxXUFgSe1yfNNBzeY0oUR2aQ5Dm4zHy9LjJFPfM4yJJhBZk9SKz1gwN
+b6CPv07iLryxv9SB+t5aGFIJByFLq/XJVY6V7D0ze9DI4hHtg3feoLPeeaY9/1U
+SWHrXkSVURoudanjtqhWTx4TUBz0OrDX/Y/blAoYA==
-----END CERTIFICATE-----`;
    res.set('Content-Type', 'text/plain');
    res.send(certificate);
  });

  // QZ Tray Signing Route
  app.post("/api/sign-qz", (req, res) => {
    const requestToSign = req.body.request;
    if (!requestToSign) {
      return res.status(400).send("Missing request parameter");
    }

    try {
      const privateKey = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDU/WnZHOtkH0+2
BtVp3yTU2Aiu7JfXGGxpz2Nrn7g8Z6tZzBTMGGxVA1cC3JsRLy/MLRUKAoaAajA5
TIgv5hdvGf9G8oAC/wv9krLN+T9Y844ZeKdsccS1+guvx48y68T8aAfffXDXMOuX
Un8czm9BL6kaHKUrgPdaC63ePSlOUK/3gOq4z5lT6TkjvkMI7WYkxZGCCp5F/wfK
teDo8t0qsEy7Rq+b9u5Y0F0FeU+P7HxSMiYlbhf76fBVQzhqkSo1RVKWCVwKOlmA
wCKfq5synteiioL4dYoKhZ1r+0j7yNfAw8NpecHrmvFoIkaGXSDX5hC2RYZWkyGF
mIEfNaV/AgMBAAECggEAAK0NOPMujBLNXfaHlt5ub36ACI4XrUcWkP9ngV/wZcCu
eop7RmqNbXelPw0UMOnFbRB3kKCRbLbpkET96akBSgj7Fm6OmXPVxehBSQYRfWbI
fKw1W9LAnRM+FkC745178pEh9UOgqA4vsTtBzAWbtMlB8CNHIuw13MNMuffXubfm
W5t2jHEwaTWivEdyAByBOwyLD6AZG2OXa7sYi9jBXFerP6lAdR5mh3pi82VFyJFi
91khxPF5cp3abJ02LjeEf74VQdkngVshB+NNLWpX39NMMkDmG6AW2IHjJakODNvn
0jSKDceVKhUoupv8J2S4+uMCKg4f2RVxgrnjcbwEgQKBgQDrwSvdYxkW7lh8s5sO
IbItf9j8Kd9po9e5jTccntzXSE5DrTT33Rq2VGgyEknt7nJjf4l/tcMQZiWiN/lq
5HQPHJEYydCWD9idOF0luR+3ZnttEBJ38CeVMlX1fUV4qZ9QuseUUYah+mnRSGrJ
sIAnizLv+3VMdMTb4bcfqObqowKBgQDnR8iNc5L/cdDNxhGhwa+5MYKaD1uI9Px2
dXmAqvITTWxifq8cNmtr2+UtrfyzDs5c13YLREqMZWV8TveYEsr+d/zXa7cbgPxW
G6uF3UpNb553bqjUO8ERpg2epJ2N9yPEbO0YjBbi0Ms0Geo9mbUhKkCaf2GTeNTs
0O16iqmDdQKBgHkQC2x2VQ33ey0eNgN9vjerLUvgXL+syTyZjbF+yr0qfjY2nbqi
qfLzSUZdKeWqysbZWUxhlDe5nJ2+zK/dfNO9wazPBfPpUzz5EqwqcmUFlWAeHr3E
by8oWAfmOmSKBiu4noBFlTNcmjZET8IehtDHpHKj2EpYtDaNpDH31AytAoGAYfGq
Ywzw0bD3hk09Jk2KB1mKP4gFcaieSeRSAkViov4Eymlv6vi44UKMeZ3XCFVa20J7
wSW4lGBUbCJdBE/hG4bg0rHRJ5qmQikRqG0gjE6aw2VfphFwH/M8jVSVTIu+3+5p
Mh4Rixh1Falr4452gIcOON99CSEAuxF3oI+cXgkCgYA5UqG6N/DpeSmqtjOhaorb
wd5JyarzJT0Z4dc5SMZOgSupmy3wRuqSWbNrX+QVky5hUTRamMvyNtEZfEN1AJs1
1/GXM1HoKVbuyrwLhaJoj9JuoywNAg3uPSUAp2ChnY9kbIoWv1m8646IdWzXRBuk
WulWnM5/R4sQkOsivcABDQ==
-----END PRIVATE KEY-----`;

      const sign = crypto.createSign('SHA256');
      sign.update(requestToSign);
      // QZ Tray expects the signature to be base64 encoded
      const signature = sign.sign(privateKey, 'base64');
      
      res.set('Content-Type', 'text/plain');
      res.send(signature);
    } catch (error) {
      console.warn("Issue signing QZ request:", error);
      res.status(500).send("Error signing request");
    }
  });

  // WhatsApp Management Routes
  app.get("/api/whatsapp/status", (req, res) => {
    res.json(getWhatsAppStatus());
  });

  app.post("/api/whatsapp/connect", async (req, res) => {
    try {
      await connectToWhatsApp(true);
      
      // Wait up to 15 seconds for QR code or open status before responding
      let attempts = 0;
      let status = getWhatsAppStatus();
      while (attempts < 30 && !status.qr && status.status !== 'open') {
          await new Promise(resolve => setTimeout(resolve, 500));
          status = getWhatsAppStatus();
          attempts++;
      }
      
      res.json(status);
    } catch (error: any) {
      console.warn("Issue in /api/whatsapp/connect:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  app.post("/api/whatsapp/reconnect", async (req, res) => {
    await reconnectWhatsApp();
    res.json({ success: true, message: "Reconnecting to WhatsApp..." });
  });

  app.post("/api/whatsapp/logout", async (req, res) => {
    await logoutWhatsApp();
    res.json({ success: true, message: "Logged out from WhatsApp" });
  });

  // WhatsApp Notification API
  app.post("/api/notifications/whatsapp", async (req, res) => {
    const { phone, message, orderId, image, isMedia } = req.body;
    
    console.log(`[WhatsApp API] Request to send message to ${phone}: ${!isMedia ? message : 'Media attached'} (Image: ${!!image})`);
    
    try {
      let status = getWhatsAppStatus();
      
      // If not open, wait a bit if it's connecting or try to reconnect if it's closed
      if (status.status !== 'open') {
        if (status.status === 'close') {
          console.log("WhatsApp connection closed. Attempting to reconnect...");
          connectToWhatsApp();
        }
        
        // Wait up to 5 seconds for connection to open
        let attempts = 0;
        while (attempts < 10 && status.status !== 'open') {
          await new Promise(resolve => setTimeout(resolve, 500));
          status = getWhatsAppStatus();
          attempts++;
        }
      }

      if (status.status !== 'open') {
        console.log("WhatsApp is not connected after waiting. Triggering manual fallback...");
        return res.json({ success: false, provider: 'BAILEYS', error: "WhatsApp not connected. Please check connection in Settings." });
      }

      let textMsg = message;
      let mediaData = undefined;

      if (isMedia) {
         try {
             const m = JSON.parse(message);
             textMsg = ''; 
             mediaData = m;
         } catch(e) {}
      }
      
      await sendWhatsAppMessage(phone, textMsg, image, mediaData);
      res.json({ success: true, message: "Message sent via WhatsApp Web" });
    } catch (error: any) {
      console.warn("Issue sending WhatsApp message:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/appointments", async (req, res) => {
    const { orderId, phone, date, notes } = req.body;
    console.log(`[Appointments] Scheduling appointment for ${orderId} at ${date} (Phone: ${phone}) with notes: ${notes}`);

    try {
        const apDate = new Date(date);
        const now = new Date();

        // 1 hour before reminder
        const oneHourBefore = new Date(apDate.getTime() - 60 * 60 * 1000);
        const msUntil1H = oneHourBefore.getTime() - now.getTime();

        // 24 hours before reminder
        const twentyFourHoursBefore = new Date(apDate.getTime() - 24 * 60 * 60 * 1000);
        const msUntil24H = twentyFourHoursBefore.getTime() - now.getTime();

        // Very basic in-memory scheduler for prototype purposes using setTimeout
        // In real production, this should be written to a DB table and processed via cron

        if (msUntil24H > 0) {
            setTimeout(() => {
                const text = `¡Hola! Recordatorio amigable: Tienes una cita programada mañana a las ${apDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Te esperamos.`;
                sendWhatsAppMessage(phone, text).catch(console.error);
            }, msUntil24H);
        }

        if (msUntil1H > 0 && msUntil1H < 86400000 * 2) { // only if < 2 days
            setTimeout(() => {
                const text = `¡Hola! Recordatorio: Tu cita es en 1 hora. ¡Nos vemos pronto!`;
                sendWhatsAppMessage(phone, text).catch(console.error);
            }, msUntil1H);
        }

        res.json({ success: true, message: "Appointment scheduled with reminders" });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
  });

  // Backend Gemini unified endpoint to avoid client-side API Key blockages (403 Forbidden)
  // This takes the exact parameters as ai.models.generateContent()
  app.post("/api/gemini/generateContent", async (req, res) => {
    try {
      const { model, contents, config } = req.body;
      if (!model || !contents) {
          return res.status(400).json({ error: "Missing model or contents" });
      }
      
      const key = process.env.GEMINI_API_KEY || '';
      console.log(`[Backend API] Request for model: ${model}. Key length: ${key.length}, starts: ${key.substring(0,4)}`);
      console.log(`[Backend API] Exact Prompt sent to Gemini:`, JSON.stringify(contents, null, 2));

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model,
        contents,
        config
      });
      res.json({ text: response.text });
    } catch (e: any) {
      const key = process.env.GEMINI_API_KEY || '';
      const debugInfo = `Key length: ${key.length}, starts: ${key.substring(0,4)}, ends: ${key.substring(key.length - 4)}`;
      // Intercept common invalid key error
      if (e?.message?.includes("API key not valid") || e?.status === "INVALID_ARGUMENT" || e?.name === "GoogleGenAIError" || JSON.stringify(e).includes("API_KEY_INVALID")) {
        const customError = "La API Key configurada ('MY_GEMINI_API_KEY' u otra inválida) fue rechazada por Google. Para usar la IA gratuita provista, ve al menú de 'Settings' -> 'Secrets', y elimina el secreto GEMINI_API_KEY. O pon una clave válida que empiece por AIza...";
        console.log(`[AI-Event] Handled invalid config:`, customError);
        return res.status(400).json({ fault: customError, debugInfo });
      }

      res.status(500).json({ fault: typeof e === 'string' ? e : (e?.message || e?.error?.message || "Internal server event"), details: e, debugInfo });
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
    app.use(express.static(distPath, { index: false }));
    app.get('*all', (req, res) => {
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        let html = fs.readFileSync(indexPath, 'utf-8');
        const envScript = `<script>window.ENV = { GEMINI_API_KEY: "${process.env.GEMINI_API_KEY || ''}" };</script>`;
        html = html.replace('</head>', `${envScript}</head>`);
        res.send(html);
      } else {
        res.status(404).send("index.html not found");
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
