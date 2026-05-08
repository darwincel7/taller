import { supabase } from './services/supabase';

async function run() {
  const { data, error } = await supabase.rpc('get_tables');
  if (error) {
    console.error(error);
  } else {
    console.log(data);
  }
}
run();
