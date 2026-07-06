-- Blog extension: media for example assets, scheduling, and a topic backlog.

-- 1. Extend blog_posts (table created in 20260625120000_blog.sql).
alter table public.blog_posts add column if not exists media jsonb not null default '[]'::jsonb;
alter table public.blog_posts add column if not exists scheduled_at timestamptz;

-- media shape: [{ "type": "video"|"image", "url": "...", "poster": "...",
--                "prompt": "...", "model": "...", "caption": "..." }]
-- status values used by the app: 'pending_review' (AI drafts), 'draft', 'scheduled', 'published'.
-- Existing RLS already exposes only status = 'published' to the public; admins manage all.

-- 2. Topic backlog — content calendar so each scheduled run picks a fresh keyword.
create table if not exists public.blog_topics (
    id uuid primary key default gen_random_uuid(),
    keyword text not null,
    target_url text not null default '/courses',
    cluster text default '',
    status text not null default 'todo', -- 'todo' | 'used'
    created_at timestamptz not null default now()
);
create index if not exists blog_topics_status_idx on public.blog_topics(status, created_at);

alter table public.blog_topics enable row level security;

drop policy if exists "admins manage topics" on public.blog_topics;
create policy "admins manage topics" on public.blog_topics
    for all using (exists (select 1 from public.admin_users where id = auth.uid()))
    with check (exists (select 1 from public.admin_users where id = auth.uid()));

-- 3. Seed keyword backlog (skips rows that already exist by keyword).
insert into public.blog_topics (keyword, target_url, cluster)
select v.keyword, v.target_url, v.cluster
from (values
    -- Core course-intent keywords (highest priority)
    ('AI video course', '/courses', 'course'),
    ('AI film making course', '/courses', 'course'),
    ('best AI video creation course online', '/courses', 'course'),
    ('learn AI filmmaking', '/courses', 'course'),
    ('AI video editing course for beginners', '/courses', 'course'),
    ('AI cinematography course', '/courses', 'course'),
    ('how to become an AI film director', '/courses', 'course'),
    ('AI video creation certification', '/courses', 'course'),
    -- AI video generation how-to cluster
    ('how to make AI videos', '/courses', 'how-to'),
    ('AI video generator tutorial', '/courses', 'how-to'),
    ('text to video AI tutorial', '/courses', 'how-to'),
    ('image to video AI guide', '/courses', 'how-to'),
    ('how to generate AI video from a prompt', '/courses', 'how-to'),
    ('AI video workflow for beginners', '/courses', 'how-to'),
    ('how to make AI short films', '/courses', 'how-to'),
    ('AI music video creation guide', '/courses', 'how-to'),
    -- Seedance / Higgsfield model cluster
    ('Seedance 2.0 tutorial', '/courses', 'model'),
    ('Higgsfield AI video tutorial', '/courses', 'model'),
    ('best AI video generation models 2026', '/courses', 'model'),
    ('Seedance vs other AI video models', '/courses', 'model'),
    ('how to use Higgsfield for filmmaking', '/courses', 'model'),
    ('AI video model comparison', '/courses', 'model'),
    -- Prompting cluster
    ('AI video prompt examples', '/courses', 'prompting'),
    ('cinematic AI video prompts', '/courses', 'prompting'),
    ('how to write prompts for AI video', '/courses', 'prompting'),
    ('AI film prompt engineering', '/courses', 'prompting'),
    ('best prompts for AI movie scenes', '/courses', 'prompting'),
    ('camera movement prompts for AI video', '/courses', 'prompting'),
    -- Use-case / inspiration cluster
    ('AI generated short film examples', '/courses', 'examples'),
    ('AI video ideas for creators', '/courses', 'examples'),
    ('AI ads with video generation', '/courses', 'examples'),
    ('AI product video creation', '/courses', 'examples'),
    ('AI anime video creation', '/courses', 'examples'),
    ('AI fight scene generation', '/courses', 'examples'),
    -- Filmmaking workflow cluster
    ('AI storyboard to video workflow', '/courses', 'workflow'),
    ('AI character consistency in video', '/courses', 'workflow'),
    ('AI scene generation for films', '/courses', 'workflow'),
    ('AI voiceover and video sync', '/courses', 'workflow'),
    ('end to end AI film production', '/courses', 'workflow'),
    ('monetize AI video skills', '/courses', 'workflow')
) as v(keyword, target_url, cluster)
where not exists (
    select 1 from public.blog_topics t where t.keyword = v.keyword
);
