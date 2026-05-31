-- Allow bids on approved legacy jobs that predate poster ownership.

drop policy if exists "authenticated users can bid on approved jobs" on public.service_job_bids;
create policy "authenticated users can bid on approved jobs"
on public.service_job_bids for insert
with check (
    bidder_id = auth.uid()
    and exists (
        select 1 from public.service_requests
        where service_requests.id = service_job_bids.job_id
        and service_requests.status = 'approved'
        and (
            service_requests.poster_id is null
            or service_requests.poster_id <> auth.uid()
        )
    )
);

drop policy if exists "users can update their own pending bids" on public.service_job_bids;
create policy "users can update their own pending bids"
on public.service_job_bids for update
using (
    bidder_id = auth.uid()
    and status = 'pending'
    and exists (
        select 1 from public.service_requests
        where service_requests.id = service_job_bids.job_id
        and service_requests.status = 'approved'
    )
)
with check (
    bidder_id = auth.uid()
    and status = 'pending'
    and exists (
        select 1 from public.service_requests
        where service_requests.id = service_job_bids.job_id
        and service_requests.status = 'approved'
    )
);
