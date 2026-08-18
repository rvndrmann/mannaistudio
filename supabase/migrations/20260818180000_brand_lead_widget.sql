-- The website chat widget, and the visitors it captures.
--
-- The same agent that knows the brand answers on the brand's own home page, so
-- a visitor gets a real answer instead of a contact form. What it learns about
-- them is a lead, kept against the brand rather than emailed into a void.

alter table public.creator_brands
  add column if not exists widget_enabled boolean not null default false,
  add column if not exists widget_greeting text not null default '',
  add column if not exists widget_agent_key text not null default 'content_strategist';

create table if not exists public.brand_lead_sessions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.creator_brands(id) on delete cascade,
  -- A salted hash of the visitor's address and browser. Enough to rate limit
  -- and to recognise a returning tab, and not a stored IP address.
  visitor_key text not null default '',
  name text not null default '',
  email text not null default '',
  phone text not null default '',
  company text not null default '',
  intent text not null default '',
  transcript jsonb not null default '[]'::jsonb,
  message_count integer not null default 0,
  source_path text not null default '',
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists brand_lead_sessions_brand_idx
  on public.brand_lead_sessions (brand_id, created_at desc);
-- Captured leads are what the owner actually reads, so they are indexed apart
-- from the sessions that never left a name.
create index if not exists brand_lead_sessions_captured_idx
  on public.brand_lead_sessions (brand_id, captured_at desc)
  where captured_at is not null;

alter table public.brand_lead_sessions enable row level security;

-- Visitors are anonymous and never hold a session of their own: the widget
-- endpoint writes with the service role. Only the brand's owner can read.
drop policy if exists "brand lead sessions owner" on public.brand_lead_sessions;
create policy "brand lead sessions owner" on public.brand_lead_sessions for all
  to authenticated
  using (public.owns_creator_brand(brand_id))
  with check (public.owns_creator_brand(brand_id));

drop trigger if exists brand_lead_sessions_updated on public.brand_lead_sessions;
create trigger brand_lead_sessions_updated before update on public.brand_lead_sessions
  for each row execute function public.creator_touch_updated_at();

-- Rate limiting for callers who are not signed in.
--
-- creator_consume_rate_limit keys on auth.uid() and returns false for everyone
-- else, which is the right answer for the studio and useless here: the widget
-- endpoint is public and calls a paid model, so it needs a limit that works
-- without an account.
create table if not exists public.public_rate_limits (
  visitor_key text not null,
  bucket text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key (visitor_key, bucket, window_start)
);

create index if not exists public_rate_limits_window_idx on public.public_rate_limits (window_start);

alter table public.public_rate_limits enable row level security;
-- No policy: reachable only through the function below and the service role.

create or replace function public.consume_public_rate_limit(
  p_visitor_key text,
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if coalesce(p_visitor_key, '') = '' then return false; end if;
  if p_limit < 1 or p_window_seconds < 1 then raise exception 'invalid rate limit'; end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.public_rate_limits (visitor_key, bucket, window_start, request_count)
  values (left(p_visitor_key, 128), left(p_bucket, 100), v_window, 1)
  on conflict (visitor_key, bucket, window_start) do update
  set request_count = public.public_rate_limits.request_count + 1
  returning request_count into v_count;

  -- Old windows are never read again; clearing them here keeps the table from
  -- growing without a scheduled job to look after it.
  delete from public.public_rate_limits where window_start < now() - interval '2 days';

  return v_count <= p_limit;
end;
$$;
