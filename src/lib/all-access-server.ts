import "server-only"
import Razorpay from "razorpay"
import { ALL_ACCESS_TYPE, ALL_ACCESS_NAME, allAccessPlanId } from "./all-access-plan"
import { createServiceClient } from "./supabase/service"

export function allAccessGateway() {
  const key_id = process.env.RAZORPAY_KEY_ID
  const key_secret = process.env.RAZORPAY_KEY_SECRET
  if (!key_id || !key_secret) throw new Error("Razorpay is not configured.")
  return new Razorpay({ key_id, key_secret })
}
export async function configuredAllAccessPlan() {
  const id = allAccessPlanId()
  if (!id) return null
  const plan = await allAccessGateway().plans.fetch(id)
  if (plan.period !== "monthly" || Number(plan.interval) !== 1 || plan.item.currency !== "INR" || Number(plan.item.amount) <= 0) {
    throw new Error("The All Access Razorpay plan must bill a positive INR amount monthly.")
  }
  return { id, amountPaise: Number(plan.item.amount), currency: "INR" }
}

/** Persist only verified, registered subscriptions. An activation is not a charge. */
export async function reconcileAllAccess(subscriptionId: string, payment?: { id: string; amount: number; currency: string; status: string }, chargedPeriodEnd?: number) {
  const client = createServiceClient()
  const { data: row, error } = await client.from("all_access_subscriptions").select("*").eq("id", subscriptionId).maybeSingle()
  if (error) throw error
  if (!row) throw new Error("Unknown All Access subscription.")
  const gateway = allAccessGateway()
  const subscription = await gateway.subscriptions.fetch(subscriptionId)
  const notes = subscription.notes as Record<string, string> | undefined
  if (notes?.type !== ALL_ACCESS_TYPE || notes.profile_id !== row.profile_id || subscription.plan_id !== row.plan_id) {
    throw new Error("Subscription ownership or plan does not match.")
  }
  let paidUntil: string | null = null
  if (payment) {
    const plan = await gateway.plans.fetch(row.plan_id)
    if (payment.status !== "captured" || payment.currency !== "INR" || payment.amount !== Number(plan.item.amount)) {
      throw new Error("All Access payment amount or status does not match the plan.")
    }
    const end = Number(chargedPeriodEnd || 0)
    if (!Number.isFinite(end) || end <= 0) throw new Error("Missing paid subscription period.")
    paidUntil = new Date(end * 1000).toISOString()
  }
  const { error: updateError } = await client.rpc("apply_all_access_subscription_event", {
    p_subscription_id: subscriptionId, p_profile_id: row.profile_id,
    p_status: subscription.status, p_cancel_at_cycle_end: Boolean((subscription as unknown as { cancel_at_cycle_end?: boolean }).cancel_at_cycle_end),
    p_payment_id: payment?.id || null, p_paid_until: paidUntil,
    p_amount_paise: payment?.amount || null, p_currency: payment?.currency || null,
  })
  if (updateError) throw updateError
  if (payment) {
    const { error: historyError } = await client.rpc("record_payment", {
      p_email: notes.email || "", p_txnid: payment.id, p_payment_id: payment.id,
      p_amount: String(payment.amount / 100), p_product_info: `${ALL_ACCESS_NAME} — monthly BYOK subscription`,
      p_status: "success", p_profile_id: row.profile_id,
    })
    if (historyError) throw historyError
  }
  return subscription
}
