'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'

type AuthResult = { error: string | null; needsConfirmation?: boolean }

type AuthContextType = {
    user: User | null
    loading: boolean
    signInWithGoogle: () => Promise<void>
    signInWithEmail: (email: string, password: string) => Promise<AuthResult>
    signUpWithEmail: (email: string, password: string, fullName: string) => Promise<AuthResult>
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

    const signInWithEmail = async (email: string, password: string): Promise<AuthResult> => {
        if (!isSupabaseConfigured()) return { error: 'Supabase is not configured.' }
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        return { error: error ? error.message : null }
    }

    const signUpWithEmail = async (email: string, password: string, fullName: string): Promise<AuthResult> => {
        if (!isSupabaseConfigured()) return { error: 'Supabase is not configured.' }
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        const { data, error } = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: {
                data: { full_name: fullName.trim() },
                emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
        })
        if (error) return { error: error.message }
        // If email confirmation is required, there is no active session yet.
        const needsConfirmation = !data.session
        return { error: null, needsConfirmation }
    }

    const signOut = async () => {
        if (!isSupabaseConfigured()) return
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        await supabase.auth.signOut()
        setUser(null)
    }

    return (
        <AuthContext.Provider value={{ user, loading, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut }}>
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
