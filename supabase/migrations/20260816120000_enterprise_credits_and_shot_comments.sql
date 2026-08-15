-- Enterprise production becomes a real transaction, and the client gets a way to
-- ask for revisions on the work that comes back.
--
-- Two changes that belong together, because they are the two halves of an
-- engagement: placing the order now charges credits at the published rate
-- (1 credit = $0.01, so the $200/minute rate is 20,000 credits a minute), and
-- each shot carries a comment thread the client and the producing team share.

-- ---------------------------------------------------------------------------
-- 1. Orders are charged, not just recorded
-- ---------------------------------------------------------------------------

alter table public.enterprise_orders
  add column if not exists credits_charged integer not null default 0,
  -- Set once, when a cancellation returns the credits. Its presence is what
  -- makes the refund idempotent: an admin who cancels an already-cancelled
  -- order must not hand the credits back twice.
  add column if not exists credits_refunded_at timestamptz;

/**
 * Places an order and charges for it in the same transaction.
 *
 * Charging here rather than out of band is the point: an order that takes no
 * payment is a contact form, and the team cannot tell a serious engagement from
 * a misclick. A failed charge raises, which rolls back the order row and the
 * project's enterprise badge with it — there is no state where a project is
 * marked "requested" against an order nobody paid for.
 */
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
  credits_needed integer;
  charge record;
  order_row public.enterprise_orders;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_minutes is null or p_minutes <= 0 then raise exception 'Enter how many finished minutes you need'; end if;
  if p_minutes > 600 then raise exception 'For runs over 600 minutes, contact the team directly'; end if;

  select value into rate_setting from public.site_settings where key = 'enterprise_rate';
  rate := coalesce((rate_setting->>'usdPerMinute')::integer, 200);
  enabled := coalesce((rate_setting->>'enabled')::boolean, true);
  if not enabled then raise exception 'Enterprise production is not accepting orders right now'; end if;

  -- 100 credits to the dollar, matching CREDIT_EXCHANGE_RATE in the app. Rounded
  -- up: a part-credit charge would let a fractional-minute order be produced for
  -- fractionally less than the published rate.
  credits_needed := ceil(p_minutes * rate * 100)::integer;

  -- A project may only be attached by the person who owns it.
  if p_project_id is not null then
    if not exists (select 1 from public.creator_projects where id = p_project_id and user_id = auth.uid()) then
      raise exception 'That project does not belong to you';
    end if;
  end if;

  select * into charge from public.deduct_user_credits(
    auth.uid(),
    credits_needed,
    'enterprise',
    'Enterprise production: ' || p_minutes || ' finished minute(s) at $' || rate || '/min'
  );
  if not charge.success then
    raise exception '%', coalesce(charge.error_message, 'Insufficient credits for this order');
  end if;

  if p_project_id is not null then
    update public.creator_projects set enterprise_status = 'requested' where id = p_project_id;
  end if;

  insert into public.enterprise_orders (
    user_id, project_id, minutes, rate_usd_per_minute, total_usd,
    brief, contact_name, contact_email, contact_phone, credits_charged
  )
  values (
    auth.uid(), p_project_id, p_minutes, rate, round(p_minutes * rate, 2),
    coalesce(p_brief, ''), coalesce(p_contact_name, ''), coalesce(p_contact_email, ''), coalesce(p_contact_phone, ''),
    credits_needed
  )
  returning * into order_row;

  return order_row;
end;
$$;

/**
 * Moves an order along, and returns the money if it is cancelled.
 *
 * A cancelled order that keeps the credits would be a charge for work never
 * delivered, so the refund is part of the same statement that cancels. It is
 * guarded on credits_refunded_at rather than on the old status, because
 * cancelling twice is an ordinary thing for an admin to do by accident.
 */
create or replace function public.admin_update_enterprise_order(p_order_id uuid, p_status text, p_admin_note text default null)
returns public.enterprise_orders
language plpgsql security definer set search_path = public as $$
declare
  order_row public.enterprise_orders;
begin
  if not exists (select 1 from public.admin_users where id = auth.uid()) then
    raise exception 'Only admins can update enterprise orders';
  end if;
  if p_status not in ('requested', 'quoted', 'in_production', 'delivered', 'cancelled') then
    raise exception 'Invalid order status';
  end if;

  update public.enterprise_orders
  set status = p_status,
      admin_note = coalesce(p_admin_note, admin_note),
      updated_at = now()
  where id = p_order_id
  returning * into order_row;
  if order_row.id is null then raise exception 'Order not found'; end if;

  if p_status = 'cancelled' and order_row.credits_charged > 0 and order_row.credits_refunded_at is null then
    perform public.add_user_credits(
      order_row.user_id,
      order_row.credits_charged,
      'refund',
      'Refund: cancelled enterprise order'
    );
    update public.enterprise_orders
    set credits_refunded_at = now()
    where id = order_row.id
    returning * into order_row;
  end if;

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

