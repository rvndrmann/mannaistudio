-- The Brand workspace: one place a brand or creator keeps everything a
-- production needs to know about them, reusable across every project.
--
-- creator_brand_profiles already exists but hangs off a single project, so the
-- same brand had to be re-entered for every campaign and every show. These
-- tables are owned by the user instead, and a project points at one, which is
-- what lets a brand's voice, rules, and reference art stay consistent across
-- an entire slate rather than being copied per project.

create extension if not exists pgcrypto;

create table if not exists public.creator_brands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  kind text not null default 'brand' check (kind in ('brand', 'creator', 'show')),
  tagline text not null default '',
  website_url text not null default '',
  industry text not null default '',
  description text not null default '',
  -- The strategist and script writer read these directly, so they are plain
  -- prose rather than structured fields nobody would fill in.
  brand_voice text not null default '',
  audience text not null default '',
  positioning text not null default '',
  goals text not null default '',
  offer text not null default '',
  visual_style text not null default '',
  color_palette text[] not null default '{}',
  do_rules text not null default '',
  dont_rules text not null default '',
  forbidden_claims text[] not null default '{}',
  logo_path text not null default '',
  default_aspect text not null default '9:16',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists creator_brands_user_idx on public.creator_brands (user_id, created_at desc);

-- Free-form knowledge: pasted research, product facts, tone examples, links.
-- Everything here is fed to the agents as reference, so a brand only has to
-- explain itself once.
create table if not exists public.creator_brand_knowledge (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.creator_brands(id) on delete cascade,
  kind text not null default 'note' check (kind in ('note', 'link', 'product', 'service', 'audience', 'guideline', 'faq', 'competitor')),
  title text not null,
  content text not null default '',
  url text not null default '',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists creator_brand_knowledge_brand_idx on public.creator_brand_knowledge (brand_id, created_at desc);

-- The brand asset library. A project imports from here so every show and
-- campaign renders the same product, logo, and cast.
create table if not exists public.creator_brand_assets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.creator_brands(id) on delete cascade,
  kind text not null default 'product' check (kind in ('logo', 'product', 'character', 'location', 'reference')),
  name text not null,
  description text not null default '',
  storage_path text not null default '',
  external_url text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists creator_brand_assets_brand_idx on public.creator_brand_assets (brand_id, created_at desc);

-- Custom agents. The Content Strategist and Script Writer ship in code as
-- built-ins; a row here is either a user's own agent or an override of a
-- built-in's instructions, keyed by the same agent key.
create table if not exists public.creator_brand_agents (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.creator_brands(id) on delete cascade,
  agent_key text not null,
  name text not null,
  role_summary text not null default '',
  instructions text not null default '',
  writes_script boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, agent_key)
);

