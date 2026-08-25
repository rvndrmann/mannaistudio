# Session Handoff — 2026-08-25

## Run modes: who presses the pipeline's next step

The Director was manual in one specific sense: every stage of a production ended on a button, and the production only moved when a person pressed it. This session added the two modes that press it for them — **Semi-auto** and **Full auto** — as a switch in the chat composer, with a Stop button on the running banner.

The feature is deliberately small at its core, because `pipeline.ts` had already been built for it. Every Director reply ends on a `suggested_actions` timeline block whose `intent` string is sent back verbatim as a user message when the button is pressed. An auto mode is therefore not a second pipeline: it is the same chain with the pressing done for it. `pipeline.ts` said as much in a comment written before any of this existed — *"Full-auto, when it lands, is the same chain with the pressing done for them."*

### What each mode runs

| Mode | Runs unattended | Stops at |
| :--- | :--- | :--- |
| `manual` | Nothing | Every step |
| `semi_auto` | `prompt_sheet` → `entities` → `entity_images` → `storyboard` → `keyframes` | The first clip |
| `full_auto` | The same, plus `videos`, one shot at a time | The end of the episode |

Neither mode runs the `script` stage. When no script is saved the pipeline's own next step is to ask the user for the idea in a sentence or two — there is no production to automate yet, and a mode that answered that question would be inventing the story. Auto begins at the first stage derived from something the user has already written.

### Where it lives

- `src/lib/studio/autopilot.ts` — the whole policy as pure functions. `decideAutopilot` answers one question from the state the workspace is already showing: **run**, **approve**, **wait**, or **stop**. Nothing here executes anything, which is what makes the rule about unattended spending a thing that can be read and tested in one place rather than a scatter of conditions inside a 9,000-line component.
- `src/components/studio/autopilot.tsx` — the switch, the banner, and the loop that acts on the decision. It lives in a component rather than the page because the page returns early while the workspace loads, and a hook cannot be called on one render and skipped on the next.
- The mode persists on `creator_projects.metadata.ai_director_full_auto`, reusing the key the never-read `update_full_auto_mode` stub already wrote. A project with the old `enabled: true` flag reads as full auto rather than being silently reset, and `max_jobs_per_run` carries over as the image batch bound.

## The bugs found by running it against a real production

Every one of these was found by watching an eleven-shot episode run in the browser, not by reading the code.

**A stored step is a snapshot, and it goes stale.** The loop read its next step from the newest reply's timeline block. Approving a card and letting a render land moves the production on *without any new reply being written* — so the block went on saying "generate the image for shot 2" after shot 2 existed. Replaying it is a second render of a frame already paid for. A block is now spent once acted on (`usableAutopilotActions`), and an empty list is what sends the run back to the Director for live state.

**A read-only step meant "wait forever".** This is what actually froze a run. The reply carried a stale *"Review 1 pending change"* button while the workspace held **zero** pending proposals — the two disagree whenever a card is answered without a new reply. The policy treated read-only steps as `wait`, so with nothing rendering and nothing pending it polled for something that was never coming, while nine shots had no image. Anything genuinely rendering is caught by the in-flight check above it, and a real card by the check before that, so reaching a read-only step now means the stored view is out of date: the run re-reads rather than waits.

**The allowlist was too narrow, and narrow in a way that promised work it would then refuse.** The run generated an image and then stopped on a card titled *"Update shot 6 — Trunk POV Reveal"*. That card was `attach_media_to_shot` — the step that writes a finished image onto its shot. Generating media and attaching it are two halves of one step, and approving only the first leaves the run holding a picture it cannot put anywhere. Checking the registry showed the same gap waited at `create_production_entity`, `create_storyboard_batch` and `write_episode_master_prompt`: Semi-auto *claims* to run characters and the storyboard, both of which are built by tools that raise approval cards.

Rather than adding tools one at a time as each stall surfaced, the allowlist is now drawn on one line:

> **A mode may approve work that builds. Never work that changes or removes.**

