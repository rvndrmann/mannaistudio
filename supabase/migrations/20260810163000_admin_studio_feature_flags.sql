create or replace function public.admin_update_studio_feature_flags(p_features jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.admin_users where id = auth.uid()
  ) then
    raise exception 'Admin access required';
  end if;

  insert into public.site_settings (key, value, updated_at)
  values ('studio_features', coalesce(p_features, '{}'::jsonb), now())
  on conflict (key) do update
  set value = excluded.value,
      updated_at = now();

  return coalesce(p_features, '{}'::jsonb);
end;
$$;

grant execute on function public.admin_update_studio_feature_flags(jsonb) to authenticated;
