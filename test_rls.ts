import { supabase } from './services/supabase';

async function test() {
    console.log("Checking RLS by trying to login as a cashier...");
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: "caja1@techfix.com", 
        password: "techfixpassword" // or whatever we can test... actually we can't easily guess password
    });
}
test();
