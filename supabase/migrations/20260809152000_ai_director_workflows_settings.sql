insert into public.site_settings (key, value)
values (
  'ai_director_workflows',
  '[
    {
      "id": "keyframe_images_to_video",
      "title": "Keyframes Images to Video",
      "description": "Generate multi grid keyframe images first, then use them as reference to create the video.",
      "skill": "Storyboard continuity, keyframe image generation, image-to-video prompting",
      "instructions": "Create storyboard keyframes for every shot before video. Use approved characters and assets as references, keep shot order, then generate video from selected keyframes.",
      "appliesTo": "project_default",
      "status": "active"
    },
    {
      "id": "elements_sequential",
      "title": "Elements to Video Sequential",
      "description": "Generate video sequentially from character reference images to ensure continuity between clips.",
      "skill": "Sequential generation, character consistency, clip-to-clip continuity",
      "instructions": "Generate shots one by one. Use the previous approved shot and character references to maintain continuity before moving to the next clip.",
      "appliesTo": "project_default",
      "status": "active"
    },
    {
      "id": "video_reference",
      "title": "Video Reference",
      "description": "Drive video generation with reference video style and motion rhythm.",
      "skill": "Reference-video direction, motion rhythm, style transfer",
      "instructions": "Use the selected reference video as the motion/style guide. Preserve character references and adapt storyboard prompts to match the reference rhythm.",
      "appliesTo": "project_default",
      "status": "active"
    },
    {
      "id": "elements_parallel",
      "title": "Elements to Video Parallel",
      "description": "Generate video concurrently from character reference images; no keyframe images needed.",
      "skill": "Parallel shot generation, batch prompting, fast storyboard production",
      "instructions": "Generate all selected shots in parallel from storyboard prompts and asset references. Use when speed matters more than strict clip-to-clip continuity.",
      "appliesTo": "project_default",
      "status": "active"
    }
  ]'::jsonb
)
on conflict (key) do nothing;

create or replace function public.admin_update_ai_director_workflows(p_workflows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.admin_users where id = auth.uid()) then
    raise exception 'Only admins can update AI Director workflows';
  end if;

  insert into public.site_settings (key, value, updated_at)
  values ('ai_director_workflows', coalesce(p_workflows, '[]'::jsonb), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();

  return coalesce(p_workflows, '[]'::jsonb);
end;
$$;

grant execute on function public.admin_update_ai_director_workflows(jsonb) to authenticated;

