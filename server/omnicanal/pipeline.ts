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
    
    // Pick pending ai_summary jobs (limit 1 to avoid overload)
    const { data: jobs } = await supabase
      .from('crm_processing_jobs')
      .select('*')
      .eq('status', 'pending')
      .eq('job_type', 'ai_summary')
      .order('created_at', { ascending: true })
      .limit(1);

    if (jobs && jobs.length > 0) {
      const job = jobs[0];
      await supabase.from('crm_processing_jobs').update({ status: 'processing' }).eq('id', job.id);
      
      try {
        const { data: conv } = await supabase.from('crm_conversations').select('contact_id').eq('id', job.reference_id).single();
        if (conv) {
           await updateAiSummary(conv.contact_id, job.reference_id);
        }
        await supabase.from('crm_processing_jobs').update({ status: 'completed' }).eq('id', job.id);
      } catch (err) {
        await supabase.from('crm_processing_jobs').update({ status: 'failed', payload: { error: String(err) } }).eq('id', job.id);
      }
    }
  }, 10000); // Check every 10 seconds
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
      .single();

    if (existingMsg) {
      console.log(`[Omnicanal Pipeline] Ignorando mensaje duplicado ${msg.externalMessageId}`);
      return;
    }

    // 2. Busca o crea contacto e identidad
    let contactId = null;

    const { data: existingIdentity } = await supabase
      .from('crm_contact_identities')
      .select('contact_id')
      .eq('channel', msg.channel)
      .eq('external_id', msg.externalSenderId)
      .single();

    if (existingIdentity) {
      contactId = existingIdentity.contact_id;
    } else {
      // Crear nuevo contacto
      const { data: newContact, error: contactError } = await supabase
        .from('crm_contacts')
        .insert({
          display_name: msg.senderName || msg.username || msg.externalSenderId,
          source_first_seen: msg.channel
        })
        .select('id')
        .single();
        
      if (contactError) throw contactError;
      contactId = newContact.id;

      // Crear nueva identidad
      await supabase
        .from('crm_contact_identities')
        .insert({
          contact_id: contactId,
          channel: msg.channel,
          external_id: msg.externalSenderId,
          display_name: msg.senderName,
          username: msg.username,
          raw: msg.raw
        });
    }

    // 3. Busca o crea conversacion (solo por contact_id, no se pide canal)
    let conversationId = null;
    const { data: existingConv } = await supabase
      .from('crm_conversations')
      .select('id, assigned_to')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existingConv) {
      conversationId = existingConv.id;
      // Actualizar ultima interacción y cambiar el active_channel al canal del ultimo msj
      await supabase.from('crm_conversations').update({
        last_message: msg.text || `[${msg.messageType}]`,
        last_message_at: msg.createdAt,
        status: 'open',
        active_channel: msg.channel
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
          source: msg.channel
        })
        .select('id, assigned_to')
        .single();
        
      if (convError) throw convError;
      conversationId = newConv.id;
    }

    // Get channel_account_id if we have channelAccountId from msg
    let internalChannelAccountId = null;
    if (msg.channelAccountId) {
       const { data: acc } = await supabase.from('crm_channel_accounts').select('id').eq('external_account_id', msg.channelAccountId).single();
       if (acc) internalChannelAccountId = acc.id;
    }

    // 4. Guarda mensaje
    const { error: msgError } = await supabase
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
        created_at: msg.createdAt
      });

    if (msgError) {
      if (msgError.code === '23505') {
        console.log(`[PIPELINE] Mensaje duplicado omitido: ${msg.externalMessageId}`);
        return;
      }
      throw msgError;
    }

    // 5. Detecta telefonos en texto
    if (msg.text) {
      await detectPhoneNumbers(msg.text, contactId, conversationId, msg.externalMessageId); // msg.id is missing but we can use external_message_id
    }

    // 6. Actualiza resumen IA mediante jobs
    await queueAiSummary(conversationId);

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

async function queueAiSummary(conversationId: string) {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.from('crm_processing_jobs').insert({
    job_type: 'ai_summary',
    reference_id: conversationId,
    status: 'pending'
  });
}

const getAiClient = () => {
    let key = process.env.GEMINI_API_KEY!;
    if (!key) throw new Error("API Key not found in environment.");
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

    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: prompt }] },
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
