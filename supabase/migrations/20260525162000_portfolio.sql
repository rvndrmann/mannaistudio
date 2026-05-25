-- Run this in the Supabase SQL editor for the AI Mastery portfolio feature.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text not null default 'Student',
    avatar_url text not null default '',
    email text not null default '',
    created_at timestamptz not null default now()
);

alter table public.profiles
add column if not exists portfolio_slug text unique,
add column if not exists is_portfolio_public boolean not null default true,
add column if not exists xp integer not null default 0,
add column if not exists level integer not null default 1;

create table if not exists public.portfolio_items (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    title text not null,
    video_url text not null,
    thumbnail_url text not null,
    views text not null default '0',
    likes integer not null default 0,
    created_at timestamptz not null default now()
);

create index if not exists portfolio_items_profile_id_created_at_idx
on public.portfolio_items(profile_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.portfolio_items enable row level security;

drop policy if exists "profiles are readable when portfolio is public" on public.profiles;
create policy "profiles are readable when portfolio is public"
on public.profiles
for select
using (is_portfolio_public = true or auth.uid() = id);

drop policy if exists "students can update their own profile" on public.profiles;
create policy "students can update their own profile"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "students can insert their own profile" on public.profiles;
create policy "students can insert their own profile"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "portfolio items are readable for public portfolios" on public.portfolio_items;
create policy "portfolio items are readable for public portfolios"
on public.portfolio_items
for select
using (
    profile_id = auth.uid()
    or exists (
        select 1
        from public.profiles
        where profiles.id = portfolio_items.profile_id
        and profiles.is_portfolio_public = true
    )
);

drop policy if exists "students can insert their own portfolio items" on public.portfolio_items;
create policy "students can insert their own portfolio items"
on public.portfolio_items
for insert
with check (auth.uid() = profile_id);

drop policy if exists "students can update their own portfolio items" on public.portfolio_items;
create policy "students can update their own portfolio items"
on public.portfolio_items
for update
using (auth.uid() = profile_id)
with check (auth.uid() = profile_id);

drop policy if exists "students can delete their own portfolio items" on public.portfolio_items;
create policy "students can delete their own portfolio items"
on public.portfolio_items
for delete
using (auth.uid() = profile_id);

insert into storage.buckets (id, name, public)
values ('portfolio-media', 'portfolio-media', true)
on conflict (id) do update set public = true;

drop policy if exists "public can read portfolio media" on storage.objects;
create policy "public can read portfolio media"
on storage.objects
for select
using (bucket_id = 'portfolio-media');

drop policy if exists "students can upload portfolio media" on storage.objects;
create policy "students can upload portfolio media"
on storage.objects
for insert
with check (
    bucket_id = 'portfolio-media'
    and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "students can update their own portfolio media" on storage.objects;
create policy "students can update their own portfolio media"
on storage.objects
for update
using (
    bucket_id = 'portfolio-media'
    and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
    bucket_id = 'portfolio-media'
    and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "students can delete their own portfolio media" on storage.objects;
create policy "students can delete their own portfolio media"
on storage.objects
for delete
using (
    bucket_id = 'portfolio-media'
    and auth.uid()::text = (storage.foldername(name))[1]
);
