import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ruwcektpadeqovwtdixd.supabase.co';
const supabaseKey = 'sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, expenses, readable_id');

  if (ordersError) {
    console.error(ordersError);
    return;
  }
  
  let missingCount = 0;
  
  for (const order of orders) {
    if (order.expenses && order.expenses.length > 0) {
      const { data: atData } = await supabase
        .from('accounting_transactions')
        .select('id, description, amount')
        .eq('order_id', order.id);
        
      for (const exp of order.expenses) {
        const desc = `[Orden #${order.readable_id}] ${exp.description}`;
        const found = atData?.find(a => Math.abs(a.amount) === Math.abs(exp.amount) && a.description === desc);
        
        if (!found) {
          // Maybe found with different description?
          const foundDiffDesc = atData?.find(a => Math.abs(a.amount) === Math.abs(exp.amount));
          if (!foundDiffDesc) {
            missingCount++;
            console.log(`Missing expense in accounting_transactions for Order #${order.readable_id}: ${exp.description} ($${exp.amount})`);
          }
        }
      }
    }
  }
  console.log(`Total missing expenses: ${missingCount}`);
}

check();
