-- Academy is an additive layer over the existing course, profile, payment,
-- showcase and Creator Studio records.

alter table public.courses
  add column if not exists is_published boolean not null default true,
  add column if not exists is_featured boolean not null default false,
  add column if not exists grants_creator_studio boolean not null default false,
  add column if not exists creator_studio_access_days integer;

-- Older courses remain available; the new flag only hides courses admins
-- deliberately mark as drafts from student queries.
drop policy if exists "courses are publicly readable" on public.courses;
create policy "published courses are publicly readable"
on public.courses for select using (is_published or exists (
  select 1 from public.admin_users where id = auth.uid()
));

drop policy if exists "lessons are publicly readable" on public.lessons;
create policy "published course lessons are readable"
on public.lessons for select using (
  exists (select 1 from public.courses c where c.id = course_id and c.is_published)
  or exists (select 1 from public.admin_users where id = auth.uid())
);

create table if not exists public.digital_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  image_url text,
  product_type text not null default 'agent',
  price numeric(12,2) not null default 0 check (price >= 0),
  is_free boolean not null default false,
  standalone_purchase boolean not null default true,
  included_with_course text[] not null default '{}',
  included_with_coaching boolean not null default false,
  access_url text not null default '',
  grants_creator_studio boolean not null default false,
  access_days integer,
  active boolean not null default false,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.digital_products(name,description,product_type,active,featured)
select 'Script Agent','Turn an idea into a structured AI video script.','agent',false,false
where not exists (select 1 from public.digital_products where lower(name) = 'script agent');
insert into public.digital_products(name,description,product_type,active,featured)
select 'Seedance Prompt Agent','Turn scenes and shots into detailed Seedance video prompts.','agent',false,false
where not exists (select 1 from public.digital_products where lower(name) = 'seedance prompt agent');
alter table public.digital_products enable row level security;
drop policy if exists "active digital products are public" on public.digital_products;
create policy "active digital products are public" on public.digital_products for select
  using (active or exists (select 1 from public.admin_users where id = auth.uid()));
drop policy if exists "admins manage digital products" on public.digital_products;
create policy "admins manage digital products" on public.digital_products for all
  using (exists (select 1 from public.admin_users where id = auth.uid()))
  with check (exists (select 1 from public.admin_users where id = auth.uid()));

