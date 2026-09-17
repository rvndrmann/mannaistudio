-- Reordering the catalogue.
--
-- `position` has always decided the order gigs and their tiers appear in — on
-- /hire-us, on the homepage, in the brief's gig picker — but the only way to
-- change it was to open a gig and save every other field along with it. The
-- admin list showed a drag handle that did nothing.
--
-- One function per table, each taking the ids in the order they should sit in
-- and writing that order in one statement. Sending the whole list rather than
-- "move this one up" is what makes it safe to press repeatedly: the result is
-- the order you sent, not an increment applied to whatever the server had.

create or replace function public.admin_reorder_managed_services(p_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_site_admin() then raise exception 'Only admins can change the catalogue'; end if;
  if p_ids is null or array_length(p_ids, 1) is null then return; end if;

  -- Positions are 1-based to match what admin_upsert_managed_service assigns a
  -- new gig (max + 1), so a row inserted after a reorder still lands last.
  -- WITH ORDINALITY, not row_number() over an unnest: only ordinality is
  -- documented to hand back the array's own subscripts. Row order out of a set
  -- returning function is incidental, and this is the value that decides what
  -- a customer sees first.
  update public.managed_offer_services as s
  set position = ordered.rank::integer
  from unnest(p_ids) with ordinality as ordered(id, rank)
  where s.id = ordered.id;
end;
$$;

create or replace function public.admin_reorder_managed_packages(p_service_id uuid, p_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_site_admin() then raise exception 'Only admins can change the catalogue'; end if;
  if p_ids is null or array_length(p_ids, 1) is null then return; end if;

  -- Scoped to one service: tiers are ordered within their own gig, and an id
  -- belonging to another gig must not be moved by a request about this one.
  update public.managed_offer_packages as p
  set position = ordered.rank::integer
  from unnest(p_ids) with ordinality as ordered(id, rank)
  where p.id = ordered.id and p.service_id = p_service_id;
end;
$$;

revoke all on function public.admin_reorder_managed_services(uuid[]) from public, anon;
revoke all on function public.admin_reorder_managed_packages(uuid, uuid[]) from public, anon;
grant execute on function public.admin_reorder_managed_services(uuid[]) to authenticated;
grant execute on function public.admin_reorder_managed_packages(uuid, uuid[]) to authenticated;
