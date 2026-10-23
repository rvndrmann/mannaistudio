-- Capacity limits and a booking queue for Hire Our Team packages.
--
-- The team can only run so many productions at once. A package now carries two
-- optional limits, set from Admin → Managed Production → Offers:
--
--   slot_limit   how many orders of this package can be in production at once
--   queue_limit  how many more can be booked to wait for a slot
--
-- Null is unlimited for both, which is what every existing package keeps.
--
-- What occupies a slot: an order of this package that is paid, was placed in a
-- slot (not the queue), and is not yet `completed` or `cancelled`. A slot is
-- freed by delivering the work or cancelling the order — not by the client
-- approving one ad of three.
--
-- A checkout in progress holds its place for HOLD_MINUTES (30): an unpaid order
-- created in that window counts against the limit, so two buyers racing for the
-- last slot cannot both be sold it. Holds count once per buyer, and never
-- against the buyer themself — someone who closes the Razorpay sheet and tries
-- again must not find that their own first attempt has filled the package.
--
-- A queued booking pays upfront, like any other order. The queue is a promise
-- of the next slot, and an unpaid promise is a reservation anyone could make
-- for free and walk away from. An admin moves a queued order into a slot by
-- hand (admin_managed_promote_from_queue); nothing promotes automatically,
-- because a freed slot is a planning decision as much as a count.
--
-- Every count is taken here, inside SECURITY DEFINER functions that lock the
-- package row first. Nothing the browser sends is a count.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

alter table public.managed_offer_packages
  add column if not exists slot_limit integer check (slot_limit is null or slot_limit >= 0),
  add column if not exists queue_limit integer check (queue_limit is null or queue_limit >= 0);

comment on column public.managed_offer_packages.slot_limit is
  'Orders of this package that can be in production at once. Null is unlimited; 0 sends every order to the queue.';
comment on column public.managed_offer_packages.queue_limit is
  'Paid orders that can wait for a slot. Null is unlimited; 0 means no queue — the package sells out when its slots do.';

alter table public.managed_projects
  add column if not exists queue_state text not null default 'slot'
    check (queue_state in ('slot', 'queued')),
  add column if not exists promoted_at timestamptz;

comment on column public.managed_projects.queue_state is
  'slot: counts against the package''s slot_limit and is being produced. queued: paid, waiting for a slot.';

create index if not exists managed_projects_capacity_idx
  on public.managed_projects (package_key, queue_state, payment_status)
  where package_key <> '';

-- ---------------------------------------------------------------------------
-- 2. The count
--
-- One function decides where an order would land, so checkout, payment, the
-- public page and the admin screen cannot disagree about what "full" means.
-- It does not lock: callers that act on the answer lock the package row first.
-- ---------------------------------------------------------------------------

create or replace function public.managed_package_load(p_package_key text, p_buyer uuid default null)
returns table (
  slot_limit integer,
  queue_limit integer,
  slots_taken integer,
  queue_taken integer,
  queue_waiting integer,
  placement text
)
language sql stable security definer set search_path = public as $$
  with pkg as (
    select p.slot_limit, p.queue_limit from public.managed_offer_packages p where p.key = p_package_key
  ),
  counts as (
    select
      -- Paid and running.
      (select count(*) from public.managed_projects mp
        where mp.package_key = p_package_key and mp.queue_state = 'slot'
          and mp.payment_status = 'paid' and mp.status not in ('completed', 'cancelled'))
      -- Plus checkouts still inside their hold, once per other buyer.
      + (select count(distinct mp.user_id) from public.managed_projects mp
          where mp.package_key = p_package_key and mp.queue_state = 'slot'
            and mp.payment_status = 'pending' and mp.status <> 'cancelled'
            and mp.created_at > now() - interval '30 minutes'
            and mp.user_id is distinct from p_buyer) as slots_taken,
      (select count(*) from public.managed_projects mp
        where mp.package_key = p_package_key and mp.queue_state = 'queued'
          and mp.payment_status = 'paid' and mp.status not in ('completed', 'cancelled')) as queue_waiting,
      (select count(distinct mp.user_id) from public.managed_projects mp
        where mp.package_key = p_package_key and mp.queue_state = 'queued'
          and mp.payment_status = 'pending' and mp.status <> 'cancelled'
          and mp.created_at > now() - interval '30 minutes'
          and mp.user_id is distinct from p_buyer) as queue_holds
  )
  select
    pkg.slot_limit,
    pkg.queue_limit,
    counts.slots_taken::int,
    (counts.queue_waiting + counts.queue_holds)::int,
    counts.queue_waiting::int,
    case
      -- A free slot belongs to whoever is already waiting for one, so a new
      -- buyer only gets a slot when nobody is in the queue ahead of them.
      when pkg.slot_limit is null
        or (counts.slots_taken < pkg.slot_limit and counts.queue_waiting = 0) then 'slot'
      when pkg.queue_limit is null
        or counts.queue_waiting + counts.queue_holds < pkg.queue_limit then 'queue'
      else 'sold_out'
    end
  from counts left join pkg on true;
