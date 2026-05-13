import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

let supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://ruwcektpadeqovwtdixd.supabase.co";
if (supabaseUrl && !supabaseUrl.startsWith('http')) {
   supabaseUrl = `https://${supabaseUrl}.supabase.co`;
}
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Iniciando migracion de WhatsApp a Omnicanal...');

  // 1. Obtener conversaciones WA
  const { data: waConvs, error: waConvError } = await supabase.from('whatsapp_conversations').select('*');
  if (waConvError) {
     console.error('Error obteniendo wa convs', waConvError);
     return;
  }

  console.log(`Encontradas ${waConvs?.length} conversaciones de WA.`);

  for (const conv of waConvs || []) {
      // asumiendo telefono = conv.phone
      const cleanPhone = conv.phone.replace(/\D/g, '');
      const externalId = conv.phone.includes('@') ? conv.phone : `${cleanPhone}@s.whatsapp.net`;

      // 2. Buscar o crear contacto
      let contactId: string;
      const { data: existingId } = await supabase.from('crm_contact_identities')
         .select('contact_id').eq('channel', 'whatsapp').eq('external_id', externalId).single();
      
      if (existingId) {
         contactId = existingId.contact_id;
      } else {
         const { data: newContact, error: contactError } = await supabase.from('crm_contacts').insert({
             full_name: conv.name || 'Cliente WA',
             display_name: conv.name || cleanPhone,
             primary_phone: cleanPhone,
             source_first_seen: 'whatsapp'
         }).select('*').single();

         if (contactError) {
            console.error('Error creando contacto', contactError);
            continue;
         }
         contactId = newContact.id;

         await supabase.from('crm_contact_identities').insert({
             contact_id: contactId,
             channel: 'whatsapp',
             external_id: externalId,
             display_name: conv.name,
             phone: cleanPhone
         });
      }

      // 3. Crear conversacion
      const { data: newConv, error: newConvError } = await supabase.from('crm_conversations').insert({
          contact_id: contactId,
          active_channel: 'whatsapp',
          last_message: conv.last_message,
          last_message_at: conv.last_message_at,
          unread_count: conv.unread_count,
          source: 'whatsapp'
      }).select('*').single();

      if (newConvError || !newConv) {
          console.error('Error creando conversacion omnicanal', newConvError);
          continue;
      }

      // 4. Migrar mensajes
      const { data: waMsgs } = await supabase.from('whatsapp_messages').select('*').eq('conversation_id', conv.id);
      if (waMsgs && waMsgs.length > 0) {
          const insertPayloads = waMsgs.map(m => ({
              conversation_id: newConv.id,
              contact_id: contactId,
              channel: 'whatsapp',
              external_message_id: m.message_id || `mig-${m.id}`,
              direction: m.direction === 'inbound' ? 'inbound' : 'outbound',
              message_type: m.message_type || 'text',
              text: m.text_content || '',
              media_url: m.media_url,
              status: m.status || 'received',
              created_at: m.created_at
          }));

          // Ignoramos errores de duplicados (dependiendo del external_message_id) 
          // insert multiples
          for (const payload of insertPayloads) {
              await supabase.from('crm_messages').upsert(payload, { onConflict: 'channel, external_message_id', ignoreDuplicates: true });
          }
      }
  }

  console.log('Migración completada.');
}

run();
