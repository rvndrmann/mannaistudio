-- Activation counter: how many successful generations a profile has ever made.
--
-- Meta's ad delivery is pointed at activation, so it needs to know the moment a
-- profile completes its 1st and its 2nd ever successful generation — the first
-- proves onboarding works, the second proves the product was worth coming back
-- to. Deriving that by counting the credit-usage log is racy: two generations
-- finishing at the same instant both read "none so far" and both report a first
-- generation. A counter the database increments and returns in one statement
-- cannot be read twice, so exactly one caller ever sees the value 1.

alter table public.profiles
  add column if not exists generation_count integer not null default 0;

-- Existing users have generated for months. Starting them at zero would report
-- a first activation for every one of them on their next render, which is the
-- same kind of retroactive noise this work exists to remove. Their credit
-- charges are the record of what they already did, so seed from those: everyone
-- who has generated twice starts past the point where anything can fire.
update public.profiles p
set generation_count = greatest(coalesce(p.generation_count, 0), prior.total)
from (
  select profile_id, count(*)::integer as total
  from public.credit_transactions
  where type = 'generation'
  group by profile_id
) prior
where prior.profile_id = p.id;

create or replace function public.record_successful_generation(p_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is distinct from p_profile_id and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized to record generations for this profile';
  end if;

  update public.profiles
  set generation_count = coalesce(generation_count, 0) + 1
  where id = p_profile_id
  returning generation_count into v_count;

  -- Null when the profile row is missing; the caller treats that as "cannot
  -- tell which generation this was" and reports nothing.
  return v_count;
end;
$$;

grant execute on function public.record_successful_generation(uuid) to authenticated;