$$;

-- The public view of the same numbers. Counts only — no order, buyer or price
-- leaves this function — and the caller's own checkout holds are left out, so a
-- returning buyer is not told their own abandoned attempt sold the package out.
create or replace function public.managed_offer_availability()
returns table (
  package_key text,
  slot_limit integer,
  queue_limit integer,
  slots_taken integer,
  queue_taken integer,
  queue_waiting integer,
  placement text
)
language sql stable security definer set search_path = public as $$
  select p.key, l.slot_limit, l.queue_limit, l.slots_taken, l.queue_taken, l.queue_waiting, l.placement
  from public.managed_offer_packages p
  cross join lateral public.managed_package_load(p.key, auth.uid()) l
  where p.slot_limit is not null or p.queue_limit is not null;
$$;

/**
 * Where each of these orders stands in its package's queue: 1 is next.
 *
 * Only orders the caller may already read come back, so a client learns their
 * own place and nothing about whose orders are ahead of them.
 */
create or replace function public.managed_queue_positions(p_project_ids uuid[])
returns table (project_id uuid, queue_position integer, queue_length integer)
language sql stable security definer set search_path = public as $$
  with waiting as (
    select mp.id, mp.package_key,
      row_number() over (partition by mp.package_key order by mp.paid_at nulls last, mp.created_at, mp.id)::int as pos,
      count(*) over (partition by mp.package_key)::int as total
    from public.managed_projects mp
    where mp.queue_state = 'queued' and mp.payment_status = 'paid'
      and mp.status not in ('completed', 'cancelled')
      and mp.package_key in (select q.package_key from public.managed_projects q where q.id = any(p_project_ids))
  )
  select w.id, w.pos, w.total
  from waiting w
  where w.id = any(p_project_ids) and public.can_access_managed_project(w.id);
$$;

-- ---------------------------------------------------------------------------
-- 3. Opening an order: the check happens under the package lock
-- ---------------------------------------------------------------------------

drop function if exists public.create_managed_project(uuid, text, text, text, jsonb, integer, integer, text, integer, integer, text, uuid);

/**
 * Opens an order — in a slot, in the queue, or not at all.
 *
 * `p_allow_queue` is the buyer's consent to wait, never a count: a buyer who
 * saw a free slot and finds the package filled while they wrote their brief is
 * told so (`managed_slots_full`) instead of being charged for a place in line
 * they did not ask for. A full queue is `managed_sold_out` whatever they say.
 *
 * The package row is locked before counting, so concurrent checkouts for the
 * same package are decided one at a time.
 */
