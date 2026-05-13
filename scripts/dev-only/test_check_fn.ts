import { supabase } from './services/supabase';

async function test() {
    const { data: cols } = await supabase.from('pg_proc').select('proname, prosrc').eq('proname', 'delete_cash_closing');
    console.log(cols?.[0]?.prosrc);
}
test();
