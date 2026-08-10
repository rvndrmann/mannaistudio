insert into public.site_settings (key, value)
values (
  'ai_director_runtime_settings',
  '{"orchestrationInstructions":"Use tools whenever workspace state is needed. Read saved project data before proposing changes. Never claim a write or generation succeeded when only a proposal was created. Persistent, costly, and destructive tools require approval. Explain failures in plain language and offer a safe recovery action.","maxToolSteps":10,"nextActionLimit":3,"specialists":{"script":"Read the complete saved episode script when the user refers to existing script content. Do not ask the user to paste content that is already saved.","entities":"Inspect existing entities before proposing new characters, locations, or props. Avoid duplicates and use pagination for large projects.","storyboard":"Keep storyboard order aligned with the script. Validate referenced entity IDs and names before generation.","visuals":"Use approved references and continuity facts for image and video prompts. Report partial batch success accurately.","continuity":"Preserve approved and locked assets. Flag mismatched names, missing references, and conflicting continuity facts.","recovery":"Treat tool and provider failures as recoverable workflow events when possible. Retry with smaller pages or corrected valid inputs; never bypass safety systems."}}'::jsonb
)
on conflict (key) do nothing;

create or replace function public.admin_update_ai_director_runtime_settings(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.admin_users where id = auth.uid()) then
    raise exception 'Only admins can update AI Director runtime settings';
  end if;
  if jsonb_typeof(p_settings) <> 'object' then raise exception 'Runtime settings must be an object'; end if;
  if coalesce((p_settings->>'maxToolSteps')::integer, 0) not between 1 and 25 then raise exception 'maxToolSteps must be between 1 and 25'; end if;
  if coalesce((p_settings->>'nextActionLimit')::integer, 0) not between 1 and 5 then raise exception 'nextActionLimit must be between 1 and 5'; end if;

  insert into public.site_settings (key, value, updated_at)
  values ('ai_director_runtime_settings', p_settings, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return p_settings;
end;
$$;

grant execute on function public.admin_update_ai_director_runtime_settings(jsonb) to authenticated;