-- ---------------------------------------------------------------------------
-- 2. Revision notes, per shot
-- ---------------------------------------------------------------------------

-- A delivered cut is discussed shot by shot, so a note lives on the shot rather
-- than on the project. One level of replies, not a tree: "the client asked, the
-- team answered" is the shape of the conversation, and deeper nesting only makes
-- a revision list harder to read.
create table if not exists public.creator_shot_comments (
  id uuid primary key default gen_random_uuid(),
  shot_id uuid not null references public.creator_shots(id) on delete cascade,
  -- Denormalised from the shot's episode so every policy and every listing can
  -- be answered without a two-hop join through episodes.
  project_id uuid not null references public.creator_projects(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.creator_shot_comments(id) on delete cascade,
  body text not null check (length(btrim(body)) > 0 and length(body) <= 5000),
  -- Marks a revision as dealt with. Nullable rather than a boolean so the panel
  -- can say when it was closed, not only that it was.
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists creator_shot_comments_shot_idx on public.creator_shot_comments (shot_id, created_at);
create index if not exists creator_shot_comments_project_idx on public.creator_shot_comments (project_id, created_at desc);
create index if not exists creator_shot_comments_parent_idx on public.creator_shot_comments (parent_id);

alter table public.creator_shot_comments enable row level security;

/**
 * Everyone who can open the project can read and write its notes.
 *
 * That is exactly the owner plus its members — and accepting an enterprise order
 * already adds the producing admin as a member, so the team gets in through the
 * same door as any collaborator rather than through a second, enterprise-shaped
 * access path that would have to be kept in step with the first.
 */
create or replace function public.can_access_project(p_project_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.creator_projects p
    where p.id = p_project_id and p.user_id = auth.uid()
  ) or exists (
    select 1 from public.creator_project_members m
    where m.project_id = p_project_id and m.profile_id = auth.uid()
  );
$$;

grant execute on function public.can_access_project(uuid) to authenticated;

drop policy if exists "shot comments read" on public.creator_shot_comments;
create policy "shot comments read" on public.creator_shot_comments for select
  to authenticated using (public.can_access_project(project_id));

drop policy if exists "shot comments insert" on public.creator_shot_comments;
create policy "shot comments insert" on public.creator_shot_comments for insert
  to authenticated with check (author_id = auth.uid() and public.can_access_project(project_id));

-- Editing is the author's alone; resolving is anyone on the project's, and goes
-- through the function below so a client cannot rewrite the team's reply while
-- closing it.
drop policy if exists "shot comments update own" on public.creator_shot_comments;
create policy "shot comments update own" on public.creator_shot_comments for update
  to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists "shot comments delete own" on public.creator_shot_comments;
create policy "shot comments delete own" on public.creator_shot_comments for delete
  to authenticated using (author_id = auth.uid());

/**
 * Opens or closes a revision note.
 *
 * A reply cannot be resolved on its own — it belongs to the thread its parent
 * opened, and closing half a conversation leaves a list that reads as done while
 * the question is still open.
 */
create or replace function public.set_shot_comment_resolved(p_comment_id uuid, p_resolved boolean)
returns public.creator_shot_comments
language plpgsql security definer set search_path = public as $$
declare
  comment_row public.creator_shot_comments;
begin
  select * into comment_row from public.creator_shot_comments where id = p_comment_id;
  if comment_row.id is null then raise exception 'Comment not found'; end if;
  if not public.can_access_project(comment_row.project_id) then
    raise exception 'You do not have access to this project';
  end if;
  if comment_row.parent_id is not null then
    raise exception 'Resolve the note this reply belongs to, not the reply';
  end if;

  update public.creator_shot_comments
  set resolved_at = case when p_resolved then now() else null end,
      resolved_by = case when p_resolved then auth.uid() else null end,
      updated_at = now()
  where id = p_comment_id
  returning * into comment_row;

  return comment_row;
end;
$$;

grant execute on function public.set_shot_comment_resolved(uuid, boolean) to authenticated;
