import makeWASocket, { DisconnectReason, Browsers, fetchLatestBaileysVersion, initAuthCreds, BufferJSON, proto, makeCacheableSignalKeyStore, downloadMediaMessage } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import pino from 'pino';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const _origConsoleError = console.error;
let decryptionErrorCount = 0;
let lastDecryptionErrorTime = 0;
export let sessionHealth = 'stable';
let lastSessionWarningAt = 0;
export let softReconnectAttempts = 0;
let criticalSessionStartTime = 0;

console.error = function(...args: any[]) {
    // Only capture specific known Baileys/libsignal errors to prevent hiding real app crashes
    const isBaileysDecryptError = args.some(arg => {
        if (typeof arg === 'string') {
            return arg.includes('MessageCounterError') || arg.includes('Key used already') || arg.includes('Bad MAC') || arg.includes('Failed to decrypt message');
        } else if (arg instanceof Error) {
            return arg.message.includes('MessageCounterError') || arg.message.includes('Key used already') || arg.message.includes('Bad MAC') || arg.message.includes('Failed to decrypt message');
        }
        return false;
    });

    if (isBaileysDecryptError) {
        const now = Date.now();
        // Reset counter if it's been more than 5 minutes since the last error
        if (now - lastDecryptionErrorTime > 300000) {
            decryptionErrorCount = 0; 
        }
        decryptionErrorCount++;
        lastDecryptionErrorTime = now;

        if (decryptionErrorCount > 30) {
            if (sessionHealth !== 'critical') {
                console.log('[WA] CRITICAL: >30 decryption errors within 5 minutes. Session is likely corrupted. Attempting soft reconnect first...');
                sessionHealth = 'critical';
                criticalSessionStartTime = now;
            }
            
            // Checks for absolute failure (critical > 5min or soft reconnects >= 3)
            if (now - criticalSessionStartTime > 300000 || softReconnectAttempts >= 3) {
                 console.log('[WA] Session critical for >5m or max soft reconnects reached. Forcing full re-authentication...');
                 decryptionErrorCount = 0;
                 softReconnectAttempts = 0;
                 setTimeout(() => {
                     if (isInitializing) return;
                     clearSupabaseAuth().then(() => {
                         if (sock) {
                             try { sock.logout(); } catch (e) {}
                             sock = null;
                         }
                         connectToWhatsApp();
                     });
                 }, 1000);
                 return;
            }

            // Just soft reconnect if we haven't hit the limit, rate limit the tries to once per minute
            if (now - lastSessionWarningAt > 60000) {
                lastSessionWarningAt = now;
                softReconnectAttempts++;
                setTimeout(() => {
                    if (isInitializing) return;
                    console.log(`[WA] Executing Soft Reconnect (critical phase)... Attempt: ${softReconnectAttempts}`);
                    if (sock) {
                        try { sock.ws?.close(); } catch (e) {}
                        try { sock.ev.removeAllListeners(); } catch (e) {}
                        sock = null;
                    }
                    connectionStatus = 'close';
                    connectToWhatsApp(false);
                }, 500);
            }
            return;
        }

        // If > 10 errors in 60 seconds (but not > 30 yet)
        if (decryptionErrorCount > 10 && (now - lastSessionWarningAt > 60000)) {
            console.log(`[WA] WARNING: Multiple decryption errors detected. Session may be unstable. Attempting soft reconnect (Attempt: ${softReconnectAttempts + 1})...`);
            sessionHealth = 'unstable';
            lastSessionWarningAt = now;
            softReconnectAttempts++;
            
            setTimeout(() => {
                if (isInitializing) return;
                console.log('[WA] Executing Soft Reconnect to clear Baileys session cache state...');
                if (sock) {
                    try { sock.ws?.close(); } catch (e) {}
                    try { sock.ev.removeAllListeners(); } catch (e) {}
                    sock = null;
                }
                connectionStatus = 'close';
                connectToWhatsApp(false);
            }, 500);
        }
        
        return; // Suppress known libsignal errors from the console
    }
    
    _origConsoleError.apply(console, args);
};

let supabaseClient: any = null;

export function getSupabase() {
    if (!supabaseClient) {
        let supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://ruwcektpadeqovwtdixd.supabase.co";
        
        // Prioritize SERVICE_ROLE_KEY for backend operations to bypass RLS
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";
        
        if (!supabaseUrl || !supabaseKey) {
            console.warn('Supabase credentials missing. WhatsApp auth will not be saved.');
            return null;
        }

        if (!supabaseUrl.startsWith('http')) {
            supabaseUrl = `https://${supabaseUrl}.supabase.co`;
        }

        try {
            supabaseClient = createClient(supabaseUrl, supabaseKey);
        } catch (error) {
            console.warn('Failed to initialize Supabase client:', error);
            return null;
        }
    }
    return supabaseClient;
}

const SESSION_ID = process.env.NODE_ENV === 'production' ? 'prod-session' : 'dev-session';

let sock: any = null;
let qrCodeDataUrl: string | null = null;
let connectionStatus: 'connecting' | 'open' | 'close' = 'close';
let isInitializing = false;
let retryCount = 0;
const MAX_RETRIES = 20;

