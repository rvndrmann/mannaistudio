# Session Handoff — 2026-09-12

Work spanned the evening of the 11th into the 12th. Two things were built — a
removable keyframe reference, and an MCP bridge — and everything after that was
one long consequence of opening the studio to a client that is not a browser,
followed by a chain of failures in the BytePlus video path that the bridge made
visible.

## The keyframe was not a reference, it was a fixture

A shot's own keyframe was attached to every video render whether or not it was
in the Multi Image strip. The server did it, before the user's strip was read:

```ts
if (provider === "byteplus" && shotBytePlusAssetId) {
  ...combinedReferencePaths.push(shotBytePlusAssetId)   // always
} else if (shot.keyframe_image && !input.startFrame) {
  combinedReferencePaths.push(shot.keyframe_image)
}
```

The behaviour was inconsistent in a way that made it hard to see: with a
registered BytePlus asset the keyframe was forced in; without one it was
*silently dropped*, because the client always sent a `startFrame` (initialised
from the keyframe and never cleared when switching tabs) and the `else if`
branch then declined. Neither is what the Multi Image tab implies.

It is now a tile like any other — seeded into the strip, labelled, deletable —
and the removal persists on `creator_shots.metadata.keyframe_reference_removed`
so it survives a reopen. The server only attaches the keyframe outside
`multi_image` mode. A kept keyframe still goes to the provider as its registered
asset, because the asset id is what clears the real-person check.

## The MCP bridge

`mcp/server.mjs` — a dependency-free stdio MCP server, registered in `.mcp.json`
and at user scope so it loads from any directory on the machine. No SDK: stdio
MCP is newline-delimited JSON-RPC, and a dependency would have been installed
into the Next app and shipped to the Netlify build for the sake of a message
loop.

Most of the auth already existed — scoped `aih_` tokens in
`creator_external_access_tokens`, and `requireProjectFromRequest`. Four routes
were still cookie-only, so an external client could run the Director's tools but
could neither send it a picture nor approve what it proposed: director uploads,
proposal decisions, and the project GET now accept a token, and a new
`…/media?path=` signs one stored file after checking it sits under the caller's
own prefix.

Nine tools: `studio_list_projects`, `studio_storyboard`, `studio_chat`,
`studio_run_director_tool` (all 35 Director tools, names read live from the
registry so they cannot drift), `studio_list_director_tools`,
`studio_upload_media`, `studio_decide_proposal`, `studio_pending_work`,
`studio_view_media`. Setup is in `mcp/README.md`.

**The token lives in `.env.local`, never `.mcp.json`** — the latter is tracked.
A token opens only projects its minter *owns*, never one merely shared with
them: a key in a config file is weaker than a browser session.

`scripts/mint-studio-token.mjs <email>` mints one. The account signs in with
Google and so has no password to hand a script, so the script uses the service
key from `.env.local` to write the same row the in-app route would.

## Serving a token holder with the service client was the wrong shape

This is the most important thing in the session to carry forward.

The service client has no `auth.uid()`. Fourteen SECURITY DEFINER functions on
the external path read a missing identity as **refuse** — approvals, credit
reservation (single and batch), resolution, refunds, job claiming, XP, prompt
sheets, `deduct_user_credits`, `get_user_credits`. The rate limiter bit first,
and it did not degrade: `creator_consume_rate_limit` returns `false` when
`auth.uid()` is null, and the caller reads `false` as "over limit", so it was a
hard 429 on the *first* call against an empty bucket.

Teaching each function to accept a user id would have been fourteen edits, and
every one of them is a place where passing the wrong id spends someone else's
money. So the identity is made real instead: `sessionClientFor` mints a session
for the user the token belongs to (admin `generateLink` → `verifyOtp`) and every
query runs under it. `auth.uid()` resolves, RLS applies exactly as in that user's
browser, and none of the fourteen changed. It is also strictly narrower than
before — a token no longer reaches anything its owner could not. Sessions are
cached until shortly before they expire: one auth round trip per user per hour.

`creator_consume_rate_limit` still gained a `p_user_id` parameter
(`20260911160000_rate_limit_external_tokens.sql`, applied) because it is correct
independently, and because it lost an implicit `EXECUTE` grant to `PUBLIC` that
the original's grant to `authenticated` had never actually narrowed. **A
signed-in caller may not name a user** — `auth.uid()` wins wherever it is
present — so nobody can burn someone else's quota by claiming to be them.

