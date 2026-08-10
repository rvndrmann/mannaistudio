create table if not exists public.creator_external_access_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'External AI Director access',
  token_hash text not null unique,
  token_prefix text not null,
  scopes text[] not null default array['director:chat', 'director:tools', 'projects:read']::text[],
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.creator_external_access_tokens enable row level security;

drop policy if exists "external access tokens select own" on public.creator_external_access_tokens;
create policy "external access tokens select own" on public.creator_external_access_tokens
for select using (user_id = auth.uid());

drop policy if exists "external access tokens insert own" on public.creator_external_access_tokens;
create policy "external access tokens insert own" on public.creator_external_access_tokens
for insert with check (user_id = auth.uid());

drop policy if exists "external access tokens revoke own" on public.creator_external_access_tokens;
create policy "external access tokens revoke own" on public.creator_external_access_tokens
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists creator_external_access_tokens_user_idx
  on public.creator_external_access_tokens(user_id, created_at desc);

create index if not exists creator_external_access_tokens_active_hash_idx
  on public.creator_external_access_tokens(token_hash)
  where revoked_at is null;
