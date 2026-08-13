alter table public.creator_generation_jobs
  add column if not exists credits_refunded integer not null default 0,
  add column if not exists credit_refunded_at timestamptz;

create unique index if not exists credit_transactions_refund_key_idx
  on public.credit_transactions ((metadata->>'refund_key'))
  where type = 'refund' and metadata ? 'refund_key';

create or replace function public.refund_generation_credits(
  p_user_id uuid,
  p_amount integer,
  p_refund_key text,
  p_description text default 'Failed generation refund',
  p_job_id uuid default null
)
returns table(refunded boolean, new_balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if auth.uid() is distinct from p_user_id and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized to refund these credits';
  end if;
  if p_amount <= 0 then raise exception 'Refund amount must be positive'; end if;
  if nullif(trim(p_refund_key), '') is null then raise exception 'Refund key is required'; end if;

  select credits_balance into v_balance from public.profiles where id = p_user_id for update;
  if v_balance is null then raise exception 'Credit profile not found'; end if;

  if exists (
    select 1 from public.credit_transactions
    where profile_id = p_user_id and type = 'refund' and metadata->>'refund_key' = p_refund_key
  ) then
    return query select false, v_balance;
    return;
  end if;

  update public.profiles set credits_balance = credits_balance + p_amount where id = p_user_id
  returning credits_balance into v_balance;

  insert into public.credit_transactions(profile_id, amount, balance_after, type, description, metadata)
  values (p_user_id, p_amount, v_balance, 'refund', p_description,
    jsonb_strip_nulls(jsonb_build_object('refund_key', p_refund_key, 'job_id', p_job_id)));

  if p_job_id is not null then
    update public.creator_generation_jobs
    set credits_refunded = greatest(credits_refunded, p_amount), credit_refunded_at = now()
    where id = p_job_id and user_id = p_user_id;
  end if;

  return query select true, v_balance;
end;
$$;

grant execute on function public.refund_generation_credits(uuid, integer, text, text, uuid) to authenticated;

-- Reconcile legacy direct-generation charges. Older routes deducted first but
-- did not link the transaction to its job. A ten-second match is narrow enough
-- to pair the charge and job created by the same request without guessing.
do $$
declare
  v_job record;
  v_charge record;
  v_balance integer;
begin
  for v_job in
    select j.* from public.creator_generation_jobs j
    where j.status in ('failed', 'cancelled') and coalesce(j.credits_refunded, 0) = 0
  loop
    select t.* into v_charge
    from public.credit_transactions t
    where t.profile_id = v_job.user_id
      and t.type = 'generation'
      and t.amount < 0
      and t.model = v_job.model
      and t.created_at between v_job.created_at - interval '10 seconds' and v_job.created_at
      and not (t.metadata ? 'generation_job_id')
    order by t.created_at desc
    limit 1;

    if v_charge.id is null then continue; end if;

    update public.profiles set credits_balance = credits_balance + abs(v_charge.amount)
    where id = v_job.user_id returning credits_balance into v_balance;

    update public.credit_transactions
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('generation_job_id', v_job.id)
    where id = v_charge.id;

    insert into public.credit_transactions(profile_id, amount, balance_after, type, model, description, metadata)
    values (v_job.user_id, abs(v_charge.amount), v_balance, 'refund', v_job.model,
      'Refund: failed generation', jsonb_build_object('refund_key', 'legacy-job:' || v_job.id, 'job_id', v_job.id, 'charge_transaction_id', v_charge.id));

    update public.creator_generation_jobs
    set estimated_credits = abs(v_charge.amount), credits_used = abs(v_charge.amount),
        credits_refunded = abs(v_charge.amount), credit_refunded_at = now()
    where id = v_job.id;
  end loop;
end
$$;
