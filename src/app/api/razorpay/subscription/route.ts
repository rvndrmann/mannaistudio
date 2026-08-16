import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { createClient } from '@/lib/supabase/server'
import { applyBillingOverrides, isBillingTierId, type BillingTierId } from '@/lib/billing-plans'
import { sendCapiEvent } from '@/lib/meta-capi'

// Creates a Razorpay subscription for the logged-in user against the chosen tier.
export async function POST(request: NextRequest) {
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

        let requestedTier: BillingTierId = 'plus'
        try {
            const body = await request.json()
            if (isBillingTierId(body?.tier)) requestedTier = body.tier
        } catch {
            // No body sent; fall back to the default tier.
        }

        // Plan IDs and prices may be overridden in site_settings so pricing can be
        // corrected without a deploy.
        const { data: billingRow } = await supabase
            .from('site_settings')
            .select('value')
            .eq('key', 'billing')
            .maybeSingle()
        const tiers = applyBillingOverrides(billingRow?.value)
        const tier = tiers[requestedTier]
        if (!tier?.planId) {
            return NextResponse.json({ error: 'No subscription plan configured for that tier.' }, { status: 500 })
        }

        const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })

        const subscription = await razorpay.subscriptions.create({
            plan_id: tier.planId,
            customer_notify: 1,
            // total_count is required; 120 months = effectively ongoing until cancelled.
            total_count: 120,
            notes: {
                profile_id: user.id,
                email: user.email || '',
                // Read back by the webhook to grant this tier's credits on each charge.
                tier: tier.id,
            },
        })

        // Purchases will be far too rare for a while for Meta to optimise
        // against — it wants around fifty a week — so the start of a checkout is
        // the mid-funnel signal we can point the ads at while volume builds.
        // The subscription ID is stable, so a retried request reports once.
        await sendCapiEvent({
            eventName: 'InitiateCheckout',
            eventId: `checkout-${subscription.id}`,
            email: user.email,
            externalId: user.id,
            value: tier.priceInr,
            currency: 'INR',
            sourceUrl: 'https://www.aidirectorhub.com/billing',
            customData: {
                content_name: `Membership: AI Director Hub ${tier.name}`,
                content_type: 'subscription',
                content_ids: [tier.id],
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
            tier: tier.id,
            planName: tier.name,
            priceInr: tier.priceInr,
            credits: tier.credits,
            email: user.email,
            name: user.user_metadata?.full_name || 'Creator',
        })
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 })
    }
}
