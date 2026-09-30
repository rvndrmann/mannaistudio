import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import Razorpay from "razorpay"
import { createClient } from "@/lib/supabase/server"
import { getUserCredits } from "@/lib/studio/credits"
import { isAdminUser, isMembershipActive } from "@/lib/membership"
import { CREDIT_PACKAGES } from "@/lib/credits-packages"
import { sendCapiEvent } from "@/lib/meta-capi"
import { getCreatorStudioAccess } from "@/lib/studio/entitlement"
import { INR_PER_USD } from "@/lib/currency"

const MIN_TOP_UP_INR = Math.ceil(5 * INR_PER_USD)

const topUpSchema = z.object({
  packageId: z.string().optional(),
  amountInr: z.number().optional(),
}).refine((data) => (data.amountInr && data.amountInr >= MIN_TOP_UP_INR) || (data.packageId && CREDIT_PACKAGES[data.packageId]), {
  message: `Minimum purchase is $5 (₹${MIN_TOP_UP_INR.toLocaleString("en-IN")}).`,
})

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const studioAccess = await getCreatorStudioAccess(supabase, user.id)
    if (!studioAccess.entitled) return NextResponse.json({ error: "Creator Studio access is required." }, { status: 403 })

    const credits = await getUserCredits(user.id, supabase)
    const { data: profile } = await supabase.from("profiles").select("membership_status, membership_expires_at").eq("id", user.id).maybeSingle()
    const isAdmin = await isAdminUser(supabase, user.id)
    const activeMember = isAdmin || isMembershipActive(profile)
    const studioSubscriber = await hasActiveStudioSubscription(supabase, user.id)

    // Credits already committed to work still running.
    //
    // The balance alone reads as more headroom than there is: a queued batch
    // has been charged against the account but its jobs have not finished, so
    // someone looking at the badge mid-render sees a number that is about to
    // move for reasons they cannot see. Reported separately rather than
    // subtracted, because the balance is what it is — this is what is spoken
    // for out of it.
    const { data: inFlight } = await supabase
      .from("creator_generation_jobs")
      .select("estimated_credits,credits_used,billing_mode,status")
      .eq("user_id", user.id)
      .in("status", ["queued", "awaiting_approval", "approved", "processing", "generating"])
    const pendingCredits = (inFlight || []).reduce((total, job) => {
      // A job on the customer's own key is not spoken for out of this balance.
      if (job.billing_mode === "byok") return total
      return total + (Number(job.credits_used) || Number(job.estimated_credits) || 0)
    }, 0)

    return NextResponse.json({ credits, pendingCredits, userId: user.id, isMember: activeMember, canBuyCredits: activeMember || studioSubscriber, purchaseOnly: studioAccess.purchaseOnly, purchaseWindowExpiresAt: studioAccess.purchaseWindowExpiresAt })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID
    const keySecret = process.env.RAZORPAY_KEY_SECRET
    if (!keyId || !keySecret) {
      return NextResponse.json({ error: "Razorpay is not configured." }, { status: 500 })
    }

    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const studioAccess = await getCreatorStudioAccess(supabase, user.id)
    if (!studioAccess.entitled) return NextResponse.json({ error: "Creator Studio access is required to buy generation credits." }, { status: 403 })
    if (studioAccess.purchaseOnly) return NextResponse.json({ error: "During your 24-hour access window, use the 3,000-credit offer to keep Creator Studio access." }, { status: 403 })

    const [{ data: profile }, isAdmin, studioSubscriber] = await Promise.all([
      supabase.from("profiles").select("membership_status,membership_expires_at").eq("id", user.id).maybeSingle(),
      isAdminUser(supabase, user.id),
      hasActiveStudioSubscription(supabase, user.id),
    ])
    if (!isAdmin && !isMembershipActive(profile) && !studioSubscriber) {
      return NextResponse.json({ error: "An active subscription is required to buy additional credits." }, { status: 403 })
    }

    // A POST with no body throws inside JSON.parse, and the route reported it
    // as an unhandled SyntaxError rather than a bad request — which is what it
    // is. The server log filled with "Unexpected end of JSON input" naming this
    // page and nothing about the caller.
    const body = await request.json().catch(() => null)
    if (body === null) {
      return NextResponse.json({ error: "A credit top-up needs a package or an amount." }, { status: 400 })
    }
    const input = topUpSchema.parse(body)

    let priceInr = 1000
    let credits = 1000
    let packageId = input.packageId || "custom"

    if (input.amountInr && input.amountInr >= MIN_TOP_UP_INR) {
      priceInr = Math.floor(input.amountInr)
      credits = priceInr
    } else if (input.packageId && CREDIT_PACKAGES[input.packageId]) {
      priceInr = CREDIT_PACKAGES[input.packageId].priceInr
      credits = CREDIT_PACKAGES[input.packageId].credits
    }

    const amountInPaise = priceInr * 100
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `credits_${user.id.slice(0, 8)}_${Date.now()}`,
      notes: {
        type: "credits",
        profile_id: user.id,
        credits: String(credits),
        packageId,
        email: user.email || "",
      },
    })

    // The mid-funnel signal Meta can optimise against while actual purchase
    // volume is still too low to train on. Keyed on the order ID so a retried
    // request deduplicates rather than reporting a second checkout.
    await sendCapiEvent({
      eventName: "InitiateCheckout",
      eventId: `checkout-${order.id}`,
      email: user.email,
      externalId: user.id,
      value: priceInr,
      currency: "INR",
      sourceUrl: "https://www.aidirectorhub.com/billing",
      customData: { content_name: `Credits: ${credits}`, content_type: "credits", content_ids: [packageId] },
    })

    return NextResponse.json({
      orderId: order.id,
      amount: amountInPaise,
      priceInr,
      keyId,
      credits,
      email: user.email || "",
      name: user.user_metadata?.full_name || "Creator",
    })
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: `Minimum purchase is $5 (₹${MIN_TOP_UP_INR.toLocaleString("en-IN")}).` }, { status: 400 })
    return NextResponse.json({ error: err instanceof Error ? err.message : "Order creation failed" }, { status: 500 })
  }
}

async function hasActiveStudioSubscription(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const now = new Date().toISOString()
  const { data, error } = await supabase.from("user_entitlements")
    .select("id")
    .eq("profile_id", userId)
    .eq("entitlement_key", "creator_studio_access")
    .eq("source_type", "studio_subscription")
    .lte("starts_at", now)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .limit(1)
  return !error && Boolean(data?.length)
}
