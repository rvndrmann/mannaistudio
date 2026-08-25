import { createClient } from '@/lib/supabase/server'
import { isAuthRetryableFetchError, type AuthError } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { safeNextPath } from '@/lib/auth-redirect'

/**
 * Exchange the OAuth code, retrying only when the request never reached
 * Supabase.
 *
 * A dev server that has been idle while the user is away on Google's consent
 * screen can be holding a keep-alive socket the upstream edge has already
 * closed. The first write to it fails as a bare "fetch failed" — a network
 * error, not an auth one, so the code was never consumed and a second attempt
 * on a fresh socket succeeds. Anything Supabase actually answered (an expired
 * code, a missing verifier) is returned untouched: retrying a real rejection
 * would only burn the one exchange the code is good for.
 *
 * Every attempt needs its own client. auth-js deletes the PKCE verifier from
 * storage in its catch block on any failure, network ones included, and the
 * ssr adapter records that deletion in memory on the client instance — after
 * which its getItem returns null no matter what the cookie says. Retrying on
 * the same client therefore always fails as "PKCE code verifier not found in
 * storage", replacing the real error with a misleading one. The adapter
 * deliberately does not write verifier deletions through to the cookie, so a
 * fresh client still finds it and the retry does what it was written to do.
 */
async function exchangeCodeWithRetry(code: string, attempts = 3) {
    let supabase = await createClient()
    let lastError: AuthError | null = null
    for (let attempt = 1; attempt <= attempts; attempt++) {
        if (attempt > 1) supabase = await createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) return { supabase, error: null }
        lastError = error
        if (!isAuthRetryableFetchError(error)) return { supabase, error }
        if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 250 * attempt))
    }
    return { supabase, error: lastError }
}

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    // Validated, not trusted. This parameter is now set on real sign-in links,
    // so it is also reachable by anyone who can hand a visitor a link to our
    // own sign-in — an unchecked value here is an open redirect.
    const next = safeNextPath(searchParams.get('next'))

    const errorParam = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    if (errorParam) {
        return NextResponse.redirect(`${origin}/auth/auth-code-error?error=${encodeURIComponent(errorDescription || errorParam)}`)
    }

    if (code) {
        const { supabase, error } = await exchangeCodeWithRetry(code)
        if (!error) {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                // Ensure profile exists
                await supabase.from('profiles').upsert({
                    id: user.id,
                    full_name: user.user_metadata?.full_name || '',
                    avatar_url: user.user_metadata?.avatar_url || '',
                    email: user.email || '',
                }, { onConflict: 'id' })

                // Welcome credits for a brand new account, so a first project can
                // actually generate something. Granted once per account and only
                // while admin has the promotion switched on.
                await supabase.rpc('grant_signup_credits', { p_user_id: user.id })
                // One-time 20 free bids so free accounts can post & bid on AI jobs
                await supabase.rpc('grant_starter_bids', { p_user_id: user.id })
            }
            return NextResponse.redirect(`${origin}${next}`)
        } else {
            console.error('[auth/callback] code exchange failed:', error.message, error)
            const kind = isAuthRetryableFetchError(error) ? 'network' : 'auth'
            return NextResponse.redirect(`${origin}/auth/auth-code-error?kind=${kind}&error=${encodeURIComponent(error.message)}`)
        }
    }

    // return the user to an error page with instructions
    return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
