-- Which landing page `/` serves.
--
-- `site_settings` is publicly readable and has no write policy at all, so every
-- setting is changed through a SECURITY DEFINER function that checks
-- `admin_users` itself — same as `admin_update_billing_settings` and
-- `admin_update_site_features`. The admin UI upserted the row directly and was
-- refused by RLS, which is the policy working.
--
-- The variant is validated here rather than trusted from the caller: an
-- unrecognised string would leave the homepage resolving to its fallback with
-- no indication that the setting was junk.

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

    if p_variant is null or p_variant not in ('studio', 'originals') then
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

-- Default the setting so the row exists and the studio pitch stays live until
-- someone deliberately switches it.
insert into public.site_settings (key, value)
values ('home_variant', jsonb_build_object('variant', 'studio'))
on conflict (key) do nothing;
