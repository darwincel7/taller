import { createClient } from '@supabase/supabase-js';

async function testBatchUpsert() {
    let supabaseUrl = "https://ruwcektpadeqovwtdixd.supabase.co";
    const supabaseKey = "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const chunk = [
        { id: 't1', data: '1' },
        { id: 't2', data: '2' },
        { id: 't3', data: '3' }
    ];

    const { data: upsertData, error: upsertError } = await supabase.from('whatsapp_auth').upsert(chunk, { onConflict: 'id' });
    console.log("Upsert batch test:", { upsertError });
    
    if (!upsertError) {
        const { error: delError } = await supabase.from('whatsapp_auth').delete().in('id', ['t1','t2','t3']);
        console.log("Delete batch test:", { delError });
    }
}
testBatchUpsert();
