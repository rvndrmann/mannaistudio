# Session Handoff — 2026-08-10

## Studio and AI Director credit deductions

Unified Studio and AI Director credit deductions onto the atomic
`deduct_user_credits` RPC, with immediate credit badge synchronization.

All of these use the atomic `deduct_user_credits` RPC and save a credit-transaction
row, so every charge is auditable.

Credits are deducted before submitting an image/video provider request. A provider
failure does not silently restore the balance; the failure is surfaced and the
current saved balance is refreshed. Any refund policy should be implemented
explicitly as a separate, auditable credit transaction.

## Chat Agent Workflow Documentation

`docs/AI_DIRECTOR_CHAT_AGENT_WORKFLOW.md` now distinguishes what is already live
from what remains on the roadmap. It documents the text-chat request flow from
`@mention` validation through deterministic image/video routing, proposal approval,
one-ledger credit charging, result persistence, and chat/badge feedback.

## Voice Director tool calling

The Realtime voice agent now ships the same tool definitions as text chat, and the
browser bridges Realtime function calls to the validated tool endpoint.
Approval-gated tools still raise their approval card in the chat panel, so voice
cannot bypass the confirmation boundary. Voice tool calls are parsed by a tested
helper that accepts both Realtime event shapes, and each spoken action is mirrored
into the chat timeline with its status and any approval card.

The voice session route now also loads the admin's global instructions and runtime
settings, which previously reached only the text agent.

**Not yet verified against a live Realtime connection.** The parsing and timeline
logging are unit-tested, but no spoken session has driven a tool end to end.

## Director vision

The Director previously received storage paths as text and had never seen the
images it was reasoning about. `collectDirectorVisionAttachments` now resolves
mentioned entities' reference art, recent chat uploads, and existing shot
keyframes into signed URLs and attaches them to the user turn as image content.
The `@mention` block also reports how many reference images each entity has, so
the agent can tell finished assets from empty ones without spending a tool call.

## Teams, sharing, and enterprise

See [`TEAMS_SHARING_AND_ENTERPRISE.md`](TEAMS_SHARING_AND_ENTERPRISE.md) for the
full design. In summary:

- Teams with owner/admin/member/viewer roles, members added by registered email.
- A two-stage credit model: personal balance ↔ team pool ↔ member.
- Per-project sharing, with viewers read-only and edit rights split across
  separate RLS policies.
- Enterprise orders priced per finished minute, rate editable in admin, each
  order storing the rate it was quoted at.
- Accepting an order puts the client's project in the admin's Studio, labelled
  with the client's name.
- Change attribution recording whether the client or the production team made
  each edit.

## Fixes

- Approval cards were project-scoped and leaked into every new chat; they are now
  filtered to the session that created them.
- Creating a chat blanked the workspace to a full-screen loader and fetched twice.
- The credits modal rendered inside the navbar's `backdrop-filter` ancestor, which
  anchored the fixed overlay to the navbar box and pushed its header off screen.
  It now renders through a portal.
- The change-attribution trigger referenced `new.script_content` in a condition
  guarded by `tg_table_name`. PL/pgSQL compiles the whole expression, so the field
  was resolved for tables without that column and the write itself failed. Caught
  in testing before release.

## Validation performed

- `npm run typecheck` — passed.
- `npx vitest run` — 72 passed.
- `npm run lint` — unchanged at the existing baseline.
- Row level security exercised against a second real account for sharing, viewer
  restrictions, team removal, and enterprise admin access, with all test data
  removed afterwards.

## Open items

- **`submit_generation` charges credits for jobs nothing executes.** It inserts
  rows at status `approved` and no worker consumes that state. One video job has
  been sitting at `approved` since 8 August. Either build the worker or route the
  tool into the generation paths that already work.
- Realtime voice tool calling is unverified against a live session.
- Specialist instructions are still selected by regex on the user's message rather
  than by the work being done.
