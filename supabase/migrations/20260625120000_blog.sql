-- Blog: SEO content managed from the admin panel.

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  excerpt text default '',
  content text default '',
  cover_image text default '',
  meta_description text default '',
  keywords text default '',
  status text not null default 'draft',
  author text default 'AI Director Hub',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists blog_posts_status_idx on public.blog_posts(status, published_at desc);

alter table public.blog_posts enable row level security;

drop policy if exists "published posts are public" on public.blog_posts;
create policy "published posts are public" on public.blog_posts
  for select using (status = 'published' or exists (select 1 from public.admin_users where id = auth.uid()));

drop policy if exists "admins manage posts" on public.blog_posts;
create policy "admins manage posts" on public.blog_posts
  for all using (exists (select 1 from public.admin_users where id = auth.uid()))
  with check (exists (select 1 from public.admin_users where id = auth.uid()));
