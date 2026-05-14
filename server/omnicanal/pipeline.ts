import { NormalizedIncomingMessage, ChannelType } from './types';
import { getSupabase } from '../whatsapp';

export async function saveRawEvent(channel: ChannelType, eventType: string, raw: any) {
  const supabase = getSupabase();
  if (!supabase) return;

  try {
    await supabase.from('crm_raw_events').insert({
      channel,
      event_type: eventType,
      raw
    });
  } catch (error) {
    console.error('[Omnicanal Pipeline] Error saving raw event:', error);
  }
}

export async function startJobWorkers() {
  setInterval(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    
    // Pick pending jobs (limit 1 to avoid overload)
    const { data: jobs } = await supabase
      .from('crm_processing_jobs')
      .select('*')
      .eq('status', 'pending')
      .in('job_type', ['ai_summary', 'ai_suggest_reply'])
      .order('created_at', { ascending: true })
      .limit(1);

    if (jobs && jobs.length > 0) {
      const job = jobs[0];
      await supabase.from('crm_processing_jobs').update({ status: 'processing' }).eq('id', job.id);
      
      try {
        if (job.job_type === 'ai_summary') {
          const { data: conv } = await supabase.from('crm_conversations').select('contact_id').eq('id', job.reference_id).single();
          if (conv) {
             await updateAiSummary(conv.contact_id, job.reference_id);
          }
        } else if (job.job_type === 'ai_suggest_reply') {
           await processAiSuggestedReply(job.reference_id!);
        }
        await supabase.from('crm_processing_jobs').update({ status: 'completed' }).eq('id', job.id);
      } catch (err) {
        await supabase.from('crm_processing_jobs').update({ status: 'failed', payload: { error: String(err) } }).eq('id', job.id);
      }
    }
  }, 10000); // Check every 10 seconds
}

export async function resolveContactIdentity(msg: NormalizedIncomingMessage) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('No DB');

  let phone = null;
  const rawId = msg.externalSenderId || '';
  
  // Extract canonical phone if possible
  const cleanNum = rawId.replace(/\D/g, '');
  if (cleanNum && cleanNum.length >= 10) {
     if (cleanNum.match(/^(1)?(809|829|849)\d{7}$/)) {
        phone = cleanNum.length === 10 ? '1' + cleanNum : cleanNum;
     } else if (cleanNum.length >= 10) {
        phone = cleanNum; // other country codes
     }
  }

  // Fallback check in raw data (e.g. senderPn, participant)
  const raw = msg.raw || {};
  const participant = raw.key?.participant || raw.participant;
  const participantAlt = raw.key?.participantAlt || raw.participantAlt;
  const senderPn = raw.key?.senderPn || raw.senderPn;
  const remoteJidAlt = raw.key?.remoteJidAlt || raw.remoteJidAlt;
  
  if (!phone && (participant || participantAlt || senderPn || remoteJidAlt)) {
      const altNum = (participantAlt || participant || senderPn || remoteJidAlt).replace(/\D/g, '');
      if (altNum && altNum.length >= 10) phone = altNum.length === 10 && altNum.match(/^(809|829|849)\d{7}$/) ? '1' + altNum : altNum;
  }

  let contactId = null;

  // 1. Find by exact channel + external_id
  const { data: exactIdentity } = await supabase.from('crm_contact_identities')
    .select('contact_id').eq('channel', msg.channel).eq('external_id', msg.externalSenderId).limit(1).maybeSingle();
  if (exactIdentity) contactId = exactIdentity.contact_id;

  // 2. If not found, try by canonical phone
  if (!contactId && phone) {
      const { data: phoneIdentity } = await supabase.from('crm_contact_identities')
        .select('contact_id').eq('phone', phone).limit(1).maybeSingle();
      if (phoneIdentity) contactId = phoneIdentity.contact_id;
      
      if (!contactId) {
         const { data: primaryContact } = await supabase.from('crm_contacts')
            .select('id').eq('primary_phone', phone).limit(1).maybeSingle();
         if (primaryContact) contactId = primaryContact.id;
      }
  }

  // 3. Create if not found
  if (!contactId) {
      const { data: newContact, error: contactError } = await supabase
        .from('crm_contacts')
        .insert({
          display_name: msg.senderName || msg.username || msg.externalSenderId,
          primary_phone: phone,
          source_first_seen: msg.channel
        })
        .select('id')
        .single();
        
      if (contactError) throw contactError;
      contactId = newContact.id;
  }

  // Upsert Identity
  if (!exactIdentity) {
      await supabase.from('crm_contact_identities').insert({
          contact_id: contactId,
          channel: msg.channel,
          external_id: msg.externalSenderId,
          phone: phone || null,
          display_name: msg.senderName,
          username: msg.username,
          raw: msg.raw
      });
  } else if (phone) {
      await supabase.from('crm_contact_identities').update({ phone }).eq('channel', msg.channel).eq('external_id', msg.externalSenderId);
  }

  return contactId;
}

