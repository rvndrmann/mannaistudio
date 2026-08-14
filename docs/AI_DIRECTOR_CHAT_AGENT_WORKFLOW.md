# AI Director Chat Agent Workflow

## Goal

Build the Studio chat agent as the user's primary production controller. The agent should understand the whole project workspace, help plan creative decisions, and operate on scripts, assets, storyboard images, and videos through a controlled tool workflow.

The agent must feel like the AI Director already described in the platform, with concrete, project-scoped workspace powers:

- read project context, script, assets, storyboard, generation jobs, and approval history
- write and edit script content, asset metadata, shot prompts, storyboard keyframes, and video generation requests
- delete or replace workspace content when explicitly approved
- show proposed work inside chat before applying sensitive changes
- generate images directly when the user asks for image generation
- require approval before video generation unless the project is in full-auto mode
- support an OpenAI Realtime voice director that can execute the same validated tool registry as text chat, including approval proposals
- end every turn on the one step the production is actually waiting for, so the user advances the pipeline by pressing a button rather than by working out what to ask for next

## Current Implemented Flow

```text
User message (+ optional @mentions)
        |
        v
Project ownership, feature, model, and entity validation
        |
        v
Deterministic fast paths, run inside the SSE stream so progress is visible
        |
        +-- Script write/append/replace ------------------> Saved to the Script tab
        |
        +-- "Fix the character descriptions in the prompts"
        |                                                  |
        |                   Identity stripper over saved shot prompts + prompt sheet
        |
        +-- Bulk entity reference art ---------------------+
        |   (never for messages naming a shot)              |
        |                                      Atomic credit debit per entity
        |                                                  |
        |                              Provider image request, saved to the entity
        |
        +-- Direct image / "regenerate shot N" ------------+
        |                                                  |
        |                                      Durable job row (approved)
        |                                                  |
        |                                      Atomic credit debit -> processing
        |                                                  |
        |                    Provider image request, references = the shot's own cast
        |                                                  |
        |                     Save to shot + job completed, or failed + refund
        |                                                  |
        |                           Chat media card + badge refresh
        |
        +-- Video intent --> Proposal card --> User approval
        |                                       |
        |                              Atomic credit debit + job creation
        |                                       |
        |                           Provider job submission and polling
        |
        +-- Write/destructive intent --> Proposal card --> User approval --> Validated tool execution
        |
        +-- Other intent --> Contextual AI Director response
        |
        v
Pipeline stage computed from live workspace state
        |
        v
Assistant message + one "Next step" button at the end of the chat
```

### 1. Context and mention resolution

The Studio sends the selected episode, session, message, and `@mentioned` entity IDs to `POST /api/studio/projects/:projectId/director/chat`. The server verifies that the user owns the project and every mentioned character, scene, or prop belongs to it. It then supplies the entity descriptions and selected reference images to the relevant prompt.

Up to six workspace images travel with the run so the Director can look at what it is reasoning about. They are **read here and sent inline as data URLs**, not as storage URLs for the provider to fetch: a keyframe is a multi-megabyte PNG, and OpenAI gives up on a slow download with *"Unable to download content from the provided URL before the timeout"*, which failed the whole request for reasons no user could act on. Caps are eight seconds per image, 4MB each and 12MB total; anything that cannot be read in time is dropped rather than handed over as a URL that would fail the same way.

### 2. Deterministic workflow routing before model chat

The chat route handles several high-confidence requests directly before falling back to the text agent:

