-- Voice session audit and reusable authenticated endpoint rate limits.
create table if not exists public.creator_voice_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.creator_projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  chat_session_id uuid references public.creator_chat_sessions(id) on delete set null,
  provider text not null,
  provider_session_id text,
  voice text,
  language text,
  status text not null default 'connecting' check (status in ('connecting', 'connected', 'ended', 'failed')),
  connection_metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  error jsonb
);

create table if not exists public.creator_voice_usage (
  id bigint generated always as identity primary key,
  voice_session_id uuid not null references public.creator_voice_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  input_audio_seconds numeric not null default 0,
  output_audio_seconds numeric not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now()
);

create table if not exists public.creator_rate_limits (
  user_id uuid not null references public.profiles(id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key (user_id, bucket, window_start)
);

create index if not exists creator_voice_sessions_project_idx on public.creator_voice_sessions(project_id, started_at desc);
create index if not exists creator_voice_usage_session_idx on public.creator_voice_usage(voice_session_id, recorded_at);

alter table public.creator_voice_sessions enable row level security;
alter table public.creator_voice_usage enable row level security;
alter table public.creator_rate_limits enable row level security;
create policy "creator voice sessions read" on public.creator_voice_sessions for select using (user_id = auth.uid());
create policy "creator voice usage read" on public.creator_voice_usage for select using (user_id = auth.uid());

create or replace function public.creator_consume_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_window timestamptz;
declare v_count integer;
begin
  if auth.uid() is null then return false; end if;
  if p_limit < 1 or p_window_seconds < 1 then raise exception 'invalid rate limit'; end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.creator_rate_limits(user_id, bucket, window_start, request_count)
  values (auth.uid(), left(p_bucket, 100), v_window, 1)
  on conflict (user_id, bucket, window_start) do update
  set request_count = public.creator_rate_limits.request_count + 1
  returning request_count into v_count;
  return v_count <= p_limit;
end;
$$;

grant execute on function public.creator_consume_rate_limit(text, integer, integer) to authenticated;
