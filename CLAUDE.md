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
│   ├── page.tsx                    # Landing page
│   ├── layout.tsx                  # Root layout (wraps AuthProvider)
│   ├── courses/page.tsx            # Course listing
│   ├── courses/[id]/page.tsx       # Individual course + lessons
│   ├── courses/[id]/certificate/   # Certificate page
│   ├── challenges/page.tsx         # Weekly challenges
│   ├── services/page.tsx           # AI Services request form
│   ├── admin/page.tsx              # Admin dashboard
│   ├── profile/page.tsx            # Student profile
│   ├── portfolio/page.tsx          # Portfolio page
│   ├── auth/callback/route.ts      # OAuth callback handler
│   ├── api/checkout/route.ts       # PayU checkout API
│   └── api/payu/webhook/route.ts   # PayU payment webhook
├── components/
│   ├── Navbar.tsx
│   └── auth/auth-provider.tsx      # AuthContext with signInWithGoogle/signOut
├── lib/
│   ├── data.ts                     # Mock/seed data (courses, challenges, showcase, studentStats)
│   ├── supabase-helpers.ts         # fetchCourses, fetchCourseWithLessons, checkEnrollment, enrollFreeCourse
│   ├── portfolio.ts                # Portfolio CRUD, file upload, public portfolio fetch
│   ├── service-requests.ts         # Service request CRUD
│   ├── supabase/client.ts          # Browser Supabase client
│   ├── supabase/server.ts          # Server Supabase client
│   └── utils.ts                    # cn() utility
├── types/
│   └── canvas-confetti.d.ts
└── middleware.ts                    # Auth token refresh middleware
```

## What's Already Done
1. **Google Auth** — Fully working. AuthProvider, OAuth callback, middleware all set up.
2. **SQL migrations created** (in `supabase/migrations/`):
   - `20260525162000_portfolio.sql` — profiles table extensions, portfolio_items table, RLS, portfolio-media storage bucket
   - `20260525162500_service_requests.sql` — service_requests table, RLS
3. **Standalone SQL files** (same content as migrations, for reference):
   - `supabase-portfolio.sql`
   - `supabase-service-requests.sql`

## What Still Needs To Be Done — Supabase Backend Tables & Storage

The code references these Supabase tables/buckets. Some have migrations, some do NOT yet:

### Tables Needed (derived from code)

| Table | Has Migration? | Referenced In | Notes |
|-------|---------------|---------------|-------|
| `profiles` | Partial (portfolio.sql adds columns) | portfolio.ts, supabase-helpers.ts | Base table needs creating first (id uuid PK references auth.users, full_name, avatar_url, email). Portfolio migration adds portfolio_slug, is_portfolio_public, xp, level columns. |
| `courses` | **NO** | supabase-helpers.ts | Fields: id, title, description, thumbnail, xp, duration, level, chapters, instructor, price, created_at. See `data.ts` for schema shape. |
| `lessons` | **NO** | supabase-helpers.ts | Fields: id, course_id (FK→courses), title, duration, video_url, order, resources (jsonb). |
| `enrollments` | **NO** | supabase-helpers.ts | Fields: profile_id (FK→profiles), course_id (FK→courses), status, payment_id. Unique on (profile_id, course_id). |
| `portfolio_items` | YES | portfolio.ts | Done in portfolio migration. |
| `service_requests` | YES | service-requests.ts | Done in service_requests migration. |
| `challenges` | **NO** | data.ts (mock only) | Fields: id, title, description, prize, deadline, participants, difficulty, winner_id, created_at. |
| `challenge_submissions` | **NO** | data.ts (mock only) | Fields: id, challenge_id (FK→challenges), student_name/profile_id, video_url, thumbnail, created_at. |
| `showcase_items` | **NO** | data.ts (mock only, adminShowcase) | Fields: id, title, description, thumbnail, video_url. For admin showcase. |

### Storage Buckets Needed

| Bucket | Has Migration? | Used In |
|--------|---------------|---------|
| `portfolio-media` | YES | portfolio.ts (file uploads) |
| `videos` | **NO** | supabase-helpers.ts (`getVideoUrl`) — for course lesson videos |
| `thumbnails` | **NO** | Likely needed for course/challenge thumbnails |

### RLS Policies Still Needed
- `courses` — public read, admin write
- `lessons` — public read (or enrolled-only read), admin write
- `enrollments` — users can read/insert their own, admin can read all
- `challenges` — public read, admin write
- `challenge_submissions` — public read, authenticated insert
- `showcase_items` — public read, admin write
- `videos` bucket — public read, admin upload
- `thumbnails` bucket — public read, admin upload

### Recommended Execution Order
1. Create base `profiles` table (before portfolio migration runs)
2. Run portfolio migration (`20260525162000_portfolio.sql`)
3. Run service_requests migration (`20260525162500_service_requests.sql`)
4. Create `courses` table + RLS
5. Create `lessons` table + RLS
6. Create `enrollments` table + RLS
7. Create `challenges` table + RLS
8. Create `challenge_submissions` table + RLS
9. Create `showcase_items` table + RLS
10. Create `videos` storage bucket + policies
11. Create `thumbnails` storage bucket + policies
12. Seed courses/challenges from `data.ts` mock data

### Admin Role
Currently there is no admin role system. The admin page (`src/app/admin/page.tsx`) and service_requests RLS are open. An `admin_users` table or role column on `profiles` should be added to gate admin access.

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
npx supabase db execute --sql "SELECT 1"
```
