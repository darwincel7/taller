-- setup_omnicanal_indexes_security.sql

-- 1. Crear indices importantes
CREATE INDEX IF NOT EXISTS idx_crm_conversations_contact_id_status ON crm_conversations(contact_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_messages_conv_created ON crm_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_crm_contact_identities_chan_ext ON crm_contact_identities(channel, external_id);
CREATE INDEX IF NOT EXISTS idx_crm_detected_contact_data_status ON crm_detected_contact_data(contact_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_ai_insights_conv ON crm_ai_insights(conversation_id);

-- 2. Triggers updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DO $$ 
DECLARE
  t text;
BEGIN
  FOR t IN 
    SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'crm_%' AND table_schema = 'public'
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_update_%I_updated_at ON %I;
      CREATE TRIGGER trg_update_%I_updated_at
      BEFORE UPDATE ON %I
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    ', t, t, t, t);
  END LOOP;
END;
$$;

-- 3. Crear tabla crm_processing_jobs
CREATE TABLE IF NOT EXISTS crm_processing_jobs (
    id uuid primary key default gen_random_uuid(),
    job_type text not null, -- 'ai_summary', 'media_download', etc.
    reference_id uuid, -- ej. conversation_id o message_id
    payload jsonb,
    status text default 'pending', -- pending, processing, completed, failed
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

CREATE INDEX IF NOT EXISTS idx_crm_processing_jobs_status_type ON crm_processing_jobs(status, job_type);

-- 4. Funciones auxiliares para RLS
CREATE OR REPLACE FUNCTION is_crm_admin() 
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT role = 'admin' 
    FROM crm_agents 
    WHERE id = auth.uid() 
    AND active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Endurecer RLS (Phase 7 - Seguridad)
DO $$ 
DECLARE
  t text;
BEGIN
  FOR t IN 
    SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'crm_%' AND table_schema = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Habilitar todo para autenticados en %I" ON %I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Permitir select basico" ON %I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Permitir usar a todos" ON %I;', t, t);
    
    -- Admins y Darwin (SuperAdmin)
    EXECUTE format('
      CREATE POLICY "Admins_full_access" ON %I
      FOR ALL
      TO authenticated
      USING (is_crm_admin() OR auth.jwt()->>''email'' = ''Daruingmejia@gmail.com'');
    ', t);
  END LOOP;
END;
$$;

-- Agentes (Sales)
CREATE POLICY "Agents_see_assigned_convs" ON crm_conversations FOR SELECT TO authenticated USING (assigned_to = auth.uid() OR assigned_to IS NULL);
CREATE POLICY "Agents_update_assigned_convs" ON crm_conversations FOR UPDATE TO authenticated USING (assigned_to = auth.uid() OR assigned_to IS NULL);

CREATE POLICY "Agents_see_conv_messages" ON crm_messages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM crm_conversations WHERE id = conversation_id AND (assigned_to = auth.uid() OR assigned_to IS NULL)));
CREATE POLICY "Agents_insert_conv_messages" ON crm_messages FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM crm_conversations WHERE id = conversation_id AND assigned_to = auth.uid()));

-- 6. Vistas y Búsqueda (High Performance)
CREATE OR REPLACE VIEW v_agent_workload AS
SELECT 
    a.id as agent_id,
    a.name,
    COUNT(c.id) filter (where c.status = 'open') as open_conversations,
    a.max_open_conversations
FROM crm_agents a
LEFT JOIN crm_conversations c ON a.id = c.assigned_to
WHERE a.active = true
GROUP BY a.id, a.name, a.max_open_conversations;

-- 7. Full Text Search
ALTER TABLE crm_messages ADD COLUMN IF NOT EXISTS fts tsvector 
GENERATED ALWAYS AS (to_tsvector('spanish', coalesce(text, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_crm_messages_fts ON crm_messages USING gin(fts);

ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS fts tsvector 
GENERATED ALWAYS AS (to_tsvector('spanish', coalesce(full_name, '') || ' ' || coalesce(primary_phone, '') || ' ' || coalesce(primary_email, ''))) STORED;

-- 8. Analytics Functions (High Performance)
CREATE OR REPLACE FUNCTION get_conversation_status_counts()
RETURNS TABLE(status text, count bigint) AS $$
BEGIN
    RETURN QUERY
    SELECT c.status, COUNT(*) as count
    FROM crm_conversations c
    GROUP BY c.status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_message_channel_counts()
RETURNS TABLE(channel text, count bigint) AS $$
BEGIN
    RETURN QUERY
    SELECT m.channel, COUNT(*) as count
    FROM crm_messages m
    WHERE m.created_at >= (now() - interval '30 days')
    GROUP BY m.channel;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