create or replace function public.create_managed_project(
  p_user_id uuid,
  p_name text,
  p_service_type text,
  p_package_key text,
  p_brief jsonb,
  p_video_count integer,
  p_duration_seconds integer,
  p_aspect_ratio text,
  p_revisions_included integer,
  p_price_inr integer,
  p_payment_status text default 'pending',
  p_brand_id uuid default null,
  p_allow_queue boolean default false
)
returns public.managed_projects
language plpgsql security definer set search_path = public as $$
declare
  row_out public.managed_projects;
  v_placement text := 'slot';
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Managed projects can only be opened by the server';
  end if;
  if p_user_id is null then raise exception 'A customer is required'; end if;
  if p_payment_status not in ('pending', 'proposal_requested') then
    raise exception 'A new project starts unpaid';
  end if;

  if coalesce(p_package_key, '') <> '' and p_payment_status = 'pending' then
    perform 1 from public.managed_offer_packages where key = p_package_key for update;
    select l.placement into v_placement from public.managed_package_load(p_package_key, p_user_id) l;
    v_placement := coalesce(v_placement, 'slot');
    if v_placement = 'sold_out' then
      raise exception 'managed_sold_out' using hint = 'Every slot and every queue place for this package is taken.';
    end if;
    if v_placement = 'queue' and not coalesce(p_allow_queue, false) then
      raise exception 'managed_slots_full' using hint = 'The live slots are taken; the buyer has to agree to join the queue.';
    end if;
  end if;

  insert into public.managed_projects (
    user_id, name, service_type, package_key, brief, video_count, duration_seconds,
    aspect_ratio, revisions_included, price_inr, payment_status, brand_id, queue_state
  ) values (
    p_user_id, coalesce(nullif(btrim(p_name), ''), 'Untitled campaign'), p_service_type,
    coalesce(p_package_key, ''), coalesce(p_brief, '{}'::jsonb), greatest(coalesce(p_video_count, 1), 1),
    coalesce(p_duration_seconds, 30), coalesce(nullif(p_aspect_ratio, ''), '9:16'),
    coalesce(p_revisions_included, 2), greatest(coalesce(p_price_inr, 0), 0), p_payment_status, p_brand_id,
    case when v_placement = 'queue' then 'queued' else 'slot' end
  )
  returning * into row_out;

  if p_payment_status = 'proposal_requested' then
    perform public.notify_managed_admins(
      'managed_order', 'Proposal requested: ' || row_out.name,
      'A client asked for a branded micro-drama proposal.', row_out.id, null
    );
    perform public.notify_managed(
      p_user_id, 'managed_order', 'Proposal request received',
      'We have your brief for "' || row_out.name || '" and will come back with a proposal.', row_out.id
    );
  end if;

  return row_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Settling a payment: the count is taken again
--
-- A hold lasts 30 minutes; a buyer can take longer. If their slot went to
-- somebody else meanwhile, the order is placed in the queue rather than
-- refused — the money is already taken, and the queue is the honest answer.
-- That is the one way a queue can run past its limit, and it is deliberate.
-- ---------------------------------------------------------------------------

create or replace function public.mark_managed_project_paid(
  p_project_id uuid,
  p_payment_id text,
  p_price_inr integer
)
returns table (project_id uuid, granted boolean)
language plpgsql security definer set search_path = public as $$
declare
  row_out public.managed_projects;
  slot integer;
  v_placement text := 'slot';
  v_position integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Payments can only be settled by the server';
  end if;

  select * into row_out from public.managed_projects where id = p_project_id for update;
  if row_out.id is null then raise exception 'Project not found'; end if;
  if row_out.payment_status = 'paid' then
    return query select row_out.id, false;
    return;
  end if;

  if row_out.package_key <> '' then
    perform 1 from public.managed_offer_packages where key = row_out.package_key for update;
    select l.placement into v_placement from public.managed_package_load(row_out.package_key, row_out.user_id) l;
    v_placement := coalesce(v_placement, 'slot');
  end if;

  update public.managed_projects mp
  set payment_status = 'paid',
      payment_id = p_payment_id,
      price_inr = coalesce(p_price_inr, mp.price_inr),
      paid_at = now(),
      status = 'brief_received',
      queue_state = case when v_placement = 'slot' then 'slot' else 'queued' end
  where mp.id = p_project_id
  returning * into row_out;

  for slot in 1..row_out.video_count loop
    insert into public.managed_deliverables (project_id, title, position, aspect_ratio)
    values (row_out.id, 'Ad ' || lpad(slot::text, 2, '0'), slot, row_out.aspect_ratio);
  end loop;

  if row_out.queue_state = 'queued' then
    -- Counted here rather than through managed_queue_positions, which answers
    -- only for orders the caller can read — and the caller is the service role.
    select count(*)::int into v_position from public.managed_projects q
    where q.package_key = row_out.package_key and q.queue_state = 'queued'
      and q.payment_status = 'paid' and q.status not in ('completed', 'cancelled')
      and (q.paid_at, q.created_at, q.id) <= (row_out.paid_at, row_out.created_at, row_out.id);
    perform public.notify_managed(
      row_out.user_id, 'managed_order', 'You are in the queue: ' || row_out.name,
      'Payment confirmed. You are number ' || v_position
        || ' in line, and we will tell you the moment a production slot opens.', row_out.id
    );
    perform public.notify_managed_admins(
      'managed_order', 'New queued order: ' || row_out.name,
      row_out.video_count || ' video(s), ' || row_out.service_type || ', paid — waiting for a slot.', row_out.id, null
    );
  else
    perform public.notify_managed(
      row_out.user_id, 'managed_order', 'Project confirmed: ' || row_out.name,
      'Your brief is with the creative team. You can track production and message us any time.', row_out.id
    );
    perform public.notify_managed_admins(
      'managed_order', 'New managed order: ' || row_out.name,
      row_out.video_count || ' video(s), ' || row_out.service_type || ', paid.', row_out.id, null
    );
  end if;

  return query select row_out.id, true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Admin: the limits, and moving an order out of the queue
