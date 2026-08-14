# Session handoff - 2026-08-15

One theme underneath most of it: a prompt is not one thing. A shot's image prompt describes a frame, its video prompt describes what happens across the runtime, and a character's description exists to build reference art and must never reach either. Conflating them is what made faces drift, clips read as drifting stills, and an apartment scene render in an open field.

## The chat waited forever on a run that had already died

A Director run is written to `creator_workflow_runs` before the work starts so the page can rejoin it after a reload, but only the process doing the work marks it finished. When that process is killed — a deploy, a timeout, a crash — nobody writes the ending, and the row sits at `running` while the chat shows *"Picking up where the Director left off"* indefinitely. Reproduced live: two rows stalled at step 3/10, last write fifteen minutes earlier.

- **Runs that have gone silent are closed on the workspace read.** Silence, not age — a run of seven minutes finishes successfully here, so age proves nothing. Eight minutes without a write is the threshold, and `awaiting_approval` is never swept because it waits on the user.
- **The streaming error path writes its own ending.** It sent the error to the browser holding the stream but left the run open, so a reload turned any failure into a permanent "thinking".
- **A run that stops without replying says so**, with the reason and a retry, instead of leaving the user's message answered by silence.

## Prompts split into the three things they actually are

- **The episode master prompt** (`creator_episodes.master_prompt`, new migration) is one document written from the script that characters, shot image prompts, and shot video prompts are all extracted from. Stored verbatim — it is the one place a `CHARACTER / ASSET LOCK` block belongs, because that block is what the entities are created from. `stripIdentityDescriptions` removes it from everything extracted out of it.
- **Shot video prompts live beside the image prompt**, on shot metadata, never replacing it. The video path films from the beats when they exist and falls back to the image paragraph until they are written. Written for a whole episode in one approval, revisable per shot via `update_shot`'s `patch.video_prompt`.
- **Beats are validated and set the runtime.** Gaps, overlaps, a first beat that does not start at 0, and a run past 15 seconds are all refused with the sentence the writer needs. A prompt scripting `0-4s / 4-8s` renders at 8 seconds.
- **Both beat forms parse:** `0-4s:` and the saved Seedance instruction's own `⏱️ 0–2s — TITLE`, em dash and no colon. A pattern insisting on the first would have rejected the format this workspace's Prompt Agent was written to produce.
- **A whole scene pasted into a shot's image prompt is refused** by `sceneNotFrameReason`, wired into `create_storyboard_batch` and `update_shot` — section headings or more than one timed beat means the wrong document is in the field, and no amount of stripping fixes that.

## A shot runs as long as what happens in it

Every shot was created at four seconds and rendered at four seconds regardless — the video request hardcoded `durationSeconds: 4`, so even a shot set to ten rendered four and clipped its own dialogue. Runtime now comes from the beats where they exist, otherwise from the shot's own dialogue at three words a second plus a second to breathe, rounded **up** to a length the model renders. A duration set by hand is never overridden.

## Every shot happens somewhere

A prompt names the location only where it changes, so the shots between were built with none and rendered nowhere — the model filled the gap from the background of whatever reference photo it had, which is why a shot set in an apartment came back in an open field. The scene now carries forward until the script moves it, at storyboard build and as a repair before rendering. A cast the user curated by hand is never touched.

## Continuity across the episode boundary

Shot 1 of an episode continues from the previous episode's last **rendered** clip instead of opening cold, reaching past an episode with no footage to the last one that has some. It is proposed, never silent: the card names the episode and shot before credits are reserved. The agent can also reach any episode's clips itself — its instructions now carry the episode roster, since it previously knew only the episode it was standing in.

## A clip is not a composition frame

`CreateAsset failed: [Unsupported media format]` — the Episode 2 `.mp4` was sitting in `input_images`, the image reference list, and got sent for image registration. Fixed on both sides with one shared check (`isVideoReferencePath`): the server moves a stray clip to the video references it belongs in, and the client routes an uploaded video to Motion Reference whichever uploader it was dropped on.

## Workflow and interface

- **"Generate all shot images"** is one proposal with one total, or three at a time — the batch card totals every frame in it, and offers "Start with 3 instead" beside it.
- **The next step no longer vanishes or repeats itself.** A turn that finished shot 1 ended with no button at all, because the pipeline had moved on to shot 2 and any step naming another shot was dropped — along with the steps for shot 1 sitting beside it. Each action is now judged on its own, a forward step is kept, and a step for a shot whose generation was *just approved* is dropped as the stale offer it is.
- **A named task is the turn's whole job.** Instruction rules 8 and 9 now separate "the user said continue" from "the user asked for something specific" — the pipeline's next action is offered after the request is done, never substituted for it.
- **Motion Reference is fully manual**: select any storyboard clip, or upload your own.
- **A rendering shot shimmers** — the whole row, not just the output cell — whether it started from a chat approval or the panel's own Generate button.
- **Reference thumbnails preview on hover**, labelled `@Lena` or `Shot 2 video`, video autoplaying. Portaled to `document.body`: every one of these strips scrolls horizontally, which forces vertical clipping too, so an absolutely positioned popup was invisible no matter which ancestor's `overflow-hidden` was worked around.
- **The Timeline tab no longer crashes** an episode with no shots, and back from Timeline returns to the tab you came from instead of ejecting you to the project list.

## The tool gate had a second copy of the tool list

A tool could be registered, described, owned by an agent, and offered to the model, yet still be rejected on arrival as `tool: Invalid input` — a hand-written `z.enum` in `tool-service.ts` that nobody remembered to update. It reads the registry now, with a test that walks every registered tool and every tool the model is offered through the gate.

## Verification

- `npm run typecheck`
- `npm test` (266 tests)
- `npm run build`
- `npx supabase db push` for the master prompt migration — **not yet run**

## Known gaps left open

- **The master prompt migration is unpushed.** `write_episode_master_prompt` fails on the missing column until it runs; everything else works without it.
- **The Prompt Agent's saved instruction overrides the code's.** A 22k-character instruction in `site_settings.ai_director_team` replaces `prompt-agent-instructions.ts` entirely, including its timed-beat spec. Format requirements were put in tool schemas precisely because a saved team cannot override those. Two sections of it also fight this pipeline: its mandatory `CHARACTER / ASSET LOCK` is stripped from every shot prompt, and `<<<image_N>>>` is for pasting into Higgsfield by hand — here references come from the shot's linked cast.
- **Extraction is not automated.** The agent reads the master prompt and calls the existing tools; there is no one-click chain, deliberately, until it has been watched once.
- **The aspect fix is per-episode, not preventive.** `fix_shot_aspect_mismatch` corrects prompts whose stated ratio disagrees with the shot's setting, but changing a project's aspect mid-production still leaves the wording behind until it is run.
- **Episode 3 was built the old way.** A master prompt written now will not retroactively make its characters, shots, and prompts consistent — it is the source for what gets regenerated from here. Episode 4 is the clean test.
- **A failed job's credit refund is unverified.** The `.mp4` crash should have refunded 200 credits through the existing path; that was never confirmed.
