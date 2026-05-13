import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ruwcektpadeqovwtdixd.supabase.co';
const supabaseKey = 'sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_';
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixCreatedAt() {
  console.log("Fetching recently created duplicate expenses...");
  
  // Get all expenses created today with -DUP- in invoice_number
  const today = new Date().toISOString().split('T')[0];
  
  const { data, error } = await supabase
    .from('accounting_transactions')
    .select('id, transaction_date, created_at, invoice_number')
    .like('invoice_number', '%-DUP-%')
    .gte('created_at', today);

  if (error) {
    console.error("Error fetching:", error);
    return;
  }
  
  console.log(`Found ${data.length} expenses to fix.`);
  
  for (const exp of data) {
    // Set created_at to transaction_date at 12:00:00 UTC
    const newCreatedAt = `${exp.transaction_date}T12:00:00.000Z`;
    
    console.log(`Updating ${exp.id} created_at from ${exp.created_at} to ${newCreatedAt}`);
    
    const { error: updateError } = await supabase
      .from('accounting_transactions')
      .update({ created_at: newCreatedAt })
      .eq('id', exp.id);
      
    if (updateError) {
      console.error(`Error updating ${exp.id}:`, updateError);
    }
  }
  
  console.log("Done!");
}

fixCreatedAt();
