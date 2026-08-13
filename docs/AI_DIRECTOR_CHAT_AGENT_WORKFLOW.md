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

## Current Implemented Flow

```text
User message (+ optional @mentions)
        |
        v
Project ownership, feature, model, and entity validation
        |
        +-- Direct image intent --------------------------+
        |                                                  |
        |                                      Atomic credit debit
        |                                                  |
        |                                      Provider image request
        |                                                  |
        |                              Save image to entity or shot
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
```

### 1. Context and mention resolution

The Studio sends the selected episode, session, message, and `@mentioned` entity IDs to `POST /api/studio/projects/:projectId/director/chat`. The server verifies that the user owns the project and every mentioned character, scene, or prop belongs to it. It then supplies the entity descriptions and selected reference images to the relevant prompt.

### 2. Deterministic workflow routing before model chat

The chat route handles several high-confidence requests directly before falling back to the text agent:

- Script write/append/replace requests update the stored script through the workflow route.
- **“Create all missing character images”** and related bulk requests generate one reference image per matching entity, then save it to that entity’s `reference_images`.
- Direct image/keyframe requests generate a GPT Image 2 output, save it to Studio storage, and attach it to the named storyboard shot when one was requested.
- Video requests create an approval proposal; they do not submit a video until the user approves.
- All other production questions pass to `runDirectorAgent`, which receives the selected workflow, project context, session history, global admin instructions, and current runtime settings.

### 3. Generation, credits, and feedback

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

The user should never have to leave chat to understand what the agent is about to change or generate.

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

Implemented components:

1. Project ownership checks, model validation, project-scoped `@mentions`, contextual instructions, and conversation history.
2. Direct image workflows, bulk entity-reference generation, media timeline cards, entity/shot persistence, durable failed-attempt blocks, and additive image history.
3. Proposal cards for costly and write/destructive tools, with approval/rejection handling and tool/audit records.
4. Image/video generation endpoints with server-side credit accounting, automatic failed-request refunds, and immediate badge synchronization.

5. Realtime voice sessions declare the Director tool registry, relay function calls through the validated tools endpoint, and honor the same approval cards as text chat.

Remaining increments:

1. Execute approved proposal jobs through a durable provider worker/webhook path and complete their lifecycle in the timeline.
2. Add regression tests for direct-chat credits, badge events, approval boundaries, provider failure/refund UI, and destructive operations.
3. Replace or formally retire the legacy `creator_credit_accounts` reservation subsystem after data migration/audit.

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
