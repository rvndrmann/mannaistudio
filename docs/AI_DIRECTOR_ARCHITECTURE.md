# AI Director Hub architecture
/Users/apple/Downloads/upto june all 2026/june- next-2026/HOLD/all websites/mannaistudio/docs/AI_DIRECTOR_ARCHITECTURE.md
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

The Studio chat selector reads active models from `site_settings.ai_director_models`. Defaults are `gpt-5.6`, `gpt-5.6-luna`, `gpt-5.6-terra`, `gpt-5.5`, `gemini-3.6-flash`, `gemini-3.6-pro`, `gemini-2.0-flash`, `kimi-2.5`, `deepseek-v4`, `glm-5.2`, `dola-seed-2-1-turbo`, and `dola-seed-2-0`. `OPENAI_DIRECTOR_MODEL` sets the preferred server fallback when no model is supplied by the browser. 

The AI Director natively supports **BytePlus Ark** for chat completion models (Kimi, DeepSeek, GLM, Dola Seed) utilizing the `BYTEPLUS_ARK_BASE_URL` and `ARK_API_KEY`, routing these requests to the OpenAI-compatible BytePlus `/chat/completions` API instead of OpenAI.

Admins can pause or rerun models in the Admin AI Models panel; paused models are hidden from the Studio selector and rejected by the server route.

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

Costly tools must declare `requiresApproval: true`. Approved Director generation and direct Studio generation both use the atomic `deduct_user_credits` RPC against `profiles.credits_balance`, the same balance displayed by the global credit badge. Provider requests are submitted only after that debit succeeds.

## Generation lifecycle

`creator_generation_jobs` stores provider-neutral requests, routing decisions, provider identifiers, estimates, actual use, results, errors, and lifecycle timestamps. `creator_generation_job_events` provides status history.

The asset and storyboard image workspaces support `gpt-image-2` and `gpt-image-1.5` through an authenticated server route. Results are uploaded to the existing private `creator-studio-media` bucket and written back to the selected asset or shot. A missing `OPENAI_API_KEY` produces an explicit configuration error; no fake output is generated.

The image workspaces also support BytePlus Seedream 5.0 Pro (`dola-seedream-5-0-pro-260628`), fal.ai Flux 3 (`fal-flux-3`), Flux Dev (`fal-flux-dev`), Flux Realism (`fal-flux-realism`), and Google AI Studio Nano Banana 2 (`google-nano-banana-2`).

Every completed debit response includes `creditBalance`. The Studio broadcasts it to mounted credit badges immediately; failed generation requests force a fresh balance read so the UI stays correct even when a provider fails after charging.

### Entity references, aspect ratio, and recovery

- `@mentions` resolve to project-scoped entity IDs in Director chat, character/asset image prompts, storyboard keyframes, and video prompts. The server validates every mentioned entity before adding its description and selected reference images to provider input.
- A request such as **“Create all missing character images”** is routed as one image request per entity, never as a contact sheet. Each completed image is appended to that entity's `reference_images` and appears in **Characters & Assets**.
- The selected project visual style is appended at the provider boundary. `Realistic - Photorealistic` explicitly requests live-action photography and rejects anime, illustrations, cartoons, CG, collages, labels, and text overlays.
- OpenAI image canvas selection follows the requested composition: landscape requests including `16:9` use `1536x1024`, portrait requests including `9:16` use `1024x1536`, and `1:1` uses `1024x1024`. GPT Image's native landscape canvas is 3:2, so 16:9 is composed as widescreen but is not pixel-exact at the provider level.
- Asset-image requests persist `metadata.image_generation.status` as `generating`, `completed`, or `failed`. Returning to the asset tab therefore retains visible progress and polls until the generated reference image is saved.

### Studio project gallery

`GET /api/studio/projects` returns a signed `gallery_images` collection for each owned project. The collection is built from saved character reference images first, followed by scene and prop references; the project cover image is only a fallback. The Studio home uses this collection in a horizontally scrollable, arrow-controlled project gallery.

### Home navigation and external access

The public home page uses the global primary navigation only; the duplicate Image/Video/AI Director quick-tool bar was removed to prevent header overlap. Authenticated users see **MCP & CLI** directly after **Billing** in that primary navigation. It opens the active `/studio/external` page, where users can create/revoke scoped external tokens and copy either an MCP server configuration or CLI setup instructions for supported clients.

Storyboard video generation supports:
- **Google AI Studio**: Veo 3.1 (`google-veo-3-1`), Gemini 2.5 Pro (`google-gemini-2-5-pro`), Omni Flash (`google-omni-flash`).
- **fal.ai Provider**: Seedance 2.5 (`fal-seedance-2-5`), Seedance 2.0 (`fal-seedance-2-0`), Seedance 2.0 Fast (`fal-seedance-2-0-fast`), Seedance 2.0 Mini (`fal-seedance-2-0-mini`), Kling 3 (`fal-kling-3`), Kling O3 (`fal-kling-o3`), Kling 1.6 Pro (`fal-kling-1-6-pro`), MiniMax H3 (`fal-minimax-h3`), MiniMax Video-01 (`fal-minimax-video-01`), Hunyuan Video (`fal-hunyuan-video`), Luma Dream Machine (`fal-luma-dream-machine`).
- **BytePlus Direct**: Seedance 2.5 (`dreamina-seedance-2-5-260628`), Seedance 2.0 (`dreamina-seedance-2-0-260128`), Fast (`dreamina-seedance-2-0-fast-260128`), and Mini (`dreamina-seedance-2-0-mini-260615`).

For complete AI Social Media + Advertising Agent architecture, see [`docs/MARKETING_AGENT_ARCHITECTURE.md`](file:///Users/apple/Downloads/upto%20june%20all%202026/june-%20next-2026/HOLD/all%20websites/mannaistudio/docs/MARKETING_AGENT_ARCHITECTURE.md).

## Continuity

Continuity combines approved reference assets, entity metadata, scoped facts, locked fields, and user review. Conflicting facts create warnings or blocking issues. Prompting alone is never treated as a guarantee of visual continuity.

## Voice architecture

Text and voice share project context and workflow instructions. The browser requests an authenticated, short-lived OpenAI Realtime client secret from the server, then creates a WebRTC connection directly to OpenAI. The permanent `OPENAI_API_KEY` stays server-only. Database records track session and usage metadata without storing permanent credentials.

Realtime voice tool execution is not yet connected to the Director tool registry. It can discuss the active project but cannot currently create assets, write a storyboard, or submit generation jobs by voice. When added, realtime calls must use the same validated tool service and approval UI as text chat.

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