create table if not exists public.creator_brand_chats (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.creator_brands(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  agent_key text not null default 'content_strategist',
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists creator_brand_chats_brand_idx on public.creator_brand_chats (brand_id, updated_at desc);

create table if not exists public.creator_brand_chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.creator_brand_chats(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  agent_key text not null default '',
  content text not null default '',
  -- Images the user attached to the turn (product shots, character refs), kept
  -- so a reopened chat still shows what the agent was looking at.
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists creator_brand_chat_messages_chat_idx on public.creator_brand_chat_messages (chat_id, created_at);

-- Scripts live on the brand, not on a project, so a draft can be worked on
-- before anyone decides which production it becomes.
create table if not exists public.creator_brand_scripts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.creator_brands(id) on delete cascade,
  chat_id uuid references public.creator_brand_chats(id) on delete set null,
  title text not null default 'Untitled script',
  status text not null default 'draft' check (status in ('draft', 'final')),
  content jsonb not null default '{}'::jsonb,
  notes text not null default '',
  sent_project_id uuid references public.creator_projects(id) on delete set null,
  sent_episode_id uuid references public.creator_episodes(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists creator_brand_scripts_brand_idx on public.creator_brand_scripts (brand_id, updated_at desc);

-- A project remembers the brand it was produced for, which is how the Director
-- reaches the brand's rules and asset library at generation time.
alter table public.creator_projects
  add column if not exists brand_id uuid references public.creator_brands(id) on delete set null;

create index if not exists creator_projects_brand_idx on public.creator_projects (brand_id);

-- A brand is readable by its owner, and by anyone already trusted with a
-- project produced for it — otherwise a shared teammate opening that project
-- would get a Director that cannot see the brand it is working for.
create or replace function public.can_access_creator_brand(p_brand_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.creator_brands b
    where b.id = p_brand_id and b.user_id = auth.uid()
  ) or exists (
    select 1 from public.creator_projects p
    join public.creator_project_members m on m.project_id = p.id
    where p.brand_id = p_brand_id and m.profile_id = auth.uid()
  );
$$;

create or replace function public.owns_creator_brand(p_brand_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.creator_brands b
    where b.id = p_brand_id and b.user_id = auth.uid()
  );
$$;

grant execute on function public.can_access_creator_brand(uuid) to authenticated;
grant execute on function public.owns_creator_brand(uuid) to authenticated;

alter table public.creator_brands enable row level security;
alter table public.creator_brand_knowledge enable row level security;
alter table public.creator_brand_assets enable row level security;
alter table public.creator_brand_agents enable row level security;
alter table public.creator_brand_chats enable row level security;
alter table public.creator_brand_chat_messages enable row level security;
alter table public.creator_brand_scripts enable row level security;

drop policy if exists "creator brands read" on public.creator_brands;
create policy "creator brands read" on public.creator_brands for select
  to authenticated using (public.can_access_creator_brand(id));

drop policy if exists "creator brands write" on public.creator_brands;
create policy "creator brands write" on public.creator_brands for all
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "creator brand knowledge read" on public.creator_brand_knowledge;
create policy "creator brand knowledge read" on public.creator_brand_knowledge for select
  to authenticated using (public.can_access_creator_brand(brand_id));

drop policy if exists "creator brand knowledge write" on public.creator_brand_knowledge;
create policy "creator brand knowledge write" on public.creator_brand_knowledge for all
  to authenticated using (public.owns_creator_brand(brand_id)) with check (public.owns_creator_brand(brand_id));

drop policy if exists "creator brand assets read" on public.creator_brand_assets;
create policy "creator brand assets read" on public.creator_brand_assets for select
  to authenticated using (public.can_access_creator_brand(brand_id));

drop policy if exists "creator brand assets write" on public.creator_brand_assets;
create policy "creator brand assets write" on public.creator_brand_assets for all
  to authenticated using (public.owns_creator_brand(brand_id)) with check (public.owns_creator_brand(brand_id));

drop policy if exists "creator brand agents read" on public.creator_brand_agents;
create policy "creator brand agents read" on public.creator_brand_agents for select
  to authenticated using (public.can_access_creator_brand(brand_id));

drop policy if exists "creator brand agents write" on public.creator_brand_agents;
create policy "creator brand agents write" on public.creator_brand_agents for all
  to authenticated using (public.owns_creator_brand(brand_id)) with check (public.owns_creator_brand(brand_id));

-- A chat is private to the person who had it, even inside a shared brand.
drop policy if exists "creator brand chats owner" on public.creator_brand_chats;
create policy "creator brand chats owner" on public.creator_brand_chats for all
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id and public.can_access_creator_brand(brand_id));

drop policy if exists "creator brand chat messages owner" on public.creator_brand_chat_messages;
create policy "creator brand chat messages owner" on public.creator_brand_chat_messages for all
  to authenticated
  using (exists (select 1 from public.creator_brand_chats c where c.id = chat_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.creator_brand_chats c where c.id = chat_id and c.user_id = auth.uid()));

drop policy if exists "creator brand scripts read" on public.creator_brand_scripts;
create policy "creator brand scripts read" on public.creator_brand_scripts for select
  to authenticated using (public.can_access_creator_brand(brand_id));

drop policy if exists "creator brand scripts write" on public.creator_brand_scripts;
create policy "creator brand scripts write" on public.creator_brand_scripts for all
  to authenticated using (public.owns_creator_brand(brand_id)) with check (public.owns_creator_brand(brand_id));

drop trigger if exists creator_brands_updated on public.creator_brands;
create trigger creator_brands_updated before update on public.creator_brands for each row execute function public.creator_touch_updated_at();
drop trigger if exists creator_brand_knowledge_updated on public.creator_brand_knowledge;
create trigger creator_brand_knowledge_updated before update on public.creator_brand_knowledge for each row execute function public.creator_touch_updated_at();
drop trigger if exists creator_brand_assets_updated on public.creator_brand_assets;
create trigger creator_brand_assets_updated before update on public.creator_brand_assets for each row execute function public.creator_touch_updated_at();
drop trigger if exists creator_brand_agents_updated on public.creator_brand_agents;
create trigger creator_brand_agents_updated before update on public.creator_brand_agents for each row execute function public.creator_touch_updated_at();
drop trigger if exists creator_brand_chats_updated on public.creator_brand_chats;
create trigger creator_brand_chats_updated before update on public.creator_brand_chats for each row execute function public.creator_touch_updated_at();
drop trigger if exists creator_brand_scripts_updated on public.creator_brand_scripts;
create trigger creator_brand_scripts_updated before update on public.creator_brand_scripts for each row execute function public.creator_touch_updated_at();
