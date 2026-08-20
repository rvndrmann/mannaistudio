# AI Director Hub — System Documentation

Welcome to the documentation directory for **AI Director Hub** & **AI Social Media + Advertising Agent**.

## Documentation Files

| Document | Description |
| :--- | :--- |
| [`SESSION_HANDOFF_2026-08-20.md`](SESSION_HANDOFF_2026-08-20.md) | Bring Your Own Keys end to end, and the bugs found underneath it: media invisible on shared and admin projects, a partial prompt match dropping a shot's cast, shots set nowhere, three refund paths that could mint credits, and generation unreachable through chat because the instructions told the model not to make the call that creates the approval card. |
| [`QUICK_CREATE.md`](QUICK_CREATE.md) | Generating one image or clip with no production attached: why it has a table of its own rather than widening the job table's RLS to share one, why the refund key cannot be derived from the row it refunds, what the storyboard path composes into a prompt that this one deliberately does not, and the connected-Gemini-key bug the cost display had all along. |
| [`BYOK_PROVIDER_KEYS.md`](BYOK_PROVIDER_KEYS.md) | Customers' own provider keys: the vault PostgREST cannot see, envelope encryption under Cloud KMS, the three billing layers and why the separation is per provider, how a credential reaches a provider without a call site being able to forget it, and what is still unverified. |
| [`INSTAGRAM_AGENT_BRIEF.md`](INSTAGRAM_AGENT_BRIEF.md) | The knowledge base the Instagram DM agent answers from — the pitch, what the product actually does, and prices — pulled from live product code so it cannot invent a feature. |
| [`SESSION_HANDOFF_2026-08-19.md`](SESSION_HANDOFF_2026-08-19.md) | The script approval gate — **since removed**, because nothing could set an episode to approved and the production wedged on Script. Also asset image jobs joining workspace polling, so a character card shows generation progress and a failure state instead of sitting still, which is still current. |
| [`SESSION_HANDOFF_2026-08-18.md`](SESSION_HANDOFF_2026-08-18.md) | A shared design system for type, radius, motion and material; the studio made usable on a phone, including the Director chat that did not exist below 1280px and editors that could not scroll; a live activity log so a long run stops reading as a hang; and the next-step offer that sent shot 7's request to shot 11. Also what the verification kept getting wrong. |
| [`APPLE_DESIGN_PLAN.md`](APPLE_DESIGN_PLAN.md) | The six-phase plan the design system came from — tokens, typography, materials and depth, motion, the gesture layer, and accessibility — with what each phase is worth and what is deliberately not being done. Phase 5 is still open. |
| [`SESSION_HANDOFF_2026-08-15.md`](SESSION_HANDOFF_2026-08-15.md) | The episode master prompt every other prompt is extracted from, shot video prompts as timed beats separate from the image prompt, runtime derived from what happens in a shot, locations carried forward, cross-episode continuity, and closing out Director runs whose server died mid-flight. |
| [`SESSION_HANDOFF_2026-08-14.md`](SESSION_HANDOFF_2026-08-14.md) | Deterministic routing for redo and skip requests, per-shot prompts on batch approval cards, the next-step button surviving in-flight and abandoned jobs, workflow-driven continuity, and the Seedance asset registry. |
| [`SESSION_HANDOFF_2026-08-13.md`](SESSION_HANDOFF_2026-08-13.md) | Durable generation blocks for failed/in-progress image attempts, additive storyboard image history, failed-request credit refunds, BytePlus Seedance adaptive-ratio video references, plus the chat production pipeline with its next-step button, identity stripping so reference art outranks written description, and the project image-quality setting. |
| [`SEEDANCE_ASSET_LIBRARY.md`](SEEDANCE_ASSET_LIBRARY.md) | The account-wide 50-image BytePlus asset library, why registration is what clears Seedance's real-person check, the registry that stopped it filling within hours, and what deletion does and does not touch. |
| [`SESSION_HANDOFF_2026-08-12.md`](SESSION_HANDOFF_2026-08-12.md) | Unified storyboard generation block UI, and the approval card styling shared with Character Assets. |
| [`SESSION_HANDOFF_2026-08-10.md`](SESSION_HANDOFF_2026-08-10.md) | Unified credit deductions, Voice Director tool calling, Director vision, teams and enterprise, and the open items left behind. |
| [`TEAMS_SHARING_AND_ENTERPRISE.md`](TEAMS_SHARING_AND_ENTERPRISE.md) | Teams and roles, the two-stage team credit model, per-project sharing and how row level security enforces it, enterprise engagements, and change attribution. |
| [`VIDEO_TAIL_REFERENCE.md`](VIDEO_TAIL_REFERENCE.md) | **On hold.** Seedance video references and why trimming a reference clip to its closing seconds needs infrastructure Netlify cannot host, with the options and what to test first. |
| [`SESSION_HANDOFF_2026-08-09.md`](SESSION_HANDOFF_2026-08-09.md) | Summary of AI Credit System, Razorpay credit top-ups, combined transaction history (paid/cancelled/failed), course pause feature, and site feature pause controls. |
| [`SESSION_HANDOFF_2026-08-08.md`](SESSION_HANDOFF_2026-08-08.md) | Summary of AI Social Media + Advertising Agent, BytePlus Seedream/Seedance 2.5, character asset pipeline, and dark minimal UI redesign. |
| [`AI_DIRECTOR_MCP_AND_CLI.md`](AI_DIRECTOR_MCP_AND_CLI.md) | External access tokens, CLI, and MCP server setup so ChatGPT/Claude-style clients can talk to the AI Director agent. |
| [`AI_DIRECTOR_CHAT_AGENT_WORKFLOW.md`](AI_DIRECTOR_CHAT_AGENT_WORKFLOW.md) | Chat-first AI Director workflow for script, assets, storyboard images, video approvals, full-auto mode, and voice control — including the production pipeline stage machine, the next-step button, and how character identity stays with the reference art. |
| [`MARKETING_AGENT_ARCHITECTURE.md`](MARKETING_AGENT_ARCHITECTURE.md) | Comprehensive architecture for the AI Social Media + Advertising Agent (UI modules, provider abstractions, guardrails, and database tables). |
| [`AI_DIRECTOR_ARCHITECTURE.md`](AI_DIRECTOR_ARCHITECTURE.md) | Studio generation pipeline, multi-provider model routing (Google AI Studio, fal.ai, BytePlus, OpenAI), and credit lifecycle. |
| [`SESSION_HANDOFF_2026-08-07.md`](SESSION_HANDOFF_2026-08-07.md) | Previous handoff summary covering initial studio expansion and BytePlus Seedream/Seedance integration. |

---

## Quick Navigation

- **Main Navigation & Studio Workspace**: [`src/app/studio/project/[projectId]/page.tsx`](../src/app/studio/project/[projectId]/page.tsx)
- **Marketing UI Components**: [`src/components/studio/marketing/`](../src/components/studio/marketing/)
- **Provider Integrations**:
  - Google AI Studio: [`src/lib/studio/google.ts`](../src/lib/studio/google.ts)
  - fal.ai: [`src/lib/studio/fal.ts`](../src/lib/studio/fal.ts)
  - BytePlus ModelArk: [`src/lib/studio/byteplus.ts`](../src/lib/studio/byteplus.ts)
  - OpenAI: [`src/lib/studio/openai.ts`](../src/lib/studio/openai.ts)
- **Database Migrations**: [`supabase/migrations/`](../supabase/migrations/)