-- ---------------------------------------------------------------------------

/**
 * Sets both limits. Null is unlimited, so this always writes what it is given —
 * which is why it is its own function rather than two more `coalesce`d
 * arguments on admin_upsert_managed_package, where null means "leave as is".
 */
create or replace function public.admin_set_managed_package_capacity(
  p_id uuid,
  p_slot_limit integer,
  p_queue_limit integer
)
returns public.managed_offer_packages
language plpgsql security definer set search_path = public as $$
declare
  row_out public.managed_offer_packages;
begin
  if not public.is_site_admin() then raise exception 'Only admins can change the catalogue'; end if;
  if p_slot_limit is not null and p_slot_limit < 0 then raise exception 'A slot limit cannot be negative'; end if;
  if p_queue_limit is not null and p_queue_limit < 0 then raise exception 'A queue limit cannot be negative'; end if;

  update public.managed_offer_packages
  set slot_limit = p_slot_limit, queue_limit = p_queue_limit
  where id = p_id
  returning * into row_out;
  if row_out.id is null then raise exception 'Package not found'; end if;
  return row_out;
end;
$$;

/** Live numbers per package, for the Offers screen. Holds count; nobody is excluded. */
create or replace function public.admin_managed_capacity()
returns table (
  package_key text,
  slot_limit integer,
  queue_limit integer,
  slots_taken integer,
  queue_taken integer,
  queue_waiting integer,
  placement text
)
language sql stable security definer set search_path = public as $$
  select p.key, l.slot_limit, l.queue_limit, l.slots_taken, l.queue_taken, l.queue_waiting, l.placement
  from public.managed_offer_packages p
  cross join lateral public.managed_package_load(p.key, null) l
  where public.is_site_admin();
$$;

/**
 * Moves a queued order into a live slot.
 *
 * Refused while the package's slots are all running — the admin raises the
 * limit first if they mean to take on more, so the number on the Offers screen
 * stays the truth. Checkout holds are not counted here: an admin promoting the
 * person who has waited longest outranks a stranger halfway through a payment
 * sheet, who will be queued at payment if the slot has gone.
 */
create or replace function public.admin_managed_promote_from_queue(p_project_id uuid)
returns public.managed_projects
language plpgsql security definer set search_path = public as $$
declare
  row_out public.managed_projects;
  v_limit integer;
  v_running integer;
