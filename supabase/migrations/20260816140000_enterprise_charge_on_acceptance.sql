-- Enterprise orders are charged when the team accepts them, not when they are
-- asked for.
--
-- Charging on request billed a client for work nobody had agreed to take on
-- yet, and left the team refunding orders they simply did not want. Acceptance
-- is the moment the engagement becomes real, so it is the moment the credits
-- move: the client asks for free, the team accepts, and the charge and the
-- team's access to the project happen in the same statement.
--
-- And once accepted, the money stays. A cancellation part-way through is a
-- cancellation of work already begun, so it does not return the credits. That
-- makes acceptance the one decision that costs anybody anything, which is why
-- it is also the only place the balance is checked.

-- ---------------------------------------------------------------------------
-- 1. Requesting is free again
-- ---------------------------------------------------------------------------

create or replace function public.create_enterprise_order(
  p_minutes numeric,
  p_brief text default '',
  p_project_id uuid default null,
  p_contact_name text default '',
  p_contact_email text default '',
  p_contact_phone text default ''
)
returns public.enterprise_orders
language plpgsql security definer set search_path = public as $$
declare
  rate_setting jsonb;
  rate integer;
  enabled boolean;
  order_row public.enterprise_orders;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_minutes is null or p_minutes <= 0 then raise exception 'Enter how many finished minutes you need'; end if;
  if p_minutes > 600 then raise exception 'For runs over 600 minutes, contact the team directly'; end if;

  select value into rate_setting from public.site_settings where key = 'enterprise_rate';
  rate := coalesce((rate_setting->>'usdPerMinute')::integer, 200);
  enabled := coalesce((rate_setting->>'enabled')::boolean, true);
  if not enabled then raise exception 'Enterprise production is not accepting orders right now'; end if;

  -- A project may only be attached by the person who owns it.
  if p_project_id is not null then
    if not exists (select 1 from public.creator_projects where id = p_project_id and user_id = auth.uid()) then
      raise exception 'That project does not belong to you';
    end if;
    update public.creator_projects set enterprise_status = 'requested' where id = p_project_id;
  end if;

  -- The rate is captured now even though nothing is charged yet, so a price
  -- change between the request and the team's answer cannot quietly re-price a
  -- quote the client has already seen.
  insert into public.enterprise_orders (
    user_id, project_id, minutes, rate_usd_per_minute, total_usd,
    brief, contact_name, contact_email, contact_phone, credits_charged
  )
  values (
    auth.uid(), p_project_id, p_minutes, rate, round(p_minutes * rate, 2),
    coalesce(p_brief, ''), coalesce(p_contact_name, ''), coalesce(p_contact_email, ''), coalesce(p_contact_phone, ''),
    0
  )
  returning * into order_row;

  return order_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Accepting is what charges
-- ---------------------------------------------------------------------------

/**
 * Moves an order along, taking payment the first time it is accepted.
 *
 * Charging is guarded on credits_charged rather than on the previous status: an
 * order walked from quoted to in production to delivered passes through the
 * accepted branch three times, and only the first may take money.
 *
 * A client who has spent their balance since ordering fails the charge, which
 * raises and rolls back the whole status change — the team is told the order
 * cannot be paid for instead of starting work that will never be funded.
 *
 * Cancelling does not refund. Once the team has accepted, the work has started,
 * and a mid-production cancellation is not a reason to return the fee. The
 * credits_refunded_at column is kept so a refund made deliberately, out of
 * band, still has somewhere to be recorded.
 */
create or replace function public.admin_update_enterprise_order(p_order_id uuid, p_status text, p_admin_note text default null)
returns public.enterprise_orders
language plpgsql security definer set search_path = public as $$
declare
  order_row public.enterprise_orders;
  credits_needed integer;
  charge record;
begin
  if not exists (select 1 from public.admin_users where id = auth.uid()) then
    raise exception 'Only admins can update enterprise orders';
  end if;
  if p_status not in ('requested', 'quoted', 'in_production', 'delivered', 'cancelled') then
    raise exception 'Invalid order status';
  end if;

  select * into order_row from public.enterprise_orders where id = p_order_id;
  if order_row.id is null then raise exception 'Order not found'; end if;

  -- Accepting: quoted, in production, and delivered all mean the team has taken
  -- the job on, and all three already grant project access below.
  if p_status in ('quoted', 'in_production', 'delivered') and order_row.credits_charged = 0 then
    -- 100 credits to the dollar, matching CREDIT_EXCHANGE_RATE in the app, at
    -- the rate captured when the order was placed. Rounded up: a part-credit
    -- charge would sell a fractional minute below the published rate.
    credits_needed := ceil(order_row.minutes * order_row.rate_usd_per_minute * 100)::integer;

    select * into charge from public.deduct_user_credits(
      order_row.user_id,
      credits_needed,
      'enterprise',
      'Enterprise production accepted: ' || order_row.minutes || ' finished minute(s) at $' || order_row.rate_usd_per_minute || '/min'
    );
    if not charge.success then
      raise exception 'Cannot accept this order: %', coalesce(charge.error_message, 'the client does not have enough credits');
    end if;

    update public.enterprise_orders
    set credits_charged = credits_needed
    where id = order_row.id;
  end if;

  update public.enterprise_orders
  set status = p_status,
      admin_note = coalesce(p_admin_note, admin_note),
      updated_at = now()
  where id = p_order_id
  returning * into order_row;

  if order_row.project_id is not null then
    -- Keep the project badge in step with the engagement.
    update public.creator_projects
    set enterprise_status = case
      when p_status in ('quoted', 'in_production') then 'active'
      when p_status = 'delivered' then 'delivered'
      when p_status = 'cancelled' then null
      else 'requested'
    end
    where id = order_row.project_id;

    if p_status in ('quoted', 'in_production', 'delivered') then
      -- Never grant the owner access to their own project as a "member".
      if order_row.user_id <> auth.uid() then
        insert into public.creator_project_members (project_id, profile_id, added_by)
        values (order_row.project_id, auth.uid(), auth.uid())
        on conflict (project_id, profile_id) do nothing;
      end if;
    elsif p_status = 'cancelled' then
      delete from public.creator_project_members
      where project_id = order_row.project_id
        and profile_id = auth.uid()
        and profile_id <> order_row.user_id;
    end if;
  end if;

  return order_row;
end;
$$;

grant execute on function public.create_enterprise_order(numeric, text, uuid, text, text, text) to authenticated;
grant execute on function public.admin_update_enterprise_order(uuid, text, text) to authenticated;
