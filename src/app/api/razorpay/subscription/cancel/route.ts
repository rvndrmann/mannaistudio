import { NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { createClient } from '@/lib/supabase/server'

// Cancels the logged-in user's Razorpay subscription at the end of the current
// billing cycle (they keep access until membership_expires_at).
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
        // cancel_at_cycle_end = 1 -> stays active until the current paid period ends
        await razorpay.subscriptions.cancel(subscriptionId, { cancel_at_cycle_end: 1 } as any)

        return NextResponse.json({ success: true })
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Could not cancel subscription.' }, { status: 500 })
    }
}