create table if not exists public.academy_offers (
  id uuid primary key default gen_random_uuid(),
  offer_type text not null check (offer_type in ('coaching')),
  title text not null,
  description text not null default '',
  price numeric(12,2) not null default 0 check (price >= 0),
  duration_minutes integer not null default 60 check (duration_minutes > 0),
  session_count integer not null default 1 check (session_count > 0),
  benefits jsonb not null default '[]'::jsonb,
  grants_creator_studio boolean not null default false,
  creator_studio_access_days integer,
  active boolean not null default false,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.academy_offers enable row level security;
drop policy if exists "active academy offers are public" on public.academy_offers;
create policy "active academy offers are public" on public.academy_offers for select
  using (active or exists (select 1 from public.admin_users where id = auth.uid()));
drop policy if exists "admins manage academy offers" on public.academy_offers;
create policy "admins manage academy offers" on public.academy_offers for all
  using (exists (select 1 from public.admin_users where id = auth.uid()))
  with check (exists (select 1 from public.admin_users where id = auth.uid()));

create table if not exists public.user_entitlements (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  entitlement_key text not null,
  source_type text not null default 'admin',
  source_id text,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists user_entitlements_source_unique_idx
  on public.user_entitlements(profile_id,entitlement_key,source_type,source_id);
create index if not exists user_entitlements_lookup_idx
  on public.user_entitlements(profile_id, entitlement_key, expires_at);
alter table public.user_entitlements enable row level security;
drop policy if exists "users read own entitlements" on public.user_entitlements;
create policy "users read own entitlements" on public.user_entitlements for select
  using (profile_id = auth.uid() or exists (select 1 from public.admin_users where id = auth.uid()));
drop policy if exists "admins manage entitlements" on public.user_entitlements;
create policy "admins manage entitlements" on public.user_entitlements for all
  using (exists (select 1 from public.admin_users where id = auth.uid()))
  with check (exists (select 1 from public.admin_users where id = auth.uid()));

-- Current Studio access allowed every signed-in account. Preserve every
-- account present when this migration runs; newly created accounts receive
-- access through Academy offers or a direct admin grant.
insert into public.user_entitlements(profile_id, entitlement_key, source_type, source_id)
select p.id, 'creator_studio_access', 'legacy_access', 'pre-academy'
from public.profiles p
where not exists (
    select 1 from public.user_entitlements e
    where e.profile_id = p.id and e.entitlement_key = 'creator_studio_access'
  );

create table if not exists public.student_showcase_submissions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.creator_projects(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  video_url text not null,
  category text not null default 'cinematic',
  display_name text,
  allow_display_name boolean not null default false,
  status text not null default 'pending' check (status in ('pending','approved','rejected','featured')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.course_progress (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  course_id text not null references public.courses(id) on delete cascade,
  completed_chapters integer[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key(profile_id,course_id)
);

create table if not exists public.digital_product_purchases (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.digital_products(id) on delete restrict,
  payment_id text not null unique,
  amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
alter table public.digital_product_purchases enable row level security;
drop policy if exists "users read own product purchases" on public.digital_product_purchases;
create policy "users read own product purchases" on public.digital_product_purchases for select
  using (profile_id = auth.uid() or exists (select 1 from public.admin_users where id = auth.uid()));

create table if not exists public.academy_offer_purchases (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  offer_id uuid not null references public.academy_offers(id) on delete restrict,
  payment_id text not null unique,
  amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
alter table public.academy_offer_purchases enable row level security;
drop policy if exists "users read own academy purchases" on public.academy_offer_purchases;
create policy "users read own academy purchases" on public.academy_offer_purchases for select
  using (profile_id = auth.uid() or exists (select 1 from public.admin_users where id = auth.uid()));
alter table public.course_progress enable row level security;
drop policy if exists "students manage own course progress" on public.course_progress;
create policy "students manage own course progress" on public.course_progress for all
  using (profile_id = auth.uid() or exists (select 1 from public.admin_users where id = auth.uid()))
  with check (profile_id = auth.uid() or exists (select 1 from public.admin_users where id = auth.uid()));
alter table public.student_showcase_submissions enable row level security;
drop policy if exists "students submit own projects" on public.student_showcase_submissions;
create policy "students submit own projects" on public.student_showcase_submissions for insert
  with check (
    profile_id = auth.uid()
    and exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid())
  );
drop policy if exists "students read own submissions" on public.student_showcase_submissions;
create policy "students read own submissions" on public.student_showcase_submissions for select
  using (profile_id = auth.uid() or exists (select 1 from public.admin_users where id = auth.uid()) or status in ('approved','featured'));
drop policy if exists "students edit own pending submissions" on public.student_showcase_submissions;
create policy "students edit own pending submissions" on public.student_showcase_submissions for update
  using (profile_id = auth.uid() and status = 'pending')
  with check (profile_id = auth.uid() and status = 'pending');
drop policy if exists "admins moderate student submissions" on public.student_showcase_submissions;
create policy "admins moderate student submissions" on public.student_showcase_submissions for all
  using (exists (select 1 from public.admin_users where id = auth.uid()))
  with check (exists (select 1 from public.admin_users where id = auth.uid()));

create or replace function public.admin_set_home_variant(p_variant text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admin_users where id = auth.uid()) then
    raise exception 'Admin access required';
  end if;
  if p_variant is null or p_variant not in ('studio','originals','hire','creative-agent','academy') then
    raise exception 'Unknown homepage variant: %', coalesce(p_variant, 'null');
  end if;
  insert into public.site_settings(key,value,updated_at)
  values ('home_variant',jsonb_build_object('variant',p_variant),now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return p_variant;
end;
$$;
revoke execute on function public.admin_set_home_variant(text) from public, anon;
grant execute on function public.admin_set_home_variant(text) to authenticated, service_role;

insert into public.site_settings(key,value)
values ('academy_content', jsonb_build_object(
  'headline', 'Create AI Videos That Don''t Look Like Everyone Else''s AI Videos.',
  'description', 'Learn the workflows behind professional AI films, commercials and cinematic content — then create your own inside AI Director Hub.',
  'instructor_name', '', 'instructor_bio', '', 'instructor_photo', '', 'instructor_experience', '',
  'show_showreel', true, 'show_transformation', true, 'show_courses', true, 'show_workflow', true,
  'show_products', true, 'show_coaching', true, 'show_creator_studio', true, 'show_student_work', true, 'show_instructor', true
)) on conflict (key) do nothing;

create or replace function public.admin_update_academy_content(p_content jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_content jsonb;
begin
  if not exists (select 1 from public.admin_users where id = auth.uid()) then
    raise exception 'Admin access required';
  end if;
  if jsonb_typeof(p_content) <> 'object' then raise exception 'Academy settings must be an object'; end if;
  v_content := p_content;
  insert into public.site_settings(key,value,updated_at) values ('academy_content',v_content,now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return v_content;
end;
$$;
revoke execute on function public.admin_update_academy_content(jsonb) from public, anon;
grant execute on function public.admin_update_academy_content(jsonb) to authenticated, service_role;
