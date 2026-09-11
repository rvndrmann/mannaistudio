# Image generation on the Edge Function

**Status:** shipped, needs deploying. `render-image` must be deployed before GPT
Image 2.5 Sunburst works at all — see [Deploying](#deploying).

## The failure

Every Sunburst render failed, and what the user was shown was this:

```
Generation Error
Unexpected token '<', "<HTML> <HE"... is not valid JSON
```

Two faults stacked on top of each other.

The visible one is the message. The workspace called `response.json()` on
whatever came back, so when the body was an HTML error page the parser's own
complaint became the reason the picture failed. It named nothing — not what
happened to the render, not what became of the credits.

The one underneath is why there was an HTML page to parse. The app runs on
Netlify, which stops a function at thirty seconds. A GPT Image render takes
fifty to seventy-five. Most image models survive that anyway: they are submitted
to OpenAI as background responses, so the job keeps an id, and a request killed
mid-render costs a wait rather than the picture — the poll finishes it from the
id later.

Sunburst has no id to keep. OpenAI serves it only on `/v1/images/generations`
and `/v1/images/edits`, so the render is held on the connection, and on a
thirty-second host that means it was killed **every time**: the image lost
though OpenAI had rendered and billed it, the credits returned six minutes later
by the stalled-job sweep, and the host's error page shown in the meantime. The
commit that added the model said as much in passing — every other GPT Image
model "keeps the background-response path, which survives a function killed
mid-render."

## Where it runs now

Sunburst renders on a Supabase Edge Function, where the budget is a hundred and
fifty seconds. This is the second thing to move there and the reason is the same
as the first: the Director turn went to `director-chat` because a turn takes
thirty-six to fifty-one seconds and the app's host stops at thirty.

| | Host | Why |
| :--- | :--- | :--- |
| gpt-image-2, gpt-image-1.5, Seedream, Flux, Nano Banana | The app's own host | Fast, or recoverable from a provider id if the request is killed |
| gpt-image-2.5-sunburst | `render-image` Edge Function | Synchronous at OpenAI, so nothing survives a killed request |

The choice is made in one place — `rendersOnEdgeFunction` in
`src/lib/studio/image-render-host.ts` — and read by one function,
`requestProjectImage`, which every call site goes through. There are three of
them (the shot panel, the asset panel, draw-to-edit) and a test fails the build
if a fourth posts to the route directly, because posting straight to it works
for most models and quietly loses the picture on the one that cannot finish
there. That is exactly how this reached production the first time.

## What the two hosts share

All of it. `renderProjectImage` in `src/lib/studio/project-image-render.ts` is
the whole generation — billing decision, credit deduction, prompt composition,
reference signing, the provider call, storage, attaching the result, and the
refund and job-failure compensation when it goes wrong. It was the body of the
route; it is now a function the route and the Edge Function both call, so
neither can drift into billing, refunding, or attaching an image differently
from the other. The charge-path guard test names this module rather than the
route for the same reason.

## Security

The Director function's model, unchanged:

- Supabase verifies the caller's JWT before the function's code runs.
- The generation runs on a client built from that same token, so row-level
  security bounds every read and write exactly as it does in the browser. A
  project shared with someone behaves identically either way.
- There is no shared secret and no signed job, because nothing is speaking for
  anyone.

The one privileged read is the BYOK vault check, which uses the service role key
the platform injects — the same code path, on the same key, as on the app's own
host.

## Deploying

The bundle is generated and git-ignored, so it has to be built before a deploy:

```bash
npm run edge:build
npx supabase functions deploy render-image
```

Secrets are per project, not per function, so `OPENAI_API_KEY` and the rest are
already there if `director-chat` is deployed. If not:

```bash
bash scripts/push-director-secrets.sh
```

`npm run edge:build` builds both bundles. Deploying `render-image` does not
require redeploying `director-chat`, though its CORS allowlist has moved to
`supabase/functions/_shared/cors.ts` and the deployed copy still carries its own
until it is next deployed.

## What is still rough

The models that stayed on the app's own host still have their POST killed at
thirty seconds when a render runs long. Nothing is lost — the job holds the
provider id and the poll finishes the picture — but the browser is answered by
the host rather than by the route, so the attempt reads as failed for as long as
it takes the poll to come back. `readGenerationResponse` now turns that into a
sentence about the request instead of a JSON parse error, which is a legible
failure rather than no failure at all. Moving those renders across too would fix
it properly; it was left alone because they currently work.
