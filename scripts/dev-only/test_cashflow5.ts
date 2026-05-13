import { supabase } from './services/supabase';

async function test() {
    let accQuery = supabase.from('accounting_transactions').select('*, accounting_categories(name)').eq('status', 'COMPLETED');
    accQuery = accQuery.gte('transaction_date', '2025-12-01').limit(5000);
    
    const { data: raw } = await accQuery;
    console.log("Supabase returned total rows:", raw?.length);
    const mayTx = raw?.filter(t => t.transaction_date && t.transaction_date.startsWith('2026-05'));
    console.log("Supabase mayTx length:", mayTx?.length);
}
test();
