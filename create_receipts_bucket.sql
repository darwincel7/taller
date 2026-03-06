-- Create the storage bucket for receipts
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do nothing;

-- Set up access policies for the receipts bucket
-- Allow public read access to receipts (so they can be viewed in the app)
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'receipts' );

-- Allow authenticated users to upload receipts
create policy "Authenticated users can upload receipts"
  on storage.objects for insert
  with check ( bucket_id = 'receipts' and auth.role() = 'authenticated' );

-- Allow users to update their own receipts
create policy "Users can update their own receipts"
  on storage.objects for update
  using ( bucket_id = 'receipts' and auth.uid() = owner );

-- Allow users to delete their own receipts
create policy "Users can delete their own receipts"
  on storage.objects for delete
  using ( bucket_id = 'receipts' and auth.uid() = owner );
