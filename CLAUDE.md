# AI Mastery Studio — Project Context

## What This Is
A Next.js 16 (App Router, Turbopack) course platform called "AI Mastery" for AI video creation education. Uses Supabase for auth/database/storage, Tailwind CSS, Framer Motion, Recharts.

## Tech Stack
- **Framework:** Next.js 16 with App Router (`src/app/`)
- **Language:** TypeScript
- **Auth:** Supabase Auth with Google OAuth (already configured and working)
- **Database:** Supabase Postgres
- **Storage:** Supabase Storage
- **UI:** Tailwind CSS, Framer Motion, Lucide icons
- **Payments:** PayU integration (checkout + webhook routes exist)

## Supabase Connection
- **Project ref:** `cytkucdnllicnmljixwd`
- **URL:** `https://cytkucdnllicnmljixwd.supabase.co`
- **Env file:** `.env.local` (contains `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- **CLI linked:** Yes (`supabase link` done)
- **Access token env var:** `SUPABASE_ACCESS_TOKEN=<SET_YOUR_SUPABASE_ACCESS_TOKEN>`
- **Google OAuth:** Enabled in Supabase dashboard, Client ID configured

## Project Structure
```
src/
├── app/
│   ├── page.tsx                    # Landing page (fetches showcase from Supabase)
│   ├── layout.tsx                  # Root layout (wraps AuthProvider)
│   ├── courses/page.tsx            # Course listing (fetches from Supabase)
│   ├── courses/[id]/page.tsx       # Individual course + lessons (fetches from Supabase, video playback)
│   ├── courses/[id]/certificate/   # Certificate page
│   ├── challenges/page.tsx         # Weekly challenges (fetches from Supabase)
│   ├── services/page.tsx           # AI Services request form
│   ├── admin/page.tsx              # Admin dashboard (admin-gated, full CRUD via RPC)
│   ├── profile/page.tsx            # Student profile
│   ├── portfolio/page.tsx          # Portfolio page (video player modal, share link copy)
│   ├── auth/callback/route.ts      # OAuth callback handler
│   ├── api/checkout/route.ts       # PayU checkout API
│   └── api/payu/webhook/route.ts   # PayU payment webhook
├── components/
│   ├── Navbar.tsx                  # Hides Admin link for non-admin users
│   └── auth/auth-provider.tsx      # AuthContext with signInWithGoogle/signOut
├── lib/
│   ├── data.ts                     # Mock/seed data (fallback only)
│   ├── supabase-helpers.ts         # fetchCourses, fetchCourseWithLessons, checkEnrollment, enrollFreeCourse
│   ├── portfolio.ts                # Portfolio CRUD, file upload, public portfolio fetch
│   ├── service-requests.ts         # Service request CRUD
│   ├── supabase/client.ts          # Browser Supabase client (singleton pattern)
│   ├── supabase/server.ts          # Server Supabase client
│   └── utils.ts                    # cn() utility
├── types/
│   └── canvas-confetti.d.ts
└── middleware.ts                    # Auth token refresh middleware
```

## What's Been Completed

### Authentication & Authorization
1. **Google Auth** — Fully working. AuthProvider, OAuth callback, middleware all set up.
2. **Admin gate** — `admin_users` table controls admin access. Admin page wrapped in `AdminGate` component that checks the table. Navbar hides Admin link for non-admins.
3. **Supabase client** — Singleton pattern (`src/lib/supabase/client.ts`) prevents session corruption from multiple instances.

### Database Tables (all created in Supabase)
| Table | Status | Notes |
|-------|--------|-------|
| `profiles` | ✅ Done | Base table + portfolio columns (slug, xp, level, is_portfolio_public) |
| `admin_users` | ✅ Done | id (FK→auth.users), role. RLS: authenticated users can SELECT. |
| `courses` | ✅ Done | id, title, description, thumbnail, xp, duration, level, chapters, instructor, price |
| `lessons` | ✅ Done | id (uuid), course_id, title, duration, video_url, order, resources (jsonb), description (text), takeaways (jsonb) |
| `enrollments` | ✅ Done | profile_id, course_id, status, payment_id. Unique on (profile_id, course_id) |
| `portfolio_items` | ✅ Done | Via portfolio migration |
| `service_requests` | ✅ Done | Via service_requests migration |
| `challenges` | ✅ Done | id, title, description, prize, deadline, participants, difficulty, winner_id |
| `showcase_items` | ✅ Done | id, title, description, thumbnail, video_url |

### Storage Buckets
| Bucket | Status | Used In |
|--------|--------|---------|
| `portfolio-media` | ✅ Done | portfolio.ts (file uploads) |
| `videos` | ✅ Done | Course lesson videos, uploaded via admin ChapterEditor |
| `thumbnails` | ✅ Done | Course thumbnails uploaded from admin (`thumbnails/courses/`), public read, admin write |

### SECURITY DEFINER RPC Functions (bypass RLS, check admin internally)
All admin write operations use these to avoid nested RLS policy issues:
- `admin_delete_course(course_id text)` — Deletes course by id
- `admin_delete_challenge(challenge_id text)` — Deletes challenge by id
- `admin_delete_showcase(item_id uuid)` — Deletes showcase item by id
- `admin_upsert_course(p_id, p_title, p_description, p_thumbnail, p_xp, p_duration, p_level, p_chapters, p_instructor, p_price)` — Insert or update course
- `admin_upsert_challenge(p_id, p_title, p_description, p_prize, p_deadline, p_participants, p_difficulty, p_winner_id)` — Insert or update challenge
- `admin_upsert_lessons(p_course_id text, p_lessons jsonb)` — Replaces all lessons for a course (delete + insert). Includes description, takeaways fields.

### Pages — All Fetch from Supabase
- **Home page** (`page.tsx`) — Fetches showcase_items from Supabase, video player modal, "Start Learning Now" triggers sign-in for unauthenticated users
- **Courses listing** (`courses/page.tsx`) — Fetches courses from Supabase
- **Course detail** (`courses/[id]/page.tsx`) — Fetches course + lessons from Supabase, actual `<video>` playback, dynamic "About this Lesson" and "Key Takeaways" per lesson, auto-completes chapter when video ends (no manual button)
- **Certificate** (`courses/[id]/certificate/page.tsx`) — Asks user for full name before generating certificate, fetches course from Supabase
- **Challenges** (`challenges/page.tsx`) — Fetches challenges from Supabase
- **Portfolio** (`portfolio/page.tsx`) — Video player modal with onCanPlay auto-play, share button copies link with "✓ Link copied!" feedback
- **Profile** (`profile/page.tsx`) — Portfolio videos from Supabase (no mock data), video first-frame thumbnails, delete button at bottom of card
- **Admin** (`admin/page.tsx`) — Full CRUD for courses/challenges/showcase via RPC functions, upload progress animations, ChapterEditor persists lessons to Supabase with description and key takeaways editing

### UI Features
- Upload progress animations (Framer Motion) for video uploads in admin and portfolio
- Video player modals on home page, portfolio page, and course detail page with onCanPlay handler
- Videos show first frame as thumbnail when no thumbnail image is set (`<video>` with `#t=0.1` and `preload="metadata"`)
- Chapter auto-completion on video end (no manual "Mark as Complete" button)
- Certificate name prompt before generation

## SQL Migrations
Located in `supabase/migrations/`:
- `20260525162000_portfolio.sql` — profiles extensions, portfolio_items, RLS, portfolio-media bucket
- `20260525162500_service_requests.sql` — service_requests table, RLS

## Viewer Analytics (admin → Audience)

Answers what purchases alone cannot: who watched what, how far they got, who
came back, and who is on the site right now. Migration
`20260911150000_viewer_analytics.sql`.

| Table | Written by | Holds |
|-------|-----------|-------|
| `analytics_sessions` | ingest route | one visit; `visitor_id` (localStorage) outlives the tab, `id` (sessionStorage) does not |
| `analytics_page_views` | ingest route | a path within a visit |
| `originals_episode_views` | ingest route | one person's pass through one episode |

All three have RLS enabled with **no policies** — reachable only through the
service key (writes) and the `admin_analytics_*` functions (reads).

- **Ingest:** `POST /api/analytics/track` — public, so signed-out viewers of the
  free episodes are counted. `profile_id` is read from the session cookie, never
  from the body. Service-role RPCs `record_site_visit` / `record_episode_view`.
- **Browser:** `src/lib/analytics.ts` (ids, beacons), `AnalyticsTracker` in the
  root layout (page views + a 30s heartbeat while the tab is visible), and the
  watch accumulator in `src/app/originals/[slug]/page.tsx`.
- **Reads:** `GET /api/admin/analytics?view=…` over `admin_analytics_overview`,
  `_traffic`, `_live`, `_episode_retention`, `_episode_viewers`, `_viewers`,
  `_purchases`, `_viewer_history` — each checks `admin_users` itself.
- **UI:** `src/components/admin/ViewerAnalytics.tsx`, admin tab `?tab=audience`.

Two numbers worth knowing the definition of:
- `episodes_after_first_visit` — episodes first watched on a visit that was not
  the viewer's first. This is the "came back for a new episode" signal; a binge
  on day one scores zero.
- `continued_to_next` — viewers of episode N who also watched N+1. Completion
  says an episode held the people who stayed; this says it was worth paying for
  the next one.

A "person" is `coalesce(profile_id, visitor_id)` throughout, because the opening
episodes play with no account and counting only accounts would report that
nobody watches them.

## Managed production (Hire Our Creative Team)

Clients hire the team to make UGC, direct-response and cinematic ads instead of
operating the studio themselves. Migration
`20260913120000_managed_production.sql`; full write-up in
[docs/MANAGED_PRODUCTION.md](docs/MANAGED_PRODUCTION.md).

| Table | Holds |
|-------|-------|
| `managed_offer_services` / `managed_offer_packages` | the editable catalogue: a gig with thumbnail + promo video, and its price tiers |
| `managed_projects` | the order: service, package, brief (jsonb), status, price, `brand_id`, `studio_project_id` |
| `managed_deliverables` | one ad per row, with its own status |
| `managed_deliverable_versions` | V1, V2, FINAL — never overwritten |
| `managed_messages` | the project conversation (`kind`: `chat` or `delivery`) |
| `managed_revision_comments` | timestamped feedback, pinned to its version |
| `managed_storyboard_items` | frames sent for storyboard sign-off (keyframe, clip, asset), by round, with the client's verdict |

- **Public:** `/hire-us`, `/hire-us/brief`. **Client:** `/hire-us/projects[/id]`.
  **Admin:** `/admin?tab=managed`. `/hire-us` is not admin-only — unlike the
  studio, this is sold to strangers.
- **Money:** Razorpay, same rule as the season pass — the browser never sends a
  price. `/api/managed/checkout` prices the package from the catalogue and
  carries the project id in the order notes; verification reads entitlement back
  from Razorpay, never from the body.
- **Catalogue:** editable at Admin → Managed Production → Offers (migration
  `20260913140000_managed_offers.sql`). Keys are immutable because orders record
  them; `managed_projects.offer_snapshot` freezes the gig and package as sold, so
  editing or deleting one never rewrites an existing order.
- **Writes:** reads are RLS; everything carrying value goes through a
  `SECURITY DEFINER` function. `create_managed_project` and
  `mark_managed_project_paid` are service-role only, with an `auth.role()` check
  in the body as well as the revoked grant.
- **The Studio bridge:** `openStudioProjectForManaged` opens a `creator_projects`
  row **owned by the producing admin**, seeded with the brief mapped onto
  `creative_brief` and the client's product art imported as `creator_entities`.
  The client is never made a member of it.
- **Internal vs client files:** one bucket, two prefixes. The studio writes
  `{owner_id}/{studio_project_id}/…`; the client can only read
  `managed/{project_id}/…`. Publishing **copies** the bytes across, so an
  unpublished take has no path a client could be handed.
- **Storyboard review:** admin ticks frames from the Studio production and sends
  a round (copied to `managed/{id}/storyboard/`); the client approves or asks for
  changes per frame, and each answer is also written to that shot's Studio
  revision notes. Migration `20261014120000_managed_storyboard_review.sql`.
- **Capacity and queue:** each package may set `slot_limit` (orders in
  production at once) and `queue_limit` (paid orders waiting); blank is
  unlimited. A slot is occupied by a paid, slot-placed order not `completed` or
  `cancelled`, plus 30-minute checkout holds. Queued bookings pay upfront
  (`managed_projects.queue_state = 'queued'`); an admin promotes them by hand
  (Orders → Waiting for a Slot → Move to live slot). `create_managed_project`
  and `mark_managed_project_paid` count under a package-row lock; the browser
  only sends `joinQueue` consent and gets `409 slots_full` / `sold_out`.
  Migration `20261023120000_managed_package_capacity.sql`; details in
  docs/MANAGED_PRODUCTION.md → Capacity and the queue.
- **Pausing:** `site_features.hireUs` hides the nav entry *and* closes the
  checkout route. Running projects stay deliverable.

## Proof and the Pro homepage (admin → /admin/proof)

The `academy` homepage sells AI Director Hub Pro and is **server-rendered**
(`src/components/home/AcademyHome.tsx`, also served at `/start` and `/learn`).
Migration `20261012120000_proof_items.sql`.

- **Proof lives in `showcase_items`**, extended rather than duplicated: `type`
  (`portfolio` | `student_review` | `sale_proof`), person fields, `quote`,
  `screenshots` (jsonb, max 6), `amount`/`currency`, `proof_date`,
  `consent_confirmed`, `published`, `deleted_at`. Four brief names map onto
  older columns: poster → `thumbnail`, video → `video_url`, featured →
  `is_featured`, sort_order → `position`. `src/lib/proof.ts` is the only place
  that knows this.
- **Publish guard is a check constraint**, not just a form rule: published
  requires `consent_confirmed`, not deleted, and a poster whenever there is a
  video. RLS: anon reads published rows only; admins read everything — so any
  public read must filter `published` itself (use `fetchPublishedProof` with
  `createPublicClient()`).
- **No placeholders.** A homepage section with no published rows is not
  rendered. Never add fallback testimonials, numbers or logos.
- **Public API:** `GET /api/proof?type=&featured=&limit=`.
- **Page settings:** `site_settings.proof_page` via
  `admin_set_proof_page_settings` — cost example, API guide link, community
  reason toggle, annual plan toggle + price, Creator Studio demo media. Empty
  means hidden.
- **CTAs:** every Pro button is `ProCta` (→ `/billing`, fires
  `InitiateCheckout`); every free-course link is `FreeCourseCta` (→
  `/free-course`, which redirects to the current free course, fires `Lead`).
- **Courses:** `/courses` is the public catalogue; `/my-courses` is what a
  signed-in student owns. `courseDurationLabel` hides zero durations.
- **Nav:** `AcademyNavbar`. Originals is a nav link (hidden when `site_features.originals` is paused); Hire Our Team is a nav link, a line under the hero and a "Done for you" section (published `managed_offer_services`, max 3), all hidden when `site_features.hireUs` is paused.

## Timeline editor (OpenReel)

The studio's Timeline tab is OpenReel (MIT, github.com/Augani/openreel-video)
in a same-origin iframe. `scripts/build-openreel.mjs` fetches the commit in
`editor/openreel/UPSTREAM`, lays `editor/openreel/overlay` over it, applies a
few checked string edits, and builds into `public/editor` (gitignored; run
`npm run editor:build`, also part of `npm run build`). Each edit fails the build
if its upstream text moves, so bumping UPSTREAM cannot silently drop the bridge.

- **Protocol:** `src/lib/studio/openreel-protocol.ts`, copied into the build.
  The studio sends the episode's shots (signed URLs + trims + `videoKey`, the
  storage path); the editor reopens its saved edit for that episode (browser
  IndexedDB, id `studio-{project}-{episode}`) and brings its Storyboard track
  up to date.