- Script write/append/replace requests update the stored script through the workflow route.
- **“Create all missing character images”** and related bulk requests generate one reference image per matching entity, then save it to that entity’s `reference_images`. A message that names a shot, storyboard, or keyframe is never routed here: it is storyboard work, and answering it with entity art reported on reference images the user had not asked about.
- Direct image/keyframe requests generate a GPT Image 2 output, save it to Studio storage, and attach it to the named storyboard shot when one was requested. A bare **“regenerate shot 3”** is handled here too — a named shot with a redo verb means its keyframe — because leaving it to the agent resolved it to a different shot. A message that says “shot” without saying which one falls through to the agent, which has the conversation context to resolve it.
- **“Fix the character descriptions in the prompts”** rewrites the saved shot prompts, and the prompt sheet behind them, through the identity stripper described below.
- **“Skip shot 6 and continue”** is answered from the pipeline. Skipping changes nothing in the workspace — it only says which shot not to offer — so there is nothing to propose and nothing to approve, and the reply names what comes next instead. Left to the agent this came back as a read-only inspection report on an unrelated shot.
- Video requests create an approval proposal; they do not submit a video until the user approves. Under a continuity workflow a bare request continues from the previous shot's clip; see below.
- All other production questions pass to `runDirectorAgent`, which receives the selected workflow, project context, session history, global admin instructions, and current runtime settings.

Redo phrasing is shared between the media paths (`wantsRedo`): `recreate`, `re-create`, `regenerate`, `redo`, `remake`, `rerender`, `rerun`, and a trailing “again”. `\bcreate\b` does not fire inside “recreate”, so “recreate the shot 6 video” previously matched nothing and fell through to the agent — which answered it with an inspection report on a different shot. A request naming several shots goes to the agent deliberately: the single-shot number match would keep the first and drop the rest.

These paths run **inside** the SSE stream and report progress as they work (`Generating the keyframe for shot 2`, `Generating reference art: Bathroom, Bathroom Mirror (1–2 of 3)`). Before this they ran before the stream was opened, so a request that spent a minute inside an image model sent nothing at all to the browser and the chat appeared frozen on the message the user had just sent.

### 3. Generation, credits, and feedback

- Image quality is a project setting (**Basic Settings → Image Quality**, `metadata.basic_settings.imageQuality`, one of Low/Medium/High, default Medium). Every image path reads it through `projectImageQuality`: chat keyframes, entity reference art, `images/route.ts`, and the job executor. It is sent to the OpenAI image endpoints — which previously always received `medium` — and feeds `calculateCreditCost`, so High costs more and Low costs less. An explicit `quality` on a direct API request still wins.
- Direct chat images and bulk entity-reference images are charged through the atomic `deduct_user_credits` RPC before provider submission.
- An approved generation proposal is charged through that same RPC when the user approves it. It no longer uses the separate legacy reservation account.
- The direct image/video routes return `creditsCharged` and `creditBalance`; the chat route returns the same fields for direct chat workflows.
- `credit-balance-events.ts` broadcasts the returned balance to the global `CreditBadge`. On any error, the badge immediately refreshes `/api/credits`, so a provider or storage failure cannot leave a stale visible balance.
- Every charge is written to `credit_transactions`. Failed provider requests now call `refund_generation_credits` with a stable refund key, and when a generation job exists the refund is linked back to that job.

### 4. Saved results

- Entity references are saved to `creator_entities.reference_images` and become available in **Characters & Assets**, mentions, and later image/video prompts.
- Storyboard keyframes are saved to `creator_shots.keyframe_image`, with generation metadata recording the model, prompt, references, status, style, aspect ratio, and mention IDs.
- Generation jobs capture provider/model/prompt/status details for the storyboard and job history. Image jobs are created before provider submission so queued/processing/failed attempts appear as visible blocks even when no output image was produced.
- The chat timeline stores the assistant response and attached generated media for immediate review.

## The production pipeline and the next step

`src/lib/studio/pipeline.ts` is a state machine over what the workspace actually contains, not over what the last message said. It reads a `ProductionSnapshot` — script present, prompt sheet entries, entities and their reference art, shots and their keyframes and clips — and returns the stage the production is on plus the single action that advances it.

