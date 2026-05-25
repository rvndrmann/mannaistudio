import type { SupabaseClient } from "@supabase/supabase-js"
import { getPortfolioClient, isSupabaseConfigured } from "@/lib/portfolio"

export type ServiceRequestStatus = "new" | "contacted" | "closed"

export type ServiceRequest = {
    id: string
    fullName: string
    email: string
    serviceType: string
    projectDescription: string
    budgetRange: string
    timeline: string
    status: ServiceRequestStatus
    createdAt: string
}

export type ServiceRequestInput = {
    fullName: string
    email: string
    serviceType: string
    projectDescription: string
    budgetRange: string
    timeline: string
}

export { getPortfolioClient as getServiceRequestClient, isSupabaseConfigured }

function mapServiceRequest(row: any): ServiceRequest {
    return {
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        serviceType: row.service_type,
        projectDescription: row.project_description,
        budgetRange: row.budget_range || "",
        timeline: row.timeline || "",
        status: row.status || "new",
        createdAt: row.created_at,
    }
}

export async function createServiceRequest(supabase: SupabaseClient, input: ServiceRequestInput) {
    const { data, error } = await supabase
        .from("service_requests")
        .insert({
            full_name: input.fullName,
            email: input.email,
            service_type: input.serviceType,
            project_description: input.projectDescription,
            budget_range: input.budgetRange,
            timeline: input.timeline,
        })
        .select("*")
        .single()

    if (error) throw error
    return mapServiceRequest(data)
}

export async function fetchServiceRequests(supabase: SupabaseClient) {
    const { data, error } = await supabase
        .from("service_requests")
        .select("*")
        .order("created_at", { ascending: false })

    if (error) throw error
    return (data || []).map(mapServiceRequest)
}

export async function updateServiceRequestStatus(
    supabase: SupabaseClient,
    id: string,
    status: ServiceRequestStatus,
) {
    const { data, error } = await supabase
        .from("service_requests")
        .update({ status })
        .eq("id", id)
        .select("*")
        .single()

    if (error) throw error
    return mapServiceRequest(data)
}
