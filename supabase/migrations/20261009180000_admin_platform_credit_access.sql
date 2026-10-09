-- Admin operators retain platform credit access; regular accounts stay opt-in.
create or replace function public.guard_platform_credit_spending()
returns trigger language plpgsql security definer set search_path = public as $$
declare config jsonb;
begin
  if new.credits_balance < old.credits_balance then
    if exists(select 1 from public.admin_users where id=new.id) then return new; end if;
    select value into config from public.site_settings where key = 'platform_credit_access';
    if not (coalesce(config->'enabled' = 'true'::jsonb, false) or coalesce(config->'userIds' ? new.id::text, false)) then
      raise exception 'Platform credits are not enabled for this account';
    end if;
  end if;
  return new;
end $$;
