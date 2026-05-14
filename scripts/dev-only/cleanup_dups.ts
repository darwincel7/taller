import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://ruwcektpadeqovwtdixd.supabase.co";
const finalUrl = supabaseUrl.startsWith('http') ? supabaseUrl : `https://${supabaseUrl}.supabase.co`;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";

const supabase = createClient(finalUrl, supabaseKey);

async function run() {
  console.log("Fetching open conversations...");
  // Now merge duplicate contacts by primary_phone
  console.log("Fetching contacts...");
  const { data: contacts, error: ec } = await supabase.from('crm_contacts').select('id, primary_phone, created_at, display_name').order('created_at', { ascending: true });
  
  if (contacts) {
     const byPhoneOrName: any = {};
     for(const c of contacts) {
        let key = c.primary_phone ? c.primary_phone.replace(/\D/g, '') : null;
        if (!key && c.display_name) {
           key = 'name:' + c.display_name.trim().toLowerCase();
        }
        if (!key) continue;
        
        if (!byPhoneOrName[key]) byPhoneOrName[key] = [];
        byPhoneOrName[key].push(c);
     }
     
     let mergedContacts = 0;
     for(const pKey in byPhoneOrName) {
        const list = byPhoneOrName[pKey];
        if (list.length > 1) {
           console.log(`Key ${pKey} has ${list.length} contacts (${list.map((c:any) => c.display_name).join(', ')})`);
           const master = list[0];
           const others = list.slice(1).map((x:any) => x.id);
           
           console.log(`Merging ${others.length} contacts into ${master.id}`);
           
           const { error: eMsg } = await supabase.from('crm_messages').update({ contact_id: master.id }).in('contact_id', others);
           if (eMsg) console.error("Messages update err", eMsg);

           const { error: e3 } = await supabase.from('crm_contact_identities').update({ contact_id: master.id }).in('contact_id', others);
           if (e3) console.error("Identity update err", e3);

           const { error: e4 } = await supabase.from('crm_conversations').update({ contact_id: master.id }).in('contact_id', others);
           if (e4) console.error("Conv update err", e4);
           
           const { error: e5 } = await supabase.from('crm_contacts').delete().in('id', others);
           if (e5) console.error("Delete err", e5);
           
           mergedContacts += others.length;
        }
     }
     console.log(`Merged ${mergedContacts} duplicate contacts.`);
  }

  // Now group conversations again
  const { data: convs, error: e1 } = await supabase.from('crm_conversations').select('id, contact_id, status, created_at, updated_at').eq('status', 'open').order('created_at', { ascending: false });
  if (e1) { console.error("Error fetching", e1); return; }
  
  if (!convs) return;
  
  // Group by contact_id
  const byContact: any = {};
  for(const c of convs) {
     if (!byContact[c.contact_id]) byContact[c.contact_id] = [];
     byContact[c.contact_id].push(c);
  }
  
  let mergedCount = 0;
  for(const contactId in byContact) {
     const list = byContact[contactId];
     if (list.length > 1) {
        console.log(`Contact ${contactId} has ${list.length} open conversations`);
        // The first one is the most recent (sorted by created_at desc)
        const master = list[0];
        const others = list.slice(1).map((x: any) => x.id);
        
        console.log(`Merging ${others.length} conversations into ${master.id}`);
        const { error: eUpdate } = await supabase.from('crm_messages').update({ conversation_id: master.id }).in('conversation_id', others);
        if (eUpdate) console.error("Error updating messages", eUpdate);
        
        const { error: eClose } = await supabase.from('crm_conversations').update({ status: 'merged' }).in('id', others);
        if (eClose) console.error("Error updating conversations", eClose);
        
        mergedCount += others.length;
     }
  }
  
  console.log(`Merged ${mergedCount} duplicate conversations.`);
}

run();
