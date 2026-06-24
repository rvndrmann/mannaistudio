import { NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { createClient } from '@/lib/supabase/server'

const PRICE_PER_BID = 10 // ₹10 per bid (10 bids = ₹100)

// Creates a one-time Razorpay order to purchase bids.
export async function POST(req: Request) {
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

        const body = await req.json().catch(() => ({}))
        const bids = Math.floor(Number(body?.bids))
        // Must be a positive multiple of 10.
        if (!Number.isFinite(bids) || bids < 10 || bids % 10 !== 0) {
            return NextResponse.json({ error: 'Bids must be a positive multiple of 10.' }, { status: 400 })
        }

        const amountInPaise = bids * PRICE_PER_BID * 100
        const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })

        const order = await razorpay.orders.create({
            amount: amountInPaise,
            currency: 'INR',
            receipt: `bids_${user.id.slice(0, 8)}_${Date.now()}`,
            notes: {
                type: 'bids',
                profile_id: user.id,
                bids: String(bids),
                email: user.email || '',
            },
        })

        return NextResponse.json({
            orderId: order.id,
            amount: amountInPaise,
            keyId,
            bids,
            email: user.email,
            name: user.user_metadata?.full_name || 'Student',
        })
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 })
    }
}
