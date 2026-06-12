-- Notifications + chat between job poster and selected creator.

create table if not exists public.notifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    type text not null default 'generic',
    title text not null default '',
    body text not null default '',
    job_id uuid references public.service_requests(id) on delete cascade,
    read boolean not null default false,
    created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications"
on public.notifications for select
using (user_id = auth.uid());

drop policy if exists "users update own notifications" on public.notifications;
create policy "users update own notifications"
on public.notifications for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create table if not exists public.job_messages (
    id uuid primary key default gen_random_uuid(),
    job_id uuid not null references public.service_requests(id) on delete cascade,
    sender_id uuid not null references public.profiles(id) on delete cascade,
    sender_name text not null default '',
    content text not null,
    created_at timestamptz not null default now()
);

create index if not exists job_messages_job_id_idx on public.job_messages (job_id, created_at);

alter table public.job_messages enable row level security;

-- Only the poster and the selected (winning) bidder of an awarded job can chat.
create or replace function public.is_job_chat_participant(p_job_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.service_requests sr
        left join public.service_job_bids b on b.id = sr.selected_bid_id
        where sr.id = p_job_id
        and sr.status in ('awarded', 'closed')
        and (sr.poster_id = p_user_id or b.bidder_id = p_user_id)
    );
$$;

drop policy if exists "participants read job messages" on public.job_messages;
create policy "participants read job messages"
on public.job_messages for select
using (public.is_job_chat_participant(job_id, auth.uid()));

drop policy if exists "participants send job messages" on public.job_messages;
create policy "participants send job messages"
on public.job_messages for insert
with check (
    sender_id = auth.uid()
    and public.is_job_chat_participant(job_id, auth.uid())
);

-- Notify the other participant when a message is sent.
create or replace function public.notify_job_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_poster_id uuid;
    v_winner_id uuid;
    v_recipient uuid;
    v_title text;
begin
    select sr.poster_id, b.bidder_id, sr.title
    into v_poster_id, v_winner_id, v_title
    from public.service_requests sr
    left join public.service_job_bids b on b.id = sr.selected_bid_id
    where sr.id = new.job_id;

    v_recipient := case when new.sender_id = v_poster_id then v_winner_id else v_poster_id end;

    if v_recipient is not null then
        insert into public.notifications (user_id, type, title, body, job_id)
        values (
            v_recipient,
            'job_message',
            'New message on "' || coalesce(v_title, 'your job') || '"',
            left(new.content, 140),
            new.job_id
        );
    end if;

    return new;
end;
$$;

drop trigger if exists job_message_notify on public.job_messages;
create trigger job_message_notify
after insert on public.job_messages
for each row execute function public.notify_job_message();

-- Selecting a winner now notifies the winning creator (and rejected bidders).
create or replace function public.select_service_job_bid(p_job_id uuid, p_bid_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_poster_id uuid;
    v_winner_id uuid;
    v_job_title text;
begin
    select poster_id, title into v_poster_id, v_job_title
    from public.service_requests
    where id = p_job_id;

    if v_poster_id is null or v_poster_id <> auth.uid() then
        raise exception 'Only the job poster can select a bid';
    end if;

    update public.service_job_bids
    set status = case when id = p_bid_id then 'selected' else 'rejected' end
    where job_id = p_job_id;

    update public.service_requests
    set status = 'awarded', selected_bid_id = p_bid_id
    where id = p_job_id;

    select bidder_id into v_winner_id
    from public.service_job_bids
    where id = p_bid_id;

    if v_winner_id is not null then
        insert into public.notifications (user_id, type, title, body, job_id)
        values (
            v_winner_id,
            'job_won',
            '🎉 You won the interview!',
            'You were selected for "' || coalesce(v_job_title, 'a job') || '". Open the chat to talk with the client.',
            p_job_id
        );
    end if;

    insert into public.notifications (user_id, type, title, body, job_id)
    select bidder_id, 'job_lost',
        'Update on "' || coalesce(v_job_title, 'a job') || '"',
        'The client selected another creator for this job. Keep bidding — more jobs are posted weekly.',
        p_job_id
    from public.service_job_bids
    where job_id = p_job_id and id <> p_bid_id;
end;
$$;
