-- Let creators edit their own active bid proposals until the job is awarded.

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
