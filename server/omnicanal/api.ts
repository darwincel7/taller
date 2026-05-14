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
        crm_contacts:contact_id ( 
          full_name, 
          display_name, 
          primary_phone,
          crm_contact_identities(channel)
        )
      `);

    // Basic assignment scoping (Phase 9/7)
    if (userRole !== 'admin' && userId) {
       // Filter by assigned_to or unassigned if the system allows taking any
       // For now, let's allow seeing everything but highlight assigned ones in UI
       // Or eventually: query = query.or(`assigned_to.eq.${userId},assigned_to.is.null`);
    }

    const { data: convs, error } = await query
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

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

    // Reset unread counts when messages are viewed
    await supabase.from('crm_conversations').update({ unread_count: 0 }).eq('id', id);

    res.json(messages || []);
  } catch (error: any) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/send', async (req, res) => {
  const { conversationId, text, mediaUrl, mediaType, clientRequestId } = req.body;
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

    const { data: rawMsg } = await supabase.from('crm_messages').select('channel_account_id').eq('conversation_id', conv.id).eq('direction', 'inbound').order('created_at', {ascending: false}).limit(1).maybeSingle();
    const internalChannelAccountId = rawMsg ? rawMsg.channel_account_id : null;

    // INSERT FIRST (status = sending)
    const { data: pendingMsg, error: insertError } = await supabase
      .from('crm_messages')
      .insert({
        conversation_id: conv.id,
        contact_id: conv.contact_id,
        channel: conv.active_channel,
        channel_account_id: internalChannelAccountId,
        external_message_id: externalMessageId, // can be updated later if provider gives one
        raw: { client_request_id: clientRequestId },
        direction: 'outbound',
        message_type: mediaUrl ? mediaType : 'text',
        text,
        media_url: finalMediaUrlForDb,
        status: 'sending'
      })
      .select('*')
      .single();
    
    if (insertError) {
      console.error('Failed to insert initial message:', insertError);
    }
    if (insertError || !pendingMsg) throw new Error(`Failed to insert initial message: ${insertError?.message || 'unknown error'}`);

    let providerMessageId = null;

    try {
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
                  message_id: pendingMsg.id,
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
              imageObj = adapterMediaUrl; 
           } else {
              mediaObj = {
                 base64: adapterMediaUrl.split(',')[1] || adapterMediaUrl,
                 mimetype: mediaType === 'audio' ? 'audio/webm' : 'application/pdf',
                 fileName: 'media_file'
              };
           }
         }

         const sentInfo = await sendWhatsAppMessage(targetJid, text, imageObj, mediaObj);
         if (sentInfo && typeof sentInfo === 'object' && sentInfo.messageId) { providerMessageId = sentInfo.messageId; }
      } else if (conv.active_channel === 'facebook' || conv.active_channel === 'instagram') {
         const { sendMetaMessage } = await import('./meta');
         if (!internalChannelAccountId) throw new Error("Could not find Meta page ID for this conversation");
         
         const { data: acc } = await supabase.from('crm_channel_accounts').select('external_account_id').eq('id', internalChannelAccountId).single();
         if (!acc) throw new Error("Account not found");

         const sentId = await sendMetaMessage(acc.external_account_id, identity.external_id, text, finalMediaUrlForDb, mediaType);
         providerMessageId = sentId || null;
      } else if (conv.active_channel === 'tiktok') {
         const { sendTikTokMessage } = await import('./tiktok');
         if (!internalChannelAccountId) throw new Error("Could not find TikTok account ID for this conversation");
         
         const { data: acc } = await supabase.from('crm_channel_accounts').select('external_account_id').eq('id', internalChannelAccountId).single();
         if (!acc) throw new Error("Account not found");

         await sendTikTokMessage(acc.external_account_id, identity.external_id, text);
         providerMessageId = null;
      } else {
         throw new Error(`Sending to ${conv.active_channel} is not implemented`);
      }

      // Update to sent
      const { data: updatedMsg } = await supabase
        .from('crm_messages')
        .update({ 
          status: 'sent', 
          media_url: finalMediaUrlForDb,
          external_message_id: providerMessageId || externalMessageId 
        })
        .eq('id', pendingMsg.id)
        .select('*')
        .single();

      // Update conversation's last_message and last_message_at
      await supabase.from('crm_conversations').update({
        last_message: text || (mediaUrl ? `[${mediaType}]` : '[mensaje]'),
        last_message_at: new Date().toISOString(),
        unread_count: 0
      }).eq('id', conv.id);

      // And optional contact update:
      await supabase.from('crm_contacts').update({
        last_interaction_at: new Date().toISOString()
      }).eq('id', conv.contact_id);

      res.json({ success: true, message: updatedMsg || pendingMsg });

    } catch (sendError: any) {
      // Update to failed
      await supabase
        .from('crm_messages')
        .update({ status: 'failed', raw: { error: sendError.message } })
        .eq('id', pendingMsg.id);
      
      throw sendError;
    }
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

router.get('/diagnostics/duplicates', async (req, res) => {
  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'DB no conectada' });

  try {
     const { data: contacts } = await supabase.from('crm_contacts').select('id, primary_phone, display_name');
     const byPhoneOrName: any = {};
     if (contacts) {
        for(const c of contacts) {
           let key = c.primary_phone ? c.primary_phone.replace(/\D/g, '') : null;
           if (!key && c.display_name) key = 'name:' + c.display_name.trim().toLowerCase();
           if (!key) continue;
           if (!byPhoneOrName[key]) byPhoneOrName[key] = [];
           byPhoneOrName[key].push(c);
        }
     }
     const phoneDups = Object.values(byPhoneOrName).filter((l: any) => l.length > 1);

     const { data: convs } = await supabase.from('crm_conversations').select('id, contact_id').eq('status', 'open');
     const byContact: any = {};
     if (convs) {
        for(const c of convs) {
           if (!byContact[c.contact_id]) byContact[c.contact_id] = [];
           byContact[c.contact_id].push(c);
        }
     }
     const convDups = Object.values(byContact).filter((l: any) => l.length > 1);

     res.json({
         by_phone: phoneDups,
         by_display_name: [],
         by_external_id: [],
         multiple_conversations_per_contact: convDups
     });
  } catch (error: any) {
     res.status(500).json({ error: error.message });
  }
});

router.post('/diagnostics/merge', async (req, res) => {
  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'DB no conectada' });

  try {
     let mergedContacts = 0;
     let mergedConversations = 0;

     // 1. Merge contacts
     const { data: contacts } = await supabase.from('crm_contacts').select('id, primary_phone, display_name').order('created_at', { ascending: true });
     if (contacts) {
        const byPhoneOrName: any = {};
        for(const c of contacts) {
           let key = c.primary_phone ? c.primary_phone.replace(/\D/g, '') : null;
           if (!key && c.display_name) key = 'name:' + c.display_name.trim().toLowerCase();
           if (!key) continue;
           if (!byPhoneOrName[key]) byPhoneOrName[key] = [];
           byPhoneOrName[key].push(c);
        }
        for(const pKey in byPhoneOrName) {
           const list = byPhoneOrName[pKey];
           if (list.length > 1) {
              const master = list[0];
              const others = list.slice(1).map((x:any) => x.id);
              await supabase.from('crm_messages').update({ contact_id: master.id }).in('contact_id', others);
              await supabase.from('crm_contact_identities').update({ contact_id: master.id }).in('contact_id', others);
              await supabase.from('crm_conversations').update({ contact_id: master.id }).in('contact_id', others);
              await supabase.from('crm_contacts').delete().in('id', others);
              mergedContacts += others.length;
           }
        }
     }

     // 2. Merge conversations
     const { data: convs } = await supabase.from('crm_conversations').select('id, contact_id').eq('status', 'open').order('created_at', { ascending: false });
     if (convs) {
        const byContact: any = {};
        for(const c of convs) {
           if (!byContact[c.contact_id]) byContact[c.contact_id] = [];
           byContact[c.contact_id].push(c);
        }
        for(const contactId in byContact) {
           const list = byContact[contactId];
           if (list.length > 1) {
              const master = list[0];
              const others = list.slice(1).map((x:any) => x.id);
              await supabase.from('crm_messages').update({ conversation_id: master.id }).in('conversation_id', others);
              await supabase.from('crm_conversations').update({ status: 'merged' }).in('id', others);
              mergedConversations += others.length;
           }
        }
     }

     res.json({ success: true, mergedContacts, mergedConversations });
  } catch (error: any) {
     res.status(500).json({ error: error.message });
  }
});

export default router;