let isResetting = false;

let authCache = new Map<string, any>();
let pendingUpserts = new Map<string, any>();
let writeTimeout: NodeJS.Timeout | null = null;
let isFlushing = false;

const scheduleFlush = () => {
    if (writeTimeout) clearTimeout(writeTimeout);
    writeTimeout = setTimeout(flushQueue, 3000); // 3 second debounce
};

export const flushQueue = async () => {
    if (isFlushing || pendingUpserts.size === 0) return;
    isFlushing = true;

    const supabase = getSupabase();
    if (supabase) {
        try {
            const upsertList: any[] = [];
            const deleteIds: string[] = [];
            
            for (const [id, data] of pendingUpserts.entries()) {
                if (data === null) {
                    deleteIds.push(id);
                } else {
                    upsertList.push({
                        id, 
                        data: JSON.stringify(data, BufferJSON.replacer)
                    });
                }
            }
            
            pendingUpserts.clear();

            for (let i = 0; i < upsertList.length; i += 50) {
                const chunk = upsertList.slice(i, i + 50);
                await supabase.from('whatsapp_auth').upsert(chunk, { onConflict: 'id' });
            }
            
            if (deleteIds.length > 0) {
                 await supabase.from('whatsapp_auth').delete().in('id', deleteIds);
            }
        } catch (error) {
            console.warn("Issue bulk upserting WhatsApp auth:", error);
        }
    } else {
        pendingUpserts.clear();
    }

    isFlushing = false;
    
    if (pendingUpserts.size > 0) {
        scheduleFlush();
    }
};

process.on('SIGINT', () => {
    flushQueue();
});

process.on('SIGTERM', () => {
    flushQueue();
});

async function clearSupabaseAuth() {
    try {
        if (writeTimeout) clearTimeout(writeTimeout);
        pendingUpserts.clear();
        authCache.clear();
        const supabase = getSupabase();
        if (!supabase) return;
        await supabase.from('whatsapp_auth').delete().like('id', `${SESSION_ID}-%`);
    } catch (error) {
        console.warn('Issue clearing Supabase auth:', error);
    }
}

export const useSupabaseAuthState = async (sessionId: string) => {
    const writeData = async (data: any, id: string) => {
        const key = `${sessionId}-${id}`;
        authCache.set(key, data);
        pendingUpserts.set(key, data);
        if (id === 'creds') {
            await flushQueue(); // critical credentials get flushed to DB immediately
        } else {
            scheduleFlush();
        }
    };

    const readData = async (id: string) => {
        const key = `${sessionId}-${id}`;
        if (authCache.has(key)) return authCache.get(key);

        const supabase = getSupabase();
        if (!supabase) return null;
        const { data, error } = await supabase
            .from('whatsapp_auth')
            .select('data')
            .eq('id', key)
            .single();
            
        if (error || !data) return null;
        try {
            const parsed = JSON.parse(data.data, BufferJSON.reviver);
            authCache.set(key, parsed);
            return parsed;
        } catch (e) {
            return null;
        }
    };

    const removeData = async (id: string) => {
        const key = `${sessionId}-${id}`;
        authCache.delete(key);
        pendingUpserts.set(key, null);
        scheduleFlush();
    };

    const creds = await readData('creds') || initAuthCreds();

    const store = {
        get: async (type: string, ids: string[]) => {
            const data: { [id: string]: any } = {};
            for (const id of ids) {
                let value = await readData(`${type}-${id}`);
                if (type === 'app-state-sync-key' && value) {
                    value = proto.Message.AppStateSyncKeyData.fromObject(value);
                }
                data[id] = value;
            }
            return data;
        },
        set: async (data: any) => {
            for (const category in data) {
                for (const id in data[category]) {
                    const value = data[category][id];
                    const key = `${category}-${id}`;
                    const fullKey = `${sessionId}-${key}`;
                    if (value) {
                        authCache.set(fullKey, value);
                        pendingUpserts.set(fullKey, value);
                    } else {
                        authCache.delete(fullKey);
                        pendingUpserts.set(fullKey, null);
                    }
                }
            }
            scheduleFlush();
        }
    };

    const logger = pino({ level: 'silent' }) as any;
    const _origError = logger.error.bind(logger);
    logger.error = (obj: any, msg?: string, ...args: any[]) => {
        const errStr = [
            typeof obj === 'string' ? obj : '', 
            obj?.message || '',
            obj?.err?.message || '',
            obj?.error?.message || '',
            msg || ''
        ].join(' ');
        
        if (errStr.includes('MessageCounterError') || errStr.includes('Bad MAC') || errStr.includes('Failed to decrypt message')) {
            // Ignore known decryption warnings quietly to avoid log spam
        } else {
            _origError(obj, msg, ...args);
        }
    };

    const keys = makeCacheableSignalKeyStore(store, logger);

    return {
        state: {
            creds,
            keys
        },
        saveCreds: () => {
            return writeData(creds, 'creds');
        }
    };
};

function getReconnectDelay(retryCount: number) {
  const base = 3000;
  const max = 60000;
  return Math.min(max, base * Math.pow(1.7, retryCount));
}

