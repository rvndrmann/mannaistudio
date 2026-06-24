import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'

// Razorpay subscription webhook.
// Configure this URL in the Razorpay Dashboard (Settings -> Webhooks) and
// subscribe to: subscription.charged, subscription.activated,
// subscription.cancelled, subscription.halted.
export async function POST(req: Request) {
    try {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET
        if (!secret) {
            return NextResponse.json({ error: 'Webhook not configured.' }, { status: 500 })
        }

        const rawBody = await req.text()
        const signature = req.headers.get('x-razorpay-signature') || ''

        // Verify the payload signature.
        const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
        if (expected !== signature) {
            return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 })
        }

        const event = JSON.parse(rawBody)
        const eventType: string = event?.event || ''
        const subscription = event?.payload?.subscription?.entity
        const paymentEntity = event?.payload?.payment?.entity
        const profileId: string | undefined = subscription?.notes?.profile_id
        const email: string = subscription?.notes?.email || paymentEntity?.email || ''
        const subscriptionId: string = subscription?.id || ''

        if (!profileId) {
            // Nothing we can reconcile against; acknowledge so Razorpay stops retrying.
            return NextResponse.json({ received: true })
        }

        const supabase = await createClient()

        switch (eventType) {
            case 'subscription.charged': {
                const paymentId = paymentEntity?.id || subscriptionId
                const amount = paymentEntity?.amount ? String(paymentEntity.amount / 100) : ''

                await supabase.rpc('record_payment', {
                    p_email: email,
                    p_txnid: paymentId,
                    p_payment_id: paymentId,
                    p_amount: amount,
                    p_product_info: 'Membership: AI Director Hub Pro',
                    p_status: 'success',
                    p_profile_id: profileId,
                })

                // Extends membership by one month and marks it active (not a trial).
                await supabase.rpc('activate_membership_by_profile', {
                    p_profile_id: profileId,
                    p_payment_id: paymentId,
                })
                await supabase.from('profiles').update({ is_trial: false }).eq('id', profileId)
                break
            }

            case 'subscription.activated': {
                await supabase.rpc('set_razorpay_subscription', {
                    p_profile_id: profileId,
                    p_subscription_id: subscriptionId,
                })
                break
            }

            case 'subscription.cancelled':
            case 'subscription.halted':
            case 'subscription.completed': {
                // Stop auto-renewal. Existing access remains until membership_expires_at.
                await supabase.rpc('set_razorpay_subscription', {
                    p_profile_id: profileId,
                    p_subscription_id: '',
                })
                break
            }
        }

        return NextResponse.json({ received: true })
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