export async function processIncomingMessage(msg: NormalizedIncomingMessage) {
  const supabase = getSupabase();
  if (!supabase) return;

  try {
    // 1. Cortar flujo si el mensaje ya existe
    const { data: existingMsg } = await supabase.from('crm_messages')
      .select('id')
      .eq('channel', msg.channel)
      .eq('external_message_id', msg.externalMessageId)
      .limit(1)
      .maybeSingle();

    if (existingMsg) {
      console.log(`[Omnicanal Pipeline] Ignorando mensaje duplicado ${msg.externalMessageId}`);
      return;
    }

    // 2. Busca o crea contacto e identidad (Fase 2)
    const contactId = await resolveContactIdentity(msg);

    // 3. Busca conversacion abierta por contact_id primero (Fase 3)
    let conversationId = null;
    let existingConv = null;

    const { data: openConvs } = await supabase
      .from('crm_conversations')
      .select('id, assigned_to, created_at, unread_count')
      .eq('contact_id', contactId)
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (openConvs && openConvs.length > 0) {
      existingConv = openConvs[0];
      conversationId = existingConv.id;
      
      // Merge si hay varias
      if (openConvs.length > 1) {
         const masterId = conversationId;
         const toMerge = openConvs.slice(1).map(c => c.id);
         
         await supabase.from('crm_messages').update({ conversation_id: masterId }).in('conversation_id', toMerge);
         await supabase.from('crm_conversations').update({ status: 'merged', updated_at: new Date().toISOString() }).in('id', toMerge);
      }
      
      // Actualizar ultima interacción y cambiar el active_channel al canal del ultimo msj
      await supabase.from('crm_conversations').update({
        last_message: msg.text || `[${msg.messageType}]`,
        last_message_at: msg.createdAt,
        active_channel: msg.channel,
        unread_count: (existingConv.unread_count || 0) + 1
      }).eq('id', conversationId);
      
      await supabase.from('crm_contacts').update({
        last_interaction_at: msg.createdAt
      }).eq('id', contactId);
    } else {
      // Crear nueva conversación
      const { data: newConv, error: convError } = await supabase
        .from('crm_conversations')
        .insert({
          contact_id: contactId,
          active_channel: msg.channel,
          last_message: msg.text || `[${msg.messageType}]`,
          last_message_at: msg.createdAt,
          source: msg.channel,
          unread_count: 1
        })
        .select('id, assigned_to')
        .single();
        
      if (convError) throw convError;
      conversationId = newConv.id;
    }

    // Get channel_account_id if we have channelAccountId from msg
    let internalChannelAccountId = null;
    if (msg.channelAccountId) {
       const { data: acc } = await supabase.from('crm_channel_accounts').select('id').eq('external_account_id', msg.channelAccountId).maybeSingle();
       if (acc) internalChannelAccountId = acc.id;
    }

    // 4. Guarda mensaje
    const { data: savedMsg, error: msgError } = await supabase
      .from('crm_messages')
      .insert({
        conversation_id: conversationId,
        contact_id: contactId,
        channel: msg.channel,
        channel_account_id: internalChannelAccountId,
        external_message_id: msg.externalMessageId,
        external_conversation_id: msg.externalConversationId,
        direction: 'inbound',
        message_type: msg.messageType,
        text: msg.text,
        media_url: msg.mediaUrl,
        media_mime: msg.mediaMime,
        raw: msg.raw,
        created_at: msg.createdAt,
        status: 'received'
      })
      .select('id')
      .single();

    if (msgError) {
      if (msgError.code === '23505') {
        console.log(`[PIPELINE] Mensaje duplicado omitido: ${msg.externalMessageId}`);
        return;
      }
      throw msgError;
    }

    // 4.1 Process Media if present
    if (msg.messageType !== 'text' && (msg.mediaUrl || msg.raw.media_id)) {
       handleMediaStorage(savedMsg.id, msg).catch(e => console.error('[Pipeline Media] Error:', e));
    }

    // 5. Detecta telefonos en texto
    if (msg.text) {
      await detectPhoneNumbers(msg.text, contactId, conversationId, savedMsg?.id);
    }

    // 6. Actualiza resumen IA mediante jobs
    await queueAiSummary(conversationId);
    await queueAiSuggestedReply(conversationId);

    // 7. Asigna vendedor solo si assigned_to es null
    if (!existingConv || !existingConv.assigned_to) {
      assignAgent(conversationId);
    }

    // 8. Emite realtime
    // Supabase REALTIME will handle this if the client is subscribed to crm_messages

  } catch (error) {
    console.error('[Omnicanal Pipeline] Error processing incoming message:', error);
  }
}

