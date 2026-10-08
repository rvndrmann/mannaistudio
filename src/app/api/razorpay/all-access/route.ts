import { byokIsConfigured } from "@/lib/byok/kms"
import { byokPaused } from "@/lib/byok/paused"
import { NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { ALL_ACCESS_TYPE, ALL_ACCESS_NAME, isPaidAccessPeriod } from "@/lib/all-access-plan"
import { allAccessGateway, configuredAllAccessPlan, reconcileAllAccess } from "@/lib/all-access-server"

export async function GET() {
  try {
    const plan = await configuredAllAccessPlan()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    let subscriptions: Record<string, unknown>[] = []
    if (user) {
      const { data, error } = await supabase.from("all_access_subscriptions").select("*")
        .eq("profile_id", user.id).order("created_at", { ascending: false })
      if (error) throw error
      for (const row of data || []) {
        if (["created", "authenticated", "active", "pending", "halted"].includes(row.status)) await reconcileAllAccess(row.id)
      }
      const { data: refreshed, error: refreshError } = await supabase.from("all_access_subscriptions").select("*").eq("profile_id", user.id).order("created_at", { ascending: false })
      if (refreshError) throw refreshError
      subscriptions = refreshed || []
    }
    const active = subscriptions.find(row => isPaidAccessPeriod(row as { paid_until: string | null }))
    return NextResponse.json({ name: ALL_ACCESS_NAME, configured: Boolean(plan) && byokIsConfigured() && !await byokPaused(), priceInr: plan ? plan.amountPaise / 100 : null,
      active: Boolean(active), subscription: subscriptions[0] || null, paidUntil: active?.paid_until || null, byokRequired: subscriptions.some(row => Boolean(row.paid_until)) }, { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return NextResponse.json({ error: "Could not load All Access subscription. Check payment configuration." }, { status: 503 })
  }
}

export async function POST() {
  let service: ReturnType<typeof createServiceClient> | null = null
  let reservation: string | null = null
  let remoteCreated = false
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Sign in to subscribe." }, { status: 401 })
    service = createServiceClient()
    if (!byokIsConfigured() || await byokPaused()) return NextResponse.json({ error: "BYOK is not currently available. Subscription checkout is paused." }, { status: 503 })
    const plan = await configuredAllAccessPlan()
    if (!plan) return NextResponse.json({ error: "This subscription is not configured yet." }, { status: 503 })
    const { data: previous, error: readError } = await service.from("all_access_subscriptions").select("*").eq("profile_id", user.id)
    if (readError) throw readError
    if ((previous || []).some(row => isPaidAccessPeriod(row))) return NextResponse.json({ error: "Your All Access subscription is still paid and active." }, { status: 409 })
    const live = (previous || []).find(row => ["creating","created","authenticated","active","pending","halted"].includes(row.status))
    if (live) {
      if (live.status === "created") return NextResponse.json({ subscriptionId: live.id, keyId: process.env.RAZORPAY_KEY_ID, email: user.email, name: user.user_metadata?.full_name || "Creator" })
      return NextResponse.json({ error: "An existing subscription needs attention. Manage it before starting another." }, { status: 409 })
    }
    reservation = `creating_${randomUUID()}`
    const { error: reserveError } = await service.from("all_access_subscriptions").insert({ id: reservation, profile_id: user.id, plan_id: plan.id, status: "creating" })
    if (reserveError) return NextResponse.json({ error: "A subscription checkout is already in progress." }, { status: 409 })
    const subscription = await allAccessGateway().subscriptions.create({ plan_id: plan.id, customer_notify: 1, total_count: 120,
      notes: { type: ALL_ACCESS_TYPE, profile_id: user.id, email: user.email || "", credits: "0" } })
    remoteCreated = true
    const { error } = await service.from("all_access_subscriptions").update({ id: subscription.id, status: subscription.status }).eq("id", reservation)
    if (error) throw error
    return NextResponse.json({ subscriptionId: subscription.id, keyId: process.env.RAZORPAY_KEY_ID, email: user.email, name: user.user_metadata?.full_name || "Creator" })
  } catch {
    // Retain a reservation after remote creation if persistence failed: do not create a second mandate.
    if (reservation && !remoteCreated && service) await service.from("all_access_subscriptions").delete().eq("id", reservation)
    return NextResponse.json({ error: "Could not start subscription. Please retry or contact support if checkout is already pending." }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
    const body = await request.json() as { subscriptionId?: string }
    const { data: row, error } = await supabase.from("all_access_subscriptions").select("id,status").eq("profile_id", user.id).eq("id", body.subscriptionId || "").maybeSingle()
    if (error || !row) return NextResponse.json({ error: "Subscription not found." }, { status: 404 })
    const subscription = await reconcileAllAccess(row.id)
    if (!["cancelled","completed","expired"].includes(subscription.status) && !(subscription as unknown as { cancel_at_cycle_end?: boolean }).cancel_at_cycle_end) {
      await allAccessGateway().subscriptions.cancel(row.id, { cancel_at_cycle_end: subscription.status === "active" ? 1 : 0 } as never)
      await reconcileAllAccess(row.id)
    }
    return NextResponse.json({ cancelled: true })
  } catch {
    return NextResponse.json({ error: "Could not cancel subscription." }, { status: 500 })
  }
}
