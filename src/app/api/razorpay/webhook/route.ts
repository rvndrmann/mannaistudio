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
        const orderEntity = event?.payload?.order?.entity
        const subscriptionId: string = subscription?.id || ''

        const supabase = await createClient()

        // --- One-time bid purchase (order.paid) ---
        if (eventType === 'order.paid') {
            const notes = orderEntity?.notes || {}
            if (notes.type === 'bids' && notes.profile_id) {
                const bidsToAdd = Number(notes.bids)
                if (Number.isFinite(bidsToAdd) && bidsToAdd > 0) {
                    await supabase.rpc('add_bids', { p_profile_id: notes.profile_id, p_amount: bidsToAdd })
                    const orderPaymentId = paymentEntity?.id || orderEntity?.id
                    await supabase.rpc('record_payment', {
                        p_email: notes.email || paymentEntity?.email || '',
                        p_txnid: orderPaymentId,
                        p_payment_id: orderPaymentId,
                        p_amount: orderEntity?.amount ? String(orderEntity.amount / 100) : '',
                        p_product_info: `Bids: ${bidsToAdd}`,
                        p_status: 'success',
                        p_profile_id: notes.profile_id,
                    })
                }
            }
            return NextResponse.json({ received: true })
        }

        // --- Subscription events ---
        const profileId: string | undefined = subscription?.notes?.profile_id
        const email: string = subscription?.notes?.email || paymentEntity?.email || ''

        if (!profileId) {
            // Nothing we can reconcile against; acknowledge so Razorpay stops retrying.
            return NextResponse.json({ received: true })
        }

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

                // Extends membership by one month, marks it active, and clears the
                // trial flag (handled inside the SECURITY DEFINER RPC so it bypasses RLS).
                await supabase.rpc('activate_membership_by_profile', {
                    p_profile_id: profileId,
                    p_payment_id: paymentId,
                })
                // One-time 100-bid bonus for paid members (no-op if already granted).
                await supabase.rpc('grant_member_bids', { p_profile_id: profileId })
                break
            }

            case 'subscription.activated': {
                await supabase.rpc('set_razorpay_subscription', {
                    p_profile_id: profileId,
                    p_subscription_id: subscriptionId,
                })
                break
            }

            case 'subscription.pending':
            case 'subscription.halted': {
                // A charge failed. Razorpay auto-retries (and emails the customer a
                // card-update link). We take no action: membership_expires_at simply
                // is not extended, so access lapses naturally if payment never recovers.
                // Keep the subscription link intact — these states are recoverable
                // (a successful card update moves the subscription back to active).
                break
            }

            case 'subscription.cancelled':
            case 'subscription.completed': {
                // Terminal states: stop auto-renewal and unlink. Existing access
                // remains until membership_expires_at.
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
