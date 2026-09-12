-- Managed production: hiring the team instead of operating the studio.
--
-- The client's whole relationship with a job lives in these tables — the brief
-- they filled in, the videos we hand back, the conversation, the revisions.
-- What they never touch is `creator_*`: the internal production runs in the
-- Creator Studio as it always has, owned by the admin producing it, and the
-- only bridge is `managed_projects.studio_project_id` plus a publish step that
-- copies chosen bytes across. An unpublished take is unreachable by the client
-- at the database and at storage, not merely absent from a screen.
--
-- `enterprise_orders` stays as it is. That flow is the opposite shape — a
-- client who already has a project of their own and hands it over — and folding
-- the two together would mean one status vocabulary describing two jobs.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.managed_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default 'Untitled campaign',
  service_type text not null check (service_type in ('ugc', 'direct_response', 'cinematic', 'micro_drama')),
  package_key text not null default '',

  -- The brand room the brief was answered from. Nullable because a client can
  -- describe a brand in the brief without ever opening /studio/brand, but when
  -- it is set the production reads that brand's voice, rules and art directly.
  brand_id uuid references public.creator_brands(id) on delete set null,
  -- The internal Creator Studio production. Created by an admin after payment
  -- and owned by that admin; the client holds no grant on it of any kind.
  studio_project_id uuid references public.creator_projects(id) on delete set null,

  -- Everything the client answered, as given. Kept whole rather than shredded
  -- into columns: the questions differ per service and will keep changing, and
  -- a brief is read as a document by the producer, not queried field by field.
  brief jsonb not null default '{}'::jsonb,

  status text not null default 'brief_received' check (status in (
    'brief_received', 'creative_research', 'script_in_progress', 'script_review',
    'production', 'first_cut', 'revision_requested', 'finalizing', 'completed', 'cancelled'
  )),

  video_count integer not null default 1 check (video_count between 1 and 50),
  duration_seconds integer not null default 30 check (duration_seconds between 5 and 600),
  aspect_ratio text not null default '9:16',
  revisions_included integer not null default 2 check (revisions_included between 0 and 20),

  -- Priced by the server at order time and frozen here, so a later price change
  -- never rewrites what someone already bought.
  price_inr integer not null default 0 check (price_inr >= 0),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'proposal_requested', 'cancelled')),
  payment_id text not null default '',
  paid_at timestamptz,

  admin_note text not null default '',
  -- Unread badges for both sides, which is two timestamps rather than a
  -- per-message read table: this conversation has exactly two participants.
  client_last_read_at timestamptz,
  admin_last_read_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists managed_projects_user_idx on public.managed_projects (user_id, created_at desc);
create index if not exists managed_projects_status_idx on public.managed_projects (status, created_at desc);
create index if not exists managed_projects_studio_idx on public.managed_projects (studio_project_id);
-- A payment settles exactly one order. This is what makes verification
-- idempotent under a double-submitted Razorpay callback.
create unique index if not exists managed_projects_payment_idx
  on public.managed_projects (payment_id) where payment_id <> '';

create table if not exists public.managed_deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.managed_projects(id) on delete cascade,
  title text not null default 'Ad 01',
  position integer not null default 1,
  status text not null default 'in_production' check (status in (
    'in_production', 'ready_for_review', 'revision_requested', 'approved'
  )),
  aspect_ratio text not null default '9:16',
  revisions_used integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists managed_deliverables_project_idx on public.managed_deliverables (project_id, position);

