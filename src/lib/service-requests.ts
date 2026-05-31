import type { SupabaseClient } from "@supabase/supabase-js"
import { getPortfolioClient, isSupabaseConfigured } from "@/lib/portfolio"

export type ServiceRequestStatus = "pending" | "approved" | "rejected" | "awarded" | "closed"

export type ServiceBid = {
    id: string
    jobId: string
    bidderId: string
    bidderName: string
    bidderEmail: string
    bidderPhone: string
    offerAmount: string
    message: string
    status: "pending" | "selected" | "rejected"
    createdAt: string
}

export type ServiceRequest = {
    id: string
    posterId: string
    fullName: string
    email: string
    phone: string
    serviceType: string
    title: string
    projectDescription: string
    budgetRange: string
    timeline: string
    status: ServiceRequestStatus
    selectedBidId: string
    createdAt: string
    bids: ServiceBid[]
}

export type ServiceRequestInput = {
    posterId: string
    fullName: string
    email: string
    phone: string
    serviceType: string
    title: string
    projectDescription: string
    budgetRange: string
    timeline: string
}

export type ServiceBidInput = {
    jobId: string
    bidderId: string
    bidderName: string
    bidderEmail: string
    bidderPhone: string
    offerAmount: string
    message: string
}

export { getPortfolioClient as getServiceRequestClient, isSupabaseConfigured }

function mapServiceBid(row: any): ServiceBid {
    return {
        id: row.id,
        jobId: row.job_id,
        bidderId: row.bidder_id,
        bidderName: row.bidder_name || "Creator",
        bidderEmail: row.bidder_email || "",
        bidderPhone: row.bidder_phone || "",
        offerAmount: row.offer_amount || "",
        message: row.message || "",
        status: row.status || "pending",
        createdAt: row.created_at,
    }
}

function mapServiceRequest(row: any, bids: ServiceBid[] = []): ServiceRequest {
    return {
        id: row.id,
        posterId: row.poster_id || "",
        fullName: row.full_name,
        email: row.email,
        phone: row.phone || "",
        serviceType: row.service_type,
        title: row.title || row.service_type,
        projectDescription: row.project_description,
        budgetRange: row.budget_range || "",
        timeline: row.timeline || "",
        status: row.status || "pending",
        selectedBidId: row.selected_bid_id || "",
        createdAt: row.created_at,
        bids,
    }
}

function groupBids(rows: any[] | null) {
    const grouped = new Map<string, ServiceBid[]>()
    ;(rows || []).forEach((row) => {
        const current = grouped.get(row.job_id) || []
        current.push(mapServiceBid(row))
        grouped.set(row.job_id, current)
    })
    return grouped
}

async function fetchBidsForJobs(supabase: SupabaseClient) {
    const { data, error } = await supabase
        .from("service_job_bids")
        .select("*")
        .order("created_at", { ascending: false })

    if (error) throw error
    return groupBids(data)
}

export async function createServiceRequest(supabase: SupabaseClient, input: ServiceRequestInput) {
    const { data, error } = await supabase
        .from("service_requests")
        .insert({
            poster_id: input.posterId,
            full_name: input.fullName,
            email: input.email,
            phone: input.phone,
            service_type: input.serviceType,
            title: input.title,
            project_description: input.projectDescription,
            budget_range: input.budgetRange,
            timeline: input.timeline,
            status: "pending",
        })
        .select("*")
        .single()

    if (error) throw error
    return mapServiceRequest(data)
}

export async function fetchServiceRequests(supabase: SupabaseClient) {
    const [{ data, error }, bidsByJob] = await Promise.all([
        supabase
            .from("service_requests")
            .select("*")
            .order("created_at", { ascending: false }),
        fetchBidsForJobs(supabase),
    ])

    if (error) throw error
    return (data || []).map((row: any) => mapServiceRequest(row, bidsByJob.get(row.id) || []))
}

export async function fetchApprovedJobs(supabase: SupabaseClient) {
    const [{ data, error }, bidsByJob] = await Promise.all([
        supabase
            .from("service_requests")
            .select("*")
            .in("status", ["approved", "awarded", "closed"])
            .order("created_at", { ascending: false }),
        fetchBidsForJobs(supabase),
    ])

    if (error) throw error
    return (data || []).map((row: any) => mapServiceRequest(row, bidsByJob.get(row.id) || []))
}

export async function fetchMyServiceJobs(supabase: SupabaseClient, userId: string) {
    const [{ data, error }, bidsByJob] = await Promise.all([
        supabase
            .from("service_requests")
            .select("*")
            .eq("poster_id", userId)
            .order("created_at", { ascending: false }),
        fetchBidsForJobs(supabase),
    ])

    if (error) throw error
    return (data || []).map((row: any) => mapServiceRequest(row, bidsByJob.get(row.id) || []))
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

export async function createServiceBid(supabase: SupabaseClient, input: ServiceBidInput) {
    const { data, error } = await supabase
        .from("service_job_bids")
        .upsert({
            job_id: input.jobId,
            bidder_id: input.bidderId,
            bidder_name: input.bidderName,
            bidder_email: input.bidderEmail,
            bidder_phone: input.bidderPhone,
            offer_amount: input.offerAmount,
            message: input.message,
        }, { onConflict: "job_id,bidder_id" })
        .select("*")
        .single()

    if (error) throw error
    return mapServiceBid(data)
}

export async function updateServiceBid(supabase: SupabaseClient, bidId: string, input: Omit<ServiceBidInput, "jobId" | "bidderId">) {
    const { data, error } = await supabase
        .from("service_job_bids")
        .update({
            bidder_name: input.bidderName,
            bidder_email: input.bidderEmail,
            bidder_phone: input.bidderPhone,
            offer_amount: input.offerAmount,
            message: input.message,
        })
        .eq("id", bidId)
        .select("*")
        .single()

    if (error) throw error
    return mapServiceBid(data)
}

export async function selectServiceBid(supabase: SupabaseClient, jobId: string, bidId: string) {
    const { data, error } = await supabase.rpc("select_service_job_bid", {
        p_job_id: jobId,
        p_bid_id: bidId,
    })

    if (error) throw error
    return data
}
