import { supabase } from './services/supabase';

async function test() {
    const { count } = await supabase.from('cash_movements').select('*', { count: 'exact', head: true }).gte('created_at', '2025-12-01');
    console.log("Total cash_movements since dec:", count);
}
test();
