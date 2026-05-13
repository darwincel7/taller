import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://ruwcektpadeqovwtdixd.supabase.co', 'sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_');

async function run() {
    const { data: opData } = await supabase
        .from('order_payments')
        .select('id, order_id, amount, orders(orderType, partsCost)')
        .eq('id', '12a05d7e-61ac-482d-9020-ddb6c5141ab3');
    console.log(JSON.stringify(opData, null, 2));
}
run();
