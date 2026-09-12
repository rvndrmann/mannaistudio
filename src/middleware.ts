import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes that require authentication (everything else is public).
//
// Browsing is public; only the account-shaped pages are behind sign-in.
// /courses, /billing and /originals came out of this list deliberately: a
// stranger has to be able to read what a thing costs and watch the opening
// episodes before being asked who they are. Sign-in is required at the point of
// purchase or enrolment instead, which the pages and API routes enforce
// themselves — the wall was in front of the shop window.
// /account is deliberately absent: it draws its own sign-in card, the same way
// /originals does. Bouncing a signed-out visitor to /login instead would put
// the wall in front of the page that explains what they are signing in for.
// /hire-us is deliberately absent: the marketing page and the brief are the
// shop window for the managed service, and a stranger has to be able to read
// what it costs before being asked who they are. Sign-in is required at the
// point of checkout instead, which the page and the API route enforce
// themselves. /hire-us/projects is a different matter — it is somebody's own
// work — and is listed below.
const protectedPaths = ['/challenges', '/services', '/admin', '/profile', '/portfolio', '/studio', '/hire-us/projects']

// Temporarily paused features — redirect to home (code kept; re-enable by emptying this list).
const pausedPaths = ['/feed', '/services', '/challenges', '/messages']

/**
 * The SaaS-era surfaces, kept for the people who run the site.
 *
 * This is a micro-drama catalogue now. A viewer's whole account is /originals
 * and /account; the studio, the course platform, the portfolio and the old
 * membership billing are operator tools that were never rebuilt for them, and
 * a viewer who lands on one sees a product that is not for sale.
 *
 * Listed here rather than gated inside each page because there are a dozen of
 * them: a per-page gate is a dozen chances to forget one, and the one that gets
 * forgotten is the one someone finds.
 */
const adminOnlyPaths = [
    '/billing', '/studio', '/profile', '/courses', '/portfolio', '/credits',
    '/social', '/marketing', '/analytics', '/ads', '/calendar', '/competitors', '/blog',
]

function matchesPath(pathname: string, paths: string[]): boolean {
    return paths.some(path => pathname === path || pathname.startsWith(path + '/'))
}

function isAdminOnlyRoute(pathname: string): boolean {
    return matchesPath(pathname, adminOnlyPaths)
}

function isProtectedRoute(pathname: string): boolean {
    return matchesPath(pathname, protectedPaths) || isAdminOnlyRoute(pathname)
}

function isPausedRoute(pathname: string): boolean {
    return matchesPath(pathname, pausedPaths)
}

export async function middleware(request: NextRequest) {
    // Paused pages: send visitors back to home until we relaunch them.
    if (isPausedRoute(request.nextUrl.pathname)) {
        return NextResponse.redirect(new URL('/', request.url))
    }

    const response = NextResponse.next({ request: { headers: request.headers } })

    // Public routes: never touch Supabase. This keeps the edge function fast
    // and prevents a slow auth call from timing out the homepage / public pages.
    if (!isProtectedRoute(request.nextUrl.pathname)) {
        return response
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    // If Supabase isn't configured, let the request through (client handles auth).
    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === 'your_supabase_url' || supabaseAnonKey === 'your_supabase_anon_key') {
        return response
    }

    try {
        let res = response
        const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    res = NextResponse.next({ request: { headers: request.headers } })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        res.cookies.set(name, value, options)
                    )
                },
            },
        })

        // Guard the auth lookup with a timeout so a slow Supabase response can
        // never hang (and crash) the edge function. On timeout we fail open.
        const userResult = await Promise.race([
            supabase.auth.getUser(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ])

        // Timed out (null) -> let the request through; the client/page handles auth.
        //
        // An admin-only route is the exception. Failing open there does not
        // degrade gracefully — it shows a viewer the operator tooling, which is
        // the exact thing this list exists to prevent. A wrongly bounced admin
        // reloads and gets in; a wrongly admitted viewer does not un-see it.
        if (userResult === null) {
            return isAdminOnlyRoute(request.nextUrl.pathname)
                ? NextResponse.redirect(new URL('/originals', request.url))
                : res
        }

        const user = userResult.data?.user
        if (!user) {
            const redirectUrl = new URL('/login', request.url)
            // Path and query, so a link carrying its own parameters survives the
            // sign-in that interrupted it.
            redirectUrl.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`)
            return NextResponse.redirect(redirectUrl)
        }

        if (isAdminOnlyRoute(request.nextUrl.pathname)) {
            const { data: admin } = await supabase
                .from('admin_users')
                .select('id')
                .eq('id', user.id)
                .maybeSingle()
            // To the catalogue, not to /: the point is to put them where the
            // product is, rather than bounce them to a landing page they have
            // already been past.
            if (!admin) return NextResponse.redirect(new URL('/originals', request.url))
        }

        return res
    } catch {
        // On any error, fail open rather than taking the site down — with the
        // same admin-only exception as the timeout above.
        return isAdminOnlyRoute(request.nextUrl.pathname)
            ? NextResponse.redirect(new URL('/originals', request.url))
            : response
    }
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
