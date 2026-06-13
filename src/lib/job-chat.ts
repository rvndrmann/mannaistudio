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

export type ChatThread = {
    jobId: string
    jobTitle: string
    otherUserId: string
    otherUserName: string
    otherUserAvatar: string
    lastMessage: string
    lastMessageAt: string
    unreadCount: number
}

export async function fetchChatThreads(supabase: SupabaseClient, userId: string): Promise<ChatThread[]> {
    // Get all awarded jobs where user is poster or winning bidder
    const { data: jobs, error: jobsErr } = await supabase
        .from("service_requests")
        .select("id, title, poster_id, selected_bid_id, profiles!service_requests_poster_id_fkey(full_name, avatar_url)")
        .eq("status", "awarded")

    if (jobsErr || !jobs) return []

    const threads: ChatThread[] = []

    for (const job of jobs) {
        // Get the winning bid to find the other participant
        const { data: bid } = await supabase
            .from("service_job_bids")
            .select("bidder_id, bidder_name")
            .eq("id", job.selected_bid_id)
            .single()

        if (!bid) continue

        const isPoster = job.poster_id === userId
        const isWinner = bid.bidder_id === userId
        if (!isPoster && !isWinner) continue

        const posterProfile = Array.isArray(job.profiles) ? job.profiles[0] : job.profiles
        const otherUserId = isPoster ? bid.bidder_id : job.poster_id
        const otherUserName = isPoster ? bid.bidder_name : (posterProfile?.full_name || "Client")
        const otherUserAvatar = isPoster ? "" : (posterProfile?.avatar_url || "")

        // Get last message
        const { data: lastMsg } = await supabase
            .from("job_messages")
            .select("content, created_at")
            .eq("job_id", job.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single()

        // Count unread notifications for this job
        const { count } = await supabase
            .from("notifications")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("job_id", job.id)
            .eq("type", "job_message")
            .eq("read", false)

        threads.push({
            jobId: job.id,
            jobTitle: job.title,
            otherUserId,
            otherUserName,
            otherUserAvatar,
            lastMessage: lastMsg?.content || "",
            lastMessageAt: lastMsg?.created_at || "",
            unreadCount: count || 0,
        })
    }

    threads.sort((a, b) => {
        if (!a.lastMessageAt && !b.lastMessageAt) return 0
        if (!a.lastMessageAt) return 1
        if (!b.lastMessageAt) return -1
        return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    })

    return threads
}

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
