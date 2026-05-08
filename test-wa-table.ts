import { createClient } from '@supabase/supabase-js';

async function testAuthTable() {
    let supabaseUrl = "https://ruwcektpadeqovwtdixd.supabase.co";
    const supabaseKey = "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase.from('whatsapp_auth').select('id').limit(1);
    console.log("Select test:", { data, error });

    const key = `test-${Date.now()}`;
    const { data: upsertData, error: upsertError } = await supabase.from('whatsapp_auth').upsert({ id: key, data: JSON.stringify({ ok: true }) });
    console.log("Upsert test:", { upsertData, upsertError });
    
    if (!upsertError) {
        const { error: delError } = await supabase.from('whatsapp_auth').delete().eq('id', key);
        console.log("Delete test:", { delError });
    }
}
testAuthTable();
