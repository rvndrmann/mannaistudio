import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Ingest endpoint for AI-written blog drafts.
//
// The blog writer (Claude, run here or on a schedule) POSTs a finished draft
// here. It lands as status = 'pending_review' so nothing is published until an
// admin approves it in the dashboard.
//
// Auth: a shared secret in the `x-ingest-secret` header (BLOG_INGEST_SECRET).
// Writes use the Supabase service-role key because this route has no admin
// user session, and RLS only lets admins write blog_posts.
//
// Required env: SUPABASE_SERVICE_ROLE_KEY, BLOG_INGEST_SECRET.

export const dynamic = "force-dynamic"

type MediaInput = {
    type?: string
    url?: string
    poster?: string
    prompt?: string
    model?: string
    caption?: string
}

function slugify(input: string): string {
    return input
        .toLowerCase()
        .trim()
        .replace(/['"]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80)
}

function cleanMedia(raw: unknown): MediaInput[] {
    if (!Array.isArray(raw)) return []
    return raw
        .filter((m) => m && typeof m === "object" && typeof (m as MediaInput).url === "string")
        .map((m: MediaInput) => ({
            type: m.type === "image" ? "image" : "video",
            url: m.url,
            poster: m.poster ?? "",
            prompt: m.prompt ?? "",
            model: m.model ?? "",
            caption: m.caption ?? "",
        }))
}

export async function POST(req: Request) {
    const secret = process.env.BLOG_INGEST_SECRET
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!secret || !serviceKey || !supabaseUrl) {
        return NextResponse.json(
            { error: "Blog ingest is not configured on the server." },
            { status: 500 }
        )
    }

    if (req.headers.get("x-ingest-secret") !== secret) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }

    let body: Record<string, unknown>
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: "Invalid JSON." }, { status: 400 })
    }

    const title = typeof body.title === "string" ? body.title.trim() : ""
    const content = typeof body.content === "string" ? body.content : ""
    if (!title || !content) {
        return NextResponse.json(
            { error: "title and content are required." },
            { status: 400 }
        )
    }

    let slug =
        typeof body.slug === "string" && body.slug.trim()
            ? slugify(body.slug)
            : slugify(title)
    if (!slug) slug = `post-${Date.now()}`

    const supabase = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false },
    })

    // Ensure slug is unique — suffix if a row already uses it.
    const { data: existing } = await supabase
        .from("blog_posts")
        .select("slug")
        .like("slug", `${slug}%`)
    if (existing && existing.some((r) => r.slug === slug)) {
        slug = `${slug}-${Date.now().toString().slice(-5)}`
    }

    const row = {
        slug,
        title,
        content,
        excerpt: typeof body.excerpt === "string" ? body.excerpt : "",
        cover_image: typeof body.cover_image === "string" ? body.cover_image : "",
        meta_description:
            typeof body.meta_description === "string" ? body.meta_description : "",
        keywords: typeof body.keywords === "string" ? body.keywords : "",
        author: typeof body.author === "string" && body.author.trim()
            ? body.author.trim()
            : "AI Director Hub",
        media: cleanMedia(body.media),
        status: "pending_review",
    }

    const { data, error } = await supabase
        .from("blog_posts")
        .insert(row)
        .select("id,slug")
        .single()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(
        { ok: true, id: data.id, slug: data.slug, status: "pending_review" },
        { status: 201 }
    )
}
