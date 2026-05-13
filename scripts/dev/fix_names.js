import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const raw = fs.readFileSync('firebase-applet-config.json', 'utf8');
const config = JSON.parse(raw);
const DB_URL = "https://ruwcektpadeqovwtdixd.supabase.co";
const DB_KEY = config.apiKey;

async function run() {
  const supabase = createClient(DB_URL, DB_KEY);
  const { data: items } = await supabase.from('inventory_parts').select('id, name, category');
  
  if (!items) {
      console.log("No items found or err"); return;
  }
  let count = 0;
  for (const item of items) {
     let newName = item.name;
     if (newName.includes('(IMEI:')) {
         newName = newName.substring(0, newName.indexOf('(IMEI:')).trim();
     } else if (newName.includes('(S/N:')) {
         newName = newName.substring(0, newName.indexOf('(S/N:')).trim();
     }
     
     if (newName !== item.name) {
         console.log(`Fixing ${item.id}: "${item.name}" -> "${newName}"`);
         await supabase.from('inventory_parts').update({ name: newName }).eq('id', item.id);
         count++;
     }
  }
  console.log(`Fixed ${count} records.`);
}
run();
