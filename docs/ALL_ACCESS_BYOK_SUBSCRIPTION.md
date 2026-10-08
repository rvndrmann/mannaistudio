# All Courses + Creator Studio BYOK subscription

A dedicated monthly Razorpay offer grants `academy_all_courses` and
`creator_studio_access` through the confirmed paid period. It includes zero
Studio credits and never activates the legacy credit-bearing membership.
The purchase card and cancellation controls appear on `/billing`.

## Configuration and rollout

1. Apply `supabase/migrations/20261007120000_all_access_byok_subscription.sql`
   to the linked Supabase project before deploying the new application or Edge
   Functions. Review any other pending migrations first; do not blindly push
   unrelated local changes. This migration also makes the `videos` bucket
   private and protects lesson rows and paid enrollments.
2. Create a separate Razorpay **monthly, interval 1, INR** plan at the desired
   price. Set `RAZORPAY_ALL_ACCESS_PLAN_ID` on the deployment. The actual plan
   amount is the source of truth for display, checkout, and payment validation.
   No price or existing plan ID is assumed.
3. Existing `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
   `RAZORPAY_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, and Supabase public
   URL/anon-key configuration are required.
4. Configure the existing `/api/razorpay/webhook` endpoint for
   `subscription.charged`, `subscription.activated`, `subscription.authenticated`,
   `subscription.pending`, `subscription.halted`, `subscription.cancelled`,
   `subscription.completed`, and `subscription.updated` events supported by the
   gateway. Only a captured `subscription.charged` payment grants access.
5. Configure the existing encrypted BYOK vault and Cloud KMS on both the web
   deployment and Supabase Edge Function runtime. See `src/lib/byok/kms.ts` for
   configuration. Keep the admin BYOK feature enabled. Checkout refuses payment
   while BYOK is paused or KMS configuration is missing.
6. Run `npm run edge:build` and deploy `director-chat` and `render-image` together
   with the web application. Deploying only the UI would leave older execution
   code on another host.
7. Test a real/test-mode subscription authorization, first captured charge,
   renewal, provider generation, cancellation, and expiry before selling the
   offer. Local tests do not verify Razorpay account settings or live KMS access.

## Subscriber behavior

- All published, unpaused courses, including future releases, are accessible
  while paid. Individual course purchases and legacy membership access continue
  independently. Course progress and Studio projects are retained on expiry.
- Keys are stored in the existing encrypted vault, not browser storage.
  Supported providers are OpenAI, Gemini, fal.ai and BytePlus. Director voice
  and visual analysis use the customer's OpenAI key; brand chat uses the key
  for its chosen supported model. BytePlus asset verification uses that user's
  BytePlus credential too.
- Missing/invalid/deleted keys, an unavailable vault, or empty provider balance
  block work. Features/models without a BYOK adapter (including Higgsfield,
  Claude and DeepSeek) cannot use platform credentials on this offer.
- Mandatory BYOK is derived from service-owned subscription records. Turning
  off the preference is rejected. Accounts that have paid for this offer retain
  the restriction after expiry, so old jobs cannot switch to platform billing.
  A pending checkout alone does not change an existing account's billing policy.
- Cancellation stops renewal; access persists through the already paid period.
  Renewal failures do not grant extra time. Duplicate/out-of-order charges are
  serialized and cannot shorten paid access or duplicate credits.
- Only one unresolved subscription mandate can exist per account. A pending
  checkout may be resumed or cancelled from the card. A `creating` reservation
  left by a process/database failure requires support reconciliation: inspect
  the gateway's mandate before removing it, to avoid duplicate recurring charges.

## Media protection

Course lessons are served through `/api/courses/[id]/lessons`. Users without
access see lesson titles/durations only. Authorized users receive temporary
15-minute signed URLs for Supabase videos; already issued URLs remain usable
until their expiry. Existing canonical public video URLs stored on lessons are
translated to signed URLs without rewriting lesson records.

The `videos` bucket is now private. If unrelated pages or externally shared
links use that bucket, migrate those public assets to a separate public bucket
or update those consumers to authorized signing before rollout. Externally
hosted embeds (YouTube, Drive, etc.) retain the host's sharing rules; move paid
lesson videos into Supabase storage if their original links must be protected.

## Validation

- TypeScript type checking and web production build.
- BYOK billing, credential scope isolation, subscription enforcement, UI cost
  decisions, provider eligibility and payment-reconciliation tests.
- PGlite execution of the actual migration: first payment, replay, renewal,
  cancellation, expiry, preserved purchases, private media and no credit spend.
- Edge Function bundle builds verify shared execution code remains deployable.

## Current unified offer

AI Director Hub Pro: Razorpay `plan_T5OgebbEgwBn1M`, INR 799 monthly.
The plan is the default and `.env.local` selects it explicitly. Old membership,
Studio subscription, and single-course checkouts are paused; existing paid access
and cancellation remain supported. The unified offer includes no platform credits.