| Stage | Condition | Action offered |
| :--- | :--- | :--- |
| `script` | No script saved | Confirm the script |
| `prompt_sheet` | Script saved, no prompt sheet | Write the prompt sheet |
| `entities` | The sheet names characters or assets the project does not have | Create only the missing ones |
| `entity_images` | Entities exist without reference art | Generate art only for those |
| `storyboard` | Sheet complete, storyboard empty | Build the storyboard |
| `keyframes` | A shot has a prompt but no keyframe | Generate the image for that shot |
| `videos` | A shot has a keyframe but no clip | Generate the video for that shot |
| `complete` | Every shot keyframed and rendered | Review the cut for continuity |

Rules that fall out of this design:

- **One stage per turn.** The Director does the stage it is on and hands back. Keyframes and clips go one shot at a time, lowest-numbered first, so the user sees each shot before the next is paid for.
- **Nothing is re-created.** The missing-entity set is a diff of the prompt sheet's names against the entity library, compared on handles, so "Detective Rao" and "detective rao" are one character. Entities that already have art are never regenerated unless the user asks by name.
- **The user stays in the loop by pressing the button.** Full-auto, when it lands, is the same chain with the pressing done for it.
- **Nothing already running is offered.** A shot mid-render still has no keyframe, so on stored state alone it reads as the obvious next step — and pressing it pays for the same frame twice. Generations in flight are excluded from the step and from the batch. When everything outstanding is rendering there is no button, only what is rendering, which also stops the stage falling through to *Review* over shots that are not finished.
- **A dead job is not work in progress.** A generation that never reaches a terminal status stays `processing` for good, and treating that as in flight removed its shot from the pipeline permanently. Jobs older than twenty minutes are read as abandoned.
- **A skipped shot is passed over, not acted on.** `withSkippedShots` marks it so the decision lives in the state rather than in the phrasing of the next message.

The stage carries **alternatives** beside the primary step, so a finished shot does not end the turn on a single option: finish the remaining images in one batch, or film a shot whose keyframe is already approved without waiting for every frame. The summary states what is outstanding — "6 images and 10 videos still to generate" — and that line goes into the Director's instructions too, so the reply closes on what it finished, what is left, and what the button will do.

The stage is computed twice per turn: once into the instructions the model reads (`pipelineInstructionBlock`, so the reply names the same step the button offers) and once *after* the run, from the state the run left behind, as a `suggested_actions` timeline block on the assistant message.

The button's intent text is sent back verbatim as a user message, so it passes through the same routing as anything typed. The wording of each intent is therefore load-bearing and deliberately chosen: "create … characters" would be read as a request for reference art, and "generate the image … assets" as entity art rather than a shot keyframe. `pipeline.test.ts` asserts each stage's intent lands on the path that stage needs.

In the UI, `ChatNextStep` renders the block at the **end of the chat** — after the messages, the generated media, and the approval cards — because a step only reads as the next step once the user can see everything it follows. It belongs to the newest reply, not the message it was stored on, and it hides while a run is in flight and while an approval card is pending, since that card is itself the next step.

## Character identity: art, never words

A referenced character's look is defined by their reference image. When a prompt *also* spells out hair, eyes, build, and wardrobe — the `CHARACTER / ASSET LOCK` block prompt writers like to open with — the model has two descriptions of the same person and follows the words, because words are what it reads first. That is what makes a face drift shot to shot despite a locked reference.

`src/lib/studio/prompt-sanitizer.ts` removes written identity and keeps the mentions, replacing a dropped block with `Cast in frame: @Ethan, @Lena.` so the cast still resolves. It handles prompts saved as one long paragraph as well as ones with line breaks — the earlier line-based version saw a single enormous line and stripped nothing.

It is applied in three places:

1. **On write**, so the block never reaches storage: `create_storyboard_batch`, `update_shot`, and `save_script_prompts` in `tool-registry.ts`.
2. **On the way to a provider**, for prompts that predate the rule: the chat keyframe path, `images/route.ts`, `videos/route.ts`, `execute-generation.ts`, and `submit_generation` prompts in `tool-service.ts`.
3. **On request**, when the user asks the chat to fix the saved prompts.

