import { supabase } from './services/supabase';

async function test() {
    const { count } = await supabase.from('accounting_transactions').select('*', { count: 'exact', head: true });
    console.log("Total accounting_transactions:", count);
}
test();
