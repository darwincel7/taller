import { supabase } from './services/supabase';

async function run() {
    const { data: acc, error } = await supabase.from('accounting_transactions').select('*').gte('created_at', '2026-05-12T00:00:00.000Z');
    console.log("Acc count:", acc?.length, acc?.map(a => `${a.type} ${a.amount} ${a.source} ${a.description}`));
}
run();
