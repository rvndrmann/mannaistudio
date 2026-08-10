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
