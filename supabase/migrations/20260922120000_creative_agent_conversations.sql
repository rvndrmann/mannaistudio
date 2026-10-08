-- Conversations begin before a customer has an account.  A randomly generated
-- visitor id is the temporary owner; the API attaches user_id on later visits.
create table if not exists public.creative_agent_conversations (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null unique,
  user_id uuid references public.profiles(id) on delete set null,
  agent_paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creative_agent_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.creative_agent_conversations(id) on delete cascade,
  sender text not null check (sender in ('visitor', 'agent', 'admin', 'system')),
  body text not null check (length(btrim(body)) > 0),
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists creative_agent_messages_conversation_idx on public.creative_agent_messages(conversation_id, created_at);
create index if not exists creative_agent_conversations_updated_idx on public.creative_agent_conversations(updated_at desc);

alter table public.creative_agent_conversations enable row level security;
alter table public.creative_agent_messages enable row level security;
-- All access is through server routes: anonymous visitors are identified by a
-- high-entropy local UUID, while admin access is checked against admin_users.
