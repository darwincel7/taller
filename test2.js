import { supabase } from './services/supabase.js';
console.log(supabase);
supabase.from('order_payments').select('*').limit(2).then(res => console.log('DATA', res.data, 'ERROR', res.error)).catch(console.error);
