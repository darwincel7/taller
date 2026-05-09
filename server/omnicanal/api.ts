import express from 'express';
import { getSupabase } from '../whatsapp';

const router = express.Router();

router.get('/conversations', async (req, res) => {
  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'DB no conectada' });

  const userId = req.headers['x-user-id'] as string;
  const userRole = req.headers['x-user-role'] as string;

  try {
    let query = supabase
      .from('crm_conversations')
      .select(`
        *,
        crm_contacts:contact_id ( full_name, display_name, primary_phone )
      `);

    // Basic assignment scoping (Phase 9/7)
    if (userRole !== 'admin' && userId) {
       // Filter by assigned_to or unassigned if the system allows taking any
       // For now, let's allow seeing everything but highlight assigned ones in UI
       // Or eventually: query = query.or(`assigned_to.eq.${userId},assigned_to.is.null`);
    }

    const { data: convs, error } = await query.order('last_message_at', { ascending: false });

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
  let adapterMediaUrl = mediaUrl;
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

    let externalMessageId = `crm-send-${Date.now()}`;
    let finalMediaUrlForDb = adapterMediaUrl; // defaults to whatever was passed

    if (adapterMediaUrl && adapterMediaUrl.startsWith('data:')) {
      // Decode and upload to supabase
       const arr = adapterMediaUrl.split(',');
       const mimeMatch = arr[0].match(/:(.*?);/);
       const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
       const base64Data = arr[1];
       const buffer = Buffer.from(base64Data, 'base64');
       
       const extension = mimeType.split('/')[1] || 'bin';
       const fileName = `${conv.id}/${Date.now()}.${extension}`;
       
       const { error: uploadError } = await supabase.storage.from('crm-media').upload(fileName, buffer, {
          contentType: mimeType
       });

       if (!uploadError) {
          const { data } = supabase.storage.from('crm-media').getPublicUrl(fileName);
          if (data.publicUrl) {
             finalMediaUrlForDb = data.publicUrl;
             // also save an entry in crm_media_assets
             await supabase.from('crm_media_assets').insert({
                message_id: null, // we don't have msg id yet
                channel: conv.active_channel,
                file_name: fileName,
                mime_type: mimeType,
                size_bytes: buffer.length,
                storage_path: fileName,
                public_url: data.publicUrl,
                source: 'outbound'
             });
          }
       } else {
          console.error("Storage upload error:", uploadError);
       }
    } else if (adapterMediaUrl && adapterMediaUrl.startsWith('http')) {
       finalMediaUrlForDb = adapterMediaUrl;
       try {
         // Optionally insert in crm_media_assets if not already there, but lets assume frontend did it.
         // We need to fetch the http URL and convert it to base64 for Baileys/Meta adapters for now.
         const fetchRes = await fetch(adapterMediaUrl);
         if (fetchRes.ok) {
           const arrayBuffer = await fetchRes.arrayBuffer();
           const buffer = Buffer.from(arrayBuffer);
           const mimeType = fetchRes.headers.get('content-type') || 'application/octet-stream';
           adapterMediaUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
         }
       } catch (e) {
         console.error("Error downloading media for adapter:", e);
       }
    }

    if (conv.active_channel === 'whatsapp') {
       const { sendWhatsAppMessage } = await import('../whatsapp');
       const targetJid = identity.external_id.includes('@s.whatsapp.net') || identity.external_id.includes('@lid') ? identity.external_id : `${identity.external_id}@s.whatsapp.net`;
       
       let imageObj = undefined;
       let mediaObj = undefined;

       if (adapterMediaUrl) {
         if (mediaType === 'image') {
            imageObj = adapterMediaUrl; // Keep passing original base64 to Baileys as it probably supports data:image
         } else {
            mediaObj = {
               base64: adapterMediaUrl.split(',')[1] || adapterMediaUrl,
               mimetype: mediaType === 'audio' ? 'audio/webm' : 'application/pdf',
               fileName: 'media_file'
            };
         }
       }

       await sendWhatsAppMessage(targetJid, text, imageObj, mediaObj);
    } else if (conv.active_channel === 'facebook' || conv.active_channel === 'instagram') {
       const { sendMetaMessage } = await import('./meta');
       // We need the pageId (channelAccountId) from the last inbound message.
       // Ideally we stored this in identity or somewhere.
       // For now, let's query the last inbound message for this conversation.
       const { data: lastInbound } = await supabase.from('crm_messages')
         .select('channel_account_id:crm_channel_accounts(external_account_id)')
         .eq('conversation_id', conv.id)
         .eq('direction', 'inbound')
         .order('created_at', { ascending: false })
         .limit(1)
         .single();
         
       // Supabase relation syntax: channel_account_id is a UUID, we requested the join.
       // But wait, the standard approach is just to get the identity or message.
       // Let's just fetch the raw message to get the channel_account_id.
       const { data: rawMsg } = await supabase.from('crm_messages').select('channel_account_id').eq('conversation_id', conv.id).eq('direction', 'inbound').order('created_at', {ascending: false}).limit(1).single();
       if (!rawMsg || !rawMsg.channel_account_id) throw new Error("Could not find Meta page ID for this conversation");
       
       const { data: acc } = await supabase.from('crm_channel_accounts').select('external_account_id').eq('id', rawMsg.channel_account_id).single();
       if (!acc) throw new Error("Account not found");

       await sendMetaMessage(acc.external_account_id, identity.external_id, text, finalMediaUrlForDb, mediaType);
    } else if (conv.active_channel === 'tiktok') {
       const { sendTikTokMessage } = await import('./tiktok');
       const { data: rawMsg } = await supabase.from('crm_messages').select('channel_account_id').eq('conversation_id', conv.id).eq('direction', 'inbound').order('created_at', {ascending: false}).limit(1).single();
       if (!rawMsg || !rawMsg.channel_account_id) throw new Error("Could not find TikTok account ID for this conversation");
       
       const { data: acc } = await supabase.from('crm_channel_accounts').select('external_account_id').eq('id', rawMsg.channel_account_id).single();
       if (!acc) throw new Error("Account not found");

       await sendTikTokMessage(acc.external_account_id, identity.external_id, text);
    } else {
       throw new Error(`Sending to ${conv.active_channel} is not implemented`);
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
        media_url: finalMediaUrlForDb,
        status: 'sent'
      })
      .select('*')
      .single();

    if (savedMsg) {
       // Update message_id in crm_media_assets if uploaded
       if (finalMediaUrlForDb && finalMediaUrlForDb !== mediaUrl) {
           await supabase.from('crm_media_assets')
             .update({ message_id: savedMsg.id })
             .eq('public_url', finalMediaUrlForDb);
       }
    }

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

