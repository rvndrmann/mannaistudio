import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/'

    if (code) {
        const supabase = await createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)
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

                // Grant free trial for new users
                await supabase.rpc('grant_free_trial', { p_user_id: user.id })
                // One-time 20 free bids so free accounts can post & bid on AI jobs
                await supabase.rpc('grant_starter_bids', { p_user_id: user.id })
            }
            return NextResponse.redirect(`${origin}${next}`)
        }
    }

    // return the user to an error page with instructions
    return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
