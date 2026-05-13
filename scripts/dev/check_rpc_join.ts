import { supabase } from './services/supabase';

async function run() {
  const { data, error } = await supabase.rpc('get_payments_flat').select(`
      *,
      orders (
          partsCost,
          expenses
      )
    `);
  if (error) {
    console.error("ERROR", error);
  } else {
    console.log("SUCCESS", data?.[0]);
  }
}
run();
