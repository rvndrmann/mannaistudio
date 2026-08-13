# Session handoff - 2026-08-13

## Studio generation workflow fixes

This session focused on making AI Director generation behave like a real production system: every attempt is visible, every successful image is preserved, and failed paid attempts are refunded.

### Durable image attempts

- Direct Studio image requests now create a `creator_generation_jobs` row before calling the provider.
- The same row is updated from `approved` to `processing`, then to `completed` or `failed`.
- Failed image requests return the `jobId` to the client, so the UI can merge its temporary block with the durable database record.
- Asset reference generation from the AI Director chat uses the same durable job pattern.
- Chat-triggered storyboard keyframe generation also creates the job before provider submission.

### Asset concept gallery

- The Characters & Assets workspace now renders non-output image jobs beside saved concept images.
- In-progress attempts show a generating block.
- Failed attempts show a red failure block with the error and original prompt.
- Selecting a failed attempt shows the prompt/model/error in the main preview instead of falling back to the last successful image.
- Completed asset images still append to `creator_entities.reference_images`; previous successful concepts are not replaced.

### Storyboard image history

- Storyboard image history is additive.
- The active storyboard keyframe is only the chosen pointer on `creator_shots.keyframe_image`.
- Previous completed images remain available in the shot gallery through `creator_generation_jobs`.
- Historical job loading fetches the full per-shot generation history rather than depending only on the capped project snapshot.

### Credits and refunds

- Failed image and video provider requests refund charged credits through `refund_generation_credits`.
- Refunds use stable keys based on the durable generation job when available.
- Refund metadata links back to the failed job, making the credit ledger auditable.
- The Studio credit badge refreshes after failed attempts so the visible balance does not stay stale.

### BytePlus Seedance video references

- BytePlus Seedance 2.5 video-extension requests send provider ratio `adaptive` whenever a video reference/start frame is present.
- The Studio can still display the requested storyboard ratio separately.
- This matches BytePlus ModelArk's requirement for extension tasks, where output ratio follows the input video.

## Chat pipeline and character identity

A second strand the same day: making the chat drive the production forward instead of ending each turn on prose, and stopping written character descriptions from overriding reference art.

### The production pipeline drives the chat

- `src/lib/studio/pipeline.ts` computes the current stage from live workspace state: script → prompt sheet → the characters and assets the sheet names → their reference art → storyboard → keyframes shot by shot → clips shot by shot → review.
- Every assistant message carries the one action that advances the stage, as a `suggested_actions` timeline block. `ChatNextStep` renders it at the end of the conversation, after the media and the approval cards.
- The same stage is written into the Director's instructions, so the reply names the step the button offers.
- One stage per turn. Keyframes and clips go one shot at a time, lowest-numbered first, so each shot is seen before the next is paid for. The user advances by pressing; nothing downstream runs until they do.
- The missing-entity set is a handle-compared diff of the prompt sheet against the entity library, so nothing already in the project is re-created and art is only generated for entities that have none.
- The button's intent is re-read by the same routing as typed text, so each stage's wording is chosen to land on the path that stage needs. `pipeline.test.ts` locks that in.

### Written identity no longer overrides reference art

- `src/lib/studio/prompt-sanitizer.ts` strips `CHARACTER / ASSET LOCK` blocks and stray `@Name — description` lines, leaving `Cast in frame: @Ethan, @Lena.` so the cast still resolves.
- It handles prompts stored as a single paragraph, which is how the existing ones were saved; the first line-based version stripped nothing from them.
- Applied on write (`create_storyboard_batch`, `update_shot`, `save_script_prompts`), on the way to every provider (chat keyframes, images route, videos route, job executor, `submit_generation` prompts), and on request when the user asks the chat to fix the saved prompts.
- Prompt Agent and Storyboard Agent instructions were rewritten: the lock section is a cast list, never a description. Those instructions had previously *prescribed* the detailed block.
- A keyframe request now attaches the shot's own cast, not only entities the user retyped with `@`. A bare "regenerate shot 1" previously sent no reference art at all.

### Chat behaviour fixes

- Fast paths run inside the SSE stream and report progress. Previously nothing reached the browser until the provider returned, so the chat looked frozen.
- "regenerate shot N" is answered deterministically; it had been resolving to a different shot.
- A message naming a shot no longer routes to bulk entity art. "create shot image again with better character consistency" had been answered with a report about reference images.
- The open episode survives a reload, stored per project and mirrored into the URL as `?episode=…`.
- Image quality (Low/Medium/High) is a project setting obeyed by every image path and passed to the OpenAI endpoints, which had always received `medium`.

### Verification completed

- `npm run typecheck`
- `npm test` (163 tests)
- `npm run build`

## Known gaps left open

- **@mention to reference-image binding.** Seedance binds positionally (`@Image1`, `@Video1`; 9 images, 3 videos, 3 audio, 12 files, 15s) while our prompts name entities, so a mention may not resolve to a specific attached image. The index convention comes from third-party guides — BytePlus's own docs render client-side and could not be read — so it was deliberately not shipped. GPT Image has no equivalent syntax; inputs are an ordered `image[]` array.
- **Storyboard rebuilds drop shot media.** `create_storyboard_batch` with `replaceExisting` deletes shot rows, discarding keyframes and orphaning generation history onto dead shot ids.

## Key implementation files

- `src/app/api/studio/projects/[projectId]/images/route.ts`
- `src/app/api/studio/projects/[projectId]/director/chat/route.ts`
- `src/app/api/studio/projects/[projectId]/videos/route.ts`
- `src/app/api/studio/projects/[projectId]/route.ts`
- `src/app/studio/project/[projectId]/page.tsx`
- `src/lib/studio/byteplus.ts`
- `src/lib/studio/byteplus.test.ts`
- `src/lib/studio/pipeline.ts` and `pipeline.test.ts`
- `src/lib/studio/prompt-sanitizer.ts` and `prompt-sanitizer.test.ts`
- `src/lib/studio/project-state-summary.ts`
- `src/lib/studio/tool-registry.ts`
- `src/lib/studio/tool-service.ts`
- `src/lib/studio/director-team.ts`
- `src/lib/studio/prompt-agent-instructions.ts`
- `src/lib/studio/entity-image-workflow.ts`
- `src/lib/studio/execute-generation.ts`
- `src/lib/studio/openai.ts`
- `supabase/migrations/20260813224500_generation_credit_refunds.sql`
- `supabase/migrations/20260813231500_generation_job_episode_and_image_history.sql`

