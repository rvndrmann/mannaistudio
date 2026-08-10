# AI Director Hub — System Documentation

Welcome to the documentation directory for **AI Director Hub** & **AI Social Media + Advertising Agent**.

## Documentation Files

| Document | Description |
| :--- | :--- |
| [`SESSION_HANDOFF_2026-08-09.md`](SESSION_HANDOFF_2026-08-09.md) | Summary of AI Credit System, Razorpay credit top-ups, combined transaction history (paid/cancelled/failed), course pause feature, and site feature pause controls. |
| [`SESSION_HANDOFF_2026-08-08.md`](SESSION_HANDOFF_2026-08-08.md) | Summary of AI Social Media + Advertising Agent, BytePlus Seedream/Seedance 2.5, character asset pipeline, and dark minimal UI redesign. |
| [`AI_DIRECTOR_MCP_AND_CLI.md`](AI_DIRECTOR_MCP_AND_CLI.md) | External access tokens, CLI, and MCP server setup so ChatGPT/Claude-style clients can talk to the AI Director agent. |
| [`AI_DIRECTOR_CHAT_AGENT_WORKFLOW.md`](AI_DIRECTOR_CHAT_AGENT_WORKFLOW.md) | Chat-first AI Director workflow for script, assets, storyboard images, video approvals, full-auto mode, and voice control. |
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
