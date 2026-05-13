import { supabase } from './services/supabase';

async function test() {
    const { data: at_raw } = await supabase.from('accounting_transactions').select('source, status, created_at').order('created_at', { ascending: false }).limit(100);
    const sources = [...new Set(at_raw?.map(x => x.source))];
    const statuses = [...new Set(at_raw?.map(x => x.status))];
    console.log("Sources manually:", sources);
    console.log("Statuses manually:", statuses);

    const { data: expenses } = await supabase.from('accounting_transactions').select('*').limit(5);
    console.log("Samples:", expenses)
}
test();
