import express from 'express';
import { saveRawEvent, processIncomingMessage } from './pipeline';

const router = express.Router();

router.get('/oauth/start', (req, res) => {
   const appId = process.env.TIKTOK_APP_ID;
   const redirectUri = `${req.protocol}://${req.get('host')}/api/tiktok/oauth/callback`;
   // Required scopes for DM, Comments, Leads if available
   const scopes = 'user.info.basic,video.list,comment.list'; 
   const oauthUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${appId}&response_type=code&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=tiktok`;
   res.json({ success: true, url: oauthUrl });
});

router.get('/oauth/callback', async (req, res) => {
  const code = req.query.code as string;
  if (!code) return res.status(400).send("No code provided");

  const { getSupabase } = await import('../whatsapp');
  const supabase = getSupabase();
  if (!supabase) return res.status(500).send("No database");

  try {
    const axios = (await import('axios')).default;
    const appId = process.env.TIKTOK_APP_ID;
    const appSecret = process.env.TIKTOK_APP_SECRET;
    const redirectUri = `${req.protocol}://${req.get('host')}/api/tiktok/oauth/callback`;

    // 1. Exchange code for token
    const tokenRes = await axios.post(`https://open.tiktokapis.com/v2/oauth/token/`, {
       client_key: appId,
       client_secret: appSecret,
       code: code,
       grant_type: 'authorization_code',
       redirect_uri: redirectUri
    }, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    
    let accessToken = tokenRes.data?.data?.access_token;
    let openId = tokenRes.data?.data?.open_id;

    if (!accessToken || !openId) throw new Error("Invalid token response");

    // 2. Get user info
    const userRes = await axios.get(`https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name`, {
       headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    const userInfo = userRes.data?.data?.user;

    // 3. Save account in DB
    await supabase.from('crm_channel_accounts').upsert({
        channel: 'tiktok',
        account_name: userInfo?.display_name || 'TikTok User',
        external_account_id: openId,
        access_token_encrypted: accessToken, 
        status: 'active'
    }, { onConflict: 'channel, external_account_id' });

    res.redirect('/omnicanal?tiktok_connected=true');
  } catch (error: any) {
    console.error("TikTok OAuth error:", error.response?.data || error.message);
    res.redirect('/omnicanal?tiktok_error=true');
  }
});

router.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    await saveRawEvent('tiktok', 'webhook', body);

    // Parse TikTok payload (comments or leads)
    // E.g. event "comment.create" or "message.receive"
    if (body.type === 'comment.create' || body.event === 'message.receive' || body.type === 'comment') {
       // Extrayendo posibles IDs de estructura típica
       const externalMessageId = body.comment_id || body.message_id || `tk-${Date.now()}`;
       const externalSenderId = body.user_id || body.sender_id || body.open_id || 'unknown';
       const text = body.text || body.content || '';

      const normalized = {
        channel: 'tiktok' as const,
        channelAccountId: body.recipient_id || 'default',
        externalConversationId: externalSenderId,
        externalMessageId: externalMessageId,
        externalSenderId: externalSenderId,
        text: text,
        messageType: 'text' as const,
        createdAt: new Date(body.create_time ? body.create_time * 1000 : Date.now()).toISOString(),
        raw: body
      };
      await processIncomingMessage(normalized);
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('[TIKTOK WEBHOOK ERROR]', error);
    res.sendStatus(200);
  }
});

router.post('/send', (req, res) => {
  // TikTok DM API requires special permissions. By default we error out indicating it's not possible
  res.status(403).json({ success: false, error: "TikTok sends are generally read-only or require specialized API approvals for DMs. Action not permitted." });
});

export async function sendTikTokMessage(accountId: string, recipientId: string, text: string) {
  // If we had approval, we'd use open.tiktokapis.com/v2/message/send/
  // For now, fail explicitly.
  throw new Error("Direct messaging via TikTok requires privileged API access not currently authorized. Mode is read-only (comments/leads).");
}

export default router;
