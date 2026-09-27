alter table public.originals_series add column if not exists season_pass_price_inr integer not null default 49 check (season_pass_price_inr >= 0);
alter table public.originals_episodes add column if not exists is_free boolean not null default false;

create or replace function public.admin_set_originals_access(p_series_id uuid, p_season_pass_price integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.admin_users where id=auth.uid()) then raise exception 'Admin access required'; end if;
  if p_season_pass_price is null or p_season_pass_price < 0 then raise exception 'Price cannot be negative'; end if;
  update public.originals_series set season_pass_price_inr=p_season_pass_price, updated_at=now() where id=p_series_id;
  if not found then raise exception 'Series not found'; end if;
end; $$;
revoke all on function public.admin_set_originals_access(uuid,integer) from public, anon;
grant execute on function public.admin_set_originals_access(uuid,integer) to authenticated, service_role;

create or replace function public.admin_set_originals_episode_free(p_episode_id uuid, p_is_free boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.admin_users where id=auth.uid()) then raise exception 'Admin access required'; end if;
  update public.originals_episodes set is_free=coalesce(p_is_free,false) where id=p_episode_id;
  if not found then raise exception 'Episode not found'; end if;
end; $$;
revoke all on function public.admin_set_originals_episode_free(uuid,boolean) from public, anon;
grant execute on function public.admin_set_originals_episode_free(uuid,boolean) to authenticated, service_role;

create or replace function public.originals_free_episode_url(p_episode_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select e.video_url from public.originals_episodes e join public.originals_series s on s.id=e.series_id
  where e.id=p_episode_id and e.is_published and s.is_published
  and (s.season_pass_price_inr=0 or e.is_free or e.episode_number<=s.free_episodes);
$$;

-- Retain the existing rental, balance locking and pass implementation for paid episodes.
do $$ begin
  if to_regprocedure('public.originals_unlock_paid_episode(uuid,uuid)') is null then
    alter function public.unlock_originals_episode(uuid,uuid) rename to originals_unlock_paid_episode;
  end if;
end $$;
revoke all on function public.originals_unlock_paid_episode(uuid,uuid) from public, anon, authenticated;
grant execute on function public.originals_unlock_paid_episode(uuid,uuid) to service_role;
create or replace function public.unlock_originals_episode(p_profile_id uuid,p_episode_id uuid)
returns table(status text,credits_charged integer,new_balance integer,video_url text)
language plpgsql security definer set search_path=public as $$
declare v_url text; v_balance integer;
begin
  if auth.uid() is distinct from p_profile_id and coalesce(auth.role(),'') <> 'service_role' then raise exception 'Not authorized'; end if;
  v_url := public.originals_free_episode_url(p_episode_id);
  if v_url is not null then
    select coalesce(credits_balance,0) into v_balance from public.profiles where id=p_profile_id;
    return query select 'free'::text,0,coalesce(v_balance,0),v_url;
    return;
  end if;
  return query select * from public.originals_unlock_paid_episode(p_profile_id,p_episode_id);
end; $$;
revoke all on function public.unlock_originals_episode(uuid,uuid) from public, anon;
grant execute on function public.unlock_originals_episode(uuid,uuid) to authenticated, service_role;
notify pgrst, 'reload schema';
