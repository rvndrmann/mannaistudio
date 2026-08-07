-- Provider-neutral conversation metadata. No provider is enabled by this migration.
alter table public.creator_chat_sessions
  add column if not exists provider text,
  add column if not exists provider_conversation_id text,
  add column if not exists context_version integer not null default 1,
  add column if not exists last_context_snapshot jsonb not null default '{}'::jsonb;

alter table public.creator_chat_messages
  add column if not exists status text not null default 'completed'
    check (status in ('pending', 'completed', 'failed', 'cancelled')),
  add column if not exists provider_response_id text,
  add column if not exists usage jsonb not null default '{}'::jsonb,
  add column if not exists error jsonb;

create unique index if not exists creator_sessions_provider_conversation_idx
  on public.creator_chat_sessions(provider, provider_conversation_id)
  where provider is not null and provider_conversation_id is not null;

create index if not exists creator_messages_pending_idx
  on public.creator_chat_messages(session_id, created_at)
  where status = 'pending';
