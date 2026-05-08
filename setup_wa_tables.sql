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
