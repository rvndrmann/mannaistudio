-- Make Originals access explicit per episode and preserve the old free window.
alter table public.originals_episodes add column if not exists is_free boolean not null default false;
update public.originals_episodes e set is_free = true from public.originals_series s
where e.series_id = s.id and e.episode_number <= s.free_episodes and e.is_free = false;

create or replace function public.admin_upsert_originals_episode(
  p_id uuid, p_series_id uuid, p_episode_number int, p_title text, p_description text,
  p_video_url text, p_thumbnail_url text, p_duration_seconds int, p_is_published boolean,
  p_is_free boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.admin_users where id = auth.uid()) then raise exception 'Admin access required'; end if;
  insert into public.originals_episodes as e (id, series_id, episode_number, title, description, video_url, thumbnail_url, duration_seconds, is_published, is_free, updated_at)
  values (coalesce(p_id, gen_random_uuid()), p_series_id, p_episode_number, btrim(p_title), p_description, p_video_url, p_thumbnail_url, p_duration_seconds, coalesce(p_is_published, true), coalesce(p_is_free, false), now())
  on conflict (id) do update set series_id=excluded.series_id, episode_number=excluded.episode_number, title=excluded.title, description=excluded.description, video_url=excluded.video_url, thumbnail_url=excluded.thumbnail_url, duration_seconds=excluded.duration_seconds, is_published=excluded.is_published, is_free=excluded.is_free, updated_at=now()
  returning e.id into v_id;
  return v_id;
end; $$;

revoke all on function public.admin_upsert_originals_episode(uuid, uuid, int, text, text, text, text, int, boolean) from public, anon;
revoke all on function public.admin_upsert_originals_episode(uuid, uuid, int, text, text, text, text, int, boolean, boolean) from public, anon;
grant execute on function public.admin_upsert_originals_episode(uuid, uuid, int, text, text, text, text, int, boolean, boolean) to authenticated, service_role;

create or replace function public.originals_free_episode_url(p_episode_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select e.video_url from public.originals_episodes e join public.originals_series s on s.id=e.series_id
  where e.id=p_episode_id and e.is_published and s.is_published and e.is_free;
$$;
notify pgrst, 'reload schema';
