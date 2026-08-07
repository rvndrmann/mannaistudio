# AI Director Hub architecture

## Compatibility contract

- `creator_projects` remains the canonical project table.
- Existing projects default to `production_mode = legacy` and do not require conversion.
- Existing episodes, script JSON, entities, shots, media paths, and Studio routes remain supported.
- New production modes and AI capabilities are disabled by default through `site_settings.studio_features`.
- Database migrations are additive. No existing column or table is removed.
- The old `studio_*` schema is intentionally retained until deployed usage is audited.

## Feature flags

The `studio_features` setting contains:

- `production_modes_enabled`
- `ai_director_text_enabled`
- `ai_director_tools_enabled`
- `generation_jobs_enabled`
- `voice_director_enabled`
- `series_hierarchy_enabled`
- `continuity_checks_enabled`
- `auto_model_routing_enabled`
- `studio_export_enabled`

Enable flags gradually after migrations and authenticated smoke tests. Generation and voice should remain disabled until their providers and usage accounting are configured.

## Required environment variables

Existing variables remain required:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_PLAN_ID=
RAZORPAY_WEBHOOK_SECRET=
BLOG_INGEST_SECRET=
```

Future AI text and voice activation requires a server-only credential:

```env
OPENAI_API_KEY=
OPENAI_DIRECTOR_MODEL=gpt-5.6
OPENAI_REALTIME_MODEL=gpt-realtime-2.1
ARK_API_KEY=
# Optional region override. Defaults to ap-southeast-1.
BYTEPLUS_ARK_BASE_URL=https://ark.ap-southeast.bytepluses.com/api/v3
```

The Studio chat selector reads active models from `site_settings.ai_director_models`. Defaults are `gpt-5.6`, `gpt-5.6-luna`, `gpt-5.6-terra`, and `gpt-5.5`. `OPENAI_DIRECTOR_MODEL` sets the preferred server fallback when no model is supplied by the browser. Admins can pause or rerun models in the Admin AI Models panel; paused models are hidden from the Studio selector and rejected by the server route.

Never prefix the permanent OpenAI key with `NEXT_PUBLIC_`. A voice provider must exchange it for a short-lived session credential on the server. The browser may receive only that ephemeral credential.

Generation-provider credentials will be server-only and provider-specific. They must not be stored in project records or sent to the browser.

## Tool security

The AI Director does not write directly to tables. Requests pass through:

1. Authenticated user lookup
2. Project ownership verification
3. Feature flag and rate-limit checks
4. Zod input validation
5. Tool risk classification
6. Persisted proposal for write, costly, or destructive actions
7. Explicit authenticated approval
8. Domain handler execution
9. Tool and audit records

Costly tools must declare `requiresApproval: true`. Generation also requires an atomic credit reservation. Provider workers must process only jobs with a valid reservation.

## Generation lifecycle

`creator_generation_jobs` stores provider-neutral requests, routing decisions, provider identifiers, estimates, actual use, results, errors, and lifecycle timestamps. `creator_generation_job_events` provides status history.

The asset and storyboard image workspaces support `gpt-image-2` and `gpt-image-1.5` through an authenticated server route. Results are uploaded to the existing private `creator-studio-media` bucket and written back to the selected asset or shot. A missing `OPENAI_API_KEY` produces an explicit configuration error; no fake output is generated.

The same image workspaces also support BytePlus Seedream 5.0 Pro (`dola-seedream-5-0-pro-260628`). Storyboard video generation supports BytePlus Seedance 2.5 (`dreamina-seedance-2-5-260628`) plus Seedance 2.0, Fast, and Mini through asynchronous ModelArk tasks. Seedance 2.5 requests may use up to 30 seconds, while Seedance 2.0 variants remain capped at 15 seconds. `ARK_API_KEY` remains server-only, provider outputs are copied into the existing private studio bucket, and generation job/provider status is persisted before a shot is marked complete.

## Continuity

Continuity combines approved reference assets, entity metadata, scoped facts, locked fields, and user review. Conflicting facts create warnings or blocking issues. Prompting alone is never treated as a guarantee of visual continuity.

## Voice architecture

Text and voice share project context, messages, tools, proposals, and audit logs. The browser requests an authenticated, short-lived OpenAI Realtime client secret from the server, then creates a WebRTC connection directly to OpenAI. The permanent `OPENAI_API_KEY` stays server-only. Database records track session and usage metadata without storing permanent credentials.

## Verification commands

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Full lint currently exposes pre-existing errors outside the Studio work. Scoped Studio lint should remain error-free while those are addressed separately.

## Migration rollout

1. Back up the linked database.
2. Review `supabase db diff` against a staging project.
3. Apply migrations to staging in timestamp order.
4. Verify legacy project loading with every new flag disabled.
5. Enable `production_modes_enabled` for internal testing.
6. Enable tools only after proposal/RLS smoke tests.
7. Fund a test credit account and verify reservation, rejection, release, and insufficient-credit paths.
8. Configure one provider and enable generation for internal users only.
9. Enable text and voice independently.

## Manual regression checklist

- Google login and callback still create/update a profile.
- `/studio` lists existing projects.
- A legacy prompt creates a project, Episode 1, and chat session.
- Existing scripts, entities, shots, uploads, storyboard, and timeline load.
- Course, portfolio, billing, admin, and public routes still load.
- Production mode query links preselect the intended mode when the flag is enabled.
- Write tools show a proposal and do not mutate before approval.
- Rejected proposals do not mutate project data.
- Cross-user project, entity, shot, proposal, job, and revision IDs are rejected.
- Insufficient credits produce no processable job.
- Provider failures never appear as successful generations.
- Existing approved assets remain locked during unrelated revisions.
- No permanent AI or provider key appears in browser source, responses, or logs.

## Known limitations

- `OPENAI_API_KEY` must be configured before live text chat, GPT Image, or Realtime voice can be exercised.
- Image reference files are stored and tracked, but the first OpenAI image release uses the text-generation endpoint; reference-image editing support is the next image-provider increment.
- Migrations have not been pushed to the linked production project.
- A long-running provider worker/webhook deployment is still required.
- Export assembly is intentionally unavailable until real completed assets exist.
- Full-repository ESLint has unrelated pre-existing failures.
