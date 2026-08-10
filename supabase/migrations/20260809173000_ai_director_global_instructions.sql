insert into public.site_settings (key, value)
values (
  'ai_director_global_instructions',
  jsonb_build_object(
    'instructions',
    'Script handling rules: normal conversation, follow-up questions, complaints, status checks, and production commands are not script content.
Only add or replace the saved Script tab when the user explicitly asks to save/add/replace a complete script or screenplay and provides actual script text.
Actual script text should look like a script: title/episode metadata, timestamps, action lines, character dialogue, shot directions, or a cliffhanger ending.
Never save messages such as ''add again'', ''I do not see it'', ''create character images'', or other ordinary instructions as script content.
When the user asks to create characters, assets, storyboard, images, or videos from the script, use the existing saved script as source context and keep those outputs in their proper tabs/workflows instead of appending to the Script tab.'
  )
)
on conflict (key) do nothing;

create or replace function public.admin_update_ai_director_global_instructions(p_instructions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_instructions text;
  next_value jsonb;
begin
  if not exists (select 1 from public.admin_users where id = auth.uid()) then
    raise exception 'Only admins can update AI Director global instructions';
  end if;

  clean_instructions := nullif(trim(coalesce(p_instructions->>'instructions', '')), '');
  if clean_instructions is null then
    raise exception 'Instructions cannot be empty';
  end if;

  next_value := jsonb_build_object('instructions', clean_instructions);

  insert into public.site_settings (key, value, updated_at)
  values ('ai_director_global_instructions', next_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();

  return next_value;
end;
$$;

grant execute on function public.admin_update_ai_director_global_instructions(jsonb) to authenticated;
