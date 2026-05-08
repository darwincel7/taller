import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const raw = fs.readFileSync('firebase-applet-config.json', 'utf8');
const config = JSON.parse(raw);
const DB_URL = "https://ruwcektpadeqovwtdixd.supabase.co";
const DB_KEY = config.apiKey;

async function run() {
  const supabase = createClient(DB_URL, DB_KEY);
  // Just try selecting one record and print its keys
  const { data, error } = await supabase.from('orders').select('*').limit(1);
  if (error) {
     console.error(error);
  } else {
     console.log(Object.keys(data[0] || {}));
  }
}
run();
