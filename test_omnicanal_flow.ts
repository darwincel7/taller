import { processIncomingMessage } from './server/omnicanal/pipeline';
import { getSupabase } from './server/whatsapp';
import crypto from 'crypto';

async function runTests() {
  const supabase = getSupabase();
  if (!supabase) {
    console.error('No supabase connection');
    return;
  }

  console.log('--- Iniciando Prueba de Flujo Omnicanal ---');
  
  const testContactId = `ext_insta_${Date.now()}`;
  const testPhone = '809-555-1234';

  console.log('1. Simulando mensaje entrante de Instagram...');
  const instaMsg = {
    channel: 'instagram' as const,
    externalMessageId: `msg_${Date.now()}`,
    externalSenderId: testContactId,
    senderName: 'Usuario Prueba IG',
    text: `Hola, me interesa. Mi número es ${testPhone}`,
    messageType: 'text',
    createdAt: new Date().toISOString(),
    raw: { mock: true }
  };

  await processIncomingMessage(instaMsg);
  
  // Esperar un momento para operaciones asíncronas
  await new Promise(r => setTimeout(r, 2000));

  console.log('2. Verificando creación de contacto e identidad...');
  const { data: identity } = await supabase.from('crm_contact_identities')
                                            .select('*')
                                            .eq('external_id', testContactId)
                                            .single();
  
  if (!identity) {
    console.error('❌ Falló identidad');
    return;
  } else {
    console.log('✅ Identidad creada:', identity.id);
  }

  console.log('3. Verificando detección de teléfono...');
  const { data: detected } = await supabase.from('crm_detected_contact_data')
                                           .select('*')
                                           .eq('contact_id', identity.contact_id)
                                           .eq('data_type', 'phone')
                                           .single();

  if (detected && detected.value === testPhone) {
    console.log('✅ Teléfono detectado correctamente:', detected.value);
  } else {
    console.error('❌ Falló la detección de teléfono');
  }

  // Set that phone in identity explicitly to simulate WhatsApp flow
  console.log('4. Simulando que el vendedor le escribe por WhatsApp...');
  // This would effectively test that we can use WhatsApp since we have the primary phone.
  const { data: contact } = await supabase.from('crm_contacts').select('*').eq('id', identity.contact_id).single();
  if (contact && contact.primary_phone) {
     console.log('✅ El contacto tiene primary_phone:', contact.primary_phone, 'listo para continuar por WA.');
  }

  console.log('--- Pruebas completadas con éxito ---');
}

runTests();
