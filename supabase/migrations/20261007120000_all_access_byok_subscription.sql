-- Dedicated recurring Academy + BYOK Studio offer. No membership/credit grants.
create table public.all_access_subscriptions (
  id text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  plan_id text not null,
  status text not null default 'created',
  paid_until timestamptz,
  cancel_at_cycle_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index all_access_subscriptions_profile on public.all_access_subscriptions(profile_id);
-- At most one unresolved mandate per user. Concurrent checkouts cannot duplicate billing.
create unique index all_access_one_live_subscription on public.all_access_subscriptions(profile_id)
where status in ('creating','created','authenticated','active','pending','halted');
alter table public.all_access_subscriptions enable row level security;
create policy "read own all access subscription" on public.all_access_subscriptions
for select to authenticated using (profile_id = auth.uid());
grant select on public.all_access_subscriptions to authenticated;
revoke insert, update, delete on public.all_access_subscriptions from anon, authenticated;

create table public.all_access_subscription_payments (
  payment_id text primary key,
  subscription_id text not null references public.all_access_subscriptions(id),
  amount_paise bigint not null,
  currency text not null,
  paid_until timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.all_access_subscription_payments enable row level security;
revoke all on public.all_access_subscription_payments from anon, authenticated;

-- Serializes renewals; replayed and older charges cannot shorten paid access.
create or replace function public.apply_all_access_subscription_event(
 p_subscription_id text, p_profile_id uuid, p_status text, p_cancel_at_cycle_end boolean,
 p_payment_id text default null, p_paid_until timestamptz default null,
 p_amount_paise bigint default null, p_currency text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v public.all_access_subscriptions; v_payment public.all_access_subscription_payments;
begin
 select * into v from public.all_access_subscriptions where id=p_subscription_id and profile_id=p_profile_id for update;
 if not found then raise exception 'Unknown subscription'; end if;
 if p_payment_id is not null then
   if p_paid_until is null or p_amount_paise is null or p_amount_paise <= 0 or p_currency is distinct from 'INR' then raise exception 'Invalid payment'; end if;
   insert into public.all_access_subscription_payments(payment_id,subscription_id,amount_paise,currency,paid_until)
   values(p_payment_id,p_subscription_id,p_amount_paise,p_currency,p_paid_until) on conflict do nothing;
   select * into v_payment from public.all_access_subscription_payments where payment_id=p_payment_id;
   if v_payment.subscription_id <> p_subscription_id then raise exception 'Payment already belongs to another subscription'; end if;
   v.paid_until := greatest(v.paid_until,v_payment.paid_until);
 end if;
 update public.all_access_subscriptions set status=p_status, cancel_at_cycle_end=p_cancel_at_cycle_end,
 paid_until=v.paid_until, updated_at=now() where id=p_subscription_id;
 if v.paid_until is not null then
   insert into public.user_entitlements(profile_id,entitlement_key,source_type,source_id,starts_at,expires_at)
   select p_profile_id,k,'all_access_subscription',p_subscription_id,v.created_at,v.paid_until
   from unnest(array['academy_all_courses','creator_studio_access']) k
   on conflict(profile_id,entitlement_key,source_type,source_id)
   do update set expires_at=excluded.expires_at;
 end if;
end $$;
revoke all on function public.apply_all_access_subscription_event(text,uuid,text,boolean,text,timestamptz,bigint,text) from public,anon,authenticated;
grant execute on function public.apply_all_access_subscription_event(text,uuid,text,boolean,text,timestamptz,bigint,text) to service_role;

-- Backstop for missed/legacy credit paths, including shared-project requests.
create function public.prevent_byok_subscription_credit_spend() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.credits_balance < old.credits_balance and exists(select 1 from public.all_access_subscriptions where profile_id=new.id and paid_until is not null) then
   raise exception 'This account requires its own provider API keys; Studio credits cannot be spent';
 end if;
 return new;
end $$;
create trigger all_access_no_credit_spend before update of credits_balance on public.profiles
for each row execute function public.prevent_byok_subscription_credit_spend();

-- Enforce course access at the data boundary, matching existing purchases and memberships.
create function public.can_access_course(p_course_id text) returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and (
 exists(select 1 from public.admin_users where id=auth.uid())
 or exists(select 1 from public.courses c where c.id=p_course_id and c.is_published and not coalesce(c.is_paused,false) and (
   coalesce(c.price::text,'') in ('','Free','$0','0','0.00')
   or exists(select 1 from public.enrollments e where e.profile_id=auth.uid() and e.course_id=c.id and e.status='active')
   or exists(select 1 from public.profiles p where p.id=auth.uid() and p.membership_status='active' and (p.membership_expires_at is null or p.membership_expires_at>now()))
   or exists(select 1 from public.user_entitlements e where e.profile_id=auth.uid() and e.entitlement_key='academy_all_courses' and e.starts_at<=now() and (e.expires_at is null or e.expires_at>now()))
  ))
 );
$$;
revoke all on function public.can_access_course(text) from public;
grant execute on function public.can_access_course(text) to authenticated;
drop policy if exists "published course lessons are readable" on public.lessons;
drop policy if exists "lessons are publicly readable" on public.lessons;
create policy "authorized course lessons are readable" on public.lessons
for select to authenticated using(public.can_access_course(course_id));

-- A public bucket bypasses SELECT policies for downloads. Signed URLs are now required.
update storage.buckets set public=false where id='videos';
drop policy if exists "public can read videos" on storage.objects;
create policy "authorized course video reads" on storage.objects for select to authenticated using (
 bucket_id='videos' and (
 exists(select 1 from public.admin_users where id=auth.uid())
 or exists(select 1 from public.lessons l where public.can_access_course(l.course_id)
   and (l.video_url=name or split_part(split_part(l.video_url,'/videos/',2),'?',1)=name))
 )
);

-- Existing own-row policies allowed a browser to enroll itself in paid courses.
-- Purchases are written by the payment service; browsers may enroll only in free courses.
drop policy if exists "users can insert their own enrollments" on public.enrollments;
drop policy if exists "users can update their own enrollments" on public.enrollments;
create policy "users can enroll in free courses" on public.enrollments for insert to authenticated with check (
 profile_id=auth.uid() and status='active' and payment_id='free'
 and exists(select 1 from public.courses c where c.id=course_id and c.is_published and not coalesce(c.is_paused,false) and coalesce(c.price::text,'') in ('','Free','$0','0','0.00'))
);
create policy "users can update free enrollments" on public.enrollments for update to authenticated
using(profile_id=auth.uid() and payment_id='free') with check (
 profile_id=auth.uid() and status='active' and payment_id='free'
 and exists(select 1 from public.courses c where c.id=course_id and c.is_published and not coalesce(c.is_paused,false) and coalesce(c.price::text,'') in ('','Free','$0','0','0.00'))
);