Auto-approved: creating entities, building the storyboard, reference art, generating media, attaching media, accepting existing art — none can take away something the user already has. Never auto-approved: `update_script`, `update_shot`, `update_asset`, `delete_shot`, `delete_asset`, `fix_shot_aspect_mismatch`. These change work the user may have written themselves, and no mode approves them however routine the card looks. A test asserts every stage the modes claim to run has its tool allowlisted, so this class of stall cannot come back silently.

**A remembered mode started spending on page load.** The mode persists on the project, so opening a project left in Full auto began rendering before the user had touched anything. Remembering a setting and resuming spending are different things: the switch keeps its position, and the run waits for the user to take part — choose the mode, send a message, or press a step. The loop calls `sendDirectorMessage` directly and so can never mark itself as engagement.

## Batching the shot images

The pipeline offers one shot at a time, which is right for a person deciding shot by shot but made an unattended run pay a full Director turn per frame. Both auto modes now ask for every outstanding shot image in a single request.

The provider was never the reason to go one at a time. `execute-generation.ts` dispatches a batch's jobs with `for (const job of jobs) { await runJob() }` — **serially** — so a ten-shot batch never puts ten calls on a provider at once. Batching changes provider load not at all; what it removes is the Director round trip between frames, which was most of the wall-clock cost.

Because every generation is charged and **a queued job cannot be recalled by pressing Stop**, the guards are specifically about that:

- The batch is built from live workspace state. A shot is included only if it has a prompt, has no image already, and has nothing rendering for it. Duplicates are stripped — a shot listed twice is a frame paid for twice.
- The intent text tells the Director not to include an already-rendered shot, in those terms.
- `maxBatchShots` (default 20) bounds how many shots one approval may commit, so it is never an open cheque on a long episode.
- The run's credit cap applies on top: a batch whose estimate would pass the cap, or exceed the balance, stops and names the number instead of approving.
- **Videos are not batched.** A clip costs many times a frame, and serial video is what makes Stop actually save money — halt after one and the next was never committed.

## Safety, as built

- Caps at 40 steps and 500 credits per run; stops on error, on insufficient balance, and if the same step repeats three times without the production moving.
- Stop reverts to Manual, so there is no fourth state where the control says "Full auto" while nothing runs.
- The Director is told the run mode (read from project metadata, no request plumbing) so replies stop closing with "press the step below" when nobody is reading them.
- **The loop runs in the browser.** Closing the tab stops it. That is the honest behaviour for something spending credits unattended, and it does mean Full auto will not finish an episode while the user is away.

## What is not verified

The multi-shot batch has **never been exercised against the live Director.** The serial run finished ten of eleven shots while the batching was being written, and with one shot outstanding the code takes the single-step path by design. The logic is unit-tested; the next episode is its first real run.

The allowlist is only as good as the registry audit behind it. If the Director reaches for an additive tool that is not listed, the run stops and names the card rather than guessing — the safe direction to fail, but a stall the user will still see.

## Files

| File | What it holds |
| :--- | :--- |
| `src/lib/studio/autopilot.ts` | Modes, stage sets, the tool allowlist, the batch builder, `decideAutopilot`, stored settings |
| `src/lib/studio/autopilot.test.ts` | The policy decision by decision, including against the real `computePipelineStage` |
| `src/lib/studio/autopilot-run.test.ts` | Whole productions driven end to end: the chain advances, terminates, and never generates a shot twice |
| `src/components/studio/autopilot.tsx` | `AutopilotModeControl`, `AutopilotBanner`, `useAutopilotRunner`, `AutopilotRunner` |
| `src/app/studio/project/[projectId]/page.tsx` | Mode state, engagement, and the runner wired into the chat stream |
| `src/app/api/studio/projects/[projectId]/workspace/route.ts` | `saveAutopilotMode` |
| `src/app/api/studio/projects/[projectId]/director/chat/route.ts` | The run mode in the Director's instructions |
