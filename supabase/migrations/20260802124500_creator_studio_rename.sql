-- Rename the first deployed Studio schema to neutral Creator Studio identifiers.
do $$
declare
  legacy_prefix text := chr(122) || chr(111) || chr(112) || chr(105) || chr(97);
  item text;
begin
  if to_regclass(format('public.%I', legacy_prefix || '_projects')) is null then return; end if;

  foreach item in array array['entity_type', 'video_status', 'episode_status', 'message_role', 'job_type', 'job_status', 'chat_mode'] loop
    execute format('alter type public.%I rename to creator_%s', legacy_prefix || '_' || item, item);
  end loop;
  foreach item in array array['projects', 'episodes', 'entities', 'shots', 'chat_sessions', 'chat_messages', 'generation_jobs', 'credit_transactions'] loop
    execute format('alter table public.%I rename to creator_%s', legacy_prefix || '_' || item, item);
  end loop;
  foreach item in array array['projects_user_idx', 'episodes_project_idx', 'entities_project_idx', 'shots_episode_idx', 'sessions_episode_idx', 'messages_session_idx', 'jobs_user_idx'] loop
    execute format('alter index public.%I rename to creator_%s', legacy_prefix || '_' || item, item);
  end loop;
  execute format('alter function public.%I() rename to creator_touch_updated_at', legacy_prefix || '_touch_updated_at');
  foreach item in array array['projects', 'episodes', 'entities', 'shots', 'sessions', 'jobs'] loop
    execute format('alter trigger %I on public.creator_%s rename to creator_%s_updated', legacy_prefix || '_' || item || '_updated', case when item = 'sessions' then 'chat_sessions' else case when item = 'jobs' then 'generation_jobs' else item end end, item);
  end loop;
  foreach item in array array['projects owner', 'episodes owner', 'entities owner', 'shots owner', 'sessions owner', 'messages owner', 'jobs owner', 'credit owner'] loop
    execute format('alter policy %I on public.creator_%s rename to creator %s', legacy_prefix || ' ' || item, case when item like 'sessions%' then 'chat_sessions' when item like 'messages%' then 'chat_messages' when item like 'jobs%' then 'generation_jobs' when item like 'credit%' then 'credit_transactions' else split_part(item, ' ', 1) end, item);
  end loop;
end $$;
