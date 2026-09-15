-- The volume plans the new homepage sells: Test Pack, Growth, Scale.
--
-- They go in the catalogue rather than into the page, for the reason the
-- catalogue exists at all: a price in a React component is a deploy, and a
-- price the browser sends is a price the buyer chooses. Checkout reads these
-- rows, the admin panel edits them, and the homepage renders whatever they say.
--
-- SEEDED UNPUBLISHED, ON PURPOSE. The prices below are extrapolated from the
-- operator's own UGC ladder (3 videos at ₹19,999, 6 at ₹34,999 — roughly
-- ₹6,600 and ₹5,800 an ad) so the rows are not empty, but nobody has agreed
-- them. A draft package is visible only to an admin and cannot be sold, so the
-- three plans sit in Admin → Managed Production → Offers waiting for real
-- numbers. Publish them there and they appear on the homepage; until then a
-- stranger sees no price rather than a wrong one.
--
-- The monthly plans are sold as one-off purchases, because recurring billing
-- does not exist yet — see the last section of docs/MANAGED_PRODUCTION.md.
-- "12 ads a month" is a volume, and today it is charged a month at a time.

insert into public.managed_offer_services
  (key, name, tagline, description, cta, deliverables, styles, quote_only, is_published, position)
values
  ('performance_ads', 'Performance Ad Creative',
   'A continuous supply of ads made to be tested',
   'Research, concepts, scripts, production and editing — delivered as finished ads for Meta, TikTok and Reels. Pick the volume your media buyer needs; we keep the creative coming.',
   'Start My First Ad',
   array['Finished video ads, platform-ready','Concepts, hooks and scripts included','Editing and sound included','Revisions included','Delivered in your dashboard'],
   array['UGC / creator-style','Product ad','Direct response','Cinematic','Hook variations','Mixed — you choose per batch'],
   false, false, 0)
on conflict (key) do nothing;

insert into public.managed_offer_packages
  (service_id, key, name, summary, video_count, duration_seconds, revisions, price_inr, includes, popular, is_published, position)
select s.id, v.key, v.name, v.summary, v.video_count, v.duration_seconds, v.revisions, v.price_inr,
       v.includes, v.popular, false, v.position
from (values
  ('performance_ads', 'ads_test_pack', 'Test Pack', '3 video ads',
    3, 30, 2, 19999,
    array[
      '3 finished video ads',
      'Concepts and scripts included',
      'Editing included',
      '2 revisions per ad',
      'Meta / TikTok / Reels ready',
      'Delivered in your dashboard'
    ], false, 1),
  ('performance_ads', 'ads_growth', 'Growth', '12 video ads a month',
    12, 30, 2, 59999,
    array[
      '12 finished ads monthly',
      'New concepts and angles each batch',
      'Hook variations',
      'UGC and product ads',
      'Editing included',
      '2 revisions per ad',
      'Weekly creative batches',
      'Delivered in your dashboard'
    ], true, 2),
  ('performance_ads', 'ads_scale', 'Scale', '30 video ads a month',
    30, 30, 2, 129999,
    array[
      '30 finished ads monthly',
      'High-volume creative testing',
      'Multiple concepts and hooks',
      'Product, UGC and direct response',
      'Priority production',
      'Revisions included',
      'Delivered in your dashboard'
    ], false, 3)
) as v(service_key, key, name, summary, video_count, duration_seconds, revisions, price_inr, includes, popular, position)
join public.managed_offer_services s on s.key = v.service_key
on conflict (key) do nothing;
