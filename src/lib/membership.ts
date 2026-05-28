import type { SupabaseClient } from "@supabase/supabase-js"

export const membershipPlan = {
    name: "AI Mastery Pro",
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
}

export const defaultBillingSettings: BillingSettings = {
    planName: membershipPlan.name,
    monthlyPrice: membershipPlan.price,
    offerEnabled: false,
    offerPrice: 799,
    offerText: "Limited offer: AI Mastery Pro for ₹799/month",
}

export function normalizeBillingSettings(value: any): BillingSettings {
    return {
        planName: value?.plan_name || defaultBillingSettings.planName,
        monthlyPrice: Number(value?.monthly_price || defaultBillingSettings.monthlyPrice),
        offerEnabled: Boolean(value?.offer_enabled),
        offerPrice: Number(value?.offer_price || defaultBillingSettings.offerPrice),
        offerText: value?.offer_text || defaultBillingSettings.offerText,
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

export function getPortfolioLimit(profile: any) {
    return isMembershipActive(profile) ? membershipPlan.portfolioLimit : membershipPlan.freePortfolioLimit
}

export async function fetchMyMembership(supabase: SupabaseClient, userId: string) {
    const { data, error } = await supabase
        .from("profiles")
        .select("membership_status, membership_expires_at, membership_payment_id")
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
