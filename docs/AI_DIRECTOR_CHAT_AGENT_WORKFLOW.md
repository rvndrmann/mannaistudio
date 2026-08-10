# AI Director Chat Agent Workflow

## Goal

Build the Studio chat agent as the user's primary production controller. The agent should understand the whole project workspace, help plan creative decisions, and operate on scripts, assets, storyboard images, and videos through a controlled tool workflow.

The agent must feel like the AI Director already described in the platform, but with concrete workspace powers:

- read project context, script, assets, storyboard, generation jobs, and approval history
- write and edit script content, asset metadata, shot prompts, storyboard keyframes, and video generation requests
- delete or replace workspace content when explicitly approved
- show proposed work inside chat before applying sensitive changes
- generate images directly when the user asks for image generation
- require approval before video generation unless the project is in full-auto mode
- support voice control through the OpenAI Realtime voice director

## Permission Model

| Action | Default behavior | Approval required |
| :--- | :--- | :--- |
| Read script, assets, storyboard, project status | Run immediately | No |
| Summarize, critique, brainstorm, rewrite draft in chat | Run immediately | No |
| Generate image because the user directly asked for an image | Run immediately, then show result in chat | No |
| Edit saved script, saved asset records, shot prompts, storyboard structure | Create proposal card | Yes |
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
- let voice commands create the same proposals and tool calls as text
- keep permanent OpenAI credentials server-only
- show transcript, proposed actions, generated media, and approvals in the chat timeline

## Chat UX Contract

The chat panel should render more than plain text.

- assistant text messages for normal guidance
- proposal cards with title, summary, affected objects, estimated credits, and Approve/Reject buttons
- image result cards with thumbnail, prompt, model, provider, and actions like Use for Shot or Add to Asset
- video proposal cards with shot list, duration, model, provider, credit estimate, and approval controls
- generation status cards for queued, processing, completed, failed, and cancelled jobs
- audit chips for applied edits, deleted content, credit reservations, and full-auto actions

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

Needed increments:

1. Add tools for script edits, asset edits/deletes, shot edits/deletes, direct image generation, media attachment, video status inspection, and full-auto runs.
2. Extend director chat responses so the model can request tools or emit structured action proposals instead of only returning text.
3. Persist proposal and generation references into `creator_chat_messages` metadata, or add a companion table for chat timeline attachments.
4. Render proposal/media/status cards in the Studio chat UI.
5. Add full-auto settings to project metadata or a dedicated automation table.
6. Add tests proving video generation cannot bypass approval outside full-auto mode.

## Safety Rules

- The agent may not silently delete user content.
- The agent may not claim generation succeeded until the provider confirms completion.
- The agent may not spend video credits without approval unless full-auto is enabled.
- The agent may generate images immediately only after a direct user request.
- Locked or approved assets remain preserved during unrelated revisions.
- Every persistent write, deletion, generation, and credit event must be auditable.

## Suggested Build Order

1. Add chat timeline attachments for proposals, images, videos, and tool executions.
2. Add missing director tools for script, asset, storyboard, and media operations.
3. Update chat route to support structured tool requests.
4. Render proposal cards and generated media inside chat.
5. Wire direct image generation from chat.
6. Wire video generation proposal approval from chat.
7. Add full-auto mode settings and guardrails.
8. Connect voice commands to the same text/tool workflow.
9. Add regression tests for approval boundaries, credit use, and destructive operations.

