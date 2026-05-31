-- Keep approval/admin changes restricted; posters select winning bids through the RPC.

drop policy if exists "job posters can update awarded job" on public.service_requests;
drop policy if exists "users can update their own bids" on public.service_job_bids;
