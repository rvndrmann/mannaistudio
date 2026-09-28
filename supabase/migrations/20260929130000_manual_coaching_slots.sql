alter table public.academy_offers add column if not exists manual_slots_left integer;
alter table public.academy_offers drop constraint if exists academy_offers_manual_slots_left_check;
alter table public.academy_offers add constraint academy_offers_manual_slots_left_check check (manual_slots_left is null or manual_slots_left >= 0);
