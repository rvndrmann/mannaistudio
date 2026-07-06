import { createClient, type SupabaseClient } from "@supabase/supabase-js"

// Public, cookie-less anon client for reading published blog content in
// server components and the sitemap. RLS only exposes status = 'published'.
let readClient: SupabaseClient | null = null
function getReadClient(): SupabaseClient {
    if (readClient) return readClient
    readClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
    )
    return readClient
}

export type BlogMedia = {
    type: "video" | "image"
    url: string
    poster?: string
    prompt?: string
    model?: string
    caption?: string
}

export type BlogPost = {
    id: string
    slug: string
    title: string
    excerpt: string
    content: string
    cover_image: string
    meta_description: string
    keywords: string
    status: string
    author: string
    media: BlogMedia[]
    created_at: string
    updated_at: string
    published_at: string | null
}

const LIST_COLUMNS =
    "slug,title,excerpt,cover_image,author,published_at,updated_at"

export async function getPublishedPosts(): Promise<Partial<BlogPost>[]> {
    const { data, error } = await getReadClient()
        .from("blog_posts")
        .select(LIST_COLUMNS)
        .eq("status", "published")
        .order("published_at", { ascending: false })

    if (error) {
        console.error("getPublishedPosts:", error.message)
        return []
    }
    return data ?? []
}

export async function getPublishedPost(slug: string): Promise<BlogPost | null> {
    const { data, error } = await getReadClient()
        .from("blog_posts")
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle()

    if (error) {
        console.error("getPublishedPost:", error.message)
        return null
    }
    if (!data) return null
    return { ...data, media: normalizeMedia(data.media) } as BlogPost
}

export async function getPublishedSlugs(): Promise<
    { slug: string; updated_at: string }[]
> {
    const { data, error } = await getReadClient()
        .from("blog_posts")
        .select("slug,updated_at")
        .eq("status", "published")

    if (error) {
        console.error("getPublishedSlugs:", error.message)
        return []
    }
    return data ?? []
}

function normalizeMedia(raw: unknown): BlogMedia[] {
    if (!Array.isArray(raw)) return []
    return raw.filter(
        (m): m is BlogMedia =>
            !!m && typeof m === "object" && typeof (m as BlogMedia).url === "string"
    )
}