- **Live sync:** while the Timeline is open, every change to the shots is sent
  as `sync`. A new shot is placed after the nearest earlier shot; a new take
  replaces the old clip where it stood; later clips on that track ripple.
  Which media item holds which shot lives in localStorage
  `openreel-studio:placements:{editorProjectId}` — only those clips are ever
  touched. Rebuild re-lays just the Storyboard track; other tracks, captions
  and imported media stay.
- **Saving:** OpenReel's own App starts autosave; StudioApp does not use it, so
  `keepSaving` force-saves ~1s after every change and on tab hide. Without it
  anything added after the initial build was lost on reload.
- **Project menu:** shows only the open episode (no New Project, recent
  projects or backup packages) — opening anything else would desync from the
  studio.
- **Captions:** Auto Captions can run on the saved OpenAI key
  (`/api/studio/editor-ai/audio/transcriptions`, whisper-1, 60s WAV pieces)
  instead of the ~760 MB in-browser Whisper model (`studio-captions.tsx`).
- **Exports:** OpenReel's download step hands the file to the studio, which
  uploads it to `{user}/{project}/final-cuts/{episode}/` and records it in
  `creator_episodes.final_cut` (workspace action `saveFinalCut`). Every
  export also downloads to the user's computer. Managed production lists and
  can publish these edited cuts.
