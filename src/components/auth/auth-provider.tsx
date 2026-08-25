'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { safeNextPath } from '@/lib/auth-redirect'
import { User } from '@supabase/supabase-js'
import { claimOnce } from '@/lib/track-once'

type AuthContextType = {
    user: User | null
    loading: boolean
    signInWithGoogle: (next?: string) => Promise<void>
    signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Supabase fires SIGNED_IN on every session restore — each page load, each tab
// focus, each token refresh — not just on a new account. Firing
// CompleteRegistration on it reported more registrations than page views and
// taught Meta's ad delivery to chase people who reload the site. Two guards fix
// it: the account must be newly created, and we only ever fire once per user.

/** A brand-new account signs in within seconds of being created. */
const NEW_ACCOUNT_WINDOW_MS = 5 * 60 * 1000

const TRACKED_KEY = 'adh:registration-tracked'

function isFreshlyCreated(createdAt: string | undefined): boolean {
    if (!createdAt) return false
    const created = new Date(createdAt).getTime()
    if (!Number.isFinite(created)) return false
    return Date.now() - created < NEW_ACCOUNT_WINDOW_MS
}

function isSupabaseConfigured() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    return url && key && url !== 'your_supabase_url' && key !== 'your_supabase_anon_key' && url.startsWith('http')
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!isSupabaseConfigured()) {
            setLoading(false)
            return
        }

        // Dynamically import to avoid errors when env vars are not set
        import('@/lib/supabase/client').then(({ createClient }) => {
            const supabase = createClient()

            const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
                setUser(session?.user ?? null)
                setLoading(false)
                // Report a registration only for an account that was just created,
                // and only the first time we see it.
                const signedInUser = session?.user
                if (
                    event === 'SIGNED_IN' &&
                    signedInUser &&
                    isFreshlyCreated(signedInUser.created_at) &&
                    claimOnce(TRACKED_KEY, signedInUser.id)
                ) {
                    import('@/lib/fbpixel')
                        .then(({ fbTrack }) => fbTrack('CompleteRegistration'))
                        .catch(() => {})
                }
            })

            return () => subscription.unsubscribe()
        }).catch(() => {
            setLoading(false)
        })
    }, [])

    /**
     * @param next Where to land afterwards. Defaults to the page the user is on,
     *   which is what makes a shared link work: somebody sent `/courses/abc`
     *   signs in and arrives at `/courses/abc` rather than at the home page
     *   having lost what they were sent. The callback has always read this
     *   parameter; nothing ever set it.
     */
    const signInWithGoogle = async (next?: string) => {
        if (!isSupabaseConfigured()) {
            alert('Supabase is not configured. Please add your credentials to .env.local')
            return
        }
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        const callback = new URL('/auth/callback', window.location.origin)
        // safeNextPath rather than the raw location: this ends up in a URL that
        // a signed-out visitor can be handed, and the callback redirects to it.
        const target = safeNextPath(next ?? `${window.location.pathname}${window.location.search}`)
        if (target !== '/') callback.searchParams.set('next', target)
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: callback.toString(),
            },
        })
    }

    const signOut = async () => {
        if (!isSupabaseConfigured()) return
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        await supabase.auth.signOut()
        setUser(null)
    }

    return (
        <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}
