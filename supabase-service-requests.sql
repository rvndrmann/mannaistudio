-- Run this in the Supabase SQL editor to store AI Services form submissions.

create extension if not exists pgcrypto;

create table if not exists public.service_requests (
    id uuid primary key default gen_random_uuid(),
    full_name text not null,
    email text not null,
    service_type text not null,
    project_description text not null,
    budget_range text not null default '',
    timeline text not null default '',
    status text not null default 'new' check (status in ('new', 'contacted', 'closed')),
    created_at timestamptz not null default now()
);

create index if not exists service_requests_created_at_idx
on public.service_requests(created_at desc);

create index if not exists service_requests_status_idx
on public.service_requests(status);

alter table public.service_requests enable row level security;

drop policy if exists "anyone can submit service requests" on public.service_requests;
create policy "anyone can submit service requests"
on public.service_requests
for insert
with check (true);

-- This admin page currently has no admin-role auth gate, so this policy lets
-- the existing dashboard read and update requests from the browser client.
-- Tighten this once an admin role table is added.
drop policy if exists "dashboard can read service requests" on public.service_requests;
create policy "dashboard can read service requests"
on public.service_requests
for select
using (true);

drop policy if exists "dashboard can update service request status" on public.service_requests;
create policy "dashboard can update service request status"
on public.service_requests
for update
using (true)
with check (true);
