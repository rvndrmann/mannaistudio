import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import Razorpay from "razorpay"
import { createClient } from "@/lib/supabase/server"
import { getUserCredits } from "@/lib/studio/credits"
import { isAdminUser, isMembershipActive } from "@/lib/membership"

const topUpSchema = z.object({
  packageId: z.enum(["1000", "2500", "5000", "10000"]),
}).strict()

export const CREDIT_PACKAGES: Record<string, { credits: number; priceInr: number; name: string }> = {
  "1000": { credits: 1000, priceInr: 800, name: "1,000 Credits (₹800)" },
  "2500": { credits: 2500, priceInr: 2000, name: "2,500 Credits (₹2,000)" },
  "5000": { credits: 5000, priceInr: 4000, name: "5,000 Credits (₹4,000)" },
  "10000": { credits: 10000, priceInr: 8000, name: "10,000 Credits (₹8,000)" },
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const credits = await getUserCredits(user.id, supabase)
    const { data: profile } = await supabase.from("profiles").select("membership_status, membership_expires_at").eq("id", user.id).maybeSingle()
    const isAdmin = await isAdminUser(supabase, user.id)
    const activeMember = isAdmin || isMembershipActive(profile)

    return NextResponse.json({ credits, userId: user.id, isMember: activeMember })
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

    const body = await request.json()
    const input = topUpSchema.parse(body)

    const selectedPkg = CREDIT_PACKAGES[input.packageId]
    if (!selectedPkg) return NextResponse.json({ error: "Invalid credit package" }, { status: 400 })

    const amountInPaise = selectedPkg.priceInr * 100
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `credits_${user.id.slice(0, 8)}_${Date.now()}`,
      notes: {
        type: "credits",
        profile_id: user.id,
        credits: String(selectedPkg.credits),
        packageId: input.packageId,
        email: user.email || "",
      },
    })

    return NextResponse.json({
      orderId: order.id,
      amount: amountInPaise,
      keyId,
      credits: selectedPkg.credits,
      email: user.email || "",
      name: user.user_metadata?.full_name || "Creator",
    })
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
    return NextResponse.json({ error: err instanceof Error ? err.message : "Order creation failed" }, { status: 500 })
  }
}
