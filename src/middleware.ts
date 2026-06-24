import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes that require authentication (everything else is public).
const protectedPaths = ['/courses', '/challenges', '/services', '/admin', '/profile', '/portfolio', '/billing']

function isProtectedRoute(pathname: string): boolean {
    return protectedPaths.some(path => pathname === path || pathname.startsWith(path + '/'))
}

export async function middleware(request: NextRequest) {
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
                get(name: string) {
                    return request.cookies.get(name)?.value
                },
                set(name: string, value: string, options: CookieOptions) {
                    request.cookies.set({ name, value, ...options })
                    res = NextResponse.next({ request: { headers: request.headers } })
                    res.cookies.set({ name, value, ...options })
                },
                remove(name: string, options: CookieOptions) {
                    request.cookies.set({ name, value: '', ...options })
                    res = NextResponse.next({ request: { headers: request.headers } })
                    res.cookies.set({ name, value: '', ...options })
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
        if (userResult === null) {
            return res
        }

        const user = userResult.data?.user
        if (!user) {
            const redirectUrl = new URL('/login', request.url)
            redirectUrl.searchParams.set('next', request.nextUrl.pathname)
            return NextResponse.redirect(redirectUrl)
        }

        return res
    } catch {
        // On any error, fail open rather than taking the site down.
        return response
    }
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
