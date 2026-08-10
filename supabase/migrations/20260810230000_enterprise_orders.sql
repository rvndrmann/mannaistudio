-- Enterprise engagements: a client hires the AI Director Hub team to produce a
-- video at a per-minute rate, instead of generating it themselves with credits.
--
-- Orders are requests, not charges. At $200 a minute a short film is a
-- five-figure engagement, so an order opens a quote the team confirms out of
-- band; no payment is taken automatically.

insert into public.site_settings (key, value)
values ('enterprise_rate', '{"usdPerMinute":200,"currency":"USD","enabled":true}'::jsonb)
on conflict (key) do nothing;

alter table public.creator_projects
  add column if not exists enterprise_status text
  check (enterprise_status in ('requested', 'active', 'delivered'));

create table if not exists public.enterprise_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.creator_projects(id) on delete set null,
  minutes numeric(6, 2) not null check (minutes > 0 and minutes <= 600),
  -- Rate is captured per order so a later price change never rewrites history.
  rate_usd_per_minute integer not null check (rate_usd_per_minute > 0),
  total_usd numeric(12, 2) not null check (total_usd >= 0),
  status text not null default 'requested'
    check (status in ('requested', 'quoted', 'in_production', 'delivered', 'cancelled')),
  brief text not null default '',
  contact_name text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists enterprise_orders_user_idx on public.enterprise_orders (user_id, created_at desc);
create index if not exists enterprise_orders_status_idx on public.enterprise_orders (status);

alter table public.enterprise_orders enable row level security;

drop policy if exists "enterprise orders own read" on public.enterprise_orders;
create policy "enterprise orders own read" on public.enterprise_orders for select
  to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.admin_users where id = auth.uid()));

-- Writes go through the functions below so the rate and total cannot be forged.

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

  insert into public.enterprise_orders (
    user_id, project_id, minutes, rate_usd_per_minute, total_usd,
    brief, contact_name, contact_email, contact_phone
  )
  values (
    auth.uid(), p_project_id, p_minutes, rate, round(p_minutes * rate, 2),
    coalesce(p_brief, ''), coalesce(p_contact_name, ''), coalesce(p_contact_email, ''), coalesce(p_contact_phone, '')
  )
  returning * into order_row;

  return order_row;
end;
$$;

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

  -- Keep the project badge in step with the engagement.
  if order_row.project_id is not null then
    update public.creator_projects
    set enterprise_status = case
      when p_status in ('quoted', 'in_production') then 'active'
      when p_status = 'delivered' then 'delivered'
      when p_status = 'cancelled' then null
      else 'requested'
    end
    where id = order_row.project_id;
  end if;

  return order_row;
end;
$$;

grant execute on function public.create_enterprise_order(numeric, text, uuid, text, text, text) to authenticated;
grant execute on function public.admin_update_enterprise_order(uuid, text, text) to authenticated;
