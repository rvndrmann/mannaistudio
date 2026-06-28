import { NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { createClient } from '@/lib/supabase/server'

function rzpError(error: any): string {
    return (
        error?.error?.description ||
        error?.description ||
        error?.message ||
        'Could not cancel subscription.'
    )
}

// Cancels the logged-in user's Razorpay subscription. Active subscriptions are
// cancelled at cycle end (access kept until period end); not-yet-active ones
// (created/authenticated/pending/halted) are cancelled immediately.
export async function POST() {
    try {
        const keyId = process.env.RAZORPAY_KEY_ID
        const keySecret = process.env.RAZORPAY_KEY_SECRET
        if (!keyId || !keySecret) {
            return NextResponse.json({ error: 'Razorpay is not configured.' }, { status: 500 })
        }

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('razorpay_subscription_id')
            .eq('id', user.id)
            .single()

        const subscriptionId = profile?.razorpay_subscription_id
        if (!subscriptionId) {
            return NextResponse.json({ error: 'No active subscription found.' }, { status: 400 })
        }

        const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })

        // Look up current state to decide how to cancel.
        let status = ''
        try {
            const sub: any = await razorpay.subscriptions.fetch(subscriptionId)
            status = sub?.status || ''
        } catch {
            // If we can't fetch it, fall through and attempt an immediate cancel.
        }

        // Already-terminal states: just unlink locally.
        if (['cancelled', 'completed', 'expired'].includes(status)) {
            await supabase.rpc('set_razorpay_subscription', { p_profile_id: user.id, p_subscription_id: '' })
            return NextResponse.json({ success: true, alreadyEnded: true })
        }

        const atCycleEnd = status === 'active' ? 1 : 0
        try {
            await razorpay.subscriptions.cancel(subscriptionId, { cancel_at_cycle_end: atCycleEnd } as any)
        } catch (err: any) {
            // Retry with an immediate cancel if cycle-end wasn't applicable.
            if (atCycleEnd === 1) {
                await razorpay.subscriptions.cancel(subscriptionId, { cancel_at_cycle_end: 0 } as any)
            } else {
                throw err
            }
        }

        // Unlink locally now (webhook also handles this, but don't depend on it).
        await supabase.rpc('set_razorpay_subscription', { p_profile_id: user.id, p_subscription_id: '' })

        return NextResponse.json({ success: true, immediate: atCycleEnd === 0 })
    } catch (error: any) {
        return NextResponse.json({ error: rzpError(error) }, { status: 500 })
    }
}
