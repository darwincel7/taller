import { supabase } from './services/supabase';

async function checkStore() {
    const { data: invData, error: invError } = await supabase
        .from('inventory_parts')
        .select('*')
        .limit(1);

    console.log("Inv Error:", invError?.message);
    const hasInvReadableId = invData && invData.length > 0 ? 'readable_id' in invData[0] : false;
    console.log("Inv has readable_id?", hasInvReadableId);
}
checkStore().catch(console.error);
