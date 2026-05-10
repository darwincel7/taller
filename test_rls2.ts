import { supabase } from './services/supabase';

async function test() {
    const { data: policies } = await supabase.from('pg_policies').select('*').limit(10);
    console.log(policies);
}
test();
