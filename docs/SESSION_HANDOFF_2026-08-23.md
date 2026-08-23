# Session Handoff - 2026-08-23

It began as a question about `deepseek-ai/deepseek-harness` — could it serve as
the chat backend, and what does it do better — and became a latency and
correctness session on the Director. The harness is not usable as a backend
here, but four of its context-management ideas were worth taking. Pulling on
those exposed a chain of bugs from the chat window down to the length of a
storyboard shot, most of which had been silently wrong for some time.

Four commits, all on `main`: `9a2b91f`, `8226fc9`, `d3b135d`, `ff3193a`.

## Why deepseek-harness is not the backend

Read before proposing it again. It is real — MIT, TypeScript, built on Cordis,
~40 developer tools, targets `deepseek-v4-*` — but four things rule it out:

- **No HTTP API.** Integration is a spawned process over newline-delimited
  JSON-RPC on stdio, so per-user means one runtime process per concurrent user.
  That does not run on serverless Next.js.
- **No mid-turn cancel.** Their docs: abandoning a turn means closing the
  runtime. `creator_workflow_runs` and the reload-rejoin path already do better.
- **`run()` returns no per-prompt result.** `prompt()` gives an admission
  receipt and `run()` collects receipt-to-idle; there is no response causally
  bound to the request, which is exactly the binding chat billing needs.
- **Its tools are developer tools.** bash, read/write/edit, glob, grep. The
  value here is `submit_generation` and the rest of the typed registry, so
  adopting it means keeping the part we do not need.

It is also nine days old with breaking changes promised in the README.

What we already do better and should not trade away: the typed risk/approval
model, per-user credit metering, the BYOK vault with KMS envelopes and
exact-hostname allowlists, RLS multi-tenancy, and runs that survive a browser
reload. The one idea it documents that this codebase had already found
independently is prompt-prefix stability — see the "Stable first, volatile last"
comment in `director-agent.ts`.

## Completed This Session

### The Director was answering from the wrong forty messages

`director/chat/route.ts` read history with `ascending: true` and `limit(40)`,
which is the **oldest** forty. Past message forty the Director stopped being
shown anything said since — it answered every turn from the opening of the
session. It now reads the newest page descending, fetches the very first
message separately because that one holds the brief, and carries a count so
compaction can say honestly how much is not shown.

### What a turn carries

Tool results went into the conversation whole, and the item list is re-sent on
every step of a loop that runs up to ten. One `list_storyboard_shots` over a
fifty-shot episode is ~80k tokens, paid ten times, and since chat metering
shipped that is the user's money.

- `tool-result-budget.ts` cuts an oversized result to a head and a tail with a
  marker between them. Idempotent, and counted in code points so a cut never
  lands inside a character.
- `read_tool_output` reads back what was cut. It needed no migration:
  `creator_workflow_steps.output` already stored every full result and nothing
  ever read it.
- `selectConversationWindow` was a blind `slice(-30)`, so past message thirty
  the opening brief vanished with no summary and no sign it had gone. It keeps
  the opening and marks the gap.
- `replayToolResults` finally reads the `tool_calls` column, which had always
  been written and never read — so every turn began blind and re-read the
  workspace from scratch.

Measured on a 24-shot storyboard read: 8.0k → 1.3k tokens for one call.

### Images stopped riding along on every turn

`collectDirectorVisionAttachments` attached up to six images unconditionally.
Instrumented, a plain "how many shots does this episode have?" carried **8.65 MB
of PNG, 11.54 MB as base64** — 7.2s to download and encode, 25.3s to upload, to
produce 47 tokens of reply. The pictures were ~99% of the bytes.

They now travel only when the turn points at one: an `@mention`, or media
attached to this message. `look_at_media` is a new control tool the Director
calls when it genuinely needs to see a frame, so the capability is kept and the
decision is the model's rather than a guess from the words in the sentence.

Measured on the same question: **36.3s → 11.2s**.

### The workspace endpoint

`GET /api/studio/projects/[projectId]` ran eleven sequential phases where few
had real dependencies, and it is what every approval, every generation and every
poll waits on. Measured at **33.4s**; three consecutive calls after batching
them: **5629ms, 2707ms, 2626ms**.

This is also the answer to "the approve button is stuck on Working". It was not
stuck — the refresh behind it took thirty-three seconds.

### The Video Prompt Agent owned no tools

