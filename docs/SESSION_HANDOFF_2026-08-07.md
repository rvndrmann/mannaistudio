# Session Handoff

Date: 2026-08-07

This branch currently includes the AI Director Hub studio expansion work. The local app has been tested in-browser and the following are working:

- AI Director chat and voice session scaffolding
- OpenAI image generation
- BytePlus Seedream 5.0 Pro image generation path
- BytePlus Seedance 2.0, 2.0 Fast, 2.0 Mini, and Seedance 2.5 video generation paths
- Storyboard image/video preview rendering from private Supabase storage via signed URLs
- Reference image selection for both image and video generation
- Video generation mode switching between Key Frame and Multi Image
- Model menus for image and video providers
- Additive Supabase migration for creator generation job updates

Important runtime notes:

- `ARK_API_KEY` must be present in `.env.local` for BytePlus image/video generation.
- `OPENAI_API_KEY` must be present in `.env.local` for OpenAI chat, voice, and image generation.
- Seedream 5.0 Pro currently requires activation in the BytePlus Ark console.
- The storyboard video flow currently uses signed private URLs for generated media and the UI is rendering those correctly.

Validation completed in this session:

- `npm run typecheck`
- Focused Vitest runs for the studio model registry and BytePlus helper
- Local browser checks for image and video generation UI

Useful files:

- `src/app/studio/project/[projectId]/page.tsx`
- `src/app/api/studio/projects/[projectId]/images/route.ts`
- `src/app/api/studio/projects/[projectId]/videos/route.ts`
- `src/lib/studio/openai.ts`
- `src/lib/studio/byteplus.ts`
- `src/lib/studio/generation-models.ts`
- `docs/AI_DIRECTOR_ARCHITECTURE.md`

If the next session starts from scratch, the main thing to verify first is that the local dev server is running with the updated `.env.local` values and that the storyboard still renders a playable video from the signed Supabase URL.
