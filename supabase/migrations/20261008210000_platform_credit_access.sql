-- Credit access is opt-in, controlled only by admin-owned site settings.
insert into public.site_settings(key, value) values ('platform_credit_access', '{"enabled":false,"userIds":[]}'::jsonb) on conflict(key) do nothing;

create or replace function public.guard_platform_credit_spending()
returns trigger language plpgsql security definer set search_path = public as $$
declare config jsonb;
begin
  if new.credits_balance < old.credits_balance then
    select value into config from public.site_settings where key = 'platform_credit_access';
    if not (coalesce(config->'enabled' = 'true'::jsonb, false) or coalesce(config->'userIds' ? new.id::text, false)) then
      raise exception 'Platform credits are not enabled for this account';
    end if;
  end if;
  return new;
end $$;
create trigger guard_platform_credit_spending before update of credits_balance on public.profiles
for each row execute function public.guard_platform_credit_spending();
