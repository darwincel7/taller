import { supabase } from './services/supabase';

async function run() {
  const { data, error } = await supabase.rpc('get_payments_flat', {
     p_start: null,
     p_end: null,
     p_cashier_id: null,
     p_branch: null,
     p_pending_only: true,
     p_closing_id: null
  });
  console.log("Pending payments:", data?.length, error);

  const { data: data2, error: error2 } = await supabase.rpc('get_payments_flat', {
     p_start: null,
     p_end: null,
     p_cashier_id: null,
     p_branch: null,
     p_pending_only: false,
     p_closing_id: null
  });
  console.log("All payments:", data2?.length, error2);
}
run();
