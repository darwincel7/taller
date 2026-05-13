import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ruwcektpadeqovwtdixd.supabase.co';
const supabaseKey = 'sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: opData } = await supabase
        .from('accounting_transactions')
        .select('*')
        .eq('amount', 27500);
    console.log('AT 27500:', JSON.stringify(opData, null, 2));

    const { data: opData2 } = await supabase
        .from('accounting_transactions')
        .select('*')
        .eq('amount', 28500);
    console.log('AT 28500:', JSON.stringify(opData2, null, 2));

    const { data: oData } = await supabase
        .from('orders')
        .select('id, totalAmount, finalPrice, partsCost, expenses')
        .eq('totalAmount', 27500);
    console.log('Orders 27500:', JSON.stringify(oData, null, 2));
}

run();
