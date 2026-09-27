create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  topic text not null default 'general',
  status text not null default 'pending' check (status in ('pending','resolved')),
  created_at timestamptz not null default now()
);
alter table public.contact_requests enable row level security;
create policy "users read own contact requests" on public.contact_requests for select to authenticated using (profile_id=auth.uid());
create policy "admins manage contact requests" on public.contact_requests for all to authenticated
using (exists(select 1 from public.admin_users where id=auth.uid()))
with check (exists(select 1 from public.admin_users where id=auth.uid()));
grant select,update,delete on public.contact_requests to authenticated;
grant all on public.contact_requests to service_role;
notify pgrst, 'reload schema';
