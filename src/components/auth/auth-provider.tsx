'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'

type AuthContextType = {
    user: User | null
    loading: boolean
    signInWithGoogle: () => Promise<void>
    signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

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
                // Fire a registration/login conversion when a fresh sign-in completes.
                if (event === 'SIGNED_IN') {
                    import('@/lib/fbpixel').then(({ fbTrack }) => fbTrack('CompleteRegistration')).catch(() => {})
                }
            })

            return () => subscription.unsubscribe()
        }).catch(() => {
            setLoading(false)
        })
    }, [])

    const signInWithGoogle = async () => {
        if (!isSupabaseConfigured()) {
            alert('Supabase is not configured. Please add your credentials to .env.local')
            return
        }
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
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
