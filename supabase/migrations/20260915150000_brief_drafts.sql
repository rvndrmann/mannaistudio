-- The briefs nobody finished.
--
-- Until now a brief existed only at the moment it was paid for: seven steps of
-- typing lived in React state and, if the visitor closed the tab at step five,
-- nothing had ever been written down. The orders table therefore answers "who
-- bought" and has no opinion at all about who nearly did — which is the more
-- actionable half of a funnel, because those people have already described
-- their product to us.
--
-- A draft is saved as it is typed, keyed to the browser rather than to an
-- account, because sign-in does not happen until checkout. When the same brief
-- is eventually paid for, the draft records which order it became, so the
-- admin list can show what was abandoned rather than everything ever started.

create extension if not exists pgcrypto;

create table if not exists public.managed_brief_drafts (
  id uuid primary key default gen_random_uuid(),

  -- The localStorage id the analytics beacons already use, so a person who
  -- came back a week later updates their own draft instead of starting a
  -- second one. It outlives the tab; it does not outlive a cleared browser.
  visitor_id uuid not null,
  -- Set the moment they sign in, which is usually at checkout — so a draft can
  -- be anonymous when written and become attributable later.
  profile_id uuid references public.profiles(id) on delete set null,

  service_key text not null default '',
  package_key text not null default '',
  -- The same shape as managed_projects.brief, so anything that can read one can
  -- read the other.
  brief jsonb not null default '{}'::jsonb,

  -- How far they got, which is the whole point: a brief abandoned on step 6 is
  -- a different conversation from one abandoned on step 1.
  furthest_step integer not null default 0,
  total_steps integer not null default 7,

  converted_project_id uuid references public.managed_projects(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One draft per browser per service. Typing updates a row rather than
-- appending one, so a ten-minute brief is one lead and not forty.
create unique index if not exists managed_brief_drafts_visitor_service_idx
  on public.managed_brief_drafts (visitor_id, service_key);

create index if not exists managed_brief_drafts_recent_idx
  on public.managed_brief_drafts (updated_at desc);

-- Reachable only through the service key (writes) and the admin function
-- (reads), exactly like the analytics tables: this holds half-typed personal
-- notes about somebody's business, and nobody browsing the site should be able
-- to read another visitor's.
alter table public.managed_brief_drafts enable row level security;

-- ---------------------------------------------------------------------------
-- Writes: service-role only, called by the ingest route.
-- ---------------------------------------------------------------------------

create or replace function public.record_brief_draft(
  p_visitor_id uuid,
  p_profile_id uuid,
  p_service_key text,
  p_package_key text,
  p_brief jsonb,
  p_furthest_step integer,
  p_total_steps integer
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'record_brief_draft is service-role only';
  end if;

  insert into public.managed_brief_drafts as d
    (visitor_id, profile_id, service_key, package_key, brief, furthest_step, total_steps)
  values
    (p_visitor_id, p_profile_id, coalesce(p_service_key, ''), coalesce(p_package_key, ''),
     coalesce(p_brief, '{}'::jsonb), greatest(coalesce(p_furthest_step, 0), 0), coalesce(p_total_steps, 7))
  on conflict (visitor_id, service_key) do update set
    -- Never backwards: a page reload starts at step one again, and a draft that
    -- forgot how far someone got would misreport where they gave up.
    furthest_step = greatest(d.furthest_step, excluded.furthest_step),
    package_key = excluded.package_key,
    brief = excluded.brief,
    total_steps = excluded.total_steps,
    -- An anonymous draft that later signs in gains its owner; one that already
    -- has an owner never loses it to a signed-out save from the same browser.
    profile_id = coalesce(excluded.profile_id, d.profile_id),
    updated_at = now()
  returning d.id into v_id;

  return v_id;
end;
$$;

create or replace function public.mark_brief_draft_converted(
  p_visitor_id uuid,
  p_service_key text,
  p_project_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'mark_brief_draft_converted is service-role only';
  end if;

  update public.managed_brief_drafts
  set converted_project_id = p_project_id, updated_at = now()
  where visitor_id = p_visitor_id and service_key = coalesce(p_service_key, '');
end;
$$;

-- ---------------------------------------------------------------------------
-- Reads: the admin's list of who started and did not finish.
-- ---------------------------------------------------------------------------

create or replace function public.admin_managed_brief_drafts()
returns table (
  id uuid,
  visitor_id uuid,
  profile_id uuid,
  person_name text,
  person_email text,
  service_key text,
  service_name text,
  package_key text,
  package_name text,
  price_inr integer,
  brief jsonb,
  furthest_step integer,
  total_steps integer,
  converted_project_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    d.id, d.visitor_id, d.profile_id,
    coalesce(pr.full_name, ''), coalesce(pr.email, ''),
    d.service_key,
    coalesce((select s.name from public.managed_offer_services s where s.key = d.service_key), d.service_key),
    d.package_key,
    coalesce((select p.name from public.managed_offer_packages p where p.key = d.package_key), ''),
    coalesce((select p.price_inr from public.managed_offer_packages p where p.key = d.package_key), 0),
    d.brief, d.furthest_step, d.total_steps,
    -- Explicitly recorded, or inferred: a tab closed between paying and the
    -- browser reporting it would otherwise sit in the abandoned list forever,
    -- and chasing someone who has already bought is worse than not chasing.
    coalesce(
      d.converted_project_id,
      (select mp.id from public.managed_projects mp
        where mp.user_id = d.profile_id
          and mp.service_type = d.service_key
          and mp.created_at >= d.created_at
        order by mp.created_at
        limit 1)
    ),
    d.created_at, d.updated_at
  from public.managed_brief_drafts d
  left join public.profiles pr on pr.id = d.profile_id
  where public.is_site_admin()
  order by d.updated_at desc;
$$;

revoke execute on function public.record_brief_draft(uuid, uuid, text, text, jsonb, integer, integer) from public, anon, authenticated;
revoke execute on function public.mark_brief_draft_converted(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.record_brief_draft(uuid, uuid, text, text, jsonb, integer, integer) to service_role;
grant execute on function public.mark_brief_draft_converted(uuid, text, uuid) to service_role;
grant execute on function public.admin_managed_brief_drafts() to authenticated;
