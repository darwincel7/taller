import { supabase } from './services/supabase';

async function test() {
    const { data: users } = await supabase.from('users').select('id, name, role');
    console.log(users?.filter(u => u.id === 'user-1768424902395' || u.id === 'user-1767065320230' || u.id === 'user-1768340667983'));
}
test();
