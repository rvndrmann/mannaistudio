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

## What Still Needs Work
- `challenge_submissions` table — Not yet created (only mock data exists)
- `thumbnails` storage bucket — Not yet created
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
