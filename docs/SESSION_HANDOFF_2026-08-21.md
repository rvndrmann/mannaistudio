# Session Handoff - 2026-08-21

A security session. It started as a question — could someone hack the credit
system, steal the platform's provider keys or a customer's, reach the admin
pages, or read and delete other people's projects — and turned into three
broken-access-control fixes, a subscription-lifecycle audit, and a read-only
sweep of the live ledger for signs the holes had already been used.

## Completed This Session

### The credit ledger was open to anyone holding the anon key

`add_user_credits`, `add_bids`, `record_payment`, membership activation and ten
others are `SECURITY DEFINER` and take the account to credit as a parameter, but
none checked who was calling. PostgREST publishes the `public` schema and
Postgres grants `EXECUTE` to `PUBLIC` by default, so every one of them was
reachable over REST by anyone holding the anon key — which ships in the browser
bundle, so by anyone at all, logged in or not. Several went further and named
`anon` in an explicit grant.

Confirmed live before the fix: `get_user_credits` answered `200` to an
unauthenticated REST call. `add_user_credits` would have minted credits into any
account from the browser console; it was not fired, because it writes.

`20260821120000_lock_down_value_granting_rpcs.sql` revokes `PUBLIC` and `anon`
on all thirteen and re-grants by who may legitimately call:

- **Service role only** — money and entitlements: `add_user_credits`,
  `add_bids`, `grant_member_bids`, `grant_subscription_credits`,
  `activate_membership_by_profile`, `record_payment`, and the new
  `grant_purchased_credits`. A browser has no business calling these; they run
  from webhook and payment-verification routes that hold the service key.
- **Self or service** — the signed-in user acting on their own account:
  `get_user_credits`, `deduct_user_credits`, `refund_generation_credits`,
  `grant_signup_credits`, `grant_starter_bids`, `grant_free_trial`,
  `set_razorpay_subscription`. Each now checks `auth.uid()` against the account
  in its body, the backstop for the day someone adds a convenience grant without
  reading the migration.

`search_path` is pinned on the three that lacked it, and `deduct_user_credits`
now rejects a negative amount — a negative charge ran the subtraction backwards
and minted credits.

### Payment verification trusted the client for the amount

The Razorpay signature is an HMAC over `order_id|payment_id` and nothing else,
so it proves a payment happened but says nothing about how much. The verify
route took the credit amount from the request body, so a genuine ₹1,000 payment
could be re-submitted for any amount, with its own valid signature, any number
of times — there was no idempotency either.

`credits/verify` now reads what was bought from the Razorpay order and what was
paid from the Razorpay payment, refuses an order whose `notes.profile_id` is not
the caller, compares the signature in constant time, and grants through
`grant_purchased_credits`, which is idempotent on the payment id. The three
callers (`studio/credits`, `billing`, `CreditBadge`) no longer send an amount;
the server does not trust one. The webhook and subscription-cancel routes moved
to the service client, since they arrive with no session and now need the
service grant to write.

### Any signed-in user could read or delete any project

`/api/studio/projects/[projectId]` fetched, updated, and deleted with the
service-role client — which bypasses RLS — filtered only by `id`, with no owner
check. A comment claimed RLS was doing the work, but the service role is exactly
what turns RLS off. So any logged-in user could `GET`, `PATCH`, or `DELETE` any
project by its UUID: read a stranger's whole project, or wipe it and its shots,
episodes, and generation jobs. Worse than the credit hole, because it destroys
data.

The route now enforces the project's own access model through the helpers the
RLS policies already use, before it touches the service client: read =
`can_access_creator_project` (owner or member), edit =
`can_edit_creator_project` (owner or non-viewer), delete = `owns_creator_project`
(owner alone). A stranger naming a real UUID gets `Project not found`, which
also refuses to confirm the id exists. The list route was already safe — it
queries with the RLS-bound client.

### Subscription lifecycle — audited, and one display fix

Buy, cancel, and failed-renewal were checked against the code and the live
database, and the lifecycle is enforced correctly. A successful
`subscription.charged` activates membership (`+1 month`, stacked on renewal),
grants that tier's monthly credits idempotently on the payment id, and the
one-time member bids. Cancel unlinks the subscription and lets access run to
`membership_expires_at`; a halted renewal simply is not extended. Enforcement is
read-time: `isMembershipActive` checks the expiry date, so access ends on
schedule even though nothing flips `membership_status`. Every real gate —
courses, credits, portfolio, the admin view — uses that date-aware check.

