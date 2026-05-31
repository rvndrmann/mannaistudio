-- Convert AI Services requests into approved job posts with creator bids.

create extension if not exists pgcrypto;

alter table public.service_requests
add column if not exists poster_id uuid references public.profiles(id) on delete set null,
add column if not exists phone text not null default '',
add column if not exists title text not null default '',
add column if not exists selected_bid_id uuid;

alter table public.service_requests
drop constraint if exists service_requests_status_check;

update public.service_requests
set status = case
    when status = 'new' then 'pending'
    when status = 'contacted' then 'approved'
    when status in ('pending', 'approved', 'rejected', 'awarded', 'closed') then status
    else 'pending'
end
where status is not null;

alter table public.service_requests
add constraint service_requests_status_check
check (status in ('pending', 'approved', 'rejected', 'awarded', 'closed'));

update public.service_requests
set title = service_type
where title = '';

create table if not exists public.service_job_bids (
    id uuid primary key default gen_random_uuid(),
    job_id uuid not null references public.service_requests(id) on delete cascade,
    bidder_id uuid not null references public.profiles(id) on delete cascade,
    bidder_name text not null default '',
    bidder_email text not null default '',
    bidder_phone text not null default '',
    offer_amount text not null default '',
    message text not null default '',
    status text not null default 'pending' check (status in ('pending', 'selected', 'rejected')),
    created_at timestamptz not null default now()
);

alter table public.service_job_bids
add constraint service_job_bids_job_bidder_unique unique (job_id, bidder_id);

alter table public.service_job_bids enable row level security;

drop policy if exists "anyone can submit service requests" on public.service_requests;
create policy "authenticated users can post jobs"
on public.service_requests for insert
with check (auth.uid() = poster_id);

drop policy if exists "dashboard can read service requests" on public.service_requests;
create policy "users can read live or owned jobs"
on public.service_requests for select
using (
    status in ('approved', 'awarded', 'closed')
    or poster_id = auth.uid()
    or exists (select 1 from public.admin_users where id = auth.uid())
);

drop policy if exists "dashboard can update service request status" on public.service_requests;
create policy "admins can update service jobs"
on public.service_requests for update
using (exists (select 1 from public.admin_users where id = auth.uid()))
with check (exists (select 1 from public.admin_users where id = auth.uid()));

drop policy if exists "job bids are readable to involved users" on public.service_job_bids;
create policy "job bids are readable to involved users"
on public.service_job_bids for select
using (
    bidder_id = auth.uid()
    or exists (
        select 1 from public.service_requests
        where service_requests.id = service_job_bids.job_id
        and service_requests.poster_id = auth.uid()
    )
    or exists (select 1 from public.admin_users where id = auth.uid())
);

drop policy if exists "authenticated users can bid on approved jobs" on public.service_job_bids;
create policy "authenticated users can bid on approved jobs"
on public.service_job_bids for insert
with check (
    bidder_id = auth.uid()
    and exists (
        select 1 from public.service_requests
        where service_requests.id = service_job_bids.job_id
        and service_requests.status = 'approved'
        and service_requests.poster_id <> auth.uid()
    )
);

create or replace function public.select_service_job_bid(p_job_id uuid, p_bid_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_poster_id uuid;
begin
    select poster_id into v_poster_id
    from public.service_requests
    where id = p_job_id;

    if v_poster_id is null or v_poster_id <> auth.uid() then
        raise exception 'Only the job poster can select a bid';
    end if;

    update public.service_job_bids
    set status = case when id = p_bid_id then 'selected' else 'rejected' end
    where job_id = p_job_id;

    update public.service_requests
    set status = 'awarded', selected_bid_id = p_bid_id
    where id = p_job_id;
end;
$$;
