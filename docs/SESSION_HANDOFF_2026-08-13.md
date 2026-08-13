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

### Verification completed

- `npm run typecheck`
- `npm test`
- `npm run build`

## Key implementation files

- `src/app/api/studio/projects/[projectId]/images/route.ts`
- `src/app/api/studio/projects/[projectId]/director/chat/route.ts`
- `src/app/api/studio/projects/[projectId]/videos/route.ts`
- `src/app/api/studio/projects/[projectId]/route.ts`
- `src/app/studio/project/[projectId]/page.tsx`
- `src/lib/studio/byteplus.ts`
- `src/lib/studio/byteplus.test.ts`
- `supabase/migrations/20260813224500_generation_credit_refunds.sql`
- `supabase/migrations/20260813231500_generation_job_episode_and_image_history.sql`