The Prompt Agent and Storyboard Agent instructions match: the Character/Asset Lock section is a cast list — the @tag and what that entity is doing — never a description. An entity with no reference art is handed back to the Character & Asset Agent to build, not papered over with a sentence.

A keyframe request also attaches **the shot's own cast**, not only the entities the user retyped with `@`. A bare "regenerate shot 1" names nobody, and sending no reference art at all was what returned a different face — the exact failure the reference library exists to prevent.

## Approvals are questions, and a reply answers them

A pending proposal used to stay pending for good: nothing generated, no way to resolve it, and every later reply queued behind an approval that was never coming.

Sending a message now withdraws that session's pending proposals. Replying instead of approving is an answer — the user is redirecting, not ignoring — so the card is retired, reads **“Withdrawn — you replied instead”**, states that nothing was generated and no credits were spent, and keeps its modify-and-regenerate route. The Director is told which proposals were withdrawn and that the message is the new brief. Only the conversation the message was typed in is affected.

Two related rules keep the next step visible:

- The next-step card is suppressed only by **the newest reply's own** approval. Suppressing on any pending proposal in the session meant one card left unanswered removed the next step from every reply after it.
- The **“Workflow is waiting for your approval”** note is written when a run ends and never rewritten, so it checks the live proposals and disappears once they are resolved.

## Continuity comes from the selected workflow

The Generation Workflow picker used to reach the model as advice and nothing more, so a plain “generate shot 3 video” rendered the shot cold even under **Video Reference**; continuity only happened when the user named the reference shot by hand.

Under **Video Reference** or **Elements Sequential** (`workflowContinuesFromPreviousClip`), a single-shot video request now continues from the previous shot's finished clip: the clip attached, `multi_image` mode, the target keyframe as the composition reference, and the prompt opened with the extend-from sentence — attaching a clip without that sentence gives the model a reference it does not know what to do with. Shot 1 never inherits, and a previous shot with no completed video falls back to reference images with the reply saying so. Under the keyframe and parallel workflows a shot renders on its own.

The storyboard's own video panel carries the same clip as a visible **motion reference**: a thumbnail of what the shot continues from, removable for a hard cut, and offered back as “Continue from shot N” when the previous shot has a finished video. Selecting an earlier generation restores the clip it used.

## What a generation actually sends

- **One image per entity — the chosen one.** An entity's other reference images are the attempts the user rejected, which is what the Choose button in Characters & Assets settles. The image and video models blend every reference into a single output, so sending the rejects averages the face the user picked with the ones they threw away.
- **The budget is spent on subjects, not on second opinions.** GPT Image takes 16 references; Seedance stays on 8. A large cast no longer loses its last members to a limit inherited from the video path.
- **A keyframe request attaches the shot's own cast**, not only the entities retyped with `@`. A bare “regenerate shot 1” names nobody, and sending no reference art at all returned a different face.
- **The job records what was sent.** `input_images` is written at creation with only the composition frames the request named; execution resolves the cast from the prompt and writes the real list back, so the shot's panel shows the same references the chat card promised and a failed job leaves a true record.

## Permission Model

| Action | Default behavior | Approval required |
| :--- | :--- | :--- |
| Read script, assets, storyboard, project status | Run immediately | No |
| Summarize, critique, brainstorm, rewrite draft in chat | Run immediately | No |
| Explicit script append/replace request handled by the script workflow | Save after the user gives the instruction; replacement needs clear confirmation | No additional proposal |
| Generate image because the user directly asked for an image | Run immediately, then show result in chat | No |
| Edit saved asset records, shot prompts, or storyboard structure through a tool | Create proposal card | Yes |
| Delete script sections, assets, shots, generated media, or jobs | Create proposal card | Yes |
| Generate video | Create proposal card with cost/model/shot preview | Yes |
| Generate video in full-auto mode | Run if full-auto is enabled and user has accepted mode guardrails | No per-job approval |
| Spend credits above configured project limit | Block or require extra confirmation | Yes |

