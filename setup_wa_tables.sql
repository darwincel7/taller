create table if not exists whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  jid text not null,
  customer_name text,
  linked_order_id text,
  last_message text,
  last_message_at timestamptz,
  unread_count int default 0,
  assigned_to text,
  tags text[] default '{}',
  status text default 'open',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_whatsapp_conversations_phone
  on whatsapp_conversations(phone);

create index if not exists idx_whatsapp_conversations_last_message_at
  on whatsapp_conversations(last_message_at desc);

-- Allow permissive access so that Anon Key/Frontend can safely read/write or backend doesn't fail
-- even if RLS is enabled by accident in Supabase UI.
alter table whatsapp_conversations enable row level security;
drop policy if exists "Enable all for conversations" on whatsapp_conversations;
create policy "Enable all for conversations" on whatsapp_conversations for all using (true) with check (true);

create table if not exists whatsapp_messages (
  id text primary key,
  conversation_id uuid references whatsapp_conversations(id) on delete cascade,
  phone text not null,
  jid text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  text text,
  message_type text default 'text',
  media_url text,
  media_type text,
  status text default 'received',
  raw jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_whatsapp_messages_conversation_created
  on whatsapp_messages(conversation_id, created_at asc);

create index if not exists idx_whatsapp_messages_phone
  on whatsapp_messages(phone);

create index if not exists idx_whatsapp_messages_direction
  on whatsapp_messages(direction);

alter table whatsapp_messages enable row level security;
drop policy if exists "Enable all for messages" on whatsapp_messages;
create policy "Enable all for messages" on whatsapp_messages for all using (true) with check (true);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_whatsapp_conversations_updated_at on whatsapp_conversations;
create trigger trg_whatsapp_conversations_updated_at
  before update on whatsapp_conversations
  for each row execute function set_updated_at();

create table if not exists whatsapp_auth (
  id text primary key,
  data text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_whatsapp_auth_id
  on whatsapp_auth(id);

drop trigger if exists trg_whatsapp_auth_updated_at on whatsapp_auth;
create trigger trg_whatsapp_auth_updated_at
  before update on whatsapp_auth
  for each row execute function set_updated_at();

alter table whatsapp_auth enable row level security;
drop policy if exists "Enable all for auth" on whatsapp_auth;
-- whatsapp_auth should only be accessed by the backend using service_role, which bypasses RLS.
-- We do not create any policy for anon or authenticated roles.

-- Supabase Realtime publication
begin;
  do $$ 
  begin 
    alter publication supabase_realtime add table whatsapp_conversations;
  exception when others then 
    null; 
  end $$;
  
  do $$ 
  begin 
    alter publication supabase_realtime add table whatsapp_messages;
  exception when others then 
    null; 
  end $$;
commit;

-- -------------------------------------------------------------
-- MIGRATION: Identidad, LID y recepcion de mensajes
-- -------------------------------------------------------------

-- Remover la restricción 'unique' de 'phone' cuidadosamente ya que puede romper si se basan en ella.
-- En vez de borrarla, simplemente agregaremos las columnas para que el código la ignore y use identity_key.
-- Nota: PostgreSQL requiere borrar el constraint unique si queremos permitir duplicados (como telefonos vacíos).
do $$
begin
  alter table whatsapp_conversations drop constraint if exists whatsapp_conversations_phone_key;
exception when others then
  null;
end $$;

alter table whatsapp_conversations
add column if not exists wa_name text,
add column if not exists display_name text,
add column if not exists raw_jid text,
add column if not exists lid text,
add column if not exists is_lid boolean default false,
add column if not exists is_self boolean default false,
add column if not exists is_valid_phone boolean default true,
add column if not exists identity_key text;

create index if not exists idx_whatsapp_conversations_identity_key
on whatsapp_conversations(identity_key);

create unique index if not exists idx_whatsapp_conversations_identity_key_unique
on whatsapp_conversations(identity_key)
where identity_key is not null;

create index if not exists idx_whatsapp_conversations_raw_jid
on whatsapp_conversations(raw_jid);

-- Update existing records to have an identity_key to avoid null constraint issues later
update whatsapp_conversations 
set identity_key = phone, raw_jid = jid 
where identity_key is null and phone is not null;

alter table whatsapp_messages
add column if not exists wa_message_id text,
add column if not exists raw_jid text,
add column if not exists message_upsert_type text;

create unique index if not exists idx_whatsapp_messages_jid_msg_unique
on whatsapp_messages(raw_jid, wa_message_id);
