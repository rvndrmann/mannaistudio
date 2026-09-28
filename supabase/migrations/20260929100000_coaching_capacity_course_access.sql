alter table public.academy_offers
    add column if not exists max_purchases integer;

alter table public.academy_offers
    drop constraint if exists academy_offers_max_purchases_check;
alter table public.academy_offers
    add constraint academy_offers_max_purchases_check
    check (max_purchases is null or max_purchases > 0);

-- Preserve course access for coaching customers who purchased before this
-- entitlement was introduced.
insert into public.user_entitlements(profile_id, entitlement_key, source_type, source_id, expires_at)
select purchases.profile_id, 'academy_all_courses', 'coaching_purchase', purchases.payment_id, null
from public.academy_offer_purchases as purchases
join public.academy_offers as offers on offers.id = purchases.offer_id
where offers.offer_type = 'coaching'
on conflict (profile_id, entitlement_key, source_type, source_id) do nothing;
