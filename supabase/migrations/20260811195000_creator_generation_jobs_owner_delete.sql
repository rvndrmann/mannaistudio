create policy "creator jobs owner delete" on public.creator_generation_jobs for delete using (user_id = auth.uid());
