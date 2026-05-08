import { supabase } from './services/supabase';

async function runSQL(sql: string) {
  const { error } = await supabase.rpc('exec_sql', { sql_string: sql });
  if (error) {
    console.error("Error executing SQL:", error.message);
  } else {
    console.log("SQL executed successfully");
  }
}

const migration = `
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
  provider_id uuid,
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
  product_id text, -- ID de inventory_parts
  expense_id text, -- Opcional, enlace a la compra
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

-- Also fix old store products, maybe make sure their category correctly includes type: 'STORE_PRODUCT' -> Actually, we handle this in code.
`;

async function main() {
  console.log("Applying store catalog migration...");
  await runSQL(migration);
}

main();
