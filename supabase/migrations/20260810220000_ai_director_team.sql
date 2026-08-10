-- The AI Director agent team: named specialist agents (character/asset,
-- storyboard, video prompt, script, continuity) whose instructions and skills
-- are editable in admin, stored as one site_settings document.

create or replace function public.admin_update_ai_director_team(p_team jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.admin_users where id = auth.uid()) then
    raise exception 'Only admins can update the AI Director agent team';
  end if;
  if jsonb_typeof(p_team) <> 'object' then raise exception 'Agent team must be an object'; end if;

  insert into public.site_settings (key, value, updated_at)
  values ('ai_director_team', p_team, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return p_team;
end;
$$;

grant execute on function public.admin_update_ai_director_team(jsonb) to authenticated;