## Images through fal

`GPT Image 2.5 Sunburst Edit` is registered as `fal-gpt-image-2-5-sunburst-edit`.
The fal image client had been written for Flux only — one `image_url` and a
hardcoded `square_hd`. Sunburst Edit takes `image_urls` (up to 16) and infers its
canvas from them, which is what keeps an edit the same shape as its source;
pointing the old code at the new endpoint would have reframed every edit to 1:1
and sent only the first reference.

Quality and aspect ratio were being **dropped entirely** on the fal path at all
three call sites. Fixing that also fixed the existing Flux models, which had been
rendering at defaults regardless of project settings.

Then the real one: a Sunburst edit produced the picture on fal and the studio
reported *"did not finish. Nothing was produced and the credits have been
returned."* The render was held on the request; the host stops a request at
thirty seconds; fal finished and billed anyway; the job kept no handle. The
route's own comment had already said this would happen. fal image renders now go
through fal's **queue**, and the request id is written to the job before any
waiting, so a killed request leaves something the poll can finish. Both poll
routes recover a fal handle, reading the endpoint recorded beside it.

## What the BytePlus asset library actually enforces

Four separate failures in one evening turned out to be four different rules. The
account answers all of them through an undocumented call worth knowing:

```
GetAssetQuota → { tier: "entry", write_qpm: 3, max_assets: 50,
                  used_assets: N, max_asset_groups: 50, ... }
```

**`write_qpm: 3` — three asset registrations per minute.** This was every
"CreateAsset rate limit exceeded". It is a per-minute window, not a burst, so a
shot with four unregistered faces trips it on the fourth call and no backoff
that fits inside a thirty-second request can wait it out. A retry built on rising
delays only spent the budget the submission itself needed. One short retry now
covers a genuine blip; past that the caller is told the rule.

**One group, not twenty-two.** `cachedAssetGroupId` was process memory, and on a
serverless host the process rarely survives to the next request, so nearly every
cold start created another group of the same name. The account reached 22. The
studio now asks the account what exists (`ListAssetGroups`, which requires
`Filter.GroupType`) before creating anything, taking the oldest match and
requesting a full page so "oldest" does not depend on which page came back.
`ARK_ASSET_GROUP_ID` still overrides everything and is worth setting in Netlify.

**Deleting groups in the ModelArk console destroys every registration.** This
was done mid-session to free space, and it invalidated every `asset-…` id the
studio held: `GetAsset` returns *"not found"* for all of them. Entities keep the
dead ids until a render discovers them, costing one failed render each. Eight
were cleared by hand and the shot's cast re-registered. **If space runs short,
work out which assets are genuinely unreferenced first** — the ids are recorded
on `creator_entities.metadata.byteplus_asset_id`, on
`creator_shots.metadata.byteplus_reference_assets`, and in
`creator_byteplus_assets`.

**A registration is found only where the render looks for it.** A reference added
through the Multi Image strip resolved against the *shot's* asset map; a
character's registration lives on the *entity*. So a face verified minutes
earlier still went to the provider as a raw URL, was rejected as a real person,
and was then registered again — spending one of fifty slots on a duplicate.
Every picture in the project that already has a registration is now matched by
the path it was registered from, whichever way it reaches the render.

Separately, the verification panel re-asked for faces that were already
verified: state lived in `verifiedReferencePaths`, a set that starts empty on
every mount. It now unions the stored registrations with the session's.

## Work that outlives the request

The pattern behind most of the evening. A serverless host freezes the function
once its response is sent, so anything not finished by then is killed.

`executeGenerationJobsInBackground` fires the work as `void (async () => …)()`.
A proposal approval therefore creates the jobs and returns, and whether the work
happens is a race — the same action ran twice and then did not. A job left behind
sits in `approved` with no provider id until the stall check refunds it six
minutes later, with the message *"approved but never reached the provider — the
server handling it went away."*

The poll now **runs** such a job rather than only writing it off, claimed with a
conditional update so two polls cannot both submit it. The executor was split
into `executeGenerationJobs` (awaitable, for the poll) and the background form
(for the chat turn that cannot wait).