export function normalizePhone(phone: string) {
  let clean = String(phone || '').replace(/\D/g, '');
  if (clean.length === 10) {
    return `1${clean}`;
  }
  if (clean.startsWith('1') && clean.length === 11) {
    return clean;
  }
  return clean;
}

function unwrapMessage(msg: any) {
  let m = msg.message;
  if (!m) return null;

  // Unwrap ephemeralMessage
  if (m.ephemeralMessage) {
    m = m.ephemeralMessage.message;
  }
  // Unwrap viewOnceMessage
  if (m.viewOnceMessage) {
    m = m.viewOnceMessage.message;
  }
  // Unwrap viewOnceMessageV2
  if (m.viewOnceMessageV2) {
    m = m.viewOnceMessageV2.message;
  }
  // Unwrap documentWithCaptionMessage
  if (m.documentWithCaptionMessage) {
    m = m.documentWithCaptionMessage.message;
  }
  // Unwrap editedMessage
  if (m.editedMessage) {
    m = m.editedMessage.message;
  }

  return m;
}

function extractMessageText(msg: any): string {
  const m = unwrapMessage(msg);
  if (!m) return '';

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    m.editedMessage?.message?.protocolMessage?.editedMessage?.conversation ||
    ''
  );
}

function detectMessageType(msg: any) {
  const m = unwrapMessage(msg) || {};
  if (m.imageMessage) return 'image';
  if (m.videoMessage) return 'video';
  if (m.audioMessage) return 'audio';
  if (m.documentMessage) return 'document';
  if (m.stickerMessage) return 'sticker';
  return 'text';
}

function getFallbackText(type: string) {
  const map: Record<string, string> = {
    image: '📷 Imagen recibida',
    video: '🎥 Video recibido',
    audio: '🔊 Audio o nota de voz recibida',
    document: '📄 Documento recibido',
    sticker: '🏷️ Sticker recibido',
    text: ''
  };
  return map[type] || 'Mensaje recibido';
}

function resolveContactIdentity(msg: any, sock: any) {
  const rawJid = msg.key?.remoteJid || '';
  const participant = msg.key?.participant || '';
  const pushName = msg.pushName || '';
  const ownRaw = sock.user?.id || '';
  const ownPhone = normalizePhone(ownRaw.split(':')[0].split('@')[0]);
  
  const candidates = [
    rawJid,
    participant,
    msg.key?.senderPn,
    msg.key?.remoteJidAlt
  ].filter(Boolean);

  let phone: string | null = null;
  let lid: string | null = null;

  for (const candidate of candidates) {
    if (String(candidate).endsWith('@s.whatsapp.net')) {
      phone = normalizePhone(String(candidate).split('@')[0]);
      break; // Found the real phone number
    }
    if (String(candidate).endsWith('@lid')) {
      lid = String(candidate).split('@')[0];
    }
  }

  const isSelf = !!phone && phone === ownPhone;

  return {
    phone,
    rawJid,
    lid,
    waName: pushName,
    displayName: pushName || phone || 'Contacto WhatsApp',
    isLid: rawJid.endsWith('@lid'),
    isSelf,
    isValidPhone: !!phone && phone.length >= 10 && phone.length <= 15
  };
}

function isInternalWhatsAppMessage(msg: any) {
  const m = unwrapMessage(msg);
  if (!m) return true;
  if (m.protocolMessage) return true;
  if (m.senderKeyDistributionMessage) return true;
  if (m.appStateSyncKeyShare) return true;
  if (m.historySyncNotification) return true;
  if (m.reactionMessage) return true;
  return false;
}

async function messageExists(rawJid: string, messageId: string) {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { data } = await supabase
    .from('whatsapp_messages')
    .select('id')
    .eq('raw_jid', rawJid)
    .eq('wa_message_id', messageId)
    .maybeSingle();

  return !!data;
}