-- Versions accumulate; nothing is ever overwritten. V1 stays watchable after
-- V2 lands, because "what changed between the cuts" is the question a revision
-- conversation is actually about.
create table if not exists public.managed_deliverable_versions (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.managed_deliverables(id) on delete cascade,
  project_id uuid not null references public.managed_projects(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  label text not null default '',
  -- Always under `managed/{project_id}/`, never a path inside the admin's own
  -- studio prefix: publishing copies the bytes across rather than pointing the
  -- client at an internal file.
  storage_path text not null,
  thumbnail_path text not null default '',
  duration_seconds numeric(8, 2),
  note text not null default '',
  is_final boolean not null default false,
  published_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (deliverable_id, version_number)
);

create index if not exists managed_versions_deliverable_idx on public.managed_deliverable_versions (deliverable_id, version_number desc);
create index if not exists managed_versions_project_idx on public.managed_deliverable_versions (project_id, created_at desc);

create table if not exists public.managed_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.managed_projects(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  -- Denormalised so the client's thread can say "AI Director Hub team" without
  -- a join that would also name which admin is producing their work.
  sender_is_admin boolean not null default false,
  -- `delivery` marks the covering note written by the publish step. It reads as
  -- an ordinary message in the thread but raises no message notification,
  -- because publishing already sends a better-worded one of its own.
  kind text not null default 'chat' check (kind in ('chat', 'delivery')),
  body text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  -- Set when the message is about one deliverable, so a thread can be read
  -- beside the video it discusses.
  deliverable_id uuid references public.managed_deliverables(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint managed_messages_not_empty check (length(btrim(body)) > 0 or jsonb_array_length(attachments) > 0)
);

create index if not exists managed_messages_project_idx on public.managed_messages (project_id, created_at);

-- Timestamped feedback: "00:08 — change this product shot". Pinned to the
-- version it was left on, so a note answered in V2 still reads against V1.
create table if not exists public.managed_revision_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.managed_projects(id) on delete cascade,
  deliverable_id uuid not null references public.managed_deliverables(id) on delete cascade,
  version_id uuid references public.managed_deliverable_versions(id) on delete set null,
  author_id uuid not null references public.profiles(id) on delete cascade,
  timestamp_seconds numeric(8, 2) check (timestamp_seconds is null or timestamp_seconds >= 0),
  body text not null check (length(btrim(body)) > 0 and length(body) <= 5000),
  attachments jsonb not null default '[]'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists managed_comments_deliverable_idx on public.managed_revision_comments (deliverable_id, created_at);
create index if not exists managed_comments_project_idx on public.managed_revision_comments (project_id, created_at desc);

drop trigger if exists managed_projects_updated on public.managed_projects;
create trigger managed_projects_updated before update on public.managed_projects
  for each row execute function public.creator_touch_updated_at();
drop trigger if exists managed_deliverables_updated on public.managed_deliverables;
create trigger managed_deliverables_updated before update on public.managed_deliverables
  for each row execute function public.creator_touch_updated_at();

alter table public.notifications
  add column if not exists managed_project_id uuid references public.managed_projects(id) on delete cascade;

create index if not exists notifications_managed_idx on public.notifications (managed_project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Access predicates
--
-- SECURITY DEFINER so a policy on managed_deliverables can consult the parent
-- project without recursing back through that project's own RLS.
-- ---------------------------------------------------------------------------

create or replace function public.is_site_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where id = auth.uid());
$$;

create or replace function public.can_access_managed_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.managed_projects mp
    where mp.id = p_project_id
      and (mp.user_id = auth.uid() or exists (select 1 from public.admin_users a where a.id = auth.uid()))
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Row level security
--
-- Reads are policy-driven; every write that carries value — money, status, a
-- published file, an approval — goes through a SECURITY DEFINER function below,
-- so a browser cannot mark its own order paid or publish its own deliverable.
-- The two exceptions are messages and revision comments, which a participant
-- genuinely authors themselves.
-- ---------------------------------------------------------------------------

alter table public.managed_projects enable row level security;
alter table public.managed_deliverables enable row level security;
alter table public.managed_deliverable_versions enable row level security;
alter table public.managed_messages enable row level security;
alter table public.managed_revision_comments enable row level security;

drop policy if exists "managed projects read" on public.managed_projects;
create policy "managed projects read" on public.managed_projects for select to authenticated
  using (user_id = auth.uid() or public.is_site_admin());

drop policy if exists "managed deliverables read" on public.managed_deliverables;
create policy "managed deliverables read" on public.managed_deliverables for select to authenticated
  using (public.can_access_managed_project(project_id));

drop policy if exists "managed versions read" on public.managed_deliverable_versions;
create policy "managed versions read" on public.managed_deliverable_versions for select to authenticated
  using (public.can_access_managed_project(project_id));

drop policy if exists "managed messages read" on public.managed_messages;
create policy "managed messages read" on public.managed_messages for select to authenticated
  using (public.can_access_managed_project(project_id));

-- `kind` is fixed to 'chat' here: 'delivery' is the publish step's own voice,
-- and a participant writing one by hand would announce a cut that does not
-- exist.
drop policy if exists "managed messages write" on public.managed_messages;
create policy "managed messages write" on public.managed_messages for insert to authenticated
  with check (sender_id = auth.uid() and kind = 'chat' and public.can_access_managed_project(project_id));

drop policy if exists "managed comments read" on public.managed_revision_comments;
create policy "managed comments read" on public.managed_revision_comments for select to authenticated
  using (public.can_access_managed_project(project_id));

drop policy if exists "managed comments write" on public.managed_revision_comments;
create policy "managed comments write" on public.managed_revision_comments for insert to authenticated
  with check (author_id = auth.uid() and public.can_access_managed_project(project_id));

-- ---------------------------------------------------------------------------
-- 4. Notifications
-- ---------------------------------------------------------------------------

create or replace function public.notify_managed(p_user_id uuid, p_type text, p_title text, p_body text, p_project_id uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, type, title, body, managed_project_id)
  select p_user_id, p_type, p_title, left(coalesce(p_body, ''), 300), p_project_id
  where p_user_id is not null;
$$;

-- Every admin hears about a new order or a client reply. There is no assignment
-- model yet, and an order nobody is notified about is an order nobody answers.
create or replace function public.notify_managed_admins(p_type text, p_title text, p_body text, p_project_id uuid, p_except uuid default null)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, type, title, body, managed_project_id)
  select a.id, p_type, p_title, left(coalesce(p_body, ''), 300), p_project_id
  from public.admin_users a
  where p_except is null or a.id <> p_except;
$$;

create or replace function public.notify_managed_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_name text;
  v_preview text;
begin
  if new.kind <> 'chat' then return new; end if;

  select mp.user_id, mp.name into v_owner, v_name from public.managed_projects mp where mp.id = new.project_id;
  v_preview := case when length(btrim(new.body)) > 0 then new.body else 'Sent an attachment' end;

  if new.sender_is_admin then
    perform public.notify_managed(v_owner, 'managed_message',
      'New message on "' || coalesce(v_name, 'your project') || '"', v_preview, new.project_id);
  else
    perform public.notify_managed_admins('managed_message',
      'Client message on "' || coalesce(v_name, 'a project') || '"', v_preview, new.project_id, new.sender_id);
  end if;
  return new;
end;
$$;

drop trigger if exists managed_message_notify on public.managed_messages;
create trigger managed_message_notify after insert on public.managed_messages
  for each row execute function public.notify_managed_message();

-- ---------------------------------------------------------------------------
-- 5. Server-only writes (money)
-- ---------------------------------------------------------------------------

/**
 * Opens an order.
 *
 * The price is passed in by the route that calculated it, never by a browser,
 * which is why this takes the owner as an argument instead of reading
 * auth.uid(): it runs under the service key from a route that has already
 * decided who is buying and what it costs. The row starts unpaid — nothing is
 * produced and no deliverable exists until mark_managed_project_paid runs
 * against a verified Razorpay payment.
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
  p_brand_id uuid default null
)
returns public.managed_projects
language plpgsql security definer set search_path = public as $$
declare
  row_out public.managed_projects;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Managed projects can only be opened by the server';
  end if;
  if p_user_id is null then raise exception 'A customer is required'; end if;
  if p_payment_status not in ('pending', 'proposal_requested') then
    raise exception 'A new project starts unpaid';
  end if;

  insert into public.managed_projects (
    user_id, name, service_type, package_key, brief, video_count, duration_seconds,
    aspect_ratio, revisions_included, price_inr, payment_status, brand_id
  ) values (
    p_user_id, coalesce(nullif(btrim(p_name), ''), 'Untitled campaign'), p_service_type,
    coalesce(p_package_key, ''), coalesce(p_brief, '{}'::jsonb), greatest(coalesce(p_video_count, 1), 1),
    coalesce(p_duration_seconds, 30), coalesce(nullif(p_aspect_ratio, ''), '9:16'),
    coalesce(p_revisions_included, 2), greatest(coalesce(p_price_inr, 0), 0), p_payment_status, p_brand_id
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

/**
 * Turns a verified payment into a live production.
 *
 * Idempotent on payment status: a resubmitted callback reports that the project
 * was already paid for rather than creating a second set of deliverables. The
 * empty deliverable rows are created here rather than by the producer, so the
 * client opens their dashboard to the three slots they bought, each visibly
 * awaiting its first cut.
 */
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

  update public.managed_projects
  set payment_status = 'paid',
      payment_id = p_payment_id,
      price_inr = coalesce(p_price_inr, price_inr),
      paid_at = now(),
      status = 'brief_received'
  where id = p_project_id
  returning * into row_out;

  for slot in 1..row_out.video_count loop
    insert into public.managed_deliverables (project_id, title, position, aspect_ratio)
    values (row_out.id, 'Ad ' || lpad(slot::text, 2, '0'), slot, row_out.aspect_ratio);
  end loop;

  perform public.notify_managed(
    row_out.user_id, 'managed_order', 'Project confirmed: ' || row_out.name,
    'Your brief is with the creative team. You can track production and message us any time.', row_out.id
  );
  perform public.notify_managed_admins(
    'managed_order', 'New managed order: ' || row_out.name,
    row_out.video_count || ' video(s), ' || row_out.service_type || ', paid.', row_out.id, null
  );

  return query select row_out.id, true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Client writes
-- ---------------------------------------------------------------------------

/** Clears the unread badge for whichever side of the conversation is asking. */
create or replace function public.mark_managed_project_read(p_project_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  if not public.can_access_managed_project(p_project_id) then
    raise exception 'You do not have access to this project';
  end if;
  select user_id into v_owner from public.managed_projects where id = p_project_id;
  if v_owner = auth.uid() then
    update public.managed_projects set client_last_read_at = now() where id = p_project_id;
  else
    update public.managed_projects set admin_last_read_at = now() where id = p_project_id;
  end if;
end;
$$;

/**
 * Approving a cut.
 *
 * The owner's call alone — an admin marking their own work approved is not an
 * approval. When the last deliverable is signed off the project completes
 * itself, so nobody has to remember to close it.
 */
create or replace function public.managed_approve_deliverable(p_deliverable_id uuid)
returns public.managed_deliverables
language plpgsql security definer set search_path = public as $$
declare
  row_out public.managed_deliverables;
  v_project public.managed_projects;
  v_outstanding integer;
begin
  select * into row_out from public.managed_deliverables where id = p_deliverable_id;
  if row_out.id is null then raise exception 'Deliverable not found'; end if;
  select * into v_project from public.managed_projects where id = row_out.project_id;
  if v_project.user_id is distinct from auth.uid() then
    raise exception 'Only the client can approve their video';
  end if;
  if not exists (select 1 from public.managed_deliverable_versions where deliverable_id = row_out.id) then
    raise exception 'There is nothing to approve yet';
  end if;

  update public.managed_deliverables set status = 'approved' where id = p_deliverable_id returning * into row_out;

  -- The newest version is the one being signed off, and marking it final is
  -- what the delivery area reads to decide which file to hand over.
  update public.managed_deliverable_versions set is_final = (id = (
    select v.id from public.managed_deliverable_versions v
    where v.deliverable_id = row_out.id order by v.version_number desc limit 1
  )) where deliverable_id = row_out.id;

  select count(*)::int into v_outstanding
  from public.managed_deliverables
  where project_id = v_project.id and status <> 'approved';

  if v_outstanding = 0 then
    update public.managed_projects set status = 'completed' where id = v_project.id;
    perform public.notify_managed_admins('managed_status', 'Project completed: ' || v_project.name,
      'Every deliverable has been approved by the client.', v_project.id, null);
  else
    perform public.notify_managed_admins('managed_status', 'Approved: ' || row_out.title,
      v_project.name || ' — ' || v_outstanding || ' deliverable(s) still open.', v_project.id, null);
  end if;

  return row_out;
end;
$$;

/**
 * Asking for changes.
 *
 * Notes and timestamped comments arrive together because they are one act: a
 * client who writes "00:08 change the product shot" and then has to submit it
 * separately from the general note has been made to do the team's filing. The
 * deliverable and the project both move to `revision_requested`, which is what
 * the client's timeline and the admin's queue each read.
 */
create or replace function public.managed_request_revision(
  p_deliverable_id uuid,
  p_notes text,
  p_comments jsonb default '[]'::jsonb,
  p_attachments jsonb default '[]'::jsonb
)
returns public.managed_deliverables
language plpgsql security definer set search_path = public as $$
declare
  row_out public.managed_deliverables;
  v_project public.managed_projects;
  v_version uuid;
  comment_row jsonb;
begin
  select * into row_out from public.managed_deliverables where id = p_deliverable_id;
  if row_out.id is null then raise exception 'Deliverable not found'; end if;
  select * into v_project from public.managed_projects where id = row_out.project_id;
  if v_project.user_id is distinct from auth.uid() then
    raise exception 'Only the client can request a revision';
  end if;
  if row_out.status = 'approved' then raise exception 'This video has already been approved'; end if;

  select id into v_version from public.managed_deliverable_versions
  where deliverable_id = row_out.id order by version_number desc limit 1;
  if v_version is null then raise exception 'There is no cut to revise yet'; end if;

  if length(btrim(coalesce(p_notes, ''))) > 0 then
    insert into public.managed_revision_comments (project_id, deliverable_id, version_id, author_id, body, attachments)
    values (v_project.id, row_out.id, v_version, auth.uid(), left(p_notes, 5000), coalesce(p_attachments, '[]'::jsonb));
  end if;

  for comment_row in select value from jsonb_array_elements(coalesce(p_comments, '[]'::jsonb)) loop
    if length(btrim(coalesce(comment_row->>'body', ''))) > 0 then
      insert into public.managed_revision_comments (project_id, deliverable_id, version_id, author_id, timestamp_seconds, body)
      values (
        v_project.id, row_out.id, v_version, auth.uid(),
        nullif(comment_row->>'timestampSeconds', '')::numeric,
        left(comment_row->>'body', 5000)
      );
    end if;
  end loop;

  update public.managed_deliverables
  set status = 'revision_requested', revisions_used = revisions_used + 1
  where id = p_deliverable_id
  returning * into row_out;

  update public.managed_projects set status = 'revision_requested' where id = v_project.id;

  perform public.notify_managed_admins(
    'managed_revision', 'Revision requested: ' || row_out.title,
    v_project.name || ' — ' || coalesce(nullif(left(p_notes, 200), ''), 'See the timestamped notes.'),
    v_project.id, null
  );

  return row_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Admin writes
-- ---------------------------------------------------------------------------

create or replace function public.admin_managed_set_status(p_project_id uuid, p_status text, p_note text default null)
returns public.managed_projects
language plpgsql security definer set search_path = public as $$
declare
  row_out public.managed_projects;
begin
  if not public.is_site_admin() then raise exception 'Only admins can move a project along'; end if;

  update public.managed_projects
  set status = p_status, admin_note = coalesce(p_note, admin_note)
  where id = p_project_id
  returning * into row_out;
  if row_out.id is null then raise exception 'Project not found'; end if;

  -- Only the stages a client would want to hear about. "Creative research
  -- started" on a Tuesday afternoon is not news; "your script is ready to read"
  -- is.
  if p_status in ('script_review', 'first_cut', 'finalizing', 'completed') then
    perform public.notify_managed(
      row_out.user_id, 'managed_status',
      case p_status
        when 'script_review' then 'Your script is ready to review'
        when 'first_cut' then 'Your first cut is ready'
        when 'finalizing' then 'We are finalising your videos'
        else 'Your project is complete'
      end,
      row_out.name, row_out.id
    );
  end if;

  return row_out;
end;
$$;

create or replace function public.admin_managed_upsert_deliverable(
  p_project_id uuid,
  p_deliverable_id uuid,
  p_title text,
  p_position integer default null,
  p_aspect_ratio text default null
)
returns public.managed_deliverables
language plpgsql security definer set search_path = public as $$
declare
  row_out public.managed_deliverables;
  v_next integer;
begin
  if not public.is_site_admin() then raise exception 'Only admins can change deliverables'; end if;

  if p_deliverable_id is null then
    select coalesce(max(position), 0) + 1 into v_next from public.managed_deliverables where project_id = p_project_id;
    insert into public.managed_deliverables (project_id, title, position, aspect_ratio)
    values (
      p_project_id,
      coalesce(nullif(btrim(p_title), ''), 'Ad ' || lpad(v_next::text, 2, '0')),
      coalesce(p_position, v_next),
      coalesce(nullif(p_aspect_ratio, ''), (select aspect_ratio from public.managed_projects where id = p_project_id))
    )
    returning * into row_out;
  else
    update public.managed_deliverables
    set title = coalesce(nullif(btrim(p_title), ''), title),
        position = coalesce(p_position, position),
        aspect_ratio = coalesce(nullif(p_aspect_ratio, ''), aspect_ratio)
    where id = p_deliverable_id and project_id = p_project_id
    returning * into row_out;
    if row_out.id is null then raise exception 'Deliverable not found'; end if;
  end if;

  return row_out;
end;
$$;

/**
 * Publishes one cut to the client.
 *
 * The bytes are copied into the client prefix by the route before this runs;
 * what happens here is the record of it — the next version number, the
 * deliverable turning to `ready_for_review`, the covering note in the project
 * chat, and the notification. All in one statement, because a version the
 * client can see with no message explaining it is how "is this the one you
 * wanted?" turns back into an email.
 */
create or replace function public.admin_managed_publish_version(
  p_deliverable_id uuid,
  p_storage_path text,
  p_label text default '',
  p_note text default '',
  p_thumbnail_path text default '',
  p_duration_seconds numeric default null
)
returns public.managed_deliverable_versions
language plpgsql security definer set search_path = public as $$
declare
  row_out public.managed_deliverable_versions;
  v_deliverable public.managed_deliverables;
  v_project public.managed_projects;
  v_number integer;
begin
  if not public.is_site_admin() then raise exception 'Only admins can publish to a client'; end if;
  if coalesce(btrim(p_storage_path), '') = '' then raise exception 'A file is required'; end if;

  select * into v_deliverable from public.managed_deliverables where id = p_deliverable_id;
  if v_deliverable.id is null then raise exception 'Deliverable not found'; end if;
  select * into v_project from public.managed_projects where id = v_deliverable.project_id;

  -- Refuses to hand the client a path outside their own prefix, which is the
  -- backstop for the publish route forgetting to copy the file across.
  if p_storage_path not like 'managed/' || v_project.id::text || '/%' then
    raise exception 'A published file must live under this project''s client folder';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_number
  from public.managed_deliverable_versions where deliverable_id = p_deliverable_id;

  insert into public.managed_deliverable_versions (
    deliverable_id, project_id, version_number, label, storage_path, thumbnail_path,
    duration_seconds, note, published_by
  ) values (
    p_deliverable_id, v_project.id, v_number,
    coalesce(nullif(btrim(p_label), ''), 'V' || v_number),
    p_storage_path, coalesce(p_thumbnail_path, ''), p_duration_seconds,
    coalesce(p_note, ''), auth.uid()
  )
  returning * into row_out;

  update public.managed_deliverables set status = 'ready_for_review' where id = p_deliverable_id;
  if v_project.status in ('brief_received', 'creative_research', 'script_in_progress', 'script_review', 'production', 'revision_requested') then
    update public.managed_projects set status = 'first_cut' where id = v_project.id;
  end if;

  insert into public.managed_messages (project_id, sender_id, sender_is_admin, kind, body, deliverable_id)
  values (
    v_project.id, auth.uid(), true, 'delivery',
    coalesce(nullif(btrim(p_note), ''), v_deliverable.title || ' — ' || row_out.label || ' is ready for review.'),
    p_deliverable_id
  );

  perform public.notify_managed(
    v_project.user_id, 'managed_delivery',
    v_deliverable.title || ' — ' || row_out.label || ' is ready',
    'Your video is ready to review in ' || v_project.name || '.', v_project.id
  );

  return row_out;
end;
$$;

/** Links the internal Creator Studio production to the client's order. */
create or replace function public.admin_managed_link_studio_project(p_project_id uuid, p_studio_project_id uuid)
returns public.managed_projects
language plpgsql security definer set search_path = public as $$
declare
  row_out public.managed_projects;
begin
  if not public.is_site_admin() then raise exception 'Only admins can link a production'; end if;
  update public.managed_projects set studio_project_id = p_studio_project_id where id = p_project_id returning * into row_out;
  if row_out.id is null then raise exception 'Project not found'; end if;
  return row_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. The admin queue
-- ---------------------------------------------------------------------------

create or replace function public.admin_managed_overview()
returns table (
  id uuid,
  name text,
  service_type text,
  package_key text,
  status text,
  payment_status text,
  price_inr integer,
  video_count integer,
  duration_seconds integer,
  aspect_ratio text,
  owner_id uuid,
  owner_name text,
  owner_email text,
  studio_project_id uuid,
  brand_id uuid,
  deliverables integer,
  ready_for_review integer,
  approved integer,
  unread_messages integer,
  last_message_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
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
    mp.created_at, mp.updated_at
  from public.managed_projects mp
  left join public.profiles pr on pr.id = mp.user_id
  where public.is_site_admin()
  order by mp.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- 9. Grants
--
-- Same two-layer rule the credit ledger uses: the grant is the control and the
-- identity check in the body is the backstop. Opening an order and settling a
-- payment are server-only, so PUBLIC — the implicit grant every function is
-- created with — is revoked from them.
-- ---------------------------------------------------------------------------

revoke execute on function public.create_managed_project(uuid, text, text, text, jsonb, integer, integer, text, integer, integer, text, uuid) from public, anon, authenticated;
revoke execute on function public.mark_managed_project_paid(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.notify_managed(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.notify_managed_admins(text, text, text, uuid, uuid) from public, anon, authenticated;

grant execute on function public.create_managed_project(uuid, text, text, text, jsonb, integer, integer, text, integer, integer, text, uuid) to service_role;
grant execute on function public.mark_managed_project_paid(uuid, text, integer) to service_role;

grant execute on function public.is_site_admin() to authenticated;
grant execute on function public.can_access_managed_project(uuid) to authenticated;
grant execute on function public.mark_managed_project_read(uuid) to authenticated;
grant execute on function public.managed_approve_deliverable(uuid) to authenticated;
grant execute on function public.managed_request_revision(uuid, text, jsonb, jsonb) to authenticated;
grant execute on function public.admin_managed_set_status(uuid, text, text) to authenticated;
grant execute on function public.admin_managed_upsert_deliverable(uuid, uuid, text, integer, text) to authenticated;
grant execute on function public.admin_managed_publish_version(uuid, text, text, text, text, numeric) to authenticated;
grant execute on function public.admin_managed_link_studio_project(uuid, uuid) to authenticated;
grant execute on function public.admin_managed_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Storage
--
-- Client-facing files live under `managed/{project_id}/`, a prefix separate
-- from every `{owner_id}/{project_id}/` path the studio writes. That separation
-- is the whole of the internal/client split: an unpublished take is not merely
-- absent from the client's screen, it sits behind a policy they cannot satisfy,
-- and publishing means copying bytes across the line rather than moving it.
-- ---------------------------------------------------------------------------

create or replace function public.managed_media_project(p_name text)
returns uuid language plpgsql immutable set search_path = public as $$
declare
  parts text[];
begin
  parts := storage.foldername(p_name);
  if coalesce(array_length(parts, 1), 0) < 2 or parts[1] <> 'managed' then return null; end if;
  if parts[2] !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return null; end if;
  return parts[2]::uuid;
end;
$$;

grant execute on function public.managed_media_project(text) to authenticated;

drop policy if exists "managed media read" on storage.objects;
create policy "managed media read" on storage.objects for select to authenticated
  using (
    bucket_id = 'creator-studio-media'
    and public.can_access_managed_project(public.managed_media_project(name))
  );

-- Clients upload the brief's product shots and the chat's reference clips
-- themselves, so they need a write path — but only into `uploads/`. Deliverable
-- files are written by the publish route under the service key, which no policy
-- constrains, so nothing legitimate needs a broader grant than this.
drop policy if exists "managed media write" on storage.objects;
create policy "managed media write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'creator-studio-media'
    and (storage.foldername(name))[3] = 'uploads'
    and public.can_access_managed_project(public.managed_media_project(name))
  );
