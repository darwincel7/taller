import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
  const { data: pos } = await supabase.from("orders").select("created_at").order("created_at", {ascending: true}).limit(1);
  const { data: pos_sales } = await supabase.from("pos_sales").select("created_at").order("created_at", {ascending: true}).limit(1);
  const { data: expenses } = await supabase.from("floating_expenses").select("date").order("date", {ascending: true}).limit(1);
  const { data: storeInv } = await supabase.from("store_inventory").select("created_at").order("created_at", {ascending: true}).limit(1);
  
  console.log("Oldest order:", pos);
  console.log("Oldest pos:", pos_sales);
  console.log("Oldest expense:", expenses);
  console.log("Oldest inventory:", storeInv);
}
check();
