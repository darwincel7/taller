import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://ruwcektpadeqovwtdixd.supabase.co', 'sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_');

async function check() {
  const { data, error } = await supabase.from('users').select('*');
  if (error) {
    console.error("Error fetching users:", error);
  } else {
    console.log("Users:", data);
  }
}

check();
