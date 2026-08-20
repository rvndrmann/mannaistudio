# Session Handoff - 2026-08-20

## Completed This Session

### Bring Your Own Keys

A whole subsystem, documented separately in
[`BYOK_PROVIDER_KEYS.md`](BYOK_PROVIDER_KEYS.md). Vault, envelope encryption
under Cloud KMS, four providers (BytePlus, fal.ai, OpenAI, Gemini), connect /
test / replace / disconnect, an "only my own keys" mode, chat metering, and the
header controls that make which account is paying visible while you work.

Proven working in the live app: an OpenAI key served a generation at zero
credits while an unconnected provider correctly charged 29, both visible in the
ledger with matching `billing_mode`.

### Bugs found and fixed on the way

- **Shared and admin projects showed no media.** Files land at
  `{owner_id}/{project_id}/…` and the only storage policy matched the first
  folder against `auth.uid()`. An admin opening a user's project, or a teammate
  on a shared one, got every row and no pixels. Reads are now granted by project
  access; writes stay owner-only.
- **A partial prompt match dropped the rest of a shot's cast.** Shot 1 listed
  Sara, the road and the car; the car — written as "a dark sleek modern car"
  rather than by name — was left out of the references entirely. The shot's cast
  is now the floor rather than a fallback.
- **Shots that never named a location had none.** The inheritance ran once
  inside `create_storyboard_batch`, but entities are created from the finished
  prompt sheet, so the shots already exist and there is nothing to inherit. It
  now runs when a location is created and on every workspace read. A curated
  cast no longer exempts a shot: that branch is only reached for a shot with no
  location at all, so it was not protecting a hand-picked cast, it was letting a
  shot be set nowhere.
- **The failed-job refund could mint credits.** `credits_used ||
  estimated_credits` refunds the estimate for a job that charged nothing. Three
  separate sites had their own copy.
- **Generation was unreachable through chat.** Rule 4 of the Director
  instructions told the model not to trigger costly generation without approval,
  but calling `submit_generation` *is* how the approval card is created — so it
  described proposals it never made, on both models. See below.
- **A stuck "Generating…" cell.** Polling only started when a job row was
  already known to be in flight, so it depended on a refetch catching the job
  mid-run.
- **Saving a key crashed the page.** The route had no top-level catch, so a
  KMS failure became a bodyless 500 and the panel called `response.json()` on
  it.

### Earlier work in the same session

- Removed the script approval gate, which had no action that could clear it.
- `accept_existing_art`, so art the user is happy with can be kept without
  paying to regenerate it.
- One write path for shots and one for entities, so the storyboard editor is
  held to the same guards as the Director's tools.
- Addressable generation candidates — `inspect_generation_jobs` filters by shot,
  takes storyboard numbers, and numbers each shot's results oldest first.

## Migrations Applied

- `20260819160000_shared_project_media_access.sql`
- `20260819180000_byok_credential_vault.sql`
- `20260819200000_byok_vault_access.sql`

All three are pushed to the linked Supabase project.

## Current Runtime Notes

- 737 tests pass; `npx tsc --noEmit` is clean over `src/`.
- `.env.local` needs the five `GOOGLE_KMS_*` variables. The service account JSON
  **must be on one line** — a pretty-printed paste breaks dotenv silently.
- Netlify already holds all five; its multi-line value is fine because Netlify
  stores values whole.
- `GOOGLE_KMS_SERVICE_ACCOUNT_JSON` is scoped to Builds, Functions and Runtime
  in Netlify. It is never needed at build time and could be narrowed.
- Next 16 warns that the `middleware` file convention is deprecated in favour of
  `proxy`. Pre-existing, unrelated to this work.

## Next Verification

1. With "only my own keys" on, generate with nano-banana and with fal. Both
   should be **refused** naming the missing key, not charged. This is the case
   that was silently taking credits before today.
2. Connect a BytePlus key with all three parts and generate a character shot,
   which exercises the Asset Library path. Confirm `billing_mode = byok` and no
   credit transaction.
3. Generate a video on a connected provider — the video path has not been run
   on a customer key at all.
4. Switch the header toggle to "Studio credits" and send a Director turn on a
   provider you have not connected. A `AI Director chat turn` transaction should
   appear. Chat metering has never been observed deducting.
5. Fail a generation on a customer key and confirm nothing is refunded.

## Known Gaps

- No one-click "generate this one with studio credits" when a customer's
  provider runs out. The failure explains the option in words only.
- Read-only chat turns cost the same as tool-calling ones. Free questions are
  what make the Director pleasant to use; worth revisiting once there is a week
  of usage data.
- Gemini 3.6 Flash pricing is introductory and **doubles on 1 January 2027**.
  `CHAT_TOKEN_RATES` has to be changed on the day.
- Google AI Studio video/image models map to the Gemini credential, but no
  other providers can take a customer key. Under only-my-own-keys they are
  unusable rather than merely billed.