- **AI Editor:** runs on the user's own BYOK key (OpenAI, else Gemini) through
  `/api/studio/editor-ai/chat/completions` (captions: `…/audio/transcriptions`,
  OpenAI only). gpt-5 models refuse tools on chat completions at default
  reasoning, so the proxy sends `reasoning_effort: "none"` with tools. The editor sends the Supabase access
  token in place of an API key; the key never reaches the browser and no
  credits are charged.
- Users never see the OpenReel name: the build renames it to "AI Director
  Editor" (the `BRAND` constant in the script); the MIT notice ships as
  `public/editor/LICENSE.txt`.
- Upstream's service worker is disabled (it would claim the whole origin), and
  `editor/` is excluded from middleware, tsc and eslint.

## MCP bridge (control the studio from an MCP client)

`mcp/server.mjs` — a dependency-free stdio MCP server registered in `.mcp.json`.
It speaks the external API as a real user, so RLS, credits, BYOK routing and the
approval gate all behave exactly as they do in the browser.

- **Auth:** `aih_` tokens in `creator_external_access_tokens`, minted by
  `scripts/mint-studio-token.mjs <email>`, stored in `.env.local` as
  `STUDIO_ACCESS_TOKEN`. Scopes: `director:chat|tools|uploads|proposals`,
  `projects:read`. A token reaches only projects its minter **owns**.
