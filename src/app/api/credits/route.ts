import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { createClient } from "@/lib/supabase/server"
import { addUserCredits, getUserCredits } from "@/lib/studio/credits"
import { isAdminUser, isMembershipActive } from "@/lib/membership"

const topUpSchema = z.object({
  packageId: z.enum(["1000", "2500", "5000", "10000"]),
}).strict()

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
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase.from("profiles").select("membership_status, membership_expires_at").eq("id", user.id).maybeSingle()
    const isAdmin = await isAdminUser(supabase, user.id)
    const activeMember = isAdmin || isMembershipActive(profile)

    if (!activeMember) {
      return NextResponse.json(
        { error: "An active membership (Starter $9/mo or Pro $30/mo) is required to purchase credits. Please upgrade your membership first." },
        { status: 403 },
      )
    }

    const body = await request.json()
    const input = topUpSchema.parse(body)

    const creditPackages: Record<string, { credits: number; priceUsd: number; name: string }> = {
      "1000": { credits: 1000, priceUsd: 10, name: "1,000 Credits ($10 USD)" },
      "2500": { credits: 2500, priceUsd: 25, name: "2,500 Credits ($25 USD)" },
      "5000": { credits: 5000, priceUsd: 50, name: "5,000 Credits ($50 USD)" },
      "10000": { credits: 10000, priceUsd: 100, name: "10,000 Credits ($100 USD)" },
    }

    const selectedPkg = creditPackages[input.packageId]
    if (!selectedPkg) return NextResponse.json({ error: "Invalid credit package" }, { status: 400 })

    // Simulate instant credit addition (or hook into payment webhook)
    const newBalance = await addUserCredits(
      user.id,
      selectedPkg.credits,
      "purchase",
      `Credit Package Purchase: ${selectedPkg.name}`,
      supabase,
    )

    return NextResponse.json({
      success: true,
      addedCredits: selectedPkg.credits,
      newBalance,
      message: `Successfully added ${selectedPkg.credits.toLocaleString()} credits to your account!`,
    })
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
    return NextResponse.json({ error: err instanceof Error ? err.message : "Top-up failed" }, { status: 500 })
  }
}
