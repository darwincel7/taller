import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import crypto from "crypto";
import fs from "fs";
import { createProxyMiddleware } from "http-proxy-middleware";
import rateLimit from "express-rate-limit";
import { connectToWhatsApp, getWhatsAppStatus, logoutWhatsApp, sendWhatsAppMessage, reconnectWhatsApp, resetWhatsAppConnection, disconnectWhatsApp, listWhatsAppConversations, listWhatsAppMessages, markConversationAsRead, linkConversationToOrder, getDiagnostics } from "./server/whatsapp.ts";
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
  if (errorMsg.includes('MAC') || errorMsg.includes('decrypt') || errorMsg.includes('MessageCounterError') || errorMsg.includes('conflict') || errorMsg.includes('Unsupported state') || errorMsg.includes('unable to authenticate data') || errorMsg.includes('bad session')) {
    console.warn('[WA] Error temporal capturado, no se resetea sesion:', errorMsg);
    return;
  }
  console.warn('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  const errorMsg = reason instanceof Error ? reason.message : String(reason);
  if (errorMsg.includes('MAC') || errorMsg.includes('decrypt') || errorMsg.includes('MessageCounterError') || errorMsg.includes('conflict') || errorMsg.includes('Unsupported state') || errorMsg.includes('unable to authenticate data') || errorMsg.includes('bad session')) {
    console.warn('[WA] Error temporal capturado, no se resetea sesion:', errorMsg);
    return;
  }
  console.warn('Unhandled Rejection at:', promise, 'reason:', reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function validateEnv() {
  const criticalVars = ['ENCRYPTION_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = criticalVars.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    console.error(`\x1b[31m[CRITICAL] Faltan variables de entorno obligatorias: ${missing.join(', ')}\x1b[0m`);
    // NOTE: Removed process.exit(1) here so Cloud Run can still boot and serve the frontend
  }

  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (encryptionKey && encryptionKey.length < 32) {
    console.warn('\x1b[33m[WARNING] ENCRYPTION_KEY es demasiado corta (min 32 caracteres). El cifrado AES-256-GCM requiere una clave robusta.\x1b[0m');
  }

  if (!process.env.GEMINI_API_KEY) {
    console.warn('\x1b[33m[WARNING] GEMINI_API_KEY no detectada. Las funciones de IA estarán desactivadas.\x1b[0m');
  }
}

async function startServer() {
  validateEnv();
  const app = express();
  const PORT = 3000;

  // Enable trust proxy for express-rate-limit to work correctly behind the platform's proxy
  app.set('trust proxy', 1);

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
            // Handle both HTTP Response and TCP Socket (for WebSockets)
            if (res && typeof res.writeHead === 'function') {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Proxy Error', message: err.message }));
            } else if (res && typeof res.write === 'function') {
                res.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
                res.end();
            }
        }
    }
  }));

  app.use(express.json({
    limit: '50mb',
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    }
  }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 1000, 
    standardHeaders: true, 
    legacyHeaders: false
  });
  
  const webhookLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, 
    max: 200, 
    standardHeaders: true,
    legacyHeaders: false
  });

  app.use('/api', apiLimiter);
  app.use('/api/meta', webhookLimiter);
  app.use('/api/tiktok', webhookLimiter);
  app.use('/api/omnicanal/send', webhookLimiter);
  app.use('/api/gemini/generateContent', webhookLimiter);

  // Initialize WhatsApp connection on server start
  connectToWhatsApp();

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Server is running" });
  });

  app.get("/api/config-status", (req, res) => {
    const criticalVars = ['ENCRYPTION_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
    const missing = criticalVars.filter(v => !process.env[v]);
    
    if (process.env.NODE_ENV === 'production') {
      res.json({
        ok: missing.length === 0,
        missing_vars: []
      });
    } else {
      res.json({
        ok: missing.length === 0,
        missing_vars: missing
      });
    }
  });



  function normalizeSupabaseUrl(input: any) {
    let value = String(input || '').trim();
    if (!value || value.startsWith('/')) {
      return process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://ruwcektpadeqovwtdixd.supabase.co';
    }
    if (value.includes(': ') && !value.startsWith('http')) {
      value = value.split(': ').pop()?.trim() || value;
    }
    if (!value.startsWith('http')) {
      value = `https://${value}.supabase.co`;
    }
    return value;
  }

  // Require Admin Middleware
  const requireAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Primero validamos la autenticación básica
    await requireAuth(req, res, async () => {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ error: 'No autorizado' });

      const { getSupabase } = await import('./server/whatsapp');
      const supabase = getSupabase();
      if (!supabase) return res.status(500).json({ error: 'DB error' });

      // Verificar si el usuario es admin en crm_agents
      const { data: agent, error } = await supabase
        .from('crm_agents')
        .select('role')
        .eq('id', userId)
        .single();

      if (error || !agent || agent.role !== 'admin') {
        // Fallback para Darwin (dueño) por email si está disponible en headers o via token
        // Por ahora, si no es 'admin' expresamente, bloqueamos.
        // PODEMOS agregar un bypass temporal para desarrollo si es necesario.
        return res.status(403).json({ error: 'Acceso denegado: Se requiere rol Admin' });
      }

      next();
    });
  };

  const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      const userIdFromHeader = req.headers['x-user-id'];
      
      if (!authHeader && !userIdFromHeader) {
        if (process.env.NODE_ENV !== 'production') {
           console.warn("requireAuth: Using dev fallback for local admin headers");
           req.headers['x-user-id'] = '1';
        } else {
           // Silently return 401 to avoid spamming the Cloud Run logs when the frontend polls
           return res.status(401).json({ error: 'No authorization header properly set' });
        }
      }

      const effectiveUserIdFromHeader = req.headers['x-user-id'] as string;

      const { createClient } = await import('@supabase/supabase-js');
      const inputUrl = req.headers['x-supabase-url'] || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseUrl = normalizeSupabaseUrl(inputUrl);
      let supabaseRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
      if (!supabaseRoleKey) {
          return res.status(500).json({ error: 'Configuración insegura. Falta SUPABASE_SERVICE_ROLE_KEY en entorno de producción.' });
      }
      
      const supabaseAdmin = createClient(supabaseUrl, supabaseRoleKey);

      let verifiedUserId = null;

      // Prefer JWT validation if provided
      if (authHeader && authHeader.startsWith('Bearer ')) {
         const token = authHeader.replace('Bearer ', '');
         const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
         if (!error && user) {
            verifiedUserId = user.id;
         }
      }

      // If JWT not provided or invalid, but we have X-User-Id, check if it exists & active.
      // (For better security, checking the JWT is preferred, which now we do above).
      const targetUserId = verifiedUserId || effectiveUserIdFromHeader;

      if (!targetUserId) {
        throw new Error('Could not verify user identity');
      }
      
      const { data, error } = await supabaseAdmin.from('users').select('*').eq('id', targetUserId).single();
      if (error || !data || !data.active) {
        // Fallback for AI Studio preview to avoid complete block if user has super credentials but no JWT
        if (process.env.NODE_ENV !== 'production' && targetUserId === '1') {
           console.warn("requireAuth: Using dev fallback for local admin");
        } else {
           console.warn("requireAuth failed lookup:", { targetUserId, error, data });
           throw new Error('User not found or inactive');
        }
      }

      // Make sure the authenticated user matches the requested user if any
      next();
    } catch (e: any) {
      console.warn("requireAuth exception:", e.message);
      res.status(401).json({ error: 'Unauthorized' });
    }
  };

  // WhatsApp Management Routes
  app.get("/api/whatsapp/diagnostics", requireAuth, (req, res) => {
    res.json(getDiagnostics());
  });

  app.get('/api/whatsapp/audit', requireAuth, async (req, res) => {
    try {
      const limit = Number(req.query.limit || 50);
      const safeLimit = Math.min(Math.max(limit, 1), 200);
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://ruwcektpadeqovwtdixd.supabase.co";
      let supabaseRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
      if (!supabaseRoleKey) {
          return res.status(500).json({ success: false, error: 'Configuración insegura. Falta SUPABASE_SERVICE_ROLE_KEY.' });
      }
      
      const supabaseAdmin = createClient(supabaseUrl, supabaseRoleKey);

      const { data, error } = await supabaseAdmin
        .from('whatsapp_message_audit')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(safeLimit);
        
      if (error) throw error;
      res.json({ success: true, data: data || [] });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/whatsapp/repair-session', requireAdmin, async (req, res) => {
    try {
      const { logoutWhatsApp, connectToWhatsApp, clearWhatsAppSession } = await import('./server/whatsapp');
      await logoutWhatsApp();
      await clearWhatsAppSession();
      // Connect will be triggered, it will return the new QR when ready by polling
      connectToWhatsApp(true); 
      res.json({ success: true, message: 'Session repair initiated' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/whatsapp/status", (req, res) => {
    res.json(getWhatsAppStatus());
  });

  app.post("/api/whatsapp/connect", requireAdmin, async (req, res) => {
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

  app.post("/api/whatsapp/reconnect", requireAdmin, async (req, res) => {
    await reconnectWhatsApp();
    res.json({ success: true, message: "Reconnecting to WhatsApp..." });
  });

  app.post("/api/whatsapp/logout", requireAdmin, async (req, res) => {
    await logoutWhatsApp();
    res.json({ success: true, message: "Logged out from WhatsApp" });
  });

  app.get("/api/whatsapp/conversations", requireAuth, async (req, res) => {
    try {
      const data = await listWhatsAppConversations();
      res.json({ success: true, data });
    } catch (error: any) {
      if (error.message && error.message.includes('schema cache')) {
        res.status(500).json({ success: false, error: 'La tabla de conversaciones no existe en Supabase o el cache está desactualizado. Ejecuta el SQL de setup_wa_tables.sql en el editor de SQL de Supabase.' });
      } else {
        res.status(500).json({ success: false, error: error.message });
      }
    }
  });

  app.get("/api/whatsapp/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const data = await listWhatsAppMessages(req.params.id as string);
      res.json({ success: true, data });
    } catch (error: any) {
      if (error.message && error.message.includes('schema cache')) {
        res.status(500).json({ success: false, error: 'Las tablas de mensajes no existen en Supabase. Ejecuta el SQL primero.' });
      } else {
        res.status(500).json({ success: false, error: error.message });
      }
    }
  });

  app.post("/api/whatsapp/send", requireAuth, async (req, res) => {
    try {
      const { phone, text, image, media } = req.body;
      const result = await sendWhatsAppMessage(phone, text, image, media);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/whatsapp/conversations/:id/read", requireAuth, async (req, res) => {
    try {
      await markConversationAsRead(req.params.id as string);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/whatsapp/conversations/:id/link-order", requireAuth, async (req, res) => {
    try {
      const { orderId } = req.body;
      await linkConversationToOrder(req.params.id as string, orderId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // WhatsApp Notification API
  app.post("/api/notifications/whatsapp", requireAuth, async (req, res) => {
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

  // Omnicanal routers
  const { default: metaRouter } = await import('./server/omnicanal/meta');
  const { default: tiktokRouter } = await import('./server/omnicanal/tiktok');
  const { default: omnicanalApiRouter } = await import('./server/omnicanal/api');
  const { startJobWorkers } = await import('./server/omnicanal/pipeline');
  
  app.use('/api/meta/connect', requireAdmin);
  app.use('/api/tiktok/oauth/start', requireAdmin);
  app.use('/api/meta', metaRouter);
  app.use('/api/tiktok', tiktokRouter);
  app.use('/api/omnicanal', requireAuth, omnicanalApiRouter);
  
  startJobWorkers();

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
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
        res.sendFile(indexPath);
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
