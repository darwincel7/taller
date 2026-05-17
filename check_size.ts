import { createClient } from "@supabase/supabase-js";
const PROVIDED_URL = "https://ruwcektpadeqovwtdixd.supabase.co"; 
const PROVIDED_KEY = "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";

const supabase = createClient(PROVIDED_URL, PROVIDED_KEY);

async function check() {
  const { data, error } = await supabase.rpc("get_financial_dashboard_v31", {
    p_start_date: "2000-01-01T00:00:00Z",
    p_end_date: "2100-01-01T00:00:00Z"
  });
  if (data && data.events) {
    console.log("Total events:", data.events.length);
  } else {
    console.log("No events or error:", error);
  }
}
check();
