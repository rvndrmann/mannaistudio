-- Allow course lesson videos larger than Supabase's default 50 MiB bucket limit.
update storage.buckets
set file_size_limit = 524288000
where id = 'videos';
