import express from 'express';
import crypto from 'crypto';
import { saveRawEvent, processIncomingMessage } from './pipeline';

const router = express.Router();

function verifyMetaSignature(req: express.Request, res: express.Response, buf: Buffer, encoding: string) {
  const signature = req.headers['x-hub-signature-256'] as string;
  if (!signature) {
    console.error("Couldn't find signature in headers");
    return; // Don't throw to avoid breaking the middleware chain
  }

  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    console.error("META_APP_SECRET not configured");
    return;
  }

  const elements = signature.split('=');
  const method = elements[0];
  const signatureHash = elements[1];
  
  const expectedHash = crypto
    .createHmac('sha256', appSecret)
    .update(buf)
    .digest('hex');
    
  if (signatureHash !== expectedHash) {
    throw new Error("Invalid signature");
  }
}

// En el server.ts (o donde usemos body-parser) se debe configurar verify: verifyMetaSignature
// Para este archivo individual, asumiremos que si body-parser-json está configurado con req.rawBody, lo verificamos acá

router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

router.post('/webhook', express.json({
  verify: (req: any, res, buf, encoding) => {
     req.rawBody = buf;
  }
}), async (req: any, res) => {
  try {
    const signature = req.headers['x-hub-signature-256'];
    const appSecret = process.env.META_APP_SECRET;
    
    if (signature && appSecret && req.rawBody) {
       const elements = (signature as string).split('=');
       const signatureHash = elements[1];
       const expectedHash = crypto.createHmac('sha256', appSecret).update(req.rawBody).digest('hex');
       if (signatureHash !== expectedHash) {
          console.error("Invalid Meta signature");
          return res.status(401).send("Invalid signature");
       }
    }

    const body = req.body;
    await saveRawEvent('facebook', 'webhook', body);

    if (body.object === 'page' || body.object === 'instagram') {
      const promises: Promise<any>[] = [];
      body.entry?.forEach((entry: any) => {
        const channel = body.object === 'instagram' ? 'instagram' : 'facebook';
        entry.messaging?.forEach((event: any) => {
          if (event.message) {
            let msgType = 'text';
            let text = event.message.text || '';
            let mediaUrl = undefined;
            
            if (event.message.attachments && event.message.attachments.length > 0) {
               const attachment = event.message.attachments[0];
               msgType = attachment.type; // image, video, audio, file
               mediaUrl = attachment.payload?.url;
            }

            const normalized = {
              channel: channel as 'instagram' | 'facebook',
              channelAccountId: entry.id,
              externalConversationId: event.sender.id,
              externalMessageId: event.message.mid,
              externalSenderId: event.sender.id,
              text: text,
              messageType: msgType as any,
              mediaUrl,
              createdAt: new Date(event.timestamp || Date.now()).toISOString(),
              raw: event
            };
            promises.push(processIncomingMessage(normalized));
          }
        });
      });
      await Promise.allSettled(promises);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('[META WEBHOOK ERROR]', error);
    res.sendStatus(200); // Meta expects 200 even on errors to avoid retries
  }
});

// OAuth Callback flow
router.get('/oauth/callback', async (req, res) => {
  const code = req.query.code as string;
  const state = req.query.state as string;
  
  if (!code) return res.status(400).send("No code provided");

  const { getSupabase } = await import('../whatsapp');
  const supabase = getSupabase();
  if (!supabase) return res.status(500).send("No database");

  try {
    const axios = (await import('axios')).default;
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const redirectUri = `${req.protocol}://${req.get('host')}/api/meta/oauth/callback`;

    // 1. Exchange code for short-lived token
    const tokenRes = await axios.get(`https://graph.facebook.com/v19.0/oauth/access_token`, {
       params: { client_id: appId, redirect_uri: redirectUri, client_secret: appSecret, code }
    });
    let accessToken = tokenRes.data.access_token;

    // 2. Exchange for long-lived token (optional but recommended)
    const longTokenRes = await axios.get(`https://graph.facebook.com/v19.0/oauth/access_token`, {
       params: { grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: accessToken }
    });
    accessToken = longTokenRes.data.access_token || accessToken;

    // 3. Get user profile and pages
    const pagesRes = await axios.get(`https://graph.facebook.com/v19.0/me/accounts`, {
       params: { access_token: accessToken }
    });

    const pages = pagesRes.data.data;

    // 4. Save accounts in DB
    for (const page of pages) {
       await supabase.from('crm_channel_accounts').upsert({
          channel: 'facebook',
          account_name: page.name,
          external_account_id: page.id,
          page_id: page.id,
          access_token_encrypted: page.access_token, // Ideally encrypted here
          status: 'active'
       }, { onConflict: 'channel, external_account_id' });
    }

    // Redirect to frontend or success page
    res.redirect('/omnicanal?meta_connected=true');
  } catch (error: any) {
    console.error("Meta OAuth error:", error.response?.data || error.message);
    res.redirect('/omnicanal?meta_error=true');
  }
});

router.post('/connect', (req, res) => {
   const appId = process.env.META_APP_ID;
   const redirectUri = `${req.protocol}://${req.get('host')}/api/meta/oauth/callback`;
   // instagram_basic, instagram_manage_messages require instagram business account and setup
   const scopes = ['pages_show_list', 'pages_messaging', 'instagram_basic', 'instagram_manage_messages'];
   const oauthUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes.join(',')}&response_type=code`;
   res.json({ success: true, oauthUrl });
});

router.get('/accounts', async (req, res) => {
   const { getSupabase } = await import('../whatsapp');
   const supabase = getSupabase();
   if (!supabase) return res.status(500).json({ error: "DB error" });
   
   const { data } = await supabase.from('crm_channel_accounts').select('*').in('channel', ['facebook', 'instagram']);
   res.json({ success: true, accounts: data || [] });
});

router.post('/send', (req, res) => {
  res.json({ success: true, message: "Use the omnicanal send endpoint instead" });
});

export async function sendMetaMessage(pageId: string, recipientId: string, text: string, mediaUrl?: string, mediaType?: string) {
  const { getSupabase } = await import('../whatsapp');
  const supabase = getSupabase();
  if (!supabase) throw new Error("No database");

  // 1. Get access token from crm_channel_accounts
  const { data: account } = await supabase.from('crm_channel_accounts')
    .select('*')
    .eq('external_account_id', pageId)
    .single();

  if (!account || !account.access_token_encrypted) {
    throw new Error(`Meta account not linked or missing access token for Page ${pageId}`);
  }

  const token = account.access_token_encrypted;

  // 2. Prepare payload
  const endpoint = `https://graph.facebook.com/v19.0/${pageId}/messages`;
  
  let payload: any = {
    recipient: { id: recipientId },
    message: {}
  };

  if (mediaUrl) {
    let type = 'file';
    if (mediaType === 'image') type = 'image';
    if (mediaType === 'video') type = 'video';
    if (mediaType === 'audio') type = 'audio';

    payload.message.attachment = {
      type: type,
      payload: { url: mediaUrl, is_reusable: true }
    };
  } else {
    payload.message.text = text;
  }

  // 3. Send to Graph API
  const axios = (await import('axios')).default;
  try {
     const response = await axios.post(endpoint, payload, {
        headers: { 'Authorization': `Bearer ${token}` }
     });
     return response.data;
  } catch (error: any) {
     console.error("Meta API error:", error.response?.data || error.message);
     throw new Error(error.response?.data?.error?.message || "Error sending to Meta API");
  }
}

export default router;
