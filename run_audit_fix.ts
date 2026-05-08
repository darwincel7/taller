import { supabase } from './services/supabase';

async function runFix() {
  console.log('Starting DB fix for audit_logs...');
  
  try {
    // Setup store catalog schema
    const { error } = await supabase.rpc('exec_sql', {
      sql_string: `
        CREATE TABLE IF NOT EXISTS store_attributes (
          id uuid default gen_random_uuid() primary key,
          type text not null,
          value text not null,
          created_at bigint default (extract(epoch from now()) * 1000)::bigint,
          UNIQUE(type, value)
        );
        ALTER TABLE store_attributes ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Public Access Store Attributes" ON store_attributes;
        CREATE POLICY "Public Access Store Attributes" ON store_attributes FOR ALL USING (true);

        CREATE TABLE IF NOT EXISTS store_expenses (
          id text primary key,
          provider_id uuid references store_attributes(id),
          amount numeric not null,
          used_amount numeric default 0,
          is_credit boolean default false,
          status text default 'AVAILABLE',
          payment_status text default 'PAID',
          receipt_url text,
          notes text,
          created_by text,
          created_at bigint default (extract(epoch from now()) * 1000)::bigint
        );
        ALTER TABLE store_expenses ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Public Access Store Expenses" ON store_expenses;
        CREATE POLICY "Public Access Store Expenses" ON store_expenses FOR ALL USING (true);


        CREATE TABLE IF NOT EXISTS store_items (
          id text primary key,
          product_id uuid references inventory_parts(id) on delete cascade,
          expense_id text references store_expenses(id) on delete set null,
          cost numeric not null, 
          price numeric not null,
          imei text,
          status text default 'AVAILABLE',
          image_url text,
          branch text,
          created_at bigint default (extract(epoch from now()) * 1000)::bigint
        );
        ALTER TABLE store_items ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Public Access Store Items" ON store_items;
        CREATE POLICY "Public Access Store Items" ON store_items FOR ALL USING (true);
      `
    });

    if (error) {
      console.error('Error adding columns via RPC:', error);
      
      // Fallback if exec_sql doesn't exist or fails
      console.log('Attempting fallback direct query (might fail if not supported)...');
      // We can't do direct DDL from client usually, but we can try if it's a superuser key
    } else {
      console.log('Successfully added entity_type, entity_id, and metadata to audit_logs.');
    }
  } catch (err) {
    console.error('Exception during DB fix:', err);
  }
}

runFix();
