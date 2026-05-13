INSERT INTO storage.buckets (id, name, public) VALUES ('crm-media', 'crm-media', true) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING ( bucket_id = 'crm-media' );
CREATE POLICY "Auth Upload" ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'crm-media' );
