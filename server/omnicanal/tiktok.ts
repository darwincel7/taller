import express from 'express';
import { saveRawEvent, processIncomingMessage } from './pipeline';

const router = express.Router();

router.get('/oauth/start', (req, res) => {
  res.json({ success: true, url: "https://tiktok.com/oauth..." });
});

router.get('/oauth/callback', (req, res) => {
  res.json({ success: true, message: "TikTok OAuth callback stub" });
});

router.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    await saveRawEvent('tiktok', 'webhook', body);

    // Parse TikTok payload (comments or leads)
    // Stub definition
    if (body.type === 'comment') {
      const normalized = {
        channel: 'tiktok' as const,
        channelAccountId: 'default',
        externalConversationId: body.user_id,
        externalMessageId: body.comment_id,
        externalSenderId: body.user_id,
        text: body.text,
        messageType: 'text' as const,
        createdAt: new Date().toISOString(),
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
  res.json({ success: true, message: "TikTok send endpoint stub" });
});

export default router;
