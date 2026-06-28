import { NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { createClient } from '@/lib/supabase/server'

// Creates a Razorpay subscription for the logged-in user against the configured plan.
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

        // Active plan is configurable from the DB (site_settings.billing.razorpay_plan_id);
        // falls back to the RAZORPAY_PLAN_ID env var.
        const { data: billingRow } = await supabase
            .from('site_settings')
            .select('value')
            .eq('key', 'billing')
            .single()
        const planId = (billingRow?.value as any)?.razorpay_plan_id || process.env.RAZORPAY_PLAN_ID
        if (!planId) {
            return NextResponse.json({ error: 'No subscription plan configured.' }, { status: 500 })
        }

        const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })

        const subscription = await razorpay.subscriptions.create({
            plan_id: planId,
            customer_notify: 1,
            // total_count is required; 120 months = effectively ongoing until cancelled.
            total_count: 120,
            notes: {
                profile_id: user.id,
                email: user.email || '',
            },
        })

        // Remember the pending subscription id on the profile.
        await supabase.rpc('set_razorpay_subscription', {
            p_profile_id: user.id,
            p_subscription_id: subscription.id,
        })

        return NextResponse.json({
            subscriptionId: subscription.id,
            keyId,
            email: user.email,
            name: user.user_metadata?.full_name || 'Student',
        })
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 })
    }
}
