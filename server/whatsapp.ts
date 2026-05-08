import makeWASocket, { DisconnectReason, Browsers, fetchLatestBaileysVersion, initAuthCreds, BufferJSON, proto, makeCacheableSignalKeyStore, downloadMediaMessage } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import pino from 'pino';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

let supabaseClient: any = null;

function getSupabase() {
    if (!supabaseClient) {
        let supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://ruwcektpadeqovwtdixd.supabase.co";
        const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";
        
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

const flushQueue = async () => {
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
        scheduleFlush();
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
                            retryCount++;
                            const delay = Math.min(30000, 5000 * retryCount);
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
                if(m.type === 'notify') {
                    for (const msg of m.messages) {
                        // Check for decryption errors due to corrupted session
                        if (msg.messageStubType === 2) { // 2 = CIPHERTEXT (Decryption failure)
                            const params = msg.messageStubParameters || [];
                            console.log(`[WA] Message decryption issue (often temporary/retryable): ${params.join(', ')}`);
                            // DO NOT reset connection here, Baileys handles retries for missed messages
                            continue;
                        }

                        if (!msg.key.fromMe && msg.message) {
                            const jid = msg.key.remoteJid;
                            if (!jid || jid === 'status@broadcast') continue;
                            const phone = jid.split('@')[0];
                            
                            let text = msg.message.conversation || 
                                         msg.message.extendedTextMessage?.text || 
                                         msg.message.imageMessage?.caption || 
                                         msg.message.videoMessage?.caption || 
                                         msg.message.documentMessage?.caption || '';
                                         
                            // Check for media
                            let mediaUrl = undefined;
                            let mediaType = undefined;
                            if (msg.message.imageMessage || msg.message.videoMessage || msg.message.audioMessage || msg.message.documentMessage || msg.message.stickerMessage) {
                                try {
                                    const buffer = await downloadMediaMessage(
                                        msg,
                                        'buffer',
                                        { },
                                        { 
                                            logger: logger,
                                            reuploadRequest: sock.updateMediaMessage
                                        }
                                    );
                                    let mimetype = '';
                                    if (msg.message.imageMessage) { mimetype = msg.message.imageMessage.mimetype || 'image/jpeg'; mediaType = 'image'; }
                                    else if (msg.message.videoMessage) { mimetype = msg.message.videoMessage.mimetype || 'video/mp4'; mediaType = 'video'; }
                                    else if (msg.message.audioMessage) { mimetype = msg.message.audioMessage.mimetype || 'audio/ogg'; mediaType = 'audio'; }
                                    else if (msg.message.documentMessage) { mimetype = msg.message.documentMessage.mimetype || 'application/pdf'; mediaType = 'document'; }
                                    else if (msg.message.stickerMessage) { mimetype = msg.message.stickerMessage.mimetype || 'image/webp'; mediaType = 'image'; }
                                    
                                    if (buffer) {
                                        mediaUrl = `data:${mimetype};base64,${buffer.toString('base64')}`;
                                    }
                                } catch(e) {
                                    console.error('[WA] Error downloading media:', e);
                                }
                            }

                            // Check for media fallback text if no text
                            if (!text) {
                                if (msg.message.imageMessage) text = '📷 Imagen recibida';
                                else if (msg.message.videoMessage) text = '🎥 Video recibido';
                                else if (msg.message.audioMessage) text = '🔊 Audio/Nota de voz recibida';
                                else if (msg.message.documentMessage) text = '📄 Documento recibido';
                                else if (msg.message.stickerMessage) text = '🏷️ Sticker recibido';
                                else continue;
                            }

                            const supabase = getSupabase();
                            if (!supabase) continue;

                            // We need to find the latest active order matching this phone number
                            // Since DB phones might be formatted (e.g., 829-123-4567), we fetch recent orders and filter locally
                            const cleanIncoming = phone.replace(/\D/g, '');
                            const phoneTail = cleanIncoming.length > 10 ? cleanIncoming.substring(cleanIncoming.length - 10) : cleanIncoming;

                            const { data: recentOrders } = await supabase
                                .from('orders')
                                .select('id, customer')
                                .order('createdAt', { ascending: false })
                                .limit(200);

                            let matchedOrder = null;
                            if (recentOrders) {
                                for (const o of recentOrders) {
                                    const dbPhone = (o.customer?.phone || '').replace(/\D/g, '');
                                    const dbPhoneTail = dbPhone.length > 10 ? dbPhone.substring(dbPhone.length - 10) : dbPhone;
                                    if (dbPhoneTail && dbPhoneTail === phoneTail) {
                                        matchedOrder = o;
                                        break; // Found the most recent matching order
                                    }
                                }
                            }

                            if (matchedOrder) {
                                const { data: fullOrderData } = await supabase
                                    .from('orders')
                                    .select('*')
                                    .eq('id', matchedOrder.id)
                                    .single();
                                
                                if (fullOrderData) {
                                    const order = fullOrderData;
                                    const customerObj = order.customer || {};
                                    const metadata = customerObj.metadata || {};
                                    const history = metadata.whatsappHistory || [];
                                    
                                    history.push({
                                        id: msg.key.id || Date.now().toString(),
                                        sender: 'client',
                                        text: text,
                                        timestamp: new Date().toISOString(),
                                        status: 'delivered',
                                        mediaUrl: mediaUrl,
                                        mediaType: mediaType,
                                    });

                                    let pfpUrl = metadata.waProfilePic;
                                    if (!pfpUrl) {
                                        try {
                                            pfpUrl = await sock.profilePictureUrl(jid, 'image');
                                        } catch (e) {
                                            // Ignore if picture cannot be fetched
                                        }
                                    }

                                    metadata.whatsappHistory = history;
                                    if (pfpUrl) metadata.waProfilePic = pfpUrl;
                                    
                                    customerObj.metadata = metadata;

                                    await supabase
                                        .from('orders')
                                        .update({ customer: customerObj })
                                        .eq('id', order.id);
                                        
                                    console.log(`[WA] Saved incoming message from ${phone} to order ${order.id}`);
                                }        
                            }
                        }
                    }
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

export async function sendWhatsAppMessage(phone: string, text: string, image?: string, media?: { base64: string, mimetype: string, fileName: string }) {
    if (connectionStatus !== 'open' || !sock) {
        if (!isInitializing && connectionStatus !== 'connecting') {
            console.log('WhatsApp not connected during send attempt. Triggering reconnection...');
            connectToWhatsApp();
        }
        throw new Error('WhatsApp is not connected. Please wait a moment and try again.');
    }
    
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const jid = `${cleanPhone}@s.whatsapp.net`;
    
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
            const safeSend = (payload: any) => {
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
                 
                 await safeSend(mediaPayload);
            } else if (image) {
                const base64Data = image.includes('base64,') ? image.split('base64,')[1] : image;
                const buffer = Buffer.from(base64Data, 'base64');
                
                await safeSend({ 
                    image: buffer, 
                    caption: text 
                });
            } else {
                await safeSend({ text });
            }
            
            // Stop typing indicator
            await sock.sendPresenceUpdate('paused', jid);
            
            return { success: true };
        } catch (error: any) {
            console.warn(`Issue in sock.sendMessage (attempt ${attempts + 1}):`, error);
            
            const errorMsg = error.message || String(error);
            
            const isAuthError = 
                errorMsg.includes('bad session') ||
                errorMsg.includes('Unsupported state') ||
                errorMsg.includes('unable to authenticate data');

            if (isAuthError) {
                console.log('Session corruption detected during send. Clearing auth and resetting...');
                resetWhatsAppConnection();
                throw new Error('Error de sesión de WhatsApp. Se ha cerrado la sesión, por favor escanea el QR nuevamente.');
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
                            if (connectionStatus === 'open' && sock) break;
                        }
                        if (connectionStatus !== 'open' || !sock) {
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
