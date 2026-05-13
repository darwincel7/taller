import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ruwcektpadeqovwtdixd.supabase.co';
const supabaseKey = 'sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: opData } = await supabase
        .from('order_payments')
        .select('id, amount, order_id, orders(deviceModel, partsCost, expenses)')
        .eq('amount', 27500);
    console.log("27500:", JSON.stringify(opData, null, 2));

    const { data: opData2 } = await supabase
        .from('order_payments')
        .select('id, amount, order_id, orders(deviceModel, partsCost, expenses)')
        .eq('amount', 28500);
    console.log("28500:", JSON.stringify(opData2, null, 2));
}

run();