`agentForStage("videos")` is `video_prompt`, but `write_shot_video_prompts` was
owned by `prompt`, and `toolsForAgent` hands an agent only read tools plus its
own. The agent named after the job could not see the tool that does it, and
replied that "the workspace's video-prompt writing operation is not available in
this turn" while producing drafts in chat that were never saved.

The identical failure is already recorded in a comment on `submit_generation` at
the keyframes stage, so the invariant is now **tested per stage**: every stage's
opening agent must be able to reach the tool that stage needs.

### Video was filmed from the wrong prompt

`submit_generation` selected `id,prompt,...` and never `metadata`, so a video
job fell back to the shot's **image** prompt — a single frame, rendered as
though it were a scene. That is why clips came back as a still that drifts. It
now reads the video prompt for video and the image prompt for images.

`create_storyboard_batch` also writes `videoPrompt` in the same pass as the
image prompt, and beats are validated on the rewrite path too — `update_shot`
and the storyboard editor both go through `shot-writes.ts`, which is the one
place a shot's writing is prepared for the database.

### @mentions reached Seedance as literal text

Per the [Seedance 2.0 prompt guide](https://docs.byteplus.com/en/docs/modelark/2222480):

> Each time a subject is involved, it must be explicitly referred to to avoid
> omission… use `<Subject_N>@<Image_N>` to emphasize the binding relationship
> between the subject and the asset. For example: `Zhang San@Image 1`.

The workspace writes `@Sara`. Seedance wants `Sara@Image 1` — subject first,
then the image index. They look alike and are not the same, and
`formatBytePlusReferencePrompt` translated only `@previous shot video` and
`@storyboard shot N image`. So the reference image was attached and **nothing in
the prompt pointed at it**, and the clip was rendered from the words.

`seedance-mentions.ts` does the translation at the provider boundary, so `@Sara`
stays the one convention the storyboard, chat, mention picker and cast resolver
share, and the same prompt still means something to Veo and fal.

`untagged-entities.ts` refuses a prompt that describes an entity in prose when
the project has reference art for it — after three rounds of asking politely in
tool descriptions and agent briefs produced "a dark sleek modern car" while
`@Sleek Luxury Car` sat in the library with a photograph.

### Freshly generated art reported itself out of date

`artIsStale` compares the description the art was made from against the one the
entity has now, but `source_description` was **only ever written by
`accept_existing_art`** — never where art is actually made. Every generated
reference fell to the fallback, which asks whether the description appears
verbatim inside the generation prompt. That holds for the prompt this workspace
composes, which carries a `Canonical description:` line, and fails the moment
the Director writes its own entity prompt — which `generate_entity_reference_art`
lets it do.

So art finished rendering and was immediately reported as stale, and the
pipeline offered a **costly** regenerate for pictures that had just landed, on a
loop. It is recorded at generation now.

### The Characters & Assets panel sat still while art rendered

The card asks whether a running job is for that entity by reading
`settings.entityId`, which `generate_entity_reference_art` has never written —
its settings carry `target: "asset"` and the entity's type, not its id. The
job's own `entity_id` column was set all along; the workspace endpoint simply
did not select it. It does now.

### One guessed id killed eleven shots

`create_storyboard_batch` threw "One or more storyboard entity references are
invalid" when any `referencedEntityId` did not resolve, naming none of them. The
Director could not tell which to fix and proposed the same batch again. Those
ids are only a hint — the cast that gets stored comes from the `@mentions` in
each shot's prompt via `findShotCastEntityIds`, and falls back to the list only
when the prompt names nobody. Unresolved ids are dropped and reported.

### Every shot was set nowhere

Two faults pointing the same way, so the storyboard showed a cast with no place
to be and generation sent no location reference at all.

`inheritedShotLocations` only carried a location **forward** from a shot that
already had one. An episode where no prompt names the scene — the ordinary case,
since prompts name who is in frame far more often than where — filled
`awaitingFirst`, never set `carried`, and dropped the list on the way out. Where
a project has exactly one scene, that is now where the episode happens. Several
scenes is a real choice and is still left to the writer.

Then the cast was recomputed from the prompt for display **and for generation**,
keeping a declared entity only when its name appeared in the text. So the scene
the repair had just attached was dropped again for precisely the reason it was
attached. A declared location now survives that filter; a declared prop still
has to be named, which is what stops a curated cast collecting the whole
library.

### Every shot was four seconds

`estimateShotSeconds` sized a shot from its spoken words and nothing else, so a
wordless shot produced `needed = 0` and fell to `MIN_SHOT_SECONDS`. A continuous
shot Seedance would render for fifteen was cut to four, and a whole storyboard
of action shots came out identical.

Three things say how long a shot is now, in order:

1. **The video prompt's timed beats**, which already governed runtime and were
   simply never written — `videoPrompt` was optional and the Storyboard Agent
   skipped it. It is **required** now.
2. **A timed range in the script text**, as `00:00-00:05`, which is the writer
   saying how long the beat runs. `resolveShotSeconds` reads the shot's stored
   `script_text` for it, so a storyboard written before this still renders at
   the right length without being rebuilt.
3. **Spoken words**, as before — but counted in the form the workspace actually
   stores. `BRACED_DIALOGUE` matched only `{"..."}` while a saved `script_text`
   holds the line as `{...}` with no inner quotes, so **every stored line
   counted as silence**.

### The "Review 1 pending change" loop

Three scopes disagreed about the same proposal. The pipeline counted pending
proposals **project-wide**; the workspace only rendered the current session's
newest run; `withdrawSupersededProposals` only expired the current session's. A
card prepared in an earlier chat was therefore counted forever and reachable
never — and the button sends its intent to the Director as a message, so
pressing it bought a turn of prose and offered itself again.

The count is now scoped to the open session and excludes expired rows, and
`PendingProposalCards` no longer filters on `latestRunId` — so an unanswered
card from an earlier run resurfaces at the bottom where the user is.

## Verification Notes

Verified live in the browser: the storyboard batch executing, the scene
appearing in each shot's assets, the Video Prompt Agent writing real timed
beats, entity jobs carrying `entity_id`, and both latency measurements.

**Committed but never seen working in a real turn** — treat as unproven:

- Revision cards showing the new prompt text (`update_shot`) — unit-tested only.
- `read_tool_output` — never fired; the test projects are too small to reach the
  trim threshold.
- `@tag` enforcement — never triggered live.
- `videoPrompt` being **required** on `create_storyboard_batch`. This is a hard
  schema requirement: if the Storyboard Agent omits it the batch fails with a
  clear message rather than silently producing four-second shots. That was a
  deliberate choice of a loud failure over a silent wrong answer, but it has not
  yet met a real Director turn. Watch this one first.

## Known Gaps

- **The BytePlus account has no active subscription.** `CreateAssetGroup failed:
  This API requires an active subscription. Please subscribe to an advanced or
  premium plan.` Registering a reference image in the Asset Library is what
  clears Seedance's real-person check, so **any** Seedance video carrying a
  character reference fails there regardless of model — 2.0 Fast exactly like
  2.5. Keyframes render fine. This is an account problem, not a code one, and it
  blocks the end of the pipeline today.
- **Gemini never streams.** `createGoogleDirectorToolTurn` is non-streaming, so
  on Gemini the user waits the entire loop before seeing a word. GPT-5.6 Luna
  streams already. This is the largest remaining *perceived* latency win.
- **BYOK adds ~1.2s to every chat turn**, measured: four Supabase RPCs at ~227ms
  each plus one KMS call at ~333ms warm, with no caching anywhere in
  `src/lib/byok/`. Two of those RPCs are bookkeeping awaited *after* the run,
  delaying the reply for nothing. A KMS call was also seen timing out at 60s
  once; the route itself is healthy from here (0.25s over IPv6, 0.03s over
  IPv4), so that was transient rather than structural. Removing BYOK from chat
  would save the same ~1.2s as fixing it and would cost an advertised feature —
  see the plan note below.
- `comments?scope=project` fires **twice** on project load, ~3s each.
- The next-step button works by sending its `intent` to the Director as a chat
  message. That is right for "write the script" and wrong for an approval, where
  a card already exists and prose is no substitute. Only the approval case was
  addressed.
- `docs/AI_DIRECTOR_ARCHITECTURE.md` still claims `deepseek-v4` runs through
  BytePlus Ark via `createBytePlusDirectorToolTurn`. **That function does not
  exist in `src/`** — `byteplus.ts` is image and video only. Corrected in this
  handoff; the architecture doc itself is still stale.

## Not Started

Written up but not built, at `~/.claude/plans/see-this-repo-of-peppy-truffle.md`:
taking BYOK off the chat hot path by fire-and-forgetting the two after-the-run
bookkeeping writes, caching the unwrapped credential with a short TTL, folding
`hasCredential` into the read, and dropping the KMS deadline from 60s to ~5s so
a slow KMS is a readable error rather than a minute-long hang. The caching step
is a deliberate relaxation of the current posture — `withCredential` zeroes the
decrypted secret in a `finally` — so it wants a decision, not just an edit.
