-- Creating a project through RLS failed on its own SELECT policy.
--
-- "creator projects read" was can_access_creator_project(id), which looks the
-- project up by id. That function is STABLE and SECURITY DEFINER, so inside the
-- statement doing the INSERT it reads a snapshot taken before the row existed
-- and returns false for the row being created. Postgres then refuses the
-- RETURNING clause and reports it as "new row violates row-level security
-- policy" — pointing at the insert, which was actually fine.
--
-- Nothing noticed because every existing path creates projects with the service
-- role, which bypasses RLS entirely. The website chat creates them as the user,
-- and hit it immediately.
--
-- Checking user_id directly reads the new row's own column, so no lookup and no
-- snapshot is involved. The set of visible rows is unchanged: an owner already
-- passed can_access_creator_project, this only lets the check succeed on a row
-- that is still being written.

drop policy if exists "creator projects read" on public.creator_projects;
create policy "creator projects read" on public.creator_projects for select
  using (auth.uid() = user_id or public.can_access_creator_project(id));
