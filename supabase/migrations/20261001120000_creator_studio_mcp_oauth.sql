-- Hosted MCP authorization. All secrets are hashed, all exchanges are atomic.
create table public.creator_mcp_clients (
  id text primary key,
  name text not null,
  redirect_uris text[] not null,
  created_at timestamptz not null default now()
);
create table public.creator_mcp_requests (
  id uuid primary key default gen_random_uuid(),
  secret_hash text not null unique,
  client_id text not null references public.creator_mcp_clients(id) on delete cascade,
  redirect_uri text not null,
  state text not null,
  challenge text not null,
  resource text not null,
  scopes text[] not null,
  expires_at timestamptz not null default now() + interval '10 minutes'
);
create table public.creator_mcp_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null references public.creator_mcp_clients(id),
  name text not null,
  scopes text[] not null,
  resource text not null,
  refresh_hash text unique,
  refresh_expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.creator_mcp_codes (
  code_hash text primary key,
  connection_id uuid not null references public.creator_mcp_connections(id) on delete cascade,
  redirect_uri text not null,
  challenge text not null,
  expires_at timestamptz not null default now() + interval '2 minutes'
);
alter table public.creator_external_access_tokens
  add column expires_at timestamptz,
  add column resource text,
  add column mcp_connection_id uuid references public.creator_mcp_connections(id) on delete cascade;
create index creator_external_tokens_connection_idx on public.creator_external_access_tokens(mcp_connection_id);
create index creator_mcp_connections_user_idx on public.creator_mcp_connections(user_id);

alter table public.creator_mcp_clients enable row level security;
alter table public.creator_mcp_requests enable row level security;
alter table public.creator_mcp_connections enable row level security;
alter table public.creator_mcp_codes enable row level security;
-- OAuth persistence is reachable only by server code, never by browser clients.
revoke all on public.creator_mcp_clients, public.creator_mcp_requests,
  public.creator_mcp_connections, public.creator_mcp_codes from anon, authenticated;
grant all on public.creator_mcp_clients, public.creator_mcp_requests,
  public.creator_mcp_connections, public.creator_mcp_codes to service_role;

create table public.creator_mcp_rate_limits (
  key text primary key, starts_at timestamptz not null, requests integer not null
);
alter table public.creator_mcp_rate_limits enable row level security;
revoke all on public.creator_mcp_rate_limits from anon, authenticated;
grant all on public.creator_mcp_rate_limits to service_role;
create function public.creator_mcp_consume_rate_limit(p_key text, p_limit integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into creator_mcp_rate_limits(key, starts_at, requests) values(p_key, now(), 1)
  on conflict(key) do update set
    requests = case when creator_mcp_rate_limits.starts_at < now() - interval '1 minute' then 1 else creator_mcp_rate_limits.requests + 1 end,
    starts_at = case when creator_mcp_rate_limits.starts_at < now() - interval '1 minute' then now() else creator_mcp_rate_limits.starts_at end
  returning requests into n;
  return n <= p_limit;
end; $$;
revoke all on function public.creator_mcp_consume_rate_limit(text, integer) from public, anon, authenticated;
grant execute on function public.creator_mcp_consume_rate_limit(text, integer) to service_role;

create function public.creator_mcp_exchange(
  p_grant text, p_hash text, p_client text, p_resource text,
  p_redirect text, p_challenge text, p_access_hash text, p_access_prefix text,
  p_refresh_hash text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare c creator_mcp_connections%rowtype; a creator_mcp_codes%rowtype;
begin
  if p_grant = 'authorization_code' then
    select * into a from creator_mcp_codes where code_hash = p_hash for update;
    if not found or a.expires_at <= now() or a.redirect_uri <> p_redirect or a.challenge <> p_challenge then
      raise exception 'invalid_grant';
    end if;
    select * into c from creator_mcp_connections where id = a.connection_id for update;
  elsif p_grant = 'refresh_token' then
    select * into c from creator_mcp_connections where refresh_hash = p_hash for update;
    if not found or c.refresh_expires_at is null or c.refresh_expires_at <= now() then raise exception 'invalid_grant'; end if;
  else
    raise exception 'unsupported_grant_type';
  end if;
  if c.id is null or c.revoked_at is not null or c.client_id <> p_client or c.resource <> p_resource then
    raise exception 'invalid_grant';
  end if;
  -- Row locks serialize exchange and refresh; old refresh tokens cannot be replayed.
  if p_grant = 'authorization_code' then delete from creator_mcp_codes where code_hash = p_hash; end if;
  update creator_mcp_connections set refresh_hash = p_refresh_hash,
    refresh_expires_at = now() + interval '30 days' where id = c.id;
  update creator_external_access_tokens set revoked_at = now()
    where mcp_connection_id = c.id and revoked_at is null;
  insert into creator_external_access_tokens(user_id, name, token_hash, token_prefix, scopes, expires_at, resource, mcp_connection_id)
    values(c.user_id, c.name, p_access_hash, p_access_prefix, c.scopes, now() + interval '1 hour', c.resource, c.id);
  return jsonb_build_object('scope', array_to_string(c.scopes, ' '));
end; $$;
revoke all on function public.creator_mcp_exchange(text,text,text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.creator_mcp_exchange(text,text,text,text,text,text,text,text,text) to service_role;

-- One transaction creates the complete workspace, acting as the authenticated owner.
create function public.creator_mcp_create_project(p_name text, p_description text, p_mode text, p_type text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare p creator_projects%rowtype; e uuid; s uuid;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  if length(trim(p_name)) = 0 or length(p_name) > 160 or length(p_description) > 10000 then raise exception 'Invalid project details'; end if;
  insert into creator_projects(user_id,name,description,production_mode,project_type)
    values(auth.uid(),p_name,p_description,p_mode,p_type) returning * into p;
  insert into creator_episodes(project_id,name,description,status)
    values(p.id,'Episode 1','First episode of ' || p.name,'in_progress') returning id into e;
  insert into creator_chat_sessions(episode_id,user_id,title)
    values(e,auth.uid(),'New Chat') returning id into s;
  return jsonb_build_object('project',to_jsonb(p),'episodeId',e,'sessionId',s);
end; $$;
revoke all on function public.creator_mcp_create_project(text,text,text,text) from public, anon;
grant execute on function public.creator_mcp_create_project(text,text,text,text) to authenticated;
