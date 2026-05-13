import { supabase } from './services/supabase';

async function test() {
    const { count } = await supabase.from('v_sales_unified').select('*', { count: 'exact', head: true }).gte('created_at', '2025-12-01');
    console.log("Total v_sales_unified since dec:", count);
}
test();
