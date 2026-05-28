import type { SupabaseClient } from "@supabase/supabase-js"

export const membershipPlan = {
    name: "AI Mastery Pro",
    price: 999,
    currency: "INR",
    portfolioLimit: 10,
    freePortfolioLimit: 2,
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
