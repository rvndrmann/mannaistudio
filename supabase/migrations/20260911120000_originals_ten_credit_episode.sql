-- One episode costs 10 credits.
--
-- The price a viewer is actually charged is `episode_price` on the series row,
-- read inside originals_unlock_episode. DEFAULT_EPISODE_PRICE in the app is
-- only what the paywall prints when a row has no value of its own, so moving
-- the constant without this migration would quote 10 and still take 25 — the
-- worst version of a price change, because it is invisible until a balance is
-- wrong.
--
-- Existing rows are rewritten as well as the default, the same way the 25-credit
-- change did it, so the whole catalogue moves together rather than splitting
-- into series priced before and after today.
alter table public.originals_series alter column episode_price set default 10;
update public.originals_series set episode_price = 10 where episode_price <> 10;
