const { createClient } = require('@supabase/supabase-js');

async function run() {
    // using dummy url to just check the builder
    const supabase = createClient('https://dummy.supabase.co', 'dummy');
    
    let q = supabase.from('test').select('*');
    console.log(q.url.toString());
    let q1 = q.range(0, 9);
    console.log(q1.url.toString());
    let q2 = q.range(10, 19);
    console.log(q2.url.toString());
}
run();
