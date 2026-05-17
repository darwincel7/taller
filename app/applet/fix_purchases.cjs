const { createClient } = require('@supabase/supabase-js');

const PROVIDED_URL = process.env.VITE_SUPABASE_URL || "https://ruwcektpadeqovwtdixd.supabase.co"; 
const PROVIDED_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";

const supabase = createClient(PROVIDED_URL, PROVIDED_KEY);

async function run() {
  console.log("Fetching STORE_PURCHASES...");
  // 1. Fetch all store purchases
  const { data: activeInventory, error } = await supabase
    .from('inventory_parts')
    .select('*');
    
  if (error) {
    console.error("Error fetching inventory:", error);
    return;
  }
  if (!activeInventory) {
    console.error("No inventory found.");
    return;
  }

  const purchases = activeInventory.filter(p => {
    try {
      const cat = JSON.parse(p.category || '{}');
      return cat.type === 'STORE_PURCHASE';
    } catch {
      return false;
    }
  });

  console.log(`Found ${purchases.length} store purchases.`);

  // 2. Fetch categories to get the expense category ID
  const { data: categories } = await supabase.from('accounting_categories').select('*');
  let catId = categories?.find(c => c.name.toLowerCase().includes('inventario') || c.name.toLowerCase().includes('mercancía'))?.id;

  if (!catId) {
     console.log("Expense category not found, please check.");
     return;
  }

  // 3. For each purchase, check if an accounting_transaction exists.
  const { data: transactions } = await supabase
    .from('accounting_transactions')
    .select('*');

  let added = 0;

  for (const purchase of purchases) {
    const desc = `Compra Tienda: ${purchase.name}`;
    const desc2 = `Compra: ${purchase.name}`;
    const exists = transactions?.find(t => t.description === desc || t.description === desc2 || t.description.includes(purchase.name));
    
    let pDate = purchase.created_at ? new Date(purchase.created_at) : new Date();

    if (!exists) {
      console.log(`Missing accounting for: ${desc} ($${purchase.cost}), date: ${pDate.toISOString().split('T')[0]}`);
      
      const { error: insertErr } = await supabase.from('accounting_transactions').insert({
             amount: -Math.abs(purchase.cost), 
             description: desc,
             transaction_date: pDate.toISOString().split('T')[0],
             created_at: pDate.toISOString(),
             created_by: purchase.created_by || 'system',
             status: 'COMPLETED',
             category_id: catId,
             expense_destination: 'STORE',
             source: 'STORE',
             branch: purchase.branch || 'T4',
             method: 'CASH' // Assuming CASH
      });

      if (insertErr) {
        console.error("Failed to insert", desc, insertErr);
      } else {
        added++;
        console.log(`Added ${desc}`);
      }
    } else {
      const tDate = pDate.toISOString().split('T')[0];
      if (exists.transaction_date !== tDate || !exists.created_at) {
         console.log(`Updating date for ${exists.description} to ${tDate}`);
         await supabase.from('accounting_transactions').update({ 
               transaction_date: tDate, 
               created_at: pDate.toISOString() 
         }).eq('id', exists.id);
      }
    }
  }

  console.log(`Finished processing. Added ${added} new expenses.`);
}

run();
