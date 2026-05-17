import { createClient } from "@supabase/supabase-js";
const PROVIDED_URL = "https://ruwcektpadeqovwtdixd.supabase.co"; 
const PROVIDED_KEY = "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";

const supabase = createClient(PROVIDED_URL, PROVIDED_KEY);

async function check() {
  const { data: pos } = await supabase.from("pos_sales").select("created_at").order("created_at", {ascending: true}).limit(1);
  const { data: exp } = await supabase.from("floating_expenses").select("date").order("date", {ascending: true}).limit(1);
  const { data: orders } = await supabase.from("orders").select("created_at").order("created_at", {ascending: true}).limit(1);

  console.log("Oldest POS:", pos);
  console.log("Oldest Expense:", exp);
  console.log("Oldest Order:", orders);
}
check();
