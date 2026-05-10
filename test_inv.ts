import { supabase } from './services/supabase';

async function run() {
  const { data: all } = await supabase.from('inventory_parts').select('*');
  console.log("Total parts:", all?.length);
  
  const { data: filtered1 } = await supabase.from('inventory_parts').select('*').is('deleted_at', null);
  console.log("Not deleted:", filtered1?.length);

  const { data: filtered2, error } = await supabase.from('inventory_parts').select('*').is('deleted_at', null).neq('status', 'archived');
  console.log("Not deleted & neq archived:", filtered2?.length, error?.message);
  
  const { data: types } = await supabase.from('inventory_parts').select('status');
  console.log("Statuses:", [...new Set((types || []).map(t => t.status))]);
}
run();
