import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ruwcektpadeqovwtdixd.supabase.co';
const supabaseKey = 'sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Migrating legacy POS sales...");
    
    // 1. Get all orders with Pieza Independiente
    const { data: posOrders } = await supabase
        .from('orders')
        .select(`id, deviceModel, totalAmount, createdAt`)
        .eq('orderType', 'Pieza Independiente');
        
    if (!posOrders) return console.log("No pos orders found");

    for (const order of posOrders) {
        // Check if order_payments exists
        const { data: ops } = await supabase
            .from('order_payments')
            .select('id')
            .eq('order_id', order.id);
            
        if (ops && ops.length === 0) {
            console.log(`Order ${order.id} missing payments. Checking accounting_transactions...`);
            
            // Generate payment based on the order
            console.log(`Inserting payment for amount ${order.totalAmount}...`);
            const { error: insertError } = await supabase
                .from('order_payments')
                .insert([{
                    id: crypto.randomUUID(),
                    order_id: order.id,
                    amount: order.totalAmount, // Assume total amount paid in cash if legacy
                    method: 'CASH',
                    cashier_id: 'system',
                    cashier_name: 'Migración',
                    is_refund: false,
                    created_at: order.createdAt
                }]);
                
            if (insertError) {
                console.error("Failed to insert payment", insertError);
            } else {
                console.log(`Successfully migrated payment for ${order.id}`);
                
                // Now delete the old accounting_transactions that was duplicate
                // since we don't have the exact AT ID, we look for similar description and date
                const dateISO = new Date(order.createdAt).toISOString().split('T')[0];
                const { data: ats } = await supabase
                    .from('accounting_transactions')
                    .select('id')
                    .is('order_id', null)
                    .ilike('description', `Venta Producto%`)
                    .gte('created_at', new Date(order.createdAt - 5000).toISOString())
                    .lte('created_at', new Date(order.createdAt + 5000).toISOString());
                    
                if (ats && ats.length > 0) {
                    console.log(`Cleaning up ${ats.length} duplicate ATs for ${order.id}`);
                    await supabase.from('accounting_transactions').delete().in('id', ats.map((a:any) => a.id));
                }
            }
        }
    }
}

run();
