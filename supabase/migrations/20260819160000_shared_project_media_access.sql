-- Generated media was readable only by the account that generated it.
--
-- Every file lands at `{owner_id}/{project_id}/...`, and the only policy on the
-- bucket matched the first folder against auth.uid(). That is the owner and
-- nobody else, so the moment a project was opened by anyone but its owner —
-- an admin using admin_grant_project_access, or a teammate added through
-- project sharing — the rows resolved and the pictures did not. The card, the
-- prompt, the model and the chosen marker all rendered against a blank frame,
-- because storage denied the signature while the database allowed the read.
--
-- Access is decided by the project in the second folder, using the same
-- ownership-or-membership test the rest of the sharing model uses, rather than
-- by whose id happens to start the path. Reading is all that is granted: the
-- owner-only policy still governs writing and deleting, so a viewer cannot
-- overwrite or remove another account's media.

create policy "creator studio media project readers" on storage.objects for select using (
  bucket_id = 'creator-studio-media'
  and exists (
    select 1
    from public.creator_projects p
    where p.id::text = (storage.foldername(name))[2]
      and (
        p.user_id = auth.uid()
        or exists (
          select 1
          from public.creator_project_members m
          where m.project_id = p.id
            and m.profile_id = auth.uid()
        )
      )
  )
);
