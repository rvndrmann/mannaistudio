insert into public.site_settings (key, value)
values (
  'ai_director_models',
  '[
    {"id":"gpt-5.6","label":"GPT-5.6","status":"active"},
    {"id":"gpt-5.6-luna","label":"GPT-5.6 Luna","status":"active"},
    {"id":"gpt-5.6-terra","label":"GPT-5.6 Terra","status":"active"},
    {"id":"gpt-5.5","label":"GPT-5.5","status":"active"}
  ]'::jsonb
)
on conflict (key) do update
set value = (
  select jsonb_agg(model)
  from (
    select distinct on (model->>'id') model
    from jsonb_array_elements(
      coalesce(public.site_settings.value, '[]'::jsonb) ||
      excluded.value
    ) as model
    where coalesce(model->>'id', '') <> ''
    order by model->>'id'
  ) merged
),
updated_at = now();

create or replace function public.admin_update_ai_director_models(p_models jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_models jsonb;
begin
  if not exists (select 1 from public.admin_users where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  if jsonb_typeof(p_models) <> 'array' then
    raise exception 'models must be an array';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', trim(item->>'id'),
        'label', coalesce(nullif(trim(item->>'label'), ''), trim(item->>'id')),
        'status', case when item->>'status' = 'paused' then 'paused' else 'active' end
      )
    ),
    '[]'::jsonb
  )
  into v_models
  from jsonb_array_elements(p_models) as item
  where coalesce(trim(item->>'id'), '') <> '';

  insert into public.site_settings (key, value, updated_at)
  values ('ai_director_models', v_models, now())
  on conflict (key) do update
  set value = excluded.value,
      updated_at = now();

  return v_models;
end;
$$;

grant execute on function public.admin_update_ai_director_models(jsonb) to authenticated;
