import { supabase } from './services/supabase';

async function test() {
    const end = Date.now();
    const start = end - (200 * 24 * 60 * 60 * 1000); 

    const { data: payments, error } = await supabase.rpc('get_payments_unified', {
        p_start: start,
        p_end: end,
        p_pending_only: false
    });

    if (error) {
        console.log("Error calling get_payments_unified:", error);
    } else {
        const expenses = payments.filter(p => Number(p.amount) < 0 && (p.order_id === 'GASTO_LOCAL' || p.order_id === 'GASTO_FLOTANTE' || p.order_id === 'EXPENSE'));
        console.log("Gastos returned:", expenses.length);
        console.log("Recent Gastos:", expenses.slice(0, 10).map(e => ({ id: e.id, amount: e.amount, date: new Date(e.created_at) })));
    }
}
test();
