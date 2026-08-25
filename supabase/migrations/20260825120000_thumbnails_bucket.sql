-- Image thumbnails uploaded from the admin dashboard (course cards today).
-- Kept separate from 'showcase-videos' so image assets are not mixed into the
-- large-file video bucket and can carry a much smaller size limit.

insert into storage.buckets (id, name, public, file_size_limit)
values ('thumbnails', 'thumbnails', true, 5242880) -- 5 MB, matches the admin picker's check
on conflict (id) do update set public = true, file_size_limit = 5242880;

drop policy if exists "public can read thumbnails" on storage.objects;
create policy "public can read thumbnails"
on storage.objects for select using (bucket_id = 'thumbnails');

drop policy if exists "admins can upload thumbnails" on storage.objects;
create policy "admins can upload thumbnails"
on storage.objects for insert
with check (
    bucket_id = 'thumbnails'
    and exists (select 1 from public.admin_users where id = auth.uid())
);

drop policy if exists "admins can update thumbnails" on storage.objects;
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

drop policy if exists "admins can delete thumbnails" on storage.objects;
create policy "admins can delete thumbnails"
on storage.objects for delete
using (
    bucket_id = 'thumbnails'
    and exists (select 1 from public.admin_users where id = auth.uid())
);
