-- Serialize invitation submissions so simultaneous clicks cannot create duplicates.
create or replace function public.guard_studio_invitation_request()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.topic='studio-access' then
    perform pg_advisory_xact_lock(hashtextextended(new.profile_id::text, 0));
    if exists(select 1 from public.contact_requests where profile_id=new.profile_id and topic='studio-access') then
      raise exception 'Studio invitation already requested' using errcode='23505';
    end if;
  end if;
  return new;
end; $$;
create trigger guard_studio_invitation_request before insert on public.contact_requests
for each row execute function public.guard_studio_invitation_request();

-- Paid overrides must also apply to episodes inside the legacy free window.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.originals_unlock_paid_episode(uuid,uuid)'::regprocedure);
  definition := replace(definition,
    'v_episode.episode_number <= v_series.free_episodes', 'v_episode.is_free');
  execute definition;
end; $$;
notify pgrst, 'reload schema';