router.get('/health', async (req, res) => {
  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'DB no conectada' });

  try {
    const { getWhatsAppStatus } = await import('../whatsapp');
    const { count: pendingJobs } = await supabase.from('crm_processing_jobs').select('*', { count: 'exact', head: true }).eq('status', 'pending');
    const { count: failedJobs } = await supabase.from('crm_processing_jobs').select('*', { count: 'exact', head: true }).eq('status', 'failed');
    
    res.json({
      success: true,
      whatsapp: getWhatsAppStatus(),
      supabase: 'connected',
      ai: !!process.env.GEMINI_API_KEY,
      jobs: {
        pending: pendingJobs || 0,
        failed: failedJobs || 0
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/agents', async (req, res) => {
  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'DB no conectada' });

  try {
    const { data: agents, error } = await supabase
      .from('crm_agents')
      .select('id, full_name, role, status')
      .eq('status', 'active');

    if (error) throw error;
    res.json(agents || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/conversations/:id/assign', async (req, res) => {
  const { id } = req.params;
  const { agentId } = req.body;
  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'DB no conectada' });

  try {
    const { error } = await supabase
      .from('crm_conversations')
      .update({ 
        assigned_to: agentId,
        assigned_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw error;
    
    // Log assignment (Phase 9/11)
    await supabase.from('crm_raw_events').insert({
       channel: 'system',
       event_type: 'conversation_assigned',
       payload: { conversation_id: id, assigned_to: agentId }
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/conversations/:id/claim', async (req, res) => {
  const { id } = req.params;
  const userId = req.headers['x-user-id'] as string;
  if (!userId) return res.status(401).json({ error: 'No user ID' });

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'DB no conectada' });

  try {
    const { error } = await supabase
      .from('crm_conversations')
      .update({ 
        assigned_to: userId,
        assigned_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/analytics/overview', async (req, res) => {
  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'DB no conectada' });

  try {
     const { data: statusCounts } = await supabase.rpc('get_conversation_status_counts');
     const { data: channelCounts } = await supabase.rpc('get_message_channel_counts');
     
     // Also get agents workload snapshot
     const { data: workloads } = await supabase.from('v_agent_workload').select('*');

     res.json({
       conversations_by_status: statusCounts,
       messages_by_channel: channelCounts,
       agent_workloads: workloads,
       timestamp: new Date().toISOString()
     });
  } catch (error: any) {
     res.status(500).json({ error: error.message });
  }
});

router.get('/search', async (req, res) => {
  const { query, type = 'all' } = req.query;
  if (!query) return res.status(400).json({ error: 'Falta query' });

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'DB no conectada' });

  try {
     const results: any = {};
     
     if (type === 'all' || type === 'messages') {
        const { data } = await supabase
          .from('crm_messages')
          .select('*, crm_conversations(contact_id, crm_contacts(full_name))')
          .textSearch('fts', query as string, { config: 'spanish' })
          .limit(20);
        results.messages = data;
     }

     if (type === 'all' || type === 'contacts') {
        const { data } = await supabase
          .from('crm_contacts')
          .select('*')
          .textSearch('fts', query as string, { config: 'spanish' })
          .limit(20);
        results.contacts = data;
     }

     res.json(results);
  } catch (error: any) {
     res.status(500).json({ error: error.message });
  }
});

router.post('/conversations/bulk-close', async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'Faltan IDs' });

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'DB no conectada' });

  try {
     const { error } = await supabase
       .from('crm_conversations')
       .update({ status: 'closed' })
       .in('id', ids);

     if (error) throw error;
     res.json({ success: true, count: ids.length });
  } catch (error: any) {
     res.status(500).json({ error: error.message });
  }
});

export default router;