That fix then failed in its own way, observed live: claimed at 19:03:35, killed
between marking the row and reaching the provider, and because the recovery
looked only at `approved` it never came back for its own abandoned claim. A claim
quiet for longer than any real submission takes is now claimable again,
conditioned on the exact `started_at` that was read.

## Follow-up: submission recovery skipped its own jobs

The screenshot's error led to two reproducible code defects. The video poll
changed an approved job to `processing` before invoking `executeGenerationJobs`,
but that executor immediately returned unless the row was still `approved`.
Reclaiming the row repeated the same skip. Separately, the executor's initial
update used `status: generating` and `requested_at`, neither of which is defined
for generation jobs in the checked-in database migrations. Its result was ignored.

The executor now owns the conditional claim, using `processing` and `started_at`
and checking the database error. Both background execution and polling use it.
The update matches status, the previous start timestamp (including null), and a
null provider handle, so concurrent or stale polls cannot overwrite a renewed
claim or a saved provider task. Recovery includes old `generating` rows for
compatibility. A live submission gets the existing six-minute submission grace
period; a newly approved, unclaimed job can start immediately. Terminal failures,
including already-refunded attempts, are never restarted automatically.

Regression tests exercise the actual executor through mocked BytePlus submission,
including abandoned statuses, concurrency, existing provider handles, and active
claims. This establishes the recovery defect locally; it does not establish why
any earlier hosting request originally stopped. No paid render was triggered.

Deployment requires the Next.js app update and rebuilding/redeploying
`director-chat`, since its bundle also contains the executor. The local bundle
was rebuilt. Production deployment and a live Scene 3 render remain unverified.

## Not resolved

**Scene 3 of episode `1e700512` has still never rendered.** Six attempts, every
one refunded, nothing produced. The blockers ahead of it are cleared — all five
references are registered and Active, verified directly against BytePlus — but
the last two attempts died mid-submit with no error recorded and no provider id,
and **the cause of that is unknown.** No CreateAsset error was logged and the
references were already registered, so the usual suspects do not fit. The next
step is the Netlify function logs for that request; guessing further without them
is not worth it.

**The Director's background worker still holds the connection** for fal images.
It runs on the Edge Function with a 150s budget so it has room, but it is the
same pattern and will bite if a render ever exceeds that.

**The quick-generate route has no handle recovery for non-fal providers.** fal
was given one; OpenAI's path there still ages out.

**`creator_credit_accounts` is an unused table that reads null for everyone.**
The real balance is `profiles.credits_balance`. Anything reading the former
reports "no credits" for an account holding tens of thousands — the project GET
still returns it as `creditAccount`.

**The remote connector was considered and deferred.** A claude.ai custom
connector needs a remote HTTPS MCP server; done safely that is OAuth 2.1, and
the shortcut puts a token in a URL. The tools and `aih_` auth carry over
unchanged if it is ever wanted — only the transport changes.

## Files

| File | What changed |
| :--- | :--- |
| `mcp/server.mjs`, `mcp/tools.mjs`, `mcp/studio-client.mjs`, `mcp/director-tools.mjs` | The bridge |
| `mcp/README.md` | Setup, tools, the security model |
| `scripts/mint-studio-token.mjs` | Mints an `aih_` token for an account |
| `src/lib/studio/external-auth.ts` | `sessionClientFor` — a token holder acts as themselves |
| `src/lib/studio/rate-limit.ts` | Takes an explicit `userId` |
| `supabase/migrations/20260911160000_rate_limit_external_tokens.sql` | `p_user_id`, and the grants narrowed |
| `src/lib/studio/byteplus.ts` | Group reuse, `findBytePlusAssetGroupId`, the CreateAsset retry |
| `src/lib/studio/fal.ts` | Sunburst Edit, queued image submit/poll, shared payload builder |
| `src/lib/studio/execute-generation.ts` | Split into awaitable and background forms |
| `src/app/api/studio/projects/[projectId]/videos/route.ts` | Keyframe in multi-image mode, abandoned-job recovery and re-claim, entity registrations for strip references |
| `src/app/api/studio/projects/[projectId]/images/route.ts` | fal handle recovery |
| `src/app/api/studio/projects/[projectId]/media/route.ts` | Signs one stored file for an external caller |
| `src/app/api/studio/projects/[projectId]/route.ts` | Project GET accepts a token |
| `src/app/studio/project/[projectId]/page.tsx` | Removable keyframe tile, verification state from stored registrations |
