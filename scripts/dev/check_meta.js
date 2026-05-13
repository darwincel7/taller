import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const raw = fs.readFileSync('firebase-applet-config.json', 'utf8');
const config = JSON.parse(raw);
const DB_URL = "https://ruwcektpadeqovwtdixd.supabase.co";
const DB_KEY = config.apiKey;

async function run() {
  const supabase = createClient(DB_URL, DB_KEY);
  const { error } = await supabase.from('orders').update({ metadata: {} }).eq('id', 'non-existing-id');
  if (error) {
     console.error("METADATA COL ERR:", error.message);
  } else {
     console.log("METADATA COL OK");
  }
}
run();