async function handleMediaStorage(messageId: string, msg: NormalizedIncomingMessage) {
    const supabase = getSupabase();
    if (!supabase) return;

    try {
        let buffer: Buffer | null = null;
        let mime = msg.mediaMime || 'application/octet-stream';
        
        // If it's a URL we can download it (Meta/TikTok)
        if (msg.mediaUrl && msg.mediaUrl.startsWith('http')) {
            const resp = await fetch(msg.mediaUrl);
            if (resp.ok) {
                buffer = Buffer.from(await resp.arrayBuffer());
                mime = resp.headers.get('content-type') || mime;
            }
        } 
        // If it's base64 (coming from legacy WhatsApp logic)
        else if (msg.mediaUrl && msg.mediaUrl.startsWith('data:')) {
            const matches = msg.mediaUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                mime = matches[1];
                buffer = Buffer.from(matches[2], 'base64');
            }
        }
        
        // WhatsApp handled by adapter usually, but if we have it in raw.buffer we could use it
        // For now, let's support what we can.

        if (buffer) {
            const ext = mime.split('/')[1] || 'bin';
            const fileName = `${msg.channel}/${messageId}.${ext}`;
            
            const { error: uploadError } = await supabase.storage
                .from('crm-media')
                .upload(fileName, buffer, { contentType: mime, upsert: true });

            if (!uploadError) {
                const { data: { publicUrl } } = supabase.storage.from('crm-media').getPublicUrl(fileName);
                
                await supabase.from('crm_messages').update({ media_url: publicUrl }).eq('id', messageId);
                
                await supabase.from('crm_media_assets').insert({
                    message_id: messageId,
                    channel: msg.channel,
                    file_name: fileName,
                    mime_type: mime,
                    size_bytes: buffer.length,
                    storage_path: fileName,
                    public_url: publicUrl,
                    source: 'inbound'
                });
            }
        }
    } catch (e) {
        console.error('[Media Storage] Failed to store media:', e);
    }
}

