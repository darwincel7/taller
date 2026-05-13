import { supabase } from './services/supabase.ts';
async function run() {
  const { data, error } = await supabase.from('order_payments').insert({
    id: `pay-pos-${Date.now()}`,
    order_id: 'INV-123',
    amount: 1,
    method: 'CASH',
    cashier_id: '123',
    cashier_name: 'test',
    is_refund: false,
    created_at: new Date().toISOString()
  });
  console.log('Error', error);
  console.log('Data', data);
}
run();
