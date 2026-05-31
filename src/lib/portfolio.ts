import type { SupabaseClient } from "@supabase/supabase-js"

export type PortfolioVideo = {
    id: string
    title: string
    views: string
    likes: number
    url: string
    thumbnail: string
}

export type PublicPortfolio = {
    name: string
    email: string
    avatarUrl: string
    level: number
    xp: number
    slug: string
    videos: PortfolioVideo[]
}

export type PortfolioFeedItem = PortfolioVideo & {
    createdAt: string
    creator: {
        name: string
        avatarUrl: string
        level: number
        xp: number
        slug: string
    }
}

type ProfileInput = {
    full_name?: string | null
    avatar_url?: string | null
    email?: string | null
    xp?: number | null
    level?: number | null
}

export const portfolioStorageKey = "ai-mastery-portfolio"

export function isSupabaseConfigured(): boolean {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    return !!url && !!key && url !== "your_supabase_url" && key !== "your_supabase_anon_key" && url.startsWith("http")
}

export async function getPortfolioClient(): Promise<SupabaseClient | null> {
    if (!isSupabaseConfigured()) return null

    try {
        const { createClient } = await import("@/lib/supabase/client")
        return createClient()
    } catch {
        return null
    }
}

export function createPortfolioSlug(name: string, userId: string) {
    const cleanName = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40)

    return `${cleanName || "creator"}-${userId.slice(0, 8)}`
}

export function mapPortfolioRow(row: any): PortfolioVideo {
    return {
        id: row.id,
        title: row.title,
        views: row.views || "0",
        likes: row.likes || 0,
        url: row.video_url,
        thumbnail: row.thumbnail_url,
    }
}

export async function ensurePortfolioProfile(
    supabase: SupabaseClient,
    userId: string,
    profile: ProfileInput,
) {
    const slug = createPortfolioSlug(profile.full_name || "Student", userId)

    const { data } = await supabase
        .from("profiles")
        .upsert({
            id: userId,
            full_name: profile.full_name || "Student",
            avatar_url: profile.avatar_url || "",
            email: profile.email || "",
            portfolio_slug: slug,
            is_portfolio_public: true,
            xp: profile.xp || 0,
            level: profile.level || 1,
        }, { onConflict: "id" })
        .select("*")
        .single()

    return data || { ...profile, id: userId, portfolio_slug: slug, is_portfolio_public: true }
}

export async function fetchMyPortfolioItems(supabase: SupabaseClient, userId: string) {
    const { data, error } = await supabase
        .from("portfolio_items")
        .select("*")
        .eq("profile_id", userId)
        .order("created_at", { ascending: false })

    if (error) throw error
    return (data || []).map(mapPortfolioRow)
}

export async function addPortfolioItem(
    supabase: SupabaseClient,
    input: { userId: string; title: string; videoUrl: string; thumbnailUrl: string },
) {
    const { data, error } = await supabase
        .from("portfolio_items")
        .insert({
            profile_id: input.userId,
            title: input.title,
            video_url: input.videoUrl,
            thumbnail_url: input.thumbnailUrl,
        })
        .select("*")
        .single()

    if (error) throw error
    return mapPortfolioRow(data)
}

export async function deletePortfolioItem(supabase: SupabaseClient, itemId: string, userId: string) {
    const { error } = await supabase
        .from("portfolio_items")
        .delete()
        .eq("id", itemId)
        .eq("profile_id", userId)

    if (error) throw error
}

export async function updatePortfolioVisibility(supabase: SupabaseClient, userId: string, isPublic: boolean) {
    const { error } = await supabase
        .from("profiles")
        .update({ is_portfolio_public: isPublic })
        .eq("id", userId)

    if (error) throw error
}

export async function uploadPortfolioFile(supabase: SupabaseClient, userId: string, file: File) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-")
    const path = `${userId}/${Date.now()}-${safeName}`

    const { error } = await supabase.storage
        .from("portfolio-media")
        .upload(path, file, { upsert: false })

    if (error) throw error

    const { data } = supabase.storage.from("portfolio-media").getPublicUrl(path)
    return data.publicUrl
}

export async function fetchPublicPortfolio(supabase: SupabaseClient, slug: string): Promise<PublicPortfolio | null> {
    const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, email, xp, level, portfolio_slug, is_portfolio_public")
        .eq("portfolio_slug", slug)
        .eq("is_portfolio_public", true)
        .single()

    if (profileError || !profile) return null

    const { data: items } = await supabase
        .from("portfolio_items")
        .select("*")
        .eq("profile_id", profile.id)
        .order("created_at", { ascending: false })

    return {
        name: profile.full_name || "AI Video Creator",
        email: profile.email || "",
        avatarUrl: profile.avatar_url || "",
        level: profile.level || 1,
        xp: profile.xp || 0,
        slug: profile.portfolio_slug,
        videos: (items || []).map(mapPortfolioRow),
    }
}

export async function fetchPublicPortfolioFeed(supabase: SupabaseClient, limit = 30): Promise<PortfolioFeedItem[]> {
    const { data: items, error } = await supabase
        .from("portfolio_items")
        .select("id, profile_id, title, video_url, thumbnail_url, views, likes, created_at")
        .order("created_at", { ascending: false })
        .limit(limit)

    if (error) throw error
    if (!items?.length) return []

    const profileIds = Array.from(new Set(items.map((item: any) => item.profile_id).filter(Boolean)))
    const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, level, xp, portfolio_slug, is_portfolio_public")
        .in("id", profileIds)
        .eq("is_portfolio_public", true)

    const profileMap = new Map((profiles || []).map((profile: any) => [profile.id, profile]))

    return items
        .map((item: any) => {
            const profile: any = profileMap.get(item.profile_id)
            if (!profile) return null

            return {
                id: item.id,
                title: item.title,
                views: item.views || "0",
                likes: item.likes || 0,
                url: item.video_url,
                thumbnail: item.thumbnail_url,
                createdAt: item.created_at,
                creator: {
                    name: profile.full_name || "AI Video Creator",
                    avatarUrl: profile.avatar_url || "",
                    level: profile.level || 1,
                    xp: profile.xp || 0,
                    slug: profile.portfolio_slug || "",
                },
            }
        })
        .filter(Boolean) as PortfolioFeedItem[]
}
