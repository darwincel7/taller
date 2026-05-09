create table if not exists crm_contacts (
 id uuid primary key default gen_random_uuid(),
 full_name text,
 display_name text,
 primary_phone text,
 primary_email text,
 country text default 'DO',
 city text,
 customer_type text default 'lead',
 lifecycle_stage text default 'new',
 source_first_seen text,
 ai_summary text,
 ai_objections text[],
 ai_interests text[],
 ai_budget text,
 ai_urgency text,
 ai_sentiment text,
 last_interaction_at timestamptz,
 assigned_to uuid,
 created_at timestamptz default now(),
 updated_at timestamptz default now()
);

create table if not exists crm_contact_identities (
 id uuid primary key default gen_random_uuid(),
 contact_id uuid references crm_contacts(id) on delete cascade,
 channel text not null,
 external_id text not null,
 username text,
 display_name text,
 phone text,
 email text,
 raw jsonb,
 verified boolean default false,
 confidence numeric default 0.5,
 created_at timestamptz default now(),
 updated_at timestamptz default now(),
 unique(channel, external_id)
);

create table if not exists crm_channel_accounts (
 id uuid primary key default gen_random_uuid(),
 channel text not null,
 account_name text,
 external_account_id text,
 page_id text,
 ig_business_id text,
 business_id text,
 status text default 'active',
 access_token_encrypted text,
 refresh_token_encrypted text,
 token_expires_at timestamptz,
 webhook_secret text,
 raw jsonb,
 created_at timestamptz default now(),
 updated_at timestamptz default now()
);

create table if not exists crm_conversations (
 id uuid primary key default gen_random_uuid(),
 contact_id uuid references crm_contacts(id),
 assigned_to uuid,
 status text default 'open',
 priority text default 'normal',
 active_channel text,
 subject text,
 last_message text,
 last_message_at timestamptz,
 unread_count int default 0,
 tags text[] default '{}',
 source text,
 created_at timestamptz default now(),
 updated_at timestamptz default now()
);

create table if not exists crm_messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid references crm_conversations(id) on delete cascade,
 contact_id uuid references crm_contacts(id),
 channel text not null,
 channel_account_id uuid references crm_channel_accounts(id),
 external_message_id text,
 external_conversation_id text,
 direction text not null check (direction in ('inbound','outbound','system','note')),
 message_type text default 'text',
 text text,
 media_url text,
 media_type text,
 media_mime text,
 status text default 'received',
 sender_role text,
 sent_by uuid,
 error_message text,
 provider_response jsonb,
 delivered_at timestamptz,
 read_at timestamptz,
 updated_at timestamptz default now(),
 raw jsonb,
 created_at timestamptz default now(),
 unique(channel, external_message_id)
);

create table if not exists crm_raw_events (
 id uuid primary key default gen_random_uuid(),
 channel text not null,
 event_type text,
 external_id text,
 action text,
 reason text,
 processed boolean default false,
 error_message text,
 raw jsonb,
 created_at timestamptz default now()
);

create table if not exists crm_agents (
 id uuid primary key,
 name text not null,
 role text default 'sales',
 active boolean default true,
 max_open_conversations int default 30,
 working_hours jsonb,
 skills text[] default '{}',
 created_at timestamptz default now()
);

create table if not exists crm_assignments (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid references crm_conversations(id) on delete cascade,
 assigned_to uuid,
 assigned_by uuid,
 reason text,
 created_at timestamptz default now()
);

create table if not exists crm_tasks (
 id uuid primary key default gen_random_uuid(),
 contact_id uuid references crm_contacts(id),
 conversation_id uuid references crm_conversations(id),
 assigned_to uuid,
 title text not null,
 description text,
 due_at timestamptz,
 status text default 'pending',
 created_at timestamptz default now()
);

