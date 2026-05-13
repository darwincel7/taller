import { supabase } from './services/supabase';

async function test() {
    const end = Date.now();
    const start = end - (200 * 24 * 60 * 60 * 1000); 

    const { data: at_raw } = await supabase.from('accounting_transactions')
      .select('id, amount, source, created_at, status, description, created_by, branch')
      .gte('created_at', new Date(start).toISOString())
      .order('created_at', { ascending: false })
      .limit(30);

    console.log("Recent expenses:", at_raw?.map(x => ({ ...x, amount: Number(x.amount) })));
}
test();
