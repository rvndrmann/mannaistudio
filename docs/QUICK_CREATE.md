# Quick Create

Generating one image or one clip, with no production attached.

## Why it exists

Every path to a model ran through a storyboard shot. To make a single picture
you created a project, then an episode, then a shot, then generated onto it —
and the project stayed in your list for ever afterwards. The studio's whole
model is a production, and that is right for a production; it is the wrong
amount of structure for someone who wants a picture.

`/studio/create` is the way out of it. Three tabs — Image, Video, History —
and nothing else. No project, no episode, no shot, no cast.

## What a standalone generation is

A row in `creator_quick_generations`, a table of its own.

The first draft recorded these as `creator_generation_jobs` rows with a null
`project_id`, on the reasoning that reuse buys the refund linkage, the
billing-mode column and admin visibility for free. It does — but it also
requires widening two RLS policies on that table so they accept a job naming no
project, and those policies exist to guarantee precisely the opposite: that a
job belongs to a project the caller owns. Relaxing a security boundary so an
unrelated feature can share storage is a bad trade, and it leaves every query
that reports on productions depending, for ever, on remembering to filter the
strangers out.

So the table is separate and nothing about productions changes at all. The two
enums are shared deliberately — `image | video` and the job status machine
already say exactly the right thing, and a second copy of either would drift.

The one thing reuse did give away is the refund linkage: `refund_generation_credits`
takes a `p_job_id` that writes `credits_refunded` back onto a storyboard job
row. A quick generation passes null and keeps its own tally instead. Idempotency
never depended on that argument anyway — it comes from the refund key.

That key is worth stating, because it is the difference between a bug and not
one. Credits are taken **before** the row is written, so a failed insert is
exactly the case where a refund keyed off the row would silently never happen.
Every request therefore mints its key up front and reuses it; only the paths
that can be retried against a row that already exists — the stalled-image
reconcile, and polling a failed video task — key off the row id, so asking twice
cannot refund twice.

## What is deliberately absent

The storyboard route composes a great deal into a prompt: the project's visual
style, the extracted look (Style DNA) and its reference images, the camera
package, and a context block for every cast member the prompt mentions. None of
it applies here, and none of it is done.

A standalone prompt reaches the model close to as written — one line is added
naming the aspect ratio, because several providers ignore it as a bare
parameter. Quietly appending a look block would make these pages produce
different pictures from the same prompt than the provider's own site does, which
is the first thing someone reaching for a bare generator will notice.

## Billing is the storyboard's, exactly

The money does not care which page asked. Both routes read `decideBilling()`,
render inside the paying account's credential scope via `runWithCredential`,
record `billing_mode` on the job, and refund through `refundableCredits()` so a
BYOK failure gives back nothing — because nothing was taken. See
[`BYOK_PROVIDER_KEYS.md`](BYOK_PROVIDER_KEYS.md).

They are registered in `charge-paths.test.ts` alongside the other three. A new
surface reaching a model is a new charge path, and adding one is precisely when
the rule gets forgotten — which is why that list is written down rather than
inferred.

The cost shown on the button comes from `resolveGenerationSource()`, the same
helper the workspace uses. Building it exposed a bug in that helper: it compared
the generation catalogue's provider name against the connected-credential list
directly, so a connected **Gemini** key never matched a **Google** model. The
card quoted a credit price the server was then going to bill at zero, and a user
out of credits was blocked from a generation nobody was going to charge them
for — the exact person BYOK exists for. It now matches through
`byokProviderFor()`, like every server path already did.

## The two routes

| | |
| :--- | :--- |
| `POST /api/studio/generate/image` | Renders synchronously and returns the stored path |
| `GET /api/studio/generate/image?jobId=` | Settles a job whose request died mid-render |
| `POST /api/studio/generate/video` | Submits to the provider, returns 202 |
| `GET /api/studio/generate/video?jobId=` | Polls, downloads, stores, completes |
| `GET /api/studio/generate/history` | The standalone slice, keyset-paged |
| `DELETE /api/studio/generate/history?id=` | Removes a row and its file |

Image generation is synchronous, so there is no provider task to poll and
nothing will ever resolve a row whose request was killed by a serverless
timeout. Its GET exists only for that: a job still `processing` past six minutes
has outlived any real generation, and is failed and refunded.

The video GET polls **inside the credential scope of whoever submitted**, which
the storyboard route does not do. A task submitted on a customer's fal key is
not visible from ours — polling it with the platform key reports "not found",
which reads as a clip that never rendered. This is a real difference, and the
storyboard route likely wants the same treatment.

## Where the files go

`{owner}/quick/…` in `creator-studio-media`. The bucket's sharing policy
resolves the second path segment as a project id to decide who else may read the
file; `quick` matches no project row, so the owner-only policy is the only one
that grants it. Nobody is sharing these, and the table's RLS says the same
thing — owner only, not visible to a team or to anyone granted a project.

References upload straight from the browser rather than through an API route: a
start frame is a few megabytes, and routing it through a serverless function
only to hand it back to storage doubles the transfer for no benefit. Storage RLS
is the same check either way — first segment must be the caller. The server
re-checks ownership before charging, because a rejected reference discovered
after the credits are taken is a charge for nothing.

## Batches

The image page's 1–4 selector fires that many independent requests. Each is its
own job, its own charge and its own refund, so one provider failure cannot take
the other three down or leave a partial charge to unpick. The credit check is
made against the whole batch, not one image — otherwise the button offers a
generation that fails partway through with three made and the fourth refused.

## Files

| Path | |
| :--- | :--- |
| `src/app/studio/create/image/page.tsx` | Image generator |
| `src/app/studio/create/video/page.tsx` | Video generator, submit and poll |
| `src/app/studio/create/history/page.tsx` | Everything made here |
| `src/components/studio/create/` | Chrome, reference strip, signed media, hooks |
| `src/lib/studio/quick-generation.ts` | Server helpers: auth without a project, paths, prompt |
| `src/lib/studio/quick-media.ts` | The few facts both sides of the wire need |
| `src/lib/studio/quick-uploads.ts` | Browser-side reference upload |
| `src/app/api/studio/generate/` | The three routes |
| `supabase/migrations/20260820120000_standalone_generations.sql` | The table |

## The migration is not optional

Until `20260820120000_standalone_generations.sql` is applied the table is not
there, and every generation is refused — before any provider is called and
before any credit is taken. That refusal is caught and reported as "Quick Create
is not finished setting up on this server", with the command to run, rather than
as `relation "creator_quick_generations" does not exist`, which reads like a
broken button. PostgREST answers the same cause with its own wording about a
schema cache and shares no error code with Postgres, so both are recognised.

## Still to verify

The table is applied and proven: insert, update, the `updated_at` trigger and
RLS refusing an anonymous read were all exercised against the live database.

Not yet proven is a real generation through these pages. The generation code is
the storyboard route's, but the wiring around it is new. In particular: a BYOK
video end to end, where the poll now runs inside the credential scope, and a
Seedream image, whose Asset Library registration is recorded with no project id
for the first time.
