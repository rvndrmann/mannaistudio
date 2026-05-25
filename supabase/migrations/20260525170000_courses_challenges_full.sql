-- Full backend setup: courses, lessons, enrollments, challenges, submissions, showcase, storage buckets

create extension if not exists pgcrypto;

-----------------------------------------------------
-- 1. COURSES
-----------------------------------------------------
create table if not exists public.courses (
    id text primary key,
    title text not null,
    description text not null default '',
    thumbnail text not null default '',
    xp integer not null default 0,
    duration text not null default '',
    level text not null default 'Beginner',
    chapters integer not null default 0,
    instructor text not null default '',
    price text not null default 'Free',
    created_at timestamptz not null default now()
);

alter table public.courses enable row level security;

create policy "courses are publicly readable"
on public.courses for select using (true);

-----------------------------------------------------
-- 2. LESSONS
-----------------------------------------------------
create table if not exists public.lessons (
    id uuid primary key default gen_random_uuid(),
    course_id text not null references public.courses(id) on delete cascade,
    title text not null,
    duration text not null default '00:00',
    video_url text not null default '',
    "order" integer not null default 0,
    resources jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists lessons_course_id_order_idx
on public.lessons(course_id, "order");

alter table public.lessons enable row level security;

create policy "lessons are publicly readable"
on public.lessons for select using (true);

-----------------------------------------------------
-- 3. ENROLLMENTS
-----------------------------------------------------
create table if not exists public.enrollments (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    course_id text not null references public.courses(id) on delete cascade,
    status text not null default 'active' check (status in ('active', 'expired', 'pending')),
    payment_id text not null default 'free',
    created_at timestamptz not null default now(),
    unique (profile_id, course_id)
);

create index if not exists enrollments_profile_id_idx
on public.enrollments(profile_id);

alter table public.enrollments enable row level security;

create policy "users can read their own enrollments"
on public.enrollments for select using (auth.uid() = profile_id);

create policy "users can insert their own enrollments"
on public.enrollments for insert with check (auth.uid() = profile_id);

create policy "users can update their own enrollments"
on public.enrollments for update
using (auth.uid() = profile_id)
with check (auth.uid() = profile_id);

-----------------------------------------------------
-- 4. CHALLENGES
-----------------------------------------------------
create table if not exists public.challenges (
    id text primary key,
    title text not null,
    description text not null default '',
    prize text not null default '',
    deadline timestamptz,
    participants integer not null default 0,
    difficulty text not null default 'Medium',
    winner_id uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now()
);

alter table public.challenges enable row level security;

create policy "challenges are publicly readable"
on public.challenges for select using (true);

-----------------------------------------------------
-- 5. CHALLENGE SUBMISSIONS
-----------------------------------------------------
create table if not exists public.challenge_submissions (
    id uuid primary key default gen_random_uuid(),
    challenge_id text not null references public.challenges(id) on delete cascade,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    student_name text not null default '',
    video_url text not null,
    thumbnail text not null default '',
    created_at timestamptz not null default now()
);

create index if not exists challenge_submissions_challenge_id_idx
on public.challenge_submissions(challenge_id, created_at desc);

alter table public.challenge_submissions enable row level security;

create policy "challenge submissions are publicly readable"
on public.challenge_submissions for select using (true);

create policy "authenticated users can submit to challenges"
on public.challenge_submissions for insert
with check (auth.uid() = profile_id);

create policy "users can update their own submissions"
on public.challenge_submissions for update
using (auth.uid() = profile_id)
with check (auth.uid() = profile_id);

create policy "users can delete their own submissions"
on public.challenge_submissions for delete
using (auth.uid() = profile_id);

-----------------------------------------------------
-- 6. SHOWCASE ITEMS (admin curated)
-----------------------------------------------------
create table if not exists public.showcase_items (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    description text not null default '',
    thumbnail text not null default '',
    video_url text not null default '',
    created_at timestamptz not null default now()
);

alter table public.showcase_items enable row level security;

create policy "showcase items are publicly readable"
on public.showcase_items for select using (true);

-----------------------------------------------------
-- 7. ADMIN USERS
-----------------------------------------------------
create table if not exists public.admin_users (
    id uuid primary key references public.profiles(id) on delete cascade,
    role text not null default 'admin' check (role in ('admin', 'super_admin')),
    created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

create policy "admins can read admin_users"
on public.admin_users for select using (auth.uid() = id);

-- Admin write policies for content tables
create policy "admins can insert courses"
on public.courses for insert
with check (exists (select 1 from public.admin_users where id = auth.uid()));

create policy "admins can update courses"
on public.courses for update
using (exists (select 1 from public.admin_users where id = auth.uid()))
with check (exists (select 1 from public.admin_users where id = auth.uid()));

create policy "admins can delete courses"
on public.courses for delete
using (exists (select 1 from public.admin_users where id = auth.uid()));

create policy "admins can insert lessons"
on public.lessons for insert
with check (exists (select 1 from public.admin_users where id = auth.uid()));

create policy "admins can update lessons"
on public.lessons for update
using (exists (select 1 from public.admin_users where id = auth.uid()))
with check (exists (select 1 from public.admin_users where id = auth.uid()));

create policy "admins can delete lessons"
on public.lessons for delete
using (exists (select 1 from public.admin_users where id = auth.uid()));

create policy "admins can insert challenges"
on public.challenges for insert
with check (exists (select 1 from public.admin_users where id = auth.uid()));

create policy "admins can update challenges"
on public.challenges for update
using (exists (select 1 from public.admin_users where id = auth.uid()))
with check (exists (select 1 from public.admin_users where id = auth.uid()));

create policy "admins can delete challenges"
on public.challenges for delete
using (exists (select 1 from public.admin_users where id = auth.uid()));

create policy "admins can insert showcase items"
on public.showcase_items for insert
with check (exists (select 1 from public.admin_users where id = auth.uid()));

create policy "admins can update showcase items"
on public.showcase_items for update
using (exists (select 1 from public.admin_users where id = auth.uid()))
with check (exists (select 1 from public.admin_users where id = auth.uid()));

create policy "admins can delete showcase items"
on public.showcase_items for delete
using (exists (select 1 from public.admin_users where id = auth.uid()));

create policy "admins can read all enrollments"
on public.enrollments for select
using (exists (select 1 from public.admin_users where id = auth.uid()));

-----------------------------------------------------
-- 8. STORAGE BUCKETS
-----------------------------------------------------

-- Videos bucket (course lesson videos)
insert into storage.buckets (id, name, public)
values ('videos', 'videos', true)
on conflict (id) do update set public = true;

create policy "public can read videos"
on storage.objects for select using (bucket_id = 'videos');

create policy "admins can upload videos"
on storage.objects for insert
with check (
    bucket_id = 'videos'
    and exists (select 1 from public.admin_users where id = auth.uid())
);

create policy "admins can update videos"
on storage.objects for update
using (
    bucket_id = 'videos'
    and exists (select 1 from public.admin_users where id = auth.uid())
)
with check (
    bucket_id = 'videos'
    and exists (select 1 from public.admin_users where id = auth.uid())
);

create policy "admins can delete videos"
on storage.objects for delete
using (
    bucket_id = 'videos'
    and exists (select 1 from public.admin_users where id = auth.uid())
);

-- Thumbnails bucket
insert into storage.buckets (id, name, public)
values ('thumbnails', 'thumbnails', true)
on conflict (id) do update set public = true;

create policy "public can read thumbnails"
on storage.objects for select using (bucket_id = 'thumbnails');

create policy "admins can upload thumbnails"
on storage.objects for insert
with check (
    bucket_id = 'thumbnails'
    and exists (select 1 from public.admin_users where id = auth.uid())
);

create policy "admins can update thumbnails"
on storage.objects for update
using (
    bucket_id = 'thumbnails'
    and exists (select 1 from public.admin_users where id = auth.uid())
)
with check (
    bucket_id = 'thumbnails'
    and exists (select 1 from public.admin_users where id = auth.uid())
);

create policy "admins can delete thumbnails"
on storage.objects for delete
using (
    bucket_id = 'thumbnails'
    and exists (select 1 from public.admin_users where id = auth.uid())
);

-----------------------------------------------------
-- 9. SEED COURSES FROM MOCK DATA
-----------------------------------------------------
insert into public.courses (id, title, description, thumbnail, xp, duration, level, chapters, instructor, price) values
('ai-video-101', 'AI Video Fundamentals', 'Master the basics of AI video generation using Runway, Pika, and Luma.', 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800', 1200, '4.5 Hours', 'Beginner', 8, 'Alex Rivera', 'Free'),
('advanced-cinematography', 'AI Cinematography Masterclass', 'Learn professional lighting, framing, and movement techniques with AI tools.', 'https://images.unsplash.com/photo-1633167606207-d840b5070fc2?auto=format&fit=crop&q=80&w=800', 2500, '6.2 Hours', 'Intermediate', 12, 'Sarah Chen', '$49'),
('ai-documentary', 'AI Storytelling & Documentaries', 'Create compelling narratives and documentaries using Gen-3 and Sora.', 'https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=800', 3000, '8 Hours', 'Advanced', 15, 'Marcus Thorne', '$99'),
('music-video-ai', 'AI Music Video Production', 'Sync AI visuals perfectly with music for high-end music video production.', 'https://images.unsplash.com/photo-1514525253361-bee8d48dce2b?auto=format&fit=crop&q=80&w=800', 1800, '5 Hours', 'Intermediate', 10, 'Elena Vance', '$29')
on conflict (id) do nothing;

-- Seed lessons for AI Video Fundamentals
insert into public.lessons (course_id, title, duration, video_url, "order", resources) values
('ai-video-101', 'Course Introduction', '10:00', '', 1, '[{"name": "Course Outline.pdf", "url": "#"}]'::jsonb),
('ai-video-101', 'Setting up your environment', '15:00', '', 2, '[{"name": "Tool_Checklist.pdf", "url": "#"}, {"name": "Setup_Guide.zip", "url": "#"}]'::jsonb),
('ai-video-101', 'Your First AI Generation', '25:00', '', 3, '[]'::jsonb)
on conflict do nothing;

-- Seed lessons for AI Cinematography Masterclass
insert into public.lessons (course_id, title, duration, video_url, "order", resources) values
('advanced-cinematography', 'Mastering the Lens', '20:00', '', 1, '[{"name": "Lens_Presets.json", "url": "#"}]'::jsonb),
('advanced-cinematography', 'Lighting for AI', '30:00', '', 2, '[{"name": "Lighting_Cheat_Sheet.pdf", "url": "#"}]'::jsonb)
on conflict do nothing;

-- Seed challenges
insert into public.challenges (id, title, description, prize, deadline, participants, difficulty) values
('weekly-1', 'The Neon Dream', 'Create a 15-second cyberpunk-style video using only AI tools.', '$500', '2024-03-05', 124, 'Medium'),
('weekly-2', 'Natures Pulse', 'Generate a hyper-realistic macro shot of a plant growing in seconds.', '$300', '2024-03-07', 89, 'Hard')
on conflict (id) do nothing;

-- Seed showcase items
insert into public.showcase_items (title, description, thumbnail, video_url) values
('Liquid Dreams', 'A surreal exploration of fluid dynamics created with Luma Dream Machine.', 'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?auto=format&fit=crop&q=80&w=800', '#'),
('The Neon Samurai', 'Cinematic short story generated using Runway Gen-3 and Midjourney.', 'https://images.unsplash.com/photo-1542332213-9b5a5a3fad35?auto=format&fit=crop&q=80&w=800', '#');
