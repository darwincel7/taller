-- Fase 5 CRM - Indices
CREATE UNIQUE INDEX IF NOT EXISTS unq_crm_identities_external_channel
ON public.crm_contact_identities (channel, external_id);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_phone 
ON public.crm_contacts (primary_phone);
