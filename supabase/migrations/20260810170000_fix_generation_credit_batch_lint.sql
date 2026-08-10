create or replace function public.creator_reserve_generation_credits_batch(p_job_ids uuid[])
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_total integer;
  v_job record;
  v_ids uuid[] := '{}'::uuid[];
  v_reservation uuid;
begin
  if coalesce(array_length(p_job_ids, 1), 0) = 0 then raise exception 'no jobs supplied'; end if;
  select count(*), sum(estimated_credits) into v_count, v_total
  from public.creator_generation_jobs
  where id = any(p_job_ids) and user_id = auth.uid() and status = 'approved' and estimated_credits > 0;
  if v_count <> array_length(p_job_ids, 1) then raise exception 'one or more jobs unavailable'; end if;

  insert into public.creator_credit_accounts(user_id) values (auth.uid()) on conflict (user_id) do nothing;
  update public.creator_credit_accounts set reserved = reserved + v_total, updated_at = now()
  where user_id = auth.uid() and balance - reserved >= v_total;
  if not found then raise exception 'insufficient credits'; end if;

  for v_job in select * from public.creator_generation_jobs where id = any(p_job_ids) and user_id = auth.uid() for update loop
    insert into public.creator_credit_reservations(user_id, project_id, job_id, amount)
    values (auth.uid(), v_job.project_id, v_job.id, v_job.estimated_credits)
    returning id into v_reservation;
    v_ids := array_append(v_ids, v_reservation);
    insert into public.creator_generation_job_events(job_id, status, details)
    values (v_job.id, 'approved', jsonb_build_object('credits_reserved', v_job.estimated_credits));
  end loop;
  return v_ids;
end;
$$;

grant execute on function public.creator_reserve_generation_credits_batch(uuid[]) to authenticated;