create table if not exists crm_media_assets (
 id uuid primary key default gen_random_uuid(),
 message_id uuid references crm_messages(id),
 channel text,
 file_name text,
 mime_type text,
 size_bytes bigint,
 storage_path text,
 public_url text,
 source text,
 created_at timestamptz default now()
);

create table if not exists crm_ai_insights (
 id uuid primary key default gen_random_uuid(),
 contact_id uuid references crm_contacts(id),
 conversation_id uuid references crm_conversations(id),
 summary text,
 objections text[],
 interests text[],
 intent text,
 sentiment text,
 next_best_action text,
 suggested_response text,
 confidence numeric,
 updated_at timestamptz default now(),
 created_at timestamptz default now()
);

create table if not exists crm_processing_jobs (
 id uuid primary key default gen_random_uuid(),
 job_type text not null,
 reference_id uuid,
 status text default 'pending' check (status in ('pending','processing','completed','failed')),
 attempts int default 0,
 payload jsonb default '{}',
 error_message text,
 created_at timestamptz default now(),
 updated_at timestamptz default now(),
 completed_at timestamptz
);

create index if not exists idx_crm_processing_jobs_status_type
on crm_processing_jobs(status, job_type, created_at);

create unique index if not exists idx_crm_processing_jobs_pending_unique
on crm_processing_jobs(job_type, reference_id, status)
where status in ('pending','processing');

create unique index if not exists idx_crm_ai_insights_conversation_unique
on crm_ai_insights(conversation_id)
where conversation_id is not null;

create unique index if not exists idx_crm_channel_accounts_unique
on crm_channel_accounts(channel, external_account_id)
where external_account_id is not null;

create table if not exists crm_detected_contact_data (
 id uuid primary key default gen_random_uuid(),
 contact_id uuid references crm_contacts(id),
 conversation_id uuid references crm_conversations(id),
 message_id uuid references crm_messages(id),
 data_type text not null,
 value text not null,
 confidence numeric default 0.5,
 status text default 'pending',
 detected_by text default 'system',
 raw_context text,
 created_at timestamptz default now()
);

-- Habilitar RLS y políticas básicas
alter table crm_contacts enable row level security;
alter table crm_contact_identities enable row level security;
alter table crm_channel_accounts enable row level security;
alter table crm_conversations enable row level security;
alter table crm_messages enable row level security;
alter table crm_raw_events enable row level security;
alter table crm_agents enable row level security;
alter table crm_assignments enable row level security;
alter table crm_tasks enable row level security;
alter table crm_media_assets enable row level security;
alter table crm_ai_insights enable row level security;
alter table crm_detected_contact_data enable row level security;

-- Políticas de backend
create policy "Habilitar todo para autenticados en crm_contacts" on crm_contacts for all using (true) with check (true);
create policy "Habilitar todo para autenticados en crm_contact_identities" on crm_contact_identities for all using (true) with check (true);
create policy "Habilitar todo para autenticados en crm_channel_accounts" on crm_channel_accounts for all using (true) with check (true);
create policy "Habilitar todo para autenticados en crm_conversations" on crm_conversations for all using (true) with check (true);
create policy "Habilitar todo para autenticados en crm_messages" on crm_messages for all using (true) with check (true);
create policy "Habilitar todo para autenticados en crm_raw_events" on crm_raw_events for all using (true) with check (true);
create policy "Habilitar todo para autenticados en crm_agents" on crm_agents for all using (true) with check (true);
create policy "Habilitar todo para autenticados en crm_assignments" on crm_assignments for all using (true) with check (true);
create policy "Habilitar todo para autenticados en crm_tasks" on crm_tasks for all using (true) with check (true);
create policy "Habilitar todo para autenticados en crm_media_assets" on crm_media_assets for all using (true) with check (true);
create policy "Habilitar todo para autenticados en crm_ai_insights" on crm_ai_insights for all using (true) with check (true);
create policy "Habilitar todo para autenticados en crm_detected_contact_data" on crm_detected_contact_data for all using (true) with check (true);
