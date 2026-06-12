import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

export async function POST(req: Request) {
    try {
        const formData = await req.formData()

        const status = formData.get('status') as string
        const txnid = formData.get('txnid') as string
        const amount = formData.get('amount') as string
        const productinfo = formData.get('productinfo') as string
        const firstname = formData.get('firstname') as string
        const email = formData.get('email') as string
        const hash = formData.get('hash') as string
        const mihpayid = formData.get('mihpayid') as string
        const udf1 = (formData.get('udf1') as string) || ''

        const salt = process.env.PAYU_SALT!
        const key = process.env.PAYU_KEY!

        // Reverse hash verification: SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
        const reverseHashString = `${salt}|${status}|||||||||${udf1}|${email}|${firstname}|${productinfo}|${amount}|${txnid}|${key}`
        const expectedHash = crypto.createHash('sha512').update(reverseHashString).digest('hex')

        if (hash !== expectedHash) {
            return NextResponse.redirect(new URL('/courses?payment=failed', req.url))
        }

        const supabase = await createClient()

        await supabase.rpc('record_payment', {
            p_email: email,
            p_txnid: txnid,
            p_payment_id: mihpayid || txnid,
            p_amount: amount,
            p_product_info: productinfo,
            p_status: status === 'success' ? 'success' : 'failed',
            p_profile_id: udf1 || null,
        })

        if (status === 'success') {
            if (productinfo.startsWith('Membership:')) {
                // Activate by user id (udf1) — survives email edits on the PayU form.
                const { data: activated } = udf1
                    ? await supabase.rpc('activate_membership_by_profile', {
                        p_profile_id: udf1,
                        p_payment_id: mihpayid || txnid,
                    })
                    : { data: false }

                if (!activated) {
                    await supabase.rpc('activate_membership_by_email', {
                        p_email: email,
                        p_payment_id: mihpayid || txnid,
                    })
                }

                return NextResponse.redirect(new URL('/billing?payment=success', req.url))
            }

            let profileId = udf1
            if (!profileId) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('email', email)
                    .single()
                profileId = profile?.id || ''
            }

            if (profileId) {
                const courseId = productinfo.replace('Course: ', '')
                await supabase.from('enrollments').upsert({
                    profile_id: profileId,
                    course_id: courseId,
                    status: 'active',
                    payment_id: mihpayid || txnid,
                }, { onConflict: 'profile_id,course_id' })

                return NextResponse.redirect(new URL(`/courses/${courseId}?payment=success`, req.url))
            }
        }

        return NextResponse.redirect(new URL('/courses?payment=failed', req.url))
    } catch (error) {
        console.error('PayU webhook error:', error)
        return NextResponse.redirect(new URL('/courses?payment=failed', req.url))
    }
}
