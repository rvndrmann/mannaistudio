-- Store student entries for weekly challenges.

create extension if not exists pgcrypto;

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

drop policy if exists "challenge submissions are publicly readable" on public.challenge_submissions;
create policy "challenge submissions are publicly readable"
on public.challenge_submissions for select
using (true);

drop policy if exists "authenticated users can submit to challenges" on public.challenge_submissions;
create policy "authenticated users can submit to challenges"
on public.challenge_submissions for insert
with check (auth.uid() = profile_id);

drop policy if exists "users can update their own submissions" on public.challenge_submissions;
create policy "users can update their own submissions"
on public.challenge_submissions for update
using (auth.uid() = profile_id)
with check (auth.uid() = profile_id);

drop policy if exists "users can delete their own submissions" on public.challenge_submissions;
create policy "users can delete their own submissions"
on public.challenge_submissions for delete
using (auth.uid() = profile_id);
