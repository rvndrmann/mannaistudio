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

## What Still Needs Work
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
