# Session Handoff — August 10, 2026

## Credit Accounting and Badge Synchronization

The Studio now uses `profiles.credits_balance` as the single balance shown to users and charged by generation flows.

### Covered generation paths

- Direct character/asset image generation (`POST /api/studio/projects/:projectId/images`).
- Direct storyboard keyframe image generation.
- Direct storyboard video submission (`POST /api/studio/projects/:projectId/videos`).
- AI Director chat image requests using GPT Image 2.
- AI Director chat bulk character/asset reference-image requests.
- AI Director costly generation proposals after the user presses **Approve**.

All of these use the atomic `deduct_user_credits` RPC and save a credit-transaction entry. The previous proposal-only `creator_credit_accounts` reservation route is no longer used for new Director approvals because it was a separate, unsynchronised ledger and could leave the top badge unchanged.

### UI synchronization

- Generation endpoints return `creditsCharged` and `creditBalance` after a successful debit.
- `src/lib/credit-balance-events.ts` broadcasts the returned balance to every mounted `CreditBadge`.
- On any generation or proposal failure, the badge immediately re-fetches `/api/credits`. This captures a debit that occurred before a provider or storage failure.
- The existing 15-second poll remains only as a fallback.

### Important operational detail

Credits are deducted before submitting an image/video provider request. A provider failure does not silently restore the balance; the failure is surfaced and the current saved balance is refreshed. Any refund policy should be implemented explicitly as a separate, auditable credit transaction.

## Chat Agent Workflow Documentation

`docs/AI_DIRECTOR_CHAT_AGENT_WORKFLOW.md` now distinguishes what is already live from what remains on the roadmap. It documents the text-chat request flow from `@mention` validation through deterministic image/video routing, proposal approval, one-ledger credit charging, result persistence, and chat/badge feedback.

## Voice Director Tool Execution

The Realtime voice director can now execute the same Director tools as text chat. The voice session endpoint declares the full tool registry (`directorFunctionDefinitions()`) plus project/episode-scoped tool instructions in the Realtime session. When the model emits a `function_call`, the Studio client relays it to the authenticated `POST /director/tools` endpoint — the identical validated path text chat uses — so ownership checks, Zod input validation, approval proposals, atomic credit deduction, rate limits, and audit events all apply unchanged. Approval-required calls surface the standard proposal cards in the chat panel; the result is sent back to the Realtime session as a `function_call_output` so the agent can speak the outcome, and the workspace plus credit badge refresh after each call.

## Validation performed

- `npm run typecheck` — passed.
- `npx vitest run src/lib/studio/routing-revisions.test.ts` — 6 tests passed.
- `npm run build` — passed.
- Targeted ESLint returned no errors (only pre-existing workspace warnings).

## Files changed in this handoff

- `src/app/api/studio/projects/[projectId]/director/chat/route.ts`
- `src/app/api/studio/projects/[projectId]/images/route.ts`
- `src/app/api/studio/projects/[projectId]/videos/route.ts`
- `src/app/studio/project/[projectId]/page.tsx`
- `src/components/CreditBadge.tsx`
- `src/lib/credit-balance-events.ts`
- `src/lib/studio/tool-registry.ts`
- `src/lib/studio/tool-service.ts`
