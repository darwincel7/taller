import { createClient } from "@supabase/supabase-js";
const PROVIDED_URL = "https://ruwcektpadeqovwtdixd.supabase.co"; 
const PROVIDED_KEY = "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";
const supabase = createClient(PROVIDED_URL, PROVIDED_KEY);

async function check() {
  const { data: v31Data } = await supabase.rpc("get_financial_dashboard_v31", {
    p_start_date: "2025-10-01T00:00:00Z",
    p_end_date: "2100-01-01T00:00:00Z"
  });
  
  const monthlyData: any = {};
  if (v31Data && v31Data.events) {
    v31Data.events.forEach((val: any) => {
        if (!val.event_date) return;
        let d = new Date(val.event_date);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, 0)}`;
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { income: 0, expenses: 0, purchases: 0 };
        }

        const amt = Number(val.amount) || 0;
        if (val.is_revenue) {
           monthlyData[monthKey].income += amt;
        } else if (val.source_table === "cash_movements" && val.event_type?.includes("_IN")) {
           monthlyData[monthKey].income += amt;
        }

        if (val.is_expense) {
            monthlyData[monthKey].expenses += Math.abs(amt);
        } else if (val.is_cogs) {
            monthlyData[monthKey].purchases += Math.abs(amt);
        } else if (val.source_table === "cash_movements" && val.event_type?.includes("_OUT")) {
            monthlyData[monthKey].expenses += Math.abs(amt);
        }
    });
  }
  console.log("Aggregated:", monthlyData);
}
check();
