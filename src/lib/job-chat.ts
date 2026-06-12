import type { SupabaseClient } from "@supabase/supabase-js"
import { getPortfolioClient, isSupabaseConfigured } from "@/lib/portfolio"

export type Notification = {
    id: string
    type: string
    title: string
    body: string
    jobId: string
    read: boolean
    createdAt: string
}

export type JobMessage = {
    id: string
    jobId: string
    senderId: string
    senderName: string
    content: string
    createdAt: string
}

export { getPortfolioClient as getJobChatClient, isSupabaseConfigured }

function mapNotification(row: any): Notification {
    return {
        id: row.id,
        type: row.type || "generic",
        title: row.title || "",
        body: row.body || "",
        jobId: row.job_id || "",
        read: Boolean(row.read),
        createdAt: row.created_at,
    }
}

function mapMessage(row: any): JobMessage {
    return {
        id: row.id,
        jobId: row.job_id,
        senderId: row.sender_id,
        senderName: row.sender_name || "User",
        content: row.content,
        createdAt: row.created_at,
    }
}

export async function fetchNotifications(supabase: SupabaseClient, userId: string) {
    const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(30)

    if (error) throw error
    return (data || []).map(mapNotification)
}

export async function markNotificationsRead(supabase: SupabaseClient, userId: string, ids?: string[]) {
    let query = supabase.from("notifications").update({ read: true }).eq("user_id", userId)
    if (ids?.length) query = query.in("id", ids)
    const { error } = await query
    if (error) throw error
}

export async function fetchJobMessages(supabase: SupabaseClient, jobId: string) {
    const { data, error } = await supabase
        .from("job_messages")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true })

    if (error) throw error
    return (data || []).map(mapMessage)
}

export async function sendJobMessage(
    supabase: SupabaseClient,
    input: { jobId: string; senderId: string; senderName: string; content: string },
) {
    const { data, error } = await supabase
        .from("job_messages")
        .insert({
            job_id: input.jobId,
            sender_id: input.senderId,
            sender_name: input.senderName,
            content: input.content,
        })
        .select("*")
        .single()

    if (error) throw error
    return mapMessage(data)
}
