import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { fetchBillingSettings, getActivePlanPrice } from '@/lib/membership'

export async function POST(req: Request) {
    try {
        const { courseId, price, userEmail, userName, productType } = await req.json()
        let amount = price

        const merchantId = process.env.PAYU_MERCHANT_ID!
        const key = process.env.PAYU_KEY!
        const salt = process.env.PAYU_SALT!
        const txnid = `TXN_${Date.now()}`
        const productInfo = productType === 'membership' ? 'Membership: AI Mastery Pro' : `Course: ${courseId}`

        if (productType === 'membership') {
            const supabase = await createClient()
            amount = String(getActivePlanPrice(await fetchBillingSettings(supabase)))
        }

        // Hash sequence: key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT
        const hashString = `${key}|${txnid}|${amount}|${productInfo}|${userName}|${userEmail}|||||||||||${salt}`
        const hash = crypto.createHash('sha512').update(hashString).digest('hex')

        // In a real scenario, you'd send this to PayU or return the hash to the frontend
        // For now, return the payload for the frontend to submit to PayU
        return NextResponse.json({
            key,
            txnid,
            amount,
            productinfo: productInfo,
            firstname: userName,
            email: userEmail,
            hash,
            // surl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/payu/success`,
            // furl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/payu/failure`,
        })
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
