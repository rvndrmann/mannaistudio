import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { safeNextPath } from '@/lib/auth-redirect'

export async function GET(request: NextRequest) {
    const url = new URL(request.url)
    const host = request.headers.get('host') || ''
    const origin = url.hostname === '0.0.0.0' && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
        ? `${url.protocol}//${host}` : url.origin
    const next = safeNextPath(url.searchParams.get('next'))
    const pendingCookies: Array<{ name: string; value: string; options: import('@supabase/ssr').CookieOptions }> = []
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        cookies: {
            getAll: () => request.cookies.getAll(),
            setAll: (cookies) => { pendingCookies.push(...cookies) },
        },
    })
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${origin}/auth/callback`, skipBrowserRedirect: true },
    })
    const response = error || !data.url
        ? NextResponse.redirect(`${origin}/auth/auth-code-error?next=${encodeURIComponent(next)}&error=${encodeURIComponent(error?.message || 'Could not start Google sign-in')}`)
        : NextResponse.redirect(data.url)
    for (const cookie of pendingCookies) response.cookies.set(cookie.name, cookie.value, cookie.options)
    response.cookies.set('aidh_auth_next', encodeURIComponent(next), { path: '/', maxAge: 600, sameSite: 'lax', secure: url.protocol === 'https:' })
    response.headers.set('Cache-Control', 'no-store')
    return response
}