The one defect was cosmetic. `/api/billing/transactions` reported `active: true`
whenever `membership_status` was `"active"`, without the date, so a lapsed or
cancelled member saw an "active" plan panel with a billing date already in the
past. It now keys off `isMembershipActive`; an expired member sees the renew
flow, and a member inside a cancelled period stays active until it actually
ends.

### What the audit confirmed is already safe

- **BYOK vault.** Own `byok` schema outside PostgREST's search path, `revoke all
  … from anon, authenticated`, RLS on with deliberately no policy, DEK wrapped by
  Cloud KMS. A full database dump decrypts to nothing. Customer and platform
  keys alike.
- **Platform provider keys** (`OPENAI_API_KEY`, `ARK_*`, `FAL_KEY`,
  `GOOGLE_*`) are server-only; nothing is exposed as `NEXT_PUBLIC_`.
- **Admin.** `admin_users` has RLS on, a single self-scoped SELECT policy, and
  no write policy — nobody can insert themselves. All 22 `admin_*` RPCs carry an
  internal `admin_users` check, so bypassing the client-side gate hits a 403 at
  the database.
- **`.env.local`** is gitignored and no env file was ever committed.

### Live ledger — no sign of abuse

319 credit transactions, 30 profiles. 27 sit at the default 100
credits, untouched. The only three `purchase` rows are the owner's own labelled test
purchases (1,000 each); no anomalous balance, no large mint, nothing to claw
back. Two things worth an operator's eye, neither a code bug:

- Three accounts (`kaa83427`, `pablaagrofarm`, `aidirectorhubtest`) have a
  linked `razorpay_subscription_id` but `status = free` and **no payment row** —
  a subscription created at checkout that never completed a charge. No money,
  no access, which is correct. If any of them claims to have paid, check the
  Razorpay dashboard, because the DB shows nothing received.
- Two paid accounts (the owner and `onedaydelivery37`) are `status = active`
  with an expiry in the past. The date-aware gates deny them correctly;
  `membership_status` is simply never flipped. `onedaydelivery37` is a clean
  real-world proof of cancel → access-to-period-end → denied.

## Migrations Applied

- `20260821120000_lock_down_value_granting_rpcs.sql`

Pushed to the linked Supabase project. The lockdown is therefore **live now**,
independent of any deploy — it is a database change.

## Current Runtime Notes

- The anon attack battery — all thirteen value-granting RPCs, called
  unauthenticated with only the public anon key, over `curl` and again as real
  browser `fetch` from a foreign origin — now returns `401 permission denied for
  function` on every one. Before the migration, `get_user_credits` was `200`.
- `npx tsc --noEmit` is clean. `src/lib/byok/billing.test.ts` passes 19/19. The
  full suite was not run this session.
- A crawl of all 35 static pages plus the changed API routes showed no `5xx`:
  public pages `200`, gated pages `307` to login, changed APIs returning proper
  `401/400/404`. The homepage renders with no console errors.
- The **payment-verification and project-IDOR fixes are route code** and go live
  only when Netlify finishes building the push. Until then, production runs the
  old versions of those two routes. The RPC lockdown, being a DB change, already
  protects production.

## Commits

- `7ab2349` Close credit-ledger and project-access holes (RPC lockdown migration,
  verify rewrite, webhook/cancel service client, project access enforcement,
  three frontend callers).
- `a025dd4` Report subscription status by expiry, not stored flag.

Both pushed to `main`.

## Next Verification

1. After the Netlify deploy, replay a real credit purchase and confirm the
   grant is idempotent — a second submit of the same `payment_id` must add
   nothing and return the existing balance.
2. As a **shared** (non-owner) member, `GET` and `PATCH` a project you have
   access to, and confirm a viewer is refused the `PATCH` — the access levels
   were verified by reasoning and unauth probes, not with a second live session.
3. Confirm `DELETE` of another user's project id returns `Project not found`
   for a non-owner and still works for the owner.
4. Open the billing page as an expired member and confirm it now shows the
   renew flow rather than an "active" panel with a past billing date.

## Known Gaps

- The **older migrations still contain `grant execute … to anon`** lines for the
  locked-down functions (e.g. `20260624110000`, `20260624120000`,
  `20260613140000`). They are overridden by today's migration because it runs
  later, but a developer editing one of those files must not treat its grant as
  current — the authority is `20260821120000`.
- `membership_status` is never set back to a non-active value when the date
  passes; the read-time date check is the single source of truth. A scheduled
  normalizer would make admin queries and any future status-based logic cleaner,
  but is not required for correctness and was not added.
- The three dangling subscription accounts want a look in the Razorpay dashboard
  to confirm no payment was actually taken.
- The two code fixes are only as deployed as Netlify's latest build. Worth
  confirming that build went green.
