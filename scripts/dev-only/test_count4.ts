import { supabase } from './services/supabase';

async function test() {
    const { count } = await supabase.from('accounting_transactions').select('*', { count: 'exact', head: true }).gte('transaction_date', '2025-12-01');
    console.log("Total accounting_transactions since dec:", count);
}
test();
