import { NextRequest, NextResponse } from "next/server"
import { studioErrorStatus } from "@/lib/studio/server-context"
import { requireProjectFromRequest } from "@/lib/studio/external-auth"

const MEDIA_BUCKET = "creator-studio-media"

/**
 * A signed URL for one stored file.
 *
 * The storyboard's keyframes are storage paths, not URLs, so a client outside
 * the browser — the MCP bridge rendering a storyboard into a chat — has no way
 * to look at what it is describing without this.
 *
 * The path is checked against the caller's own prefix before it is signed. An
 * external token resolves to a service client, which RLS does not constrain, so
 * without this check a valid token could sign any file in the bucket by
 * guessing its path.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const context = await requireProjectFromRequest(request, projectId, "projects:read")
    const path = (request.nextUrl.searchParams.get("path") || "").trim()
    if (!path) return NextResponse.json({ error: "A storage path is required" }, { status: 400 })
    if (/^https?:\/\//i.test(path)) return NextResponse.json({ path, url: path })
    if (path.includes("..")) return NextResponse.json({ error: "Invalid storage path" }, { status: 400 })
    if (!path.startsWith(`${context.user.id}/`)) {
      return NextResponse.json({ error: "That file does not belong to you" }, { status: 403 })
    }

    const { data, error } = await context.supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 60 * 60)
    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: error?.message || "Could not sign that file" }, { status: 404 })
    }
    return NextResponse.json({ path, url: data.signedUrl, expiresInSeconds: 3_600 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not sign media" },
      { status: studioErrorStatus(error) },
    )
  }
}
