do $$
declare
  current_settings jsonb;
  orchestration text;
  recovery text;
begin
  select value into current_settings
  from public.site_settings
  where key = 'ai_director_runtime_settings';

  if current_settings is null then return; end if;

  orchestration := coalesce(current_settings->>'orchestrationInstructions', '');
  recovery := coalesce(current_settings#>>'{specialists,recovery}', '');

  if recovery <> '' and position(recovery in orchestration) = 0 then
    orchestration := trim(orchestration) || E'\n\nFAILURE RECOVERY\n' || trim(recovery);
  end if;

  update public.site_settings
  set value = jsonb_build_object(
    'orchestrationInstructions', orchestration,
    'maxToolSteps', coalesce((current_settings->>'maxToolSteps')::integer, 10),
    'nextActionLimit', coalesce((current_settings->>'nextActionLimit')::integer, 1)
  ),
  updated_at = now()
  where key = 'ai_director_runtime_settings';
end
$$;

create or replace function public.admin_update_ai_director_runtime_settings(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_settings jsonb;
begin
  if not exists (select 1 from public.admin_users where id = auth.uid()) then
    raise exception 'Only admins can update AI Director runtime settings';
  end if;
  if jsonb_typeof(p_settings) <> 'object' then raise exception 'Runtime settings must be an object'; end if;
  if nullif(trim(p_settings->>'orchestrationInstructions'), '') is null then raise exception 'orchestrationInstructions is required'; end if;
  if coalesce((p_settings->>'maxToolSteps')::integer, 0) not between 1 and 25 then raise exception 'maxToolSteps must be between 1 and 25'; end if;
  if coalesce((p_settings->>'nextActionLimit')::integer, 0) not between 1 and 5 then raise exception 'nextActionLimit must be between 1 and 5'; end if;

  clean_settings := jsonb_build_object(
    'orchestrationInstructions', p_settings->>'orchestrationInstructions',
    'maxToolSteps', (p_settings->>'maxToolSteps')::integer,
    'nextActionLimit', (p_settings->>'nextActionLimit')::integer
  );

  insert into public.site_settings (key, value, updated_at)
  values ('ai_director_runtime_settings', clean_settings, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return clean_settings;
end;
$$;

grant execute on function public.admin_update_ai_director_runtime_settings(jsonb) to authenticated;