async function detectPhoneNumbers(text: string, contactId: string, conversationId: string, messageId?: string) {
  const patterns = [
    /(?:\+?1)?\s?\(?8(?:09|29|49)\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    /\b(?:809|829|849)[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    /\b1(?:809|829|849)\d{7}\b/g
  ];
  
  const candidates = new Set<string>();
  for (const pattern of patterns) {
    const matches = text.match(pattern) || [];
    for (const match of matches) {
      const clean = match.replace(/\D/g, '');
      if (clean.length >= 10) {
        let finalPhone = clean;
        if (clean.length === 10) finalPhone = '1' + clean;
        candidates.add(finalPhone);
      }
    }
  }

  if (candidates.size > 0) {
    const supabase = getSupabase();
    if (!supabase) return;
    
    for (const phone of candidates) {
      await supabase.from('crm_detected_contact_data').insert({
        contact_id: contactId,
        conversation_id: conversationId,
        message_id: messageId,
        data_type: 'phone',
        value: phone,
        confidence: 0.8
      });
      
      // Update primary phone if not set
      const { data: contact } = await supabase.from('crm_contacts').select('primary_phone').eq('id', contactId).single();
      if (contact && !contact.primary_phone) {
         await supabase.from('crm_contacts').update({ primary_phone: phone }).eq('id', contactId);
      }
    }
  }
}

// Stubs for future implementation
import { GoogleGenAI, Type } from "@google/genai";

async function queueAiSuggestedReply(conversationId: string) {
  const supabase = getSupabase();
  if (!supabase) return;
  
  const { data: existing } = await supabase
    .from('crm_processing_jobs')
    .select('id')
    .eq('job_type', 'ai_suggest_reply')
    .eq('reference_id', conversationId)
    .in('status', ['pending', 'processing'])
    .maybeSingle();

  if (existing) return;

  await supabase.from('crm_processing_jobs').insert({
    job_type: 'ai_suggest_reply',
    reference_id: conversationId,
    status: 'pending'
  });
}

async function processAiSuggestedReply(conversationId: string) {
    const supabase = getSupabase();
    if (!supabase) return;

    const key = process.env.GEMINI_API_KEY;
    if (!key) return;

    const { data: messages } = await supabase
      .from('crm_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (!messages || messages.length === 0) return;

    const chatLog = messages.reverse().map(m => `${m.source === 'inbound' ? 'Cliente' : 'Asistente'}: ${m.text || '[Multimedia]'}`).join('\n');
    
    const prompt = `Actúa como un experto en ventas de una tienda de regalos. Sugiere una respuesta perfecta para el cliente.
    Responde ÚNICAMENTE con la sugerencia en formato JSON plano: { "suggestion": "..." }
    Chat actual:
    ${chatLog}`;

    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const jsonStr = response.text?.trim();
    if (!jsonStr) return;

    try {
      const result = JSON.parse(jsonStr);
      if (result.suggestion) {
         await supabase.from('crm_conversations').update({ 
            ai_suggested_reply: result.suggestion,
            ai_suggestion_updated_at: new Date().toISOString()
         }).eq('id', conversationId);
      }
    } catch(e) {}
}

async function queueAiSummary(conversationId: string) {
  const supabase = getSupabase();
  if (!supabase) return;
  
  // Anti-duplicado: No insertar si ya hay uno pendiente o procesando
  const { data: existing } = await supabase
    .from('crm_processing_jobs')
    .select('id')
    .eq('job_type', 'ai_summary')
    .eq('reference_id', conversationId)
    .in('status', ['pending', 'processing'])
    .maybeSingle();

  if (existing) return;

  await supabase.from('crm_processing_jobs').insert({
    job_type: 'ai_summary',
    reference_id: conversationId,
    status: 'pending'
  });
}

const getAiClient = () => {
    let key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("API Key not found in environment.");
    
    // Strip quotes if they were accidentally included and trim
    key = key.replace(/['"]/g, '').trim();
    
    return new GoogleGenAI({ apiKey: key });
};

async function updateAiSummary(contactId: string, conversationId: string) {
  const supabase = getSupabase();
  if (!supabase) return;

  try {
    // Tomar los últimos 10 mensajes
    const { data: messages } = await supabase
      .from('crm_messages')
      .select('text, direction, message_type, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (!messages || messages.length === 0) return;

    // Invertir para orden cronológico
    messages.reverse();
    const chatLog = messages.map(m => `[${m.direction}] ${m.message_type === 'text' ? m.text : '<multimedia>'}`).join('\n');

    const prompt = `Analiza esta conversacion de venta.
Devuelve JSON con la estructura exacta:
- resumen_cliente: string
- producto_interes: string (o null)
- objeciones: array de strings
- presupuesto: string (o null)
- urgencia: string (o null)
- sentimiento: string
- probabilidad_compra: numero (0-100)
- siguiente_mejor_accion: string
- respuesta_sugerida: string
No inventes datos. Si no sabes algo, usa null.

Conversación:
${chatLog}`;

    const key = process.env.GEMINI_API_KEY;
    if (!key) {
       console.warn('[Omnicanal IA] No GEMINI_API_KEY, skipping summary update');
       return;
    }
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
             resumen_cliente: { type: Type.STRING, nullable: true },
             producto_interes: { type: Type.STRING, nullable: true },
             objeciones: { type: Type.ARRAY, items: { type: Type.STRING } },
             presupuesto: { type: Type.STRING, nullable: true },
             urgencia: { type: Type.STRING, nullable: true },
             sentimiento: { type: Type.STRING, nullable: true },
             probabilidad_compra: { type: Type.NUMBER, nullable: true },
             siguiente_mejor_accion: { type: Type.STRING, nullable: true },
             respuesta_sugerida: { type: Type.STRING, nullable: true },
          }
        }
      }
    });

    const jsonStr = response.text?.trim();
    if (!jsonStr) return;

    const insight = JSON.parse(jsonStr);

    // Guardar en crm_ai_insights
    const { data: existing } = await supabase.from('crm_ai_insights').select('id').eq('conversation_id', conversationId).single();

    if (existing) {
       await supabase.from('crm_ai_insights').update({
           summary: insight.resumen_cliente,
           objections: insight.objeciones,
           interests: insight.producto_interes ? [insight.producto_interes] : [],
           intent: insight.probabilidad_compra?.toString() || null,
           sentiment: insight.sentimiento,
           next_best_action: insight.siguiente_mejor_accion,
           suggested_response: insight.respuesta_sugerida,
           confidence: insight.probabilidad_compra ? insight.probabilidad_compra / 100 : 0.5,
           updated_at: new Date().toISOString()
       }).eq('id', existing.id);
    } else {
       await supabase.from('crm_ai_insights').insert({
           contact_id: contactId,
           conversation_id: conversationId,
           summary: insight.resumen_cliente,
           objections: insight.objeciones,
           interests: insight.producto_interes ? [insight.producto_interes] : [],
           intent: insight.probabilidad_compra?.toString() || null,
           sentiment: insight.sentimiento,
           next_best_action: insight.siguiente_mejor_accion,
           suggested_response: insight.respuesta_sugerida,
           confidence: insight.probabilidad_compra ? insight.probabilidad_compra / 100 : 0.5
       });
    }

    // Actualizar crm_contacts.ai_summary y demás si es útil
    await supabase.from('crm_contacts').update({
       ai_summary: insight.resumen_cliente,
       ai_objections: insight.objeciones,
       ai_interests: insight.producto_interes ? [insight.producto_interes] : [],
       ai_budget: insight.presupuesto,
       ai_urgency: insight.urgencia,
       ai_sentiment: insight.sentimiento
    }).eq('id', contactId);

  } catch (error) {
    console.error('Error in updateAiSummary:', error);
  }
}

import { assignAgent as performAssign } from './ruleEngine';
async function assignAgent(conversationId: string) {
  await performAssign(conversationId);
}
