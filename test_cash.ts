import { supabase } from './services/supabase';

async function run() {
  const { data: rawCashMovements } = await supabase.from('cash_movements').select('*');
  console.log("Cash movements:", rawCashMovements?.length);
  if (rawCashMovements?.length) console.log(rawCashMovements[rawCashMovements.length - 1]);
}
run();
