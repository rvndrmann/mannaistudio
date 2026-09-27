-- Include verified receipts across the current products, once per payment.
create or replace function public.admin_revenue_receipts()
returns table(amount numeric, created_at timestamptz)
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.admin_users where id=auth.uid()) then
    raise exception 'Admin access required';
  end if;
  return query
  with receipts as (
    select coalesce(nullif(p.payment_id,''), nullif(p.txnid,''), 'ledger:'||p.id::text) as receipt,
      case when regexp_replace(p.amount,'[₹,[:space:]]','','g') ~ '^[0-9]+([.][0-9]+)?$'
        then regexp_replace(p.amount,'[₹,[:space:]]','','g')::numeric else 0 end as value,
      p.created_at as paid_at, 0 as priority
    from public.payments p where p.status='success'
    union all
    select m.payment_id, m.price_inr::numeric, coalesce(m.paid_at,m.created_at), 1
    from public.managed_projects m where m.payment_status='paid' and m.payment_id<>''
    union all
    select d.payment_id, d.amount, d.created_at, 1 from public.digital_product_purchases d
    union all
    select a.payment_id, a.amount, a.created_at, 1 from public.academy_offer_purchases a
    union all
    select s.payment_id, s.price_inr::numeric, s.created_at, 1
    from public.originals_season_passes s where s.payment_id is not null and s.payment_id<>''
  ), unique_receipts as (
    select distinct on(receipt) receipt,value,paid_at from receipts
    where value>0 order by receipt,priority,paid_at
  ) select u.value,u.paid_at from unique_receipts u order by u.paid_at desc;
end; $$;
revoke all on function public.admin_revenue_receipts() from public,anon;
grant execute on function public.admin_revenue_receipts() to authenticated;
notify pgrst,'reload schema';
