import { createClient } from "@supabase/supabase-js";
const PROVIDED_URL = "https://ruwcektpadeqovwtdixd.supabase.co"; 
const PROVIDED_KEY = "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";
const supabase = createClient(PROVIDED_URL, PROVIDED_KEY);

async function check() {
  const { data, error } = await supabase.from("store_audits").insert({
    branch_id: "test",
    auditor_id: "test",
    auditor_name: "test",
    total_items: 1,
    found_items: 0,
    missing_items: 0,
    left_items: 0,
    pending_items: 0
  });
  console.log("Insert Error:", error);
  console.log("Insert Data:", data);
}
check();
