import express from 'express';
import { getSupabase } from '../whatsapp';

const router = express.Router();

router.get('/conversations', async (req, res) => {
  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'DB no conectada' });

  try {
    const { data: convs, error } = await supabase
      .from('crm_conversations')
      .select(`
        *,
        crm_contacts:contact_id ( full_name, display_name, primary_phone )
      `)
      .order('last_message_at', { ascending: false });

    if (error) throw error;
    res.json(convs || []);
  } catch (error: any) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/conversations/:id/messages', async (req, res) => {
  const { id } = req.params;
  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'DB no conectada' });

  try {
    const { data: messages, error } = await supabase
      .from('crm_messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(messages || []);
  } catch (error: any) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/send', async (req, res) => {
  const { conversationId, text, mediaUrl, mediaType } = req.body;
  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'DB no conectada' });

  try {
    // 1. Get conversation to know channel and external_id
    const { data: conv, error: convError } = await supabase
      .from('crm_conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (convError || !conv) throw new Error('Conversation not found');

    const { data: identity, error: idError } = await supabase
      .from('crm_contact_identities')
      .select('*')
      .eq('contact_id', conv.contact_id)
      .eq('channel', conv.active_channel)
      .single();

    if (idError || !identity) throw new Error('Identity not found for channel');

    // 2. Send via specific channel adapter
    let externalMessageId = `crm-send-${Date.now()}`;

    if (conv.active_channel === 'whatsapp') {
       const { sendWhatsAppMessage } = await import('../whatsapp');
       const targetJid = identity.external_id.includes('@s.whatsapp.net') || identity.external_id.includes('@lid') ? identity.external_id : `${identity.external_id}@s.whatsapp.net`;
       
       let imageObj = undefined;
       let mediaObj = undefined;

       if (mediaUrl) {
         if (mediaType === 'image') {
            imageObj = mediaUrl; // For testing base64 can be passed directly if sendWhatsAppMessage handles it, but typically it assumes a buffer or base64. Let's pass it as image.
         } else {
            mediaObj = {
               base64: mediaUrl.split(',')[1] || mediaUrl,
               mimetype: mediaType === 'audio' ? 'audio/mpeg' : 'application/pdf',
               fileName: 'media_file'
            };
         }
       }

       await sendWhatsAppMessage(targetJid, text, imageObj, mediaObj);
    } else {
       console.log(`Sending to ${conv.active_channel}...`);
       // TODO: Call meta/tiktok apis
    }

    // 3. Save outbound message
    const { data: savedMsg, error: msgError } = await supabase
      .from('crm_messages')
      .insert({
        conversation_id: conv.id,
        contact_id: conv.contact_id,
        channel: conv.active_channel,
        external_message_id: externalMessageId,
        direction: 'outbound',
        message_type: mediaUrl ? mediaType : 'text',
        text,
        media_url: mediaUrl,
        status: 'sent'
      })
      .select('*')
      .single();

    res.json({ success: true, message: savedMsg });
  } catch (error: any) {
    console.error('Error sending omnicanal message:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/metrics', async (req, res) => {
  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'DB no conectada' });

  try {
    const { data: convs, error } = await supabase
      .from('crm_conversations')
      .select('id, assigned_to, source, status, created_at, last_message_at');

    if (error) throw error;

    // Métricas básicas
    const totalConvs = convs?.length || 0;
    const leadsByChannel: Record<string, number> = {};
    const chatsByAgent: Record<string, number> = {};
    let openCount = 0;

    convs?.forEach(c => {
      leadsByChannel[c.source] = (leadsByChannel[c.source] || 0) + 1;
      if (c.assigned_to) {
        chatsByAgent[c.assigned_to] = (chatsByAgent[c.assigned_to] || 0) + 1;
      }
      if (c.status === 'open') openCount++;
    });

    res.json({
      totalConvs,
      leadsByChannel,
      chatsByAgent,
      openCount,
      success: true
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/conversations/:id/change-channel', async (req, res) => {
  const { id } = req.params;
  const { channel, phone } = req.body;
  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'DB no conectada' });

  try {
     const { data: conv, error: convError } = await supabase.from('crm_conversations').select('*').eq('id', id).single();
     if (convError || !conv) throw new Error('Conversacion no encontrada');

     // Upsert identity para whatsapp
     if (channel === 'whatsapp' && phone) {
        let cleanPhone = phone.replace(/\D/g, '');
        if (cleanPhone.length === 10) cleanPhone = '1' + cleanPhone;
        const targetExternalId = cleanPhone.includes('@') ? cleanPhone : `${cleanPhone}@s.whatsapp.net`;

        const { data: existingWa } = await supabase.from('crm_contact_identities')
          .select('id').eq('contact_id', conv.contact_id).eq('channel', 'whatsapp').single();

        if (!existingWa) {
           await supabase.from('crm_contact_identities').insert({
             contact_id: conv.contact_id,
             channel: 'whatsapp',
             external_id: targetExternalId,
             phone: cleanPhone
           });
        }
     }

     const { error: updateError } = await supabase.from('crm_conversations').update({ active_channel: channel }).eq('id', id);
     if (updateError) throw updateError;

     res.json({ success: true, message: `Canal cambiado a ${channel}` });
  } catch(e: any) {
     res.status(500).json({ error: e.message, success: false });
  }
});

export default router;
