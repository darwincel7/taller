import express from 'express';
import { saveRawEvent, processIncomingMessage } from './pipeline';

const router = express.Router();

router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

router.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    
    // Validate signature (mocked for now, needs crypto)
    // const signature = req.headers['x-hub-signature-256'];

    await saveRawEvent('facebook', 'webhook', body);

    if (body.object === 'page' || body.object === 'instagram') {
      body.entry?.forEach((entry: any) => {
        const channel = body.object === 'instagram' ? 'instagram' : 'facebook';
        entry.messaging?.forEach(async (event: any) => {
          if (event.message) {
            const normalized = {
              channel: channel as 'instagram' | 'facebook',
              channelAccountId: entry.id,
              externalConversationId: event.sender.id,
              externalMessageId: event.message.mid,
              externalSenderId: event.sender.id,
              text: event.message.text,
              messageType: 'text' as const, // Extender para media luego
              createdAt: new Date(event.timestamp || Date.now()).toISOString(),
              raw: event
            };
            await processIncomingMessage(normalized);
          }
        });
      });
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('[META WEBHOOK ERROR]', error);
    res.sendStatus(200); // Meta expects 200 even on errors to avoid retries
  }
});

router.post('/connect', (req, res) => {
  res.json({ success: true, message: "Meta connect endpoint stub" });
});

router.get('/accounts', (req, res) => {
  res.json({ success: true, accounts: [] });
});

router.post('/send', (req, res) => {
  res.json({ success: true, message: "Meta send endpoint stub" });
});

export default router;
