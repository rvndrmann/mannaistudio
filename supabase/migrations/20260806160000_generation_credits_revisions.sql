-- Provider-neutral generation accounting and revision history.
alter table public.creator_generation_jobs
  add column if not exists project_id uuid references public.creator_projects(id) on delete cascade,
  add column if not exists operation text,
  add column if not exists idempotency_key text,
  add column if not exists routing_decision jsonb not null default '{}'::jsonb,
  add column if not exists cost_estimate jsonb not null default '{}'::jsonb,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_retry_at timestamptz,
  add column if not exists replaces_job_id uuid references public.creator_generation_jobs(id) on delete set null,
  add column if not exists callback_verified_at timestamptz;

create unique index if not exists creator_jobs_user_idempotency_idx
  on public.creator_generation_jobs(user_id, idempotency_key)
  where idempotency_key is not null;
create unique index if not exists creator_jobs_provider_id_idx
  on public.creator_generation_jobs(provider, provider_job_id)
  where provider_job_id is not null;
create index if not exists creator_jobs_project_status_idx
  on public.creator_generation_jobs(project_id, status, created_at desc);

create table if not exists public.creator_credit_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  reserved integer not null default 0 check (reserved >= 0 and reserved <= balance),
  lifetime_purchased integer not null default 0 check (lifetime_purchased >= 0),
  lifetime_used integer not null default 0 check (lifetime_used >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_credit_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.creator_projects(id) on delete cascade,
  job_id uuid not null unique references public.creator_generation_jobs(id) on delete cascade,
  amount integer not null check (amount > 0),
  status text not null default 'reserved' check (status in ('reserved', 'captured', 'released')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.creator_generation_job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.creator_generation_jobs(id) on delete cascade,
  status public.creator_job_status not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.creator_revision_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.creator_projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  instruction text not null,
  parsed_change jsonb not null default '{}'::jsonb,
  affected_entities jsonb not null default '[]'::jsonb,
  dependencies jsonb not null default '[]'::jsonb,
  locked_assets jsonb not null default '[]'::jsonb,
  estimated_credits integer not null default 0 check (estimated_credits >= 0),
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'applied', 'rejected', 'reverted', 'failed')),
  parent_revision_id uuid references public.creator_revision_requests(id) on delete set null,
  snapshot_before jsonb,
  snapshot_after jsonb,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  reverted_at timestamptz
);

create index if not exists creator_revision_project_idx on public.creator_revision_requests(project_id, created_at desc);
create index if not exists creator_credit_reservations_user_idx on public.creator_credit_reservations(user_id, status);
create index if not exists creator_job_events_job_idx on public.creator_generation_job_events(job_id, created_at);

alter table public.creator_credit_accounts enable row level security;
alter table public.creator_credit_reservations enable row level security;
alter table public.creator_generation_job_events enable row level security;
alter table public.creator_revision_requests enable row level security;

create policy "creator credit accounts read" on public.creator_credit_accounts for select using (user_id = auth.uid());
create policy "creator credit reservations read" on public.creator_credit_reservations for select using (user_id = auth.uid());
create policy "creator job events read" on public.creator_generation_job_events for select using (exists (select 1 from public.creator_generation_jobs j where j.id = job_id and j.user_id = auth.uid()));
create policy "creator revisions owner" on public.creator_revision_requests for all using (user_id = auth.uid() and exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid())) with check (user_id = auth.uid() and exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid()));

drop policy if exists "creator jobs owner" on public.creator_generation_jobs;
create policy "creator jobs read" on public.creator_generation_jobs for select using (user_id = auth.uid());
create policy "creator jobs request insert" on public.creator_generation_jobs for insert with check (
  user_id = auth.uid()
  and status in ('awaiting_approval', 'approved')
  and provider_job_id is null
  and credits_used = 0
  and exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid())
);

create or replace function public.creator_reserve_generation_credits(p_job_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.creator_generation_jobs;
  v_reservation uuid;
begin
  select * into v_job from public.creator_generation_jobs
  where id = p_job_id and user_id = auth.uid() and status = 'approved'
  for update;
  if v_job.id is null then raise exception 'job unavailable'; end if;
  if v_job.estimated_credits <= 0 then raise exception 'invalid credit estimate'; end if;

  insert into public.creator_credit_accounts(user_id) values (auth.uid()) on conflict (user_id) do nothing;
  update public.creator_credit_accounts
  set reserved = reserved + v_job.estimated_credits, updated_at = now()
  where user_id = auth.uid() and balance - reserved >= v_job.estimated_credits;
  if not found then raise exception 'insufficient credits'; end if;

  insert into public.creator_credit_reservations(user_id, project_id, job_id, amount)
  values (auth.uid(), v_job.project_id, v_job.id, v_job.estimated_credits)
  returning id into v_reservation;
  insert into public.creator_generation_job_events(job_id, status, details)
  values (v_job.id, 'approved', jsonb_build_object('credits_reserved', v_job.estimated_credits));
  return v_reservation;
end;
$$;

grant execute on function public.creator_reserve_generation_credits(uuid) to authenticated;

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
  v_ids uuid[] := '{}';
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

create or replace function public.creator_cancel_unreserved_jobs(p_job_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  update public.creator_generation_jobs j
  set status = 'cancelled', cancelled_at = now(), error = 'Credit reservation failed'
  where j.id = any(p_job_ids) and j.user_id = auth.uid() and j.status = 'approved'
    and not exists (select 1 from public.creator_credit_reservations r where r.job_id = j.id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.creator_cancel_unreserved_jobs(uuid[]) to authenticated;

create or replace function public.creator_resolve_generation_credits(p_job_id uuid, p_outcome text, p_actual_credits integer default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res public.creator_credit_reservations;
  v_actual integer;
begin
  if p_outcome not in ('capture', 'release') then raise exception 'invalid outcome'; end if;
  select * into v_res from public.creator_credit_reservations where job_id = p_job_id and user_id = auth.uid() and status = 'reserved' for update;
  if v_res.id is null then raise exception 'reservation unavailable'; end if;
  v_actual := least(v_res.amount, greatest(coalesce(p_actual_credits, v_res.amount), 0));
  update public.creator_credit_accounts set
    balance = balance - case when p_outcome = 'capture' then v_actual else 0 end,
    reserved = reserved - v_res.amount,
    lifetime_used = lifetime_used + case when p_outcome = 'capture' then v_actual else 0 end,
    updated_at = now()
  where user_id = auth.uid();
  update public.creator_credit_reservations set status = case when p_outcome = 'capture' then 'captured' else 'released' end, resolved_at = now() where id = v_res.id;
  return true;
end;
$$;

grant execute on function public.creator_resolve_generation_credits(uuid, text, integer) to authenticated;
