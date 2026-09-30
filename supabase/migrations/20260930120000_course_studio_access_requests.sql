-- Keep Creator Studio and course-section invitation requests independently
-- deduplicated, even when a user submits two requests at the same time.
create or replace function public.guard_studio_invitation_request()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.topic in ('studio-access', 'course-studio-access') then
    perform pg_advisory_xact_lock(hashtextextended(new.profile_id::text || ':' || new.topic, 0));
    if exists (
      select 1 from public.contact_requests
      where profile_id = new.profile_id and topic = new.topic
    ) then
      raise exception 'Invitation already requested' using errcode='23505';
    end if;
  end if;
  return new;
end; $$;

notify pgrst, 'reload schema';
