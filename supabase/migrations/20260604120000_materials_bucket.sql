-- Downloadable lesson materials (PDFs, docs, slides, zips, etc.)
-- Lesson resources are stored as JSON on public.lessons.resources; this bucket
-- holds the uploaded files those resource URLs point to.

insert into storage.buckets (id, name, public, file_size_limit)
values ('materials', 'materials', true, 104857600) -- 100 MB
on conflict (id) do update set public = true, file_size_limit = 104857600;

drop policy if exists "public can read materials" on storage.objects;
create policy "public can read materials"
on storage.objects for select using (bucket_id = 'materials');

drop policy if exists "admins can upload materials" on storage.objects;
create policy "admins can upload materials"
on storage.objects for insert
with check (
    bucket_id = 'materials'
    and exists (select 1 from public.admin_users where id = auth.uid())
);

drop policy if exists "admins can update materials" on storage.objects;
create policy "admins can update materials"
on storage.objects for update
using (
    bucket_id = 'materials'
    and exists (select 1 from public.admin_users where id = auth.uid())
)
with check (
    bucket_id = 'materials'
    and exists (select 1 from public.admin_users where id = auth.uid())
);

drop policy if exists "admins can delete materials" on storage.objects;
create policy "admins can delete materials"
on storage.objects for delete
using (
    bucket_id = 'materials'
    and exists (select 1 from public.admin_users where id = auth.uid())
);
