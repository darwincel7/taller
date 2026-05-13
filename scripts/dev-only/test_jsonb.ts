import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = "https://ruwcektpadeqovwtdixd.supabase.co";
const supabaseKey = "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase
    .from('orders')
    .select('id, createdAt, "partRequests"')
    .not('partRequests', 'is', null)
    .contains('partRequests', '[{"status": "PENDING"}]');
    
  console.log('Error:', error);
  console.log('Data:', data?.length);
}

test();
