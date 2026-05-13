import { supabase } from './services/supabase';

async function test() {
    const { data: maybeNull } = await supabase.from('accounting_transactions')
        .select('id, amount, closing_id')
        .gte('transaction_date', '2026-05-08');
    
    console.log("May 8-9 expenses closing_id:");
    const expenses = maybeNull?.filter(x => x.amount < 0) || [];
    console.log(expenses.slice(0, 10));
}
test();
