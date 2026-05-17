import { createClient } from "@supabase/supabase-js";
const PROVIDED_URL = "https://ruwcektpadeqovwtdixd.supabase.co"; 
const PROVIDED_KEY = process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";
const supabase = createClient(PROVIDED_URL, PROVIDED_KEY);

async function check() {
  const { data, error } = await supabase.rpc("get_payments_unified", {
      p_start: new Date("2026-05-14").getTime(), // yesterday
      p_end: new Date("2026-05-30").getTime()
  });
  
  const purchasesInRPC = data?.filter((x: any) => x.amount === -21030);
  console.log("Found the 21030 expense in RPC:", purchasesInRPC?.length);
  console.log(purchasesInRPC);
}
check();
