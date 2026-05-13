import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ruwcektpadeqovwtdixd.supabase.co';
const supabaseKey = 'sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_';
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixAllCreatedAt() {
  console.log("Fetching all expenses created today...");
  
  const today = new Date().toISOString().split('T')[0];
  
  const { data, error } = await supabase
    .from('accounting_transactions')
    .select('id, transaction_date, created_at')
    .gte('created_at', today);

  if (error) {
    console.error("Error fetching:", error);
    return;
  }
  
  console.log(`Found ${data.length} expenses created today.`);
  
  let updatedCount = 0;
  
  for (const exp of data) {
    // Only update if transaction_date is different from today
    if (exp.transaction_date && exp.transaction_date !== today) {
      const newCreatedAt = `${exp.transaction_date}T12:00:00.000Z`;
      
      const { error: updateError } = await supabase
        .from('accounting_transactions')
        .update({ created_at: newCreatedAt })
        .eq('id', exp.id);
        
      if (updateError) {
        console.error(`Error updating ${exp.id}:`, updateError);
      } else {
        updatedCount++;
      }
    }
  }
  
  console.log(`Successfully updated ${updatedCount} expenses to their correct historical dates.`);
}

fixAllCreatedAt();
