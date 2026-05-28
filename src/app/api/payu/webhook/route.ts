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

        const salt = process.env.PAYU_SALT!
        const key = process.env.PAYU_KEY!

        // Reverse hash verification: SALT|status||||||||||email|firstname|productinfo|amount|txnid|key
        const reverseHashString = `${salt}|${status}||||||||||${email}|${firstname}|${productinfo}|${amount}|${txnid}|${key}`
        const expectedHash = crypto.createHash('sha512').update(reverseHashString).digest('hex')

        if (hash !== expectedHash) {
            return NextResponse.redirect(new URL('/courses?payment=failed', req.url))
        }

        if (status === 'success') {
            const supabase = await createClient()

            if (productinfo.startsWith('Membership:')) {
                await supabase.rpc('activate_membership_by_email', {
                    p_email: email,
                    p_payment_id: mihpayid || txnid,
                })

                return NextResponse.redirect(new URL('/billing?payment=success', req.url))
            }

            // Find the user by email
            const { data: profile } = await supabase
                .from('profiles')
                .select('id')
                .eq('email', email)
                .single()

            if (profile) {
                const courseId = productinfo.replace('Course: ', '')
                await supabase.from('enrollments').upsert({
                    profile_id: profile.id,
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
