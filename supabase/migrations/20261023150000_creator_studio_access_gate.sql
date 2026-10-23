-- Creator Studio is for subscribers again.
--
-- getCreatorStudioAccess had been reduced to "any signed-in account", so every
-- page and route that asked it was waved through, and the database never asked
-- at all. One rule now lives here, and both the app and the project insert use
-- it, so the two cannot drift apart again.
--
-- Entitled:
--   * site admins;
--   * a creator_studio_access grant that is active now and comes from
--       - all_access_subscription (AI Director Hub Pro; expires with the paid period),
--       - studio_subscription (the paused Studio plan; existing payers keep it),
--       - a paid course, coaching or product purchase that an admin set to
--         grant Creator Studio,
--       - an admin grant (admin, admin_preview), timed or indefinite;
--   * accounts on the BYOK test list (site_settings.byok_test_access).
-- Not entitled: legacy_access (every account that existed on 27 Sep 2026 was
-- grandfathered in when the Studio was free), free_product and credit_purchase.
--
-- Members a project is shared with keep opening that project — the app checks
-- creator_project_members for that — but creating a project of their own needs
-- access, which the trigger at the bottom enforces for every insert path,
-- service role included.

create or replace function public.creator_studio_access(p_profile_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_full boolean;
  v_window timestamptz;
begin
  if p_profile_id is null then
    return jsonb_build_object('entitled', false, 'purchase_window_expires_at', null, 'purchase_only', false);
  end if;
  if exists (select 1 from admin_users where id = p_profile_id) then
    return jsonb_build_object('entitled', true, 'purchase_window_expires_at', null, 'purchase_only', false);
  end if;

  with active as (
    select source_type, expires_at from user_entitlements
    where profile_id = p_profile_id
      and entitlement_key = 'creator_studio_access'
      and starts_at <= now()
      and (expires_at is null or expires_at > now())
  )
  select
    bool_or(source_type in (
      'all_access_subscription', 'studio_subscription',
      'course_purchase', 'course_inclusion', 'coaching_purchase', 'coaching_inclusion', 'product_purchase'
    ) or (source_type = 'admin' and expires_at is null)),
    -- A timed admin grant is a trial window: the Studio shows it counting down.
    max(expires_at) filter (where source_type in ('admin', 'admin_preview') and expires_at is not null)
  into v_full, v_window
  from active;

  v_full := coalesce(v_full, false) or exists (
    select 1 from site_settings
    where key = 'byok_test_access'
      and jsonb_typeof(value -> 'userIds') = 'array'
      and value -> 'userIds' ? p_profile_id::text
  );

  return jsonb_build_object(
    'entitled', v_full or v_window is not null,
    'purchase_window_expires_at', case when v_full then null else v_window end,
    'purchase_only', not v_full and v_window is not null
  );
end $$;
revoke all on function public.creator_studio_access(uuid) from public, anon, authenticated;
grant execute on function public.creator_studio_access(uuid) to service_role;

-- What the signed-in caller may do. No argument, so nobody can ask about
-- another account.
create or replace function public.my_creator_studio_access()
returns jsonb language sql stable security definer set search_path = public as $$
  select public.creator_studio_access(auth.uid())
$$;
revoke all on function public.my_creator_studio_access() from public, anon;
grant execute on function public.my_creator_studio_access() to authenticated;

create or replace function public.enforce_creator_studio_project_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.user_id is not distinct from old.user_id then return new; end if;
  if not coalesce((public.creator_studio_access(new.user_id) ->> 'entitled')::boolean, false) then
    raise exception 'Creator Studio needs an active AI Director Hub Pro subscription to create projects.'
      using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.enforce_creator_studio_project_owner() from public, anon, authenticated;

drop trigger if exists creator_projects_require_studio_access on public.creator_projects;
create trigger creator_projects_require_studio_access
  before insert or update of user_id on public.creator_projects
  for each row execute function public.enforce_creator_studio_project_owner();
