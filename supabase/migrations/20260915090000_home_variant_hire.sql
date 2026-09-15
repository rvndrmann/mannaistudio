-- A third homepage: the done-for-you offer.
--
-- The variant is validated inside the function rather than trusted from the
-- caller, so a new homepage is not live until this list says it exists — which
-- is the point of validating here, and also why adding one is a migration.
--
-- 'hire' serves the managed-production pitch at `/`: send a brief, first cut in
-- 24 hours, two revisions, finished files. `/hire-us` keeps its own URL either
-- way, exactly as `/originals` does.

create or replace function public.admin_set_home_variant(p_variant text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
    if not exists (select 1 from public.admin_users where id = auth.uid()) then
        raise exception 'Admin access required';
    end if;

    if p_variant is null or p_variant not in ('studio', 'originals', 'hire') then
        raise exception 'Unknown homepage variant: %', coalesce(p_variant, 'null');
    end if;

    insert into public.site_settings (key, value, updated_at)
    values ('home_variant', jsonb_build_object('variant', p_variant), now())
    on conflict (key) do update
    set value = excluded.value,
        updated_at = now();

    return p_variant;
end;
$$;

revoke execute on function public.admin_set_home_variant(text) from public, anon;
grant execute on function public.admin_set_home_variant(text) to authenticated, service_role;