begin
  if not public.is_site_admin() then raise exception 'Only admins can move the queue'; end if;

  select * into row_out from public.managed_projects where id = p_project_id for update;
  if row_out.id is null then raise exception 'Project not found'; end if;
  if row_out.queue_state <> 'queued' then raise exception 'This order is not in the queue'; end if;
  if row_out.payment_status <> 'paid' then raise exception 'Only a paid order can be given a slot'; end if;
  if row_out.status in ('completed', 'cancelled') then raise exception 'This order is closed'; end if;

  select p.slot_limit into v_limit from public.managed_offer_packages p where p.key = row_out.package_key for update;
  if v_limit is not null then
    select count(*) into v_running from public.managed_projects mp
    where mp.package_key = row_out.package_key and mp.queue_state = 'slot'
      and mp.payment_status = 'paid' and mp.status not in ('completed', 'cancelled');
    if v_running >= v_limit then
      raise exception 'All % slot(s) for this package are in production. Deliver or cancel one, or raise the slot limit in Offers.', v_limit;
    end if;
  end if;

  update public.managed_projects
  set queue_state = 'slot', promoted_at = now()
  where id = p_project_id
  returning * into row_out;

  perform public.notify_managed(
    row_out.user_id, 'managed_status', 'Your production slot is open',
    '"' || row_out.name || '" has left the queue and is now with the creative team.', row_out.id
  );

  return row_out;
end;
$$;

-- The admin order list, with where each order stands. Dropped and recreated
-- because its result columns change.
drop function if exists public.admin_managed_overview();

create or replace function public.admin_managed_overview()
returns table (
  id uuid, name text, service_type text, package_key text, status text, payment_status text,
  price_inr integer, video_count integer, duration_seconds integer, aspect_ratio text,
  owner_id uuid, owner_name text, owner_email text, studio_project_id uuid, brand_id uuid,
  deliverables integer, ready_for_review integer, approved integer, unread_messages integer,
  last_message_at timestamptz, created_at timestamptz, updated_at timestamptz,
  queue_state text, queue_position integer
)
language sql stable security definer set search_path = public as $$
  with waiting as (
    select q.id, row_number() over (partition by q.package_key order by q.paid_at nulls last, q.created_at, q.id)::int as pos
    from public.managed_projects q
    where q.queue_state = 'queued' and q.payment_status = 'paid' and q.status not in ('completed', 'cancelled')
  )
  select
    mp.id, mp.name, mp.service_type, mp.package_key, mp.status, mp.payment_status,
    mp.price_inr, mp.video_count, mp.duration_seconds, mp.aspect_ratio,
    mp.user_id, coalesce(pr.full_name, ''), coalesce(pr.email, ''),
    mp.studio_project_id, mp.brand_id,
    (select count(*)::int from public.managed_deliverables d where d.project_id = mp.id),
    (select count(*)::int from public.managed_deliverables d where d.project_id = mp.id and d.status = 'ready_for_review'),
    (select count(*)::int from public.managed_deliverables d where d.project_id = mp.id and d.status = 'approved'),
    (select count(*)::int from public.managed_messages m
      where m.project_id = mp.id and not m.sender_is_admin
        and (mp.admin_last_read_at is null or m.created_at > mp.admin_last_read_at)),
    (select max(m.created_at) from public.managed_messages m where m.project_id = mp.id),
    mp.created_at, mp.updated_at,
    mp.queue_state, w.pos
  from public.managed_projects mp
  left join public.profiles pr on pr.id = mp.user_id
  left join waiting w on w.id = mp.id
  where public.is_site_admin()
  order by mp.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------

revoke execute on function public.create_managed_project(uuid, text, text, text, jsonb, integer, integer, text, integer, integer, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.create_managed_project(uuid, text, text, text, jsonb, integer, integer, text, integer, integer, text, uuid, boolean) to service_role;
revoke execute on function public.mark_managed_project_paid(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.mark_managed_project_paid(uuid, text, integer) to service_role;

-- The raw count takes a buyer id, so only the functions above call it.
revoke execute on function public.managed_package_load(text, uuid) from public, anon, authenticated;

grant execute on function public.managed_offer_availability() to anon, authenticated;
grant execute on function public.managed_queue_positions(uuid[]) to authenticated;
grant execute on function public.admin_set_managed_package_capacity(uuid, integer, integer) to authenticated;
grant execute on function public.admin_managed_capacity() to authenticated;
grant execute on function public.admin_managed_promote_from_queue(uuid) to authenticated;
grant execute on function public.admin_managed_overview() to authenticated;
