create table public.managed_order_drafts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 service_type text not null,
 package_key text not null default '',
 brief jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.managed_order_drafts enable row level security;
revoke all on public.managed_order_drafts from anon, authenticated;
grant select, insert on public.managed_order_drafts to authenticated;
create policy managed_order_drafts_read on public.managed_order_drafts for select to authenticated using (user_id=auth.uid());
create policy managed_order_drafts_create on public.managed_order_drafts for insert to authenticated with check (user_id=auth.uid());
create index managed_order_drafts_owner on public.managed_order_drafts(user_id);
notify pgrst, 'reload schema';