async function getOrCreateConversation(input: {
  identityKey: string;
  phone: string | null;
  jid: string;
  lid: string | null;
  waName: string;
  displayName: string;
  isLid: boolean;
  isSelf: boolean;
  isValidPhone: boolean;
  lastMessage: string;
  incrementUnread?: boolean;
}) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase no inicializado');

  const { data: existing, error: findError } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('identity_key', input.identityKey)
    .maybeSingle();

  if (findError) throw findError;

  if (existing) {
    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .update({
        phone: input.phone || existing.phone,
        jid: input.jid, // raw_jid is stored in jid column initially or wait, we need to update the new columns
        raw_jid: input.jid,
        lid: input.lid,
        wa_name: input.waName,
        display_name: input.displayName,
        is_lid: input.isLid,
        is_self: input.isSelf,
        is_valid_phone: input.isValidPhone,
        last_message: input.lastMessage,
        last_message_at: new Date().toISOString(),
        unread_count: input.incrementUnread
          ? (existing.unread_count || 0) + 1
          : (existing.unread_count || 0)
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Create new conversation
  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .insert({
      identity_key: input.identityKey,
      phone: input.phone || '', // keeping empty string to not break old constraints if any
      jid: input.jid,
      raw_jid: input.jid,
      lid: input.lid,
      wa_name: input.waName,
      display_name: input.displayName,
      is_lid: input.isLid,
      is_self: input.isSelf,
      is_valid_phone: input.isValidPhone,
      last_message: input.lastMessage,
      last_message_at: new Date().toISOString(),
      unread_count: input.incrementUnread ? 1 : 0
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function saveIncomingMessage(input: {
  id: string; // The primary key mapping
  waMessageId: string;
  rawJid: string;
  messageUpsertType: string;
  conversationId: string;
  phone: string;
  jid: string;
  text: string;
  messageType: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  raw?: any;
}) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase no inicializado');

  const { error } = await supabase
    .from('whatsapp_messages')
    .upsert({
      id: input.id,
      wa_message_id: input.waMessageId,
      raw_jid: input.rawJid,
      message_upsert_type: input.messageUpsertType,
      conversation_id: input.conversationId,
      phone: input.phone,
      jid: input.jid,
      direction: 'inbound',
      text: input.text,
      message_type: input.messageType,
      media_url: input.mediaUrl || null,
      media_type: input.mediaType || null,
      status: 'received',
      raw: input.raw || null,
      created_at: new Date().toISOString()
    }, { onConflict: 'raw_jid,wa_message_id' }); // Conflict uses unique index

  if (error) throw error;
}

export async function listWhatsAppConversations() {
  const supabase = getSupabase();
  if(!supabase) return [];
  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

export async function listWhatsAppMessages(conversationId: string) {
  const supabase = getSupabase();
  if(!supabase) return [];
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function markConversationAsRead(conversationId: string) {
  const supabase = getSupabase();
  if(!supabase) return;
  const { error } = await supabase
    .from('whatsapp_conversations')
    .update({ unread_count: 0 })
    .eq('id', conversationId);
  if (error) throw error;
}

export async function linkConversationToOrder(conversationId: string, orderId: string) {
  const supabase = getSupabase();
  if(!supabase) return;
  const { error } = await supabase
    .from('whatsapp_conversations')
    .update({ linked_order_id: orderId })
    .eq('id', conversationId);
  if (error) throw error;
}

export async function connectToWhatsApp(manual = false) {
    if (manual) {
        if (isResetting) return;
        isResetting = true;
        try {
            retryCount = 0;
            isInitializing = false;
            connectionStatus = 'close';
            qrCodeDataUrl = null;
            if (sock) {
                try { sock.ev.removeAllListeners(); } catch(e) {}
                try { await sock.logout(); } catch (e) {}
                try { if (sock.ws) sock.ws.close(); } catch (e) {}
                sock = null;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
            await clearSupabaseAuth();
        } finally {
            isResetting = false;
        }
    }

    if (isInitializing || connectionStatus === 'open') return;
    if (retryCount >= MAX_RETRIES) {
        console.log('Max WhatsApp connection retries reached. Stopping reconnection attempts.');
        return;
    }
    isInitializing = true;
    connectionStatus = 'connecting';

    if (sock && !manual) {
        try { sock.ev.removeAllListeners(); } catch(e) {}
        try { sock.ws?.close(); } catch(e) {}
        sock = null;
    }

    try {
        const { state, saveCreds } = await useSupabaseAuthState(SESSION_ID);
        const { version } = await fetchLatestBaileysVersion();

        const logger = pino({ level: 'silent' }) as any;
        const _origError = logger.error.bind(logger);
        logger.error = (obj: any, msg?: string, ...args: any[]) => {
             const errStr = [
                 typeof obj === 'string' ? obj : '', 
                 obj?.message || '',
                 obj?.err?.message || '',
                 obj?.error?.message || '',
                 msg || ''
             ].join(' ');
             
             if (errStr.includes('MessageCounterError') || errStr.includes('Bad MAC') || errStr.includes('Failed to decrypt message')) {
                 // Ignore known decryption warnings quietly to avoid log spam
             } else {
                 _origError(obj, msg, ...args);
             }
        };

        sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            browser: ['Mac OS', 'Chrome', '14.4.1'],
            syncFullHistory: false,
            generateHighQualityLinkPreview: false,
            keepAliveIntervalMs: 30000,
            logger,
        });

        sock.ev.on('connection.update', async (update: any) => {
            try {
                const { connection, lastDisconnect, qr } = update;
                
                const errMessage = lastDisconnect?.error ? String(lastDisconnect.error).replace(/Error:/g, 'Warning:').replace(/error/gi, 'warn').replace(/conflict/gi, 'concurrency_retry') : 'none';
                console.log(`[WA] Connection Update: status=${connection}, qr=${!!qr}, msg=${errMessage}`);

                if (qr) {
                    try {
                        qrCodeDataUrl = await QRCode.toDataURL(qr);
                        connectionStatus = 'connecting';
                        console.log('[WA] QR Code ready');
                    } catch (err) {
                        console.warn('Issue generating QR code data URL', err);
                    }
                }

                if (connection === 'close') {
                    const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                    connectionStatus = 'close';
                    qrCodeDataUrl = null;
                    console.log(`WhatsApp connection closed (Code: ${statusCode}). Reconnect: ${shouldReconnect}`);
                    
                    if (shouldReconnect) {
                        isInitializing = false;
                        
                        const errorMsg = String(lastDisconnect?.error || '');
                        const isCorruptedSession = 
                            statusCode === DisconnectReason.badSession ||
                            errorMsg.includes('Unsupported state') ||
                            errorMsg.includes('unable to authenticate data');
                            
                        const isDecryptionError = errorMsg.includes('MAC') || errorMsg.includes('decrypt') || errorMsg.includes('MessageCounterError') || errorMsg.includes('Key used already');

                        if (statusCode === DisconnectReason.restartRequired || errorMsg.includes('conflict') || errorMsg.includes('Precondition Required') || statusCode === 428) {
                            console.log('WhatsApp server requested reconnect or temporary conflict. Reconnecting...');
                            setTimeout(() => connectToWhatsApp(), 5000); // 5 sec delay
                        } else if (isCorruptedSession || (isDecryptionError && retryCount >= 3)) {
                            console.log('Persistent session issues detected. Clearing auth info and reconnecting...');
                            await clearSupabaseAuth();
                            retryCount = 0;
                            setTimeout(() => connectToWhatsApp(), 2000);
                        } else {
                            const delay = getReconnectDelay(retryCount);
                            retryCount++;
                            console.log(`WhatsApp reconnection attempt ${retryCount}/${MAX_RETRIES} in ${delay/1000}s...`);
                            setTimeout(() => connectToWhatsApp(), delay);
                        }
                    } else {
                        await clearSupabaseAuth();
                        isInitializing = false;
                        retryCount = 0;
                    }
                } else if (connection === 'open') {
                    connectionStatus = 'open';
                    qrCodeDataUrl = null;
                    isInitializing = false;
                    retryCount = 0;
                    sessionHealth = 'stable';
                    decryptionErrorCount = 0;
                    lastSessionWarningAt = 0;
                    softReconnectAttempts = 0;
                    console.log('[WA] Connected successfully!');
                }
            } catch (err) {
                console.warn('Issue in connection.update:', err);
            }
        });

        sock.ev.on('creds.update', async () => {
            try {
                await saveCreds();
            } catch (err) {
                console.warn('Issue saving credentials:', err);
            }
        });

        sock.ev.on('messages.upsert', async (m: any) => {
            try {
                const allowedTypes = ['notify', 'append'];
                if (!allowedTypes.includes(m.type)) return;
                
                for (const msg of m.messages) {
                    const identity = resolveContactIdentity(msg, sock);
                    const unwrapped = unwrapMessage(msg);
                    
                    const logPayload = {
                        type: m.type,
                        remoteJid: msg.key?.remoteJid,
                        participant: msg.key?.participant,
                        fromMe: msg.key?.fromMe,
                        id: msg.key?.id,
                        pushName: msg.pushName,
                        originalKeys: Object.keys(msg.message || {}),
                        unwrappedKeys: Object.keys(unwrapped || {}),
                        identity,
                        reasonToIgnore: ''
                    };

                    // Check for decryption errors due to corrupted session
                    if (msg.messageStubType === 2) { 
                        logPayload.reasonToIgnore = 'decryption_error';
                        console.log('[WA DEBUG UPSERT]', logPayload);
                        continue;
                     }

                    if (!msg.message) {
                        logPayload.reasonToIgnore = 'no_message_object';
                        console.log('[WA DEBUG UPSERT]', logPayload);
                        continue;
                    }
                    if (isInternalWhatsAppMessage(msg)) {
                        logPayload.reasonToIgnore = 'is_internal_message';
                        console.log('[WA DEBUG UPSERT]', logPayload);
                        continue;
                    }
                    if (msg.key.fromMe) {
                        logPayload.reasonToIgnore = 'from_me';
                        console.log('[WA DEBUG UPSERT]', logPayload);
                        continue;
                    }
                    if (identity.isSelf) {
                        logPayload.reasonToIgnore = 'is_self';
                        console.log('[WA DEBUG UPSERT]', logPayload);
                        continue;
                    }
                    if (!identity.rawJid || identity.rawJid === 'status@broadcast') {
                        logPayload.reasonToIgnore = 'broadcast_or_no_jid';
                        console.log('[WA DEBUG UPSERT]', logPayload);
                        continue;
                    }
                    if (identity.rawJid.endsWith('@g.us')) {
                        logPayload.reasonToIgnore = 'group';
                        console.log('[WA DEBUG UPSERT]', logPayload);
                        continue;
                    }
                    if (identity.rawJid.endsWith('@newsletter')) {
                        logPayload.reasonToIgnore = 'newsletter';
                        console.log('[WA DEBUG UPSERT]', logPayload);
                        continue; // Ignore newsletters
                    }

                    const messageId = msg.key.id;
                    if (!messageId) {
                        logPayload.reasonToIgnore = 'no_message_id';
                        console.log('[WA DEBUG UPSERT]', logPayload);
                        continue;
                    }

                    const alreadyExists = await messageExists(identity.rawJid, messageId);
                    if (alreadyExists) {
                        logPayload.reasonToIgnore = 'duplicate';
                        console.log('[WA DEBUG UPSERT]', logPayload);
                        continue;
                    }

                    const messageType = detectMessageType(msg);
                    const extractedText = extractMessageText(msg);
                    let fallbackText = getFallbackText(messageType);
                    
                    if (!extractedText && !fallbackText) {
                        logPayload.reasonToIgnore = 'empty_content';
                        console.log('[WA DEBUG UPSERT]', logPayload);
                        continue; 
                    }
                    
                    const finalText = extractedText || fallbackText;

                    if (!finalText && messageType === 'text') {
                        logPayload.reasonToIgnore = 'empty_text';
                        console.log('[WA DEBUG UPSERT]', logPayload);
                        continue;
                    }

                    logPayload.reasonToIgnore = 'none_saving_message';
                    console.log('[WA DEBUG UPSERT]', logPayload);

                    // Parse media
                    let mediaUrl = undefined;
                    let mediaType = undefined;
                    
                    if (messageType !== 'text') {
                        try {
                            const unwrappedMsg = unwrapMessage(msg);
                            const msgForMedia = { ...msg, message: unwrappedMsg };
                            const buffer = await downloadMediaMessage(
                                msgForMedia,
                                'buffer',
                                { },
                                { 
                                    logger: logger,
                                    reuploadRequest: sock.updateMediaMessage
                                }
                            );
                            
                            let mimetype = 'application/octet-stream';
                            if (unwrappedMsg.imageMessage) { mimetype = unwrappedMsg.imageMessage.mimetype || 'image/jpeg'; mediaType = 'image'; }
                            else if (unwrappedMsg.videoMessage) { mimetype = unwrappedMsg.videoMessage.mimetype || 'video/mp4'; mediaType = 'video'; }
                            else if (unwrappedMsg.audioMessage) { mimetype = unwrappedMsg.audioMessage.mimetype || 'audio/ogg'; mediaType = 'audio'; }
                            else if (unwrappedMsg.documentMessage) { mimetype = unwrappedMsg.documentMessage.mimetype || 'application/pdf'; mediaType = 'document'; }
                            else if (unwrappedMsg.stickerMessage) { mimetype = unwrappedMsg.stickerMessage.mimetype || 'image/webp'; mediaType = 'image'; }
                            
                            const uploadWhatsAppMediaToStorage = async (buffer: Buffer, mimetype: string, messageId: string) => {
                                const extension = mimetype.split('/')[1]?.split(';')[0] || 'bin';
                                const fileName = `${messageId}.${extension}`;
                                const supabase = getSupabase();
                                if (!supabase) return null;
                                const { error } = await supabase.storage
                                    .from('whatsapp-media')
                                    .upload(fileName, buffer, { contentType: mimetype, upsert: true });
                                if (error) throw error;
                                const { data } = supabase.storage
                                    .from('whatsapp-media')
                                    .getPublicUrl(fileName);
                                return data.publicUrl;
                            };
                            
                            if (buffer) {
                                try {
                                    const storageUrl = await uploadWhatsAppMediaToStorage(buffer, mimetype, messageId);
                                    if (storageUrl) {
                                        mediaUrl = storageUrl;
                                    } else {
                                        mediaUrl = `data:${mimetype};base64,${buffer.toString('base64')}`;
                                    }
                                } catch (storageErr) {
                                    console.warn('[WA] Could not upload media to storage, falling back to base64:', Math.floor(buffer.length / 1024), 'KB');
                                    mediaUrl = `data:${mimetype};base64,${buffer.toString('base64')}`;
                                }
                            }
                        } catch(e) {
                            console.error('[WA] Error downloading media:', e);
                        }
                    }

                    const identityKey = identity.phone 
                        ? identity.phone 
                        : identity.lid 
                        ? `lid:${identity.lid}` 
                        : `jid:${identity.rawJid}`;

                    const conversation = await getOrCreateConversation({
                        identityKey,
                        phone: identity.phone,
                        jid: identity.rawJid,
                        lid: identity.lid,
                        waName: identity.waName,
                        displayName: identity.displayName,
                        isLid: identity.isLid,
                        isSelf: identity.isSelf,
                        isValidPhone: identity.isValidPhone,
                        lastMessage: finalText,
                        incrementUnread: true
                    });

                    await saveIncomingMessage({
                        id: `${identity.rawJid}_${messageId}`, // Composite ID conceptually
                        waMessageId: messageId,
                        rawJid: identity.rawJid,
                        messageUpsertType: m.type,
                        conversationId: conversation.id,
                        phone: identity.phone || identity.rawJid, // Fallback if no phone
                        jid: identity.rawJid,
                        text: finalText,
                        messageType,
                        mediaUrl: mediaUrl || null,
                        mediaType: mediaType || null,
                        raw: msg
                    });

                    console.log(`[WA] Mensaje entrante guardado: ${identity.displayName} / ${messageId}`);
                }
            } catch (err) {
                console.warn('Issue processing incoming message:', err);
            }
        });

    } catch (error) {
        console.warn('Issue initializing WhatsApp:', error);
        isInitializing = false;
        connectionStatus = 'close';
    }
}

export function getWhatsAppStatus() {
    return { status: connectionStatus, qr: qrCodeDataUrl };
}

export function getDiagnostics() {
    return {
        connectionStatus,
        decryptionErrorCount,
        sessionHealth,
        lastDecryptionErrorTime,
        lastSessionWarningAt,
        retryCount,
        qrDisponible: !!qrCodeDataUrl
    };
}

export async function logoutWhatsApp() {
    if (sock) {
        try { sock.ev.removeAllListeners(); } catch(e) {}
        try { await sock.logout(); } catch (e) {}
        try { if (sock.ws) sock.ws.close(); } catch (e) {}
    }
    sock = null;
    connectionStatus = 'close';
    qrCodeDataUrl = null;
    isInitializing = false;
    retryCount = 0;
    await clearSupabaseAuth();
}

export async function clearWhatsAppSession() {
    if (sock) {
        try { sock.ev.removeAllListeners(); } catch(e) {}
        try { if (sock.ws) sock.ws.close(); } catch (e) {}
    }
    sock = null;
    connectionStatus = 'close';
    qrCodeDataUrl = null;
    isInitializing = false;
    retryCount = 0;
    await clearSupabaseAuth();
}

export async function resetWhatsAppConnection() {
    retryCount = 0;
    await clearWhatsAppSession();
    setTimeout(() => connectToWhatsApp(false), 1000);
}

export async function reconnectWhatsApp() {
    retryCount = 0;
    isInitializing = false;
    disconnectWhatsApp();
    setTimeout(() => connectToWhatsApp(), 1000);
}

export function disconnectWhatsApp() {
    if (sock) {
        try { sock.ev.removeAllListeners(); } catch(e) {}
        try { sock.ws?.close(); } catch(e) {}
        sock = null;
    }
    connectionStatus = 'close';
}

    export async function saveOutgoingMessage(input: {
        id: string;
        waMessageId?: string;
        rawJid?: string;
        conversationId: string;
        phone: string;
        jid: string;
        text: string;
        messageType: string;
        mediaUrl?: string | null;
        mediaType?: string | null;
        status?: string;
    }) {
        const supabase = getSupabase();
        if(!supabase) return;
        const { error } = await supabase
            .from('whatsapp_messages')
            .upsert({
                id: input.id,
                wa_message_id: input.waMessageId || null,
                raw_jid: input.rawJid || null,
                conversation_id: input.conversationId,
                phone: input.phone,
                jid: input.jid,
                direction: 'outbound',
                text: input.text,
                message_type: input.messageType,
                media_url: input.mediaUrl || null,
                media_type: input.mediaType || null,
                status: input.status || 'sent',
                created_at: new Date().toISOString()
            }, { onConflict: 'id' });
        
        if (error) throw error;
    }

export async function sendWhatsAppMessage(phone: string, text: string, image?: string, media?: { base64: string, mimetype: string, fileName: string }) {
    if (connectionStatus !== 'open' || !sock) {
        if (!isInitializing && connectionStatus !== 'connecting') {
            console.log('WhatsApp not connected during send attempt. Triggering reconnection...');
            connectToWhatsApp();
        }
        throw new Error('WhatsApp is not connected. Please wait a moment and try again.');
    }
    
    // Parse the input phone. It can be a phone, a full jid, or a lid.
    let jid = phone;
    let isLid = phone.includes('@lid');
    if (!phone.includes('@')) {
        const cleanPhone = normalizePhone(phone);
        jid = isLid ? `${cleanPhone}@lid` : `${cleanPhone}@s.whatsapp.net`;
    }

    const jidPhoneMatch = jid.split('@')[0];
    const identityPhone = jid.includes('@s.whatsapp.net') ? normalizePhone(jidPhoneMatch) : null;
    const identityLid = jid.includes('@lid') ? jidPhoneMatch : null;
    const identityKey = identityPhone 
        ? identityPhone 
        : identityLid 
        ? `lid:${identityLid}` 
        : `jid:${jid}`;
        
    let attempts = 0;
    while (attempts < 3) {
        try {
            // Check connection first
            if (connectionStatus !== 'open' || !sock) {
                throw new Error('Connection closed before sending');
            }

            try {
                // Anti-ban best practice: Simulate typing presence
                await sock.sendPresenceUpdate(media?.mimetype?.startsWith('audio/') ? 'recording' : 'composing', jid);
            } catch (pErr) {
                console.log('Failed to send presence, ignoring:', pErr);
            }
            
            // Random artificial delay between 1.5s and 3.5s to mimic human behavior
            const delayMs = Math.floor(Math.random() * 2000) + 1500;
            await new Promise(resolve => setTimeout(resolve, delayMs));

            // Helper to prevent unhandled promise rejections after timeout
            const safeSend = (payload: any): Promise<any> => {
                return new Promise((resolve, reject) => {
                    let isDone = false;
                    const timeoutId = setTimeout(() => {
                        if (!isDone) {
                            isDone = true;
                            reject(new Error('WhatsApp send timeout'));
                        }
                    }, 45000);

                    try {
                        sock!.sendMessage(jid, payload)
                          .then((res: any) => {
                              if (!isDone) {
                                  isDone = true;
                                  clearTimeout(timeoutId);
                                  resolve(res);
                              }
                          })
                          .catch((err: any) => {
                              if (!isDone) {
                                  isDone = true;
                                  clearTimeout(timeoutId);
                                  reject(err);
                              } else {
                                  console.log('Late WhatsApp error (ignored):', err?.message || err);
                              }
                          });
                    } catch (err: any) {
                        if (!isDone) {
                            isDone = true;
                            clearTimeout(timeoutId);
                            reject(err);
                        }
                    }
                });
            };

            let result: any = null;
            if (media) {
                 const base64Data = media.base64.split(';base64,').pop() || '';
                 const buffer = Buffer.from(base64Data, 'base64');
                 let mediaPayload: any = {};
                 if (media.mimetype.startsWith('image/')) {
                     mediaPayload = { image: buffer, caption: text };
                 } else if (media.mimetype.startsWith('video/')) {
                     mediaPayload = { video: buffer, caption: text };
                 } else if (media.mimetype.startsWith('audio/')) {
                     mediaPayload = { audio: buffer, ptt: true };
                 } else {
                     mediaPayload = { document: buffer, mimetype: media.mimetype, fileName: media.fileName, caption: text };
                 }
                 
                 result = await safeSend(mediaPayload);
            } else if (image) {
                const base64Data = image.includes('base64,') ? image.split('base64,')[1] : image;
                const buffer = Buffer.from(base64Data, 'base64');
                
                result = await safeSend({ 
                    image: buffer, 
                    caption: text 
                });
            } else {
                result = await safeSend({ text });
            }
            
            // Stop typing indicator
            await sock.sendPresenceUpdate('paused', jid);
            
            const messageId = result?.key?.id || `local-${Date.now()}`;
            const messageType = media ? 'media' : image ? 'image' : 'text';

            try {
                const conversation = await getOrCreateConversation({
                    identityKey: identityKey,
                    phone: identityPhone,
                    jid: jid,
                    lid: identityLid,
                    waName: '', // Output message doesn't need to overwrite name
                    displayName: identityPhone || 'Contacto WhatsApp',
                    isLid: isLid || jid.includes('@lid'),
                    isSelf: false, // We're sending to them, so they are not us
                    isValidPhone: !!identityPhone,
                    lastMessage: text || 'Mensaje enviado',
                    incrementUnread: false // Since we're sending, it's not unread for us
                });

                await saveOutgoingMessage({
                    id: `${jid}_${messageId}`, // Composite ID
                    waMessageId: messageId,
                    rawJid: jid,
                    conversationId: conversation.id,
                    phone: identityPhone || jid,
                    jid: jid,
                    text: text || '',
                    messageType: messageType,
                    status: 'sent'
                });
            } catch (err) {
                console.warn('Could not save outgoing CRM message:', err);
            }

            return { success: true, messageId };
        } catch (error: any) {
            console.warn(`Issue in sock.sendMessage (attempt ${attempts + 1}):`, error);
            
            const errorMsg = error.message || String(error);
            
            const isAuthError = 
                errorMsg.includes('bad session') ||
                errorMsg.includes('Unsupported state') ||
                errorMsg.includes('unable to authenticate data');

            if (isAuthError) {
                console.warn('Session corruption warning during send. Deferring session reset to connection.update.');
                throw new Error('Error temporal de sesión de WhatsApp al enviar el mensaje. Reitentando la conexión localmente.');
            }

            if (errorMsg.includes('Connection Closed') || errorMsg.includes('timeout') || errorMsg.includes('connection') || errorMsg.includes('socket') || errorMsg.includes('Precondition Required') || errorMsg.includes('decrypt') || errorMsg.includes('MAC') || errorMsg.includes('MessageCounterError') || errorMsg.includes('Key used already')) {
                console.log(`Network disconnect or temporary decryption error detected during send. Retry attempt ${attempts + 1}...`);
                if (attempts < 2) {
                    // Try to reconnect if not attempting the last time
                    if (errorMsg.includes('Connection Closed') || errorMsg.includes('socket') || errorMsg.includes('Precondition Required')) {
                        connectionStatus = 'close';
                        reconnectWhatsApp();
                        // wait up to 15 seconds for reconnect
                        for (let i = 0; i < 30; i++) {
                            await new Promise(r => setTimeout(r, 500));
                            if ((connectionStatus as string) === 'open' && sock) break;
                        }
                        if ((connectionStatus as string) !== 'open' || !sock) {
                            throw new Error('No se pudo reconectar con WhatsApp automáticamente.');
                        }
                        await new Promise(r => setTimeout(r, 4000)); // Wait for connection to fully stabilize
                    } else {
                        // For timeout or decrypt errors, just wait a bit and retry
                        await new Promise(r => setTimeout(r, 3000));
                    }
                    attempts++;
                    continue;
                }
                throw new Error('Problema temporal de conexión con WhatsApp. Por favor, intenta de nuevo en unos segundos.');
            }
            throw error;
        }
    }
}
