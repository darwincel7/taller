import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function run() {
    const { data: allItems } = await supabase.from('inventory_parts').select('id, category, name');
    let maxId = 999;
    let missing = [];

    for (const row of allItems || []) {
        try {
            const c = JSON.parse(row.category || '{}');
            if (c.readable_id && c.readable_id > maxId) {
                maxId = c.readable_id;
            } else if (!c.readable_id) {
                missing.push(row);
            }
        } catch(e) {
            missing.push(row);
        }
    }

    console.log(`Max ID found: ${maxId}`);
    console.log(`Missing readable_id count: ${missing.length}`);
    
    // Assign to missing
    for (const m of missing) {
        maxId++;
        let catObj: any = {};
        try {
            catObj = JSON.parse(m.category || '{}');
        } catch(e) {}
        catObj.readable_id = maxId;
        await supabase.from('inventory_parts').update({ category: JSON.stringify(catObj) }).eq('id', m.id);
        console.log(`Assigned ${maxId} to ${m.name}`);
    }
}
run();