Important distinction: image generation can be immediate only when the user clearly asks for it. If the agent merely suggests an image, it should show a proposal or ask a short confirmation question.

## Chat Modes

### Copilot

The default mode. The agent can read context, draft text, generate requested images, and prepare proposals. It cannot make persistent edits or generate video without explicit approval.

### Assisted Auto

The agent can apply low-risk workspace edits after showing a concise proposal. Video still requires approval. This is useful for batch script cleanup, shot prompt updates, and storyboard organization.

### Full Auto

The user opts in at project level. The agent can execute the full production workflow from prompt to assets, storyboard images, video jobs, and revisions within configured guardrails.

Full-auto should require:

- explicit user opt-in
- credit cap
- allowed model/provider set
- max jobs per run
- destructive actions disabled unless separately approved
- audit log for every action

## Workflow Skills

The chat agent should expose workflow skills as structured tools, not free-form database access.

### Project Skill

- inspect current project
- update creative brief
- update production mode
- explain current status and blockers

### Script Skill

- read current script
- create script draft
- propose script edit
- apply approved script edit
- split script into scenes
- delete or restore script sections through proposal flow

### Asset Skill

- inspect characters, props, locations, voices, and reference images
- create asset records
- edit asset descriptions and metadata
- generate requested asset image immediately
- register generated image as reference
- delete or replace asset records through proposal flow

### Storyboard Skill

- inspect shots and referenced entities
- create or reorder shots
- edit shot prompt, framing, duration, aspect ratio, and continuity notes
- generate requested storyboard image immediately
- attach selected image to a shot
- delete shots or generated media through proposal flow

### Video Skill

- estimate video generation credits
- propose video generation for selected shots
- submit approved video jobs
- poll job status
- attach completed video to the shot
- propose regeneration when results fail continuity or quality checks

### Review Skill

- compare generated image/video with script and continuity
- flag visual drift, missing assets, wrong aspect ratio, or prompt mismatch
- create revision proposal
- preserve locked approved assets unless user explicitly unlocks them

### Voice Skill

- start Realtime voice session with the same director instructions as text chat
- keep permanent OpenAI credentials server-only
- provide project-aware spoken guidance and a server-issued short-lived Realtime credential
- expose the full Director tool registry to the Realtime session; the browser relays each model function call to the authenticated `POST /director/tools` endpoint, so voice tool calls pass through the same Zod validation, ownership checks, approval proposals, credit charges, and audit records as text chat
- approval-required voice tool calls create the same proposal cards in the Studio chat panel; the voice agent tells the user to approve them there, and nothing is applied until they do
- tool results are returned to the Realtime session as `function_call_output` items so the agent can speak the outcome; the workspace and credit badge refresh after each executed tool

## Chat UX Contract

The chat panel should render more than plain text.

- assistant text messages for normal guidance
- proposal cards with title, summary, affected objects, estimated credits, and Approve/Reject buttons
- image result cards with thumbnail, prompt, model, provider, and actions like Use for Shot or Add to Asset
- video proposal cards with shot list, duration, model, provider, credit estimate, and approval controls
- generation status cards for queued, processing, completed, failed, and cancelled jobs
- audit chips for applied edits, deleted content, credit deductions, and full-auto actions
- a single **Next step** card pinned to the end of the conversation, labelled with what it will do and marked when it spends credits
- a generation card that carries **one prompt per shot**, with a shot tab each when a batch covers several. Reading only the first prompt and sending it back for every shot rendered the first shot's scene under all of their numbers, and the card showed nothing that would reveal it

The user should never have to leave chat to understand what the agent is about to change or generate.

