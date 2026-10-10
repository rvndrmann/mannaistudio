-- Shared across serverless instances. BYOK accounts are scoped to the owner;
-- credit-paid jobs share the platform scope. No credentials are stored here.
create or replace function public.claim_openai_image_job(p_job_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  j public.creator_generation_jobs%rowtype;
  scope_key text;
  active_count integer;
  recent_count integer;
begin
  select * into j from public.creator_generation_jobs where id = p_job_id;
  if not found then return false; end if;
  if j.user_id is distinct from auth.uid() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if j.type::text <> 'image' or j.provider <> 'openai' then return false; end if;
  scope_key := case when j.billing_mode = 'byok' then j.user_id::text else 'platform' end;
  perform pg_advisory_xact_lock(hashtextextended('openai-image:' || scope_key, 0));
  -- Re-read after the scope lock: two polls may have read the same approved row.
  select * into j from public.creator_generation_jobs where id = p_job_id for update;
  if j.status::text <> 'approved' or j.started_at is not null or j.provider_job_id is not null then return false; end if;

  select count(*) into active_count from public.creator_generation_jobs g
  where g.type::text = 'image' and g.provider = 'openai'
    and g.status::text = 'processing'
    and (case when g.billing_mode = 'byok' then g.user_id::text else 'platform' end) = scope_key;
  select count(*) into recent_count from public.creator_generation_jobs g
  where g.type::text = 'image' and g.provider = 'openai'
    and g.started_at > now() - interval '1 minute'
    and (case when g.billing_mode = 'byok' then g.user_id::text else 'platform' end) = scope_key;
  if active_count >= 10 or recent_count >= 120 then return false; end if;

  update public.creator_generation_jobs set status = 'processing', started_at = now() where id = p_job_id;
  return true;
end;
$$;
revoke all on function public.claim_openai_image_job(uuid) from public;
grant execute on function public.claim_openai_image_job(uuid) to authenticated, service_role;
create index if not exists creator_openai_image_queue_idx
  on public.creator_generation_jobs(provider, started_at)
  where type = 'image';
