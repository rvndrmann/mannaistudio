import type { SupabaseClient } from "@supabase/supabase-js"

export const membershipPlan = {
    name: "AI Director Hub Pro",
    price: 999,
    currency: "INR",
    portfolioLimit: 10,
    freePortfolioLimit: 2,
}

export type BillingSettings = {
    planName: string
    monthlyPrice: number
    offerEnabled: boolean
    offerPrice: number
    offerText: string
    paymentsEnabled: boolean
}

export const defaultBillingSettings: BillingSettings = {
    planName: membershipPlan.name,
    monthlyPrice: membershipPlan.price,
    offerEnabled: false,
    offerPrice: 799,
    offerText: "Limited offer: AI Director Hub Pro for ₹799/month",
    paymentsEnabled: false,
}

export function normalizeBillingSettings(value: any): BillingSettings {
    return {
        planName: value?.plan_name || defaultBillingSettings.planName,
        monthlyPrice: Number(value?.monthly_price || defaultBillingSettings.monthlyPrice),
        offerEnabled: Boolean(value?.offer_enabled),
        offerPrice: Number(value?.offer_price || defaultBillingSettings.offerPrice),
        offerText: value?.offer_text || defaultBillingSettings.offerText,
        paymentsEnabled: value?.payments_enabled !== undefined ? Boolean(value.payments_enabled) : defaultBillingSettings.paymentsEnabled,
    }
}

export function getActivePlanPrice(settings: BillingSettings) {
    return settings.offerEnabled ? settings.offerPrice : settings.monthlyPrice
}

export function isMembershipActive(profile: any) {
    if (!profile || profile.membership_status !== "active") return false
    if (!profile.membership_expires_at) return true
    return new Date(profile.membership_expires_at).getTime() > Date.now()
}

export function hasPremiumAccess(profile: any, isAdmin = false) {
    return isAdmin || isMembershipActive(profile)
}

export function getPortfolioLimit(profile: any, isAdmin = false) {
    return hasPremiumAccess(profile, isAdmin) ? membershipPlan.portfolioLimit : membershipPlan.freePortfolioLimit
}

export async function isAdminUser(supabase: SupabaseClient, userId: string) {
    const { data, error } = await supabase
        .from("admin_users")
        .select("id")
        .eq("id", userId)
        .maybeSingle()

    return !error && !!data
}

export async function fetchMyMembership(supabase: SupabaseClient, userId: string) {
    const { data, error } = await supabase
        .from("profiles")
        .select("membership_status, membership_expires_at, membership_payment_id, is_trial")
        .eq("id", userId)
        .single()

    if (error) return null
    return data
}

export async function fetchBillingSettings(supabase: SupabaseClient) {
    const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "billing")
        .single()

    if (error) return defaultBillingSettings
    return normalizeBillingSettings(data?.value)
}

export type PaymentRecord = {
    id: string
    txnid: string
    paymentId: string
    amount: string
    productInfo: string
    status: "success" | "failed"
    createdAt: string
}

export async function fetchMyPayments(supabase: SupabaseClient, userId: string): Promise<PaymentRecord[]> {
    const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("profile_id", userId)
        .order("created_at", { ascending: false })
        .limit(50)

    if (error) return []
    return (data || []).map((row: any) => ({
        id: row.id,
        txnid: row.txnid,
        paymentId: row.payment_id,
        amount: row.amount,
        productInfo: row.product_info,
        status: row.status,
        createdAt: row.created_at,
    }))
}