The Director never answers with directions for the user to click through the workspace — "open the Storyboard tab", "press Generate". It holds the tools; it does the work and reports what it did, then closes on the one next step. The open episode is part of that continuity: it is stored per project and mirrored into the URL as `?episode=…`, restored before the first fetch, so a reload returns to the episode the user was working in rather than to whichever one the server lists first.

## Backend Mapping

Existing pieces already align with this design:

- `src/app/api/studio/projects/[projectId]/director/chat/route.ts`
- `src/app/api/studio/projects/[projectId]/director/tools/route.ts`
- `src/app/api/studio/projects/[projectId]/director/proposals/[proposalId]/route.ts`
- `src/app/api/studio/projects/[projectId]/voice/session/route.ts`
- `src/app/api/studio/projects/[projectId]/images/route.ts`
- `src/app/api/studio/projects/[projectId]/videos/route.ts`
- `src/app/api/studio/projects/[projectId]/workspace/route.ts`
- `src/lib/studio/tool-registry.ts`
- `src/lib/studio/tool-service.ts`
- `src/lib/studio/conversation.ts`
- `src/lib/studio/project-context.ts`
- `src/lib/studio/pipeline.ts` — the stage machine and the next-step action
- `src/lib/studio/project-state-summary.ts` — loads the snapshot both the instructions and the button read
- `src/lib/studio/prompt-sanitizer.ts` — identity stripping
- `src/lib/studio/director-team.ts` — the agent roles and the order they hand off in

Implemented components:

1. Project ownership checks, model validation, project-scoped `@mentions`, contextual instructions, and conversation history.
2. Direct image workflows, bulk entity-reference generation, media timeline cards, entity/shot persistence, durable failed-attempt blocks, and additive image history.
3. Proposal cards for costly and write/destructive tools, with approval/rejection handling and tool/audit records.
4. Image/video generation endpoints with server-side credit accounting, automatic failed-request refunds, and immediate badge synchronization.

5. Realtime voice sessions declare the Director tool registry, relay function calls through the validated tools endpoint, and honor the same approval cards as text chat.

6. A pipeline stage machine that ends every turn on one next-step button, one stage per turn, shot by shot for keyframes and clips.
7. Identity stripping on write, on the way to every provider, and on request, with agent instructions rewritten to stop producing the block in the first place.

Remaining increments:

1. Execute approved proposal jobs through a durable provider worker/webhook path and complete their lifecycle in the timeline.
2. Add regression tests for direct-chat credits, badge events, approval boundaries, provider failure/refund UI, and destructive operations.
3. Replace or formally retire the legacy `creator_credit_accounts` reservation subsystem after data migration/audit.
4. Bind each `@mention` to the reference image slot it is attached to. Seedance binds positionally — `@Image1`, `@Video1` — while our prompts name entities (`@Ethan`), so a mention may not be resolving to any specific attached image. Third-party guides describe the syntax and the limits (9 images, 3 videos, 3 audio, 12 files, 15s); BytePlus's own pages render client-side and could not be read, so the index convention is unverified and was deliberately not shipped. GPT Image has no equivalent syntax at all — inputs are an ordered `image[]` array read contextually.
5. Carry shot media across a storyboard rebuild. `create_storyboard_batch` with `replaceExisting` deletes the shot rows, which drops keyframes and orphans their generation history onto dead shot ids.

## Safety Rules

- The agent may not silently delete user content.
- The agent may not claim generation succeeded until the provider confirms completion.
- The agent may not spend video credits without approval unless full-auto is enabled.
- The agent may generate images immediately only after a direct user request.
- Locked or approved assets remain preserved during unrelated revisions.
- Every persistent write, deletion, generation, and credit event must be auditable.

## Suggested Build Order

1. Finish durable execution of approved generation jobs and status callbacks.
2. Add regression tests for approval boundaries, credit use, badge updates, and destructive operations.
3. Expand refund and failed-block coverage to any new provider route as it is added.
