import { createClient } from "@supabase/supabase-js";
const PROVIDED_URL = "https://ruwcektpadeqovwtdixd.supabase.co"; 
const PROVIDED_KEY = "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";

const supabase = createClient(PROVIDED_URL, PROVIDED_KEY);

async function check() {
  const { data: pos } = await supabase.from("pos_sales").select("created_at, total").order("created_at", {ascending: true}).limit(5);
  // test unified query from rpc
  const { data: transactions } = await supabase.rpc("get_payments_flat_v19");
  
  console.log("Oldest POS:", pos);
  if (transactions) {
     console.log("Flat dates:", transactions.map(t => new Date(t.payment_date || t.date).toISOString()).sort().slice(0, 10));
  }
}
check();