- **Target:** `STUDIO_BASE_URL`, default `http://localhost:3000`.
- **Externally reachable routes** (via `requireProjectFromRequest`): director
  chat, tools, uploads, proposals, the project GET, and `…/media?path=` which
  signs one stored file after checking it sits under the caller's own prefix.
- Tools and setup: `mcp/README.md`.

## What Still Needs Work
- Managed production: no monthly subscription plans, no "Download All", no
  automatic competitor research — see the last section of
  [docs/MANAGED_PRODUCTION.md](docs/MANAGED_PRODUCTION.md) for why the schema
  leaves room for each.
- `challenge_submissions` table — Not yet created (only mock data exists)
- Course enrollment payment flow — PayU routes exist but untested end-to-end
- RLS policies for `enrollments` — users read/insert own, admin read all
- Seeding initial data from `data.ts` into Supabase tables (if desired)

## Dev Server
- Run: `npm run dev`
- Default port: 3000 (falls back to 3001 if occupied)
- `.env.local` is loaded automatically

## Commands
```bash
# Link Supabase (already done)
export SUPABASE_ACCESS_TOKEN=<SET_YOUR_SUPABASE_ACCESS_TOKEN>
npx supabase link --project-ref cytkucdnllicnmljixwd

# Push migrations
npx supabase db push

# Run SQL directly
npx supabase db query --linked "SELECT 1"
```

## Deployment
- **Netlify** — Build deployed. Note: use `Array.from(new Set(...))` instead of `[...new Set(...)]` for compatibility.
