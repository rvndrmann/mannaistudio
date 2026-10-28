import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { MEDIA_PASS_SECONDS, readMediaPass } from "@/lib/studio/mcp/media-pass"

const MEDIA_BUCKET = "creator-studio-media"

/**
 * One stored file for the storyboard gallery: checks the pass, signs the file
 * and redirects to it. The gallery's <img> and <video> tags point here.
 *
 * Same ownership rule as the studio media route: only paths under the pass
 * holder's own prefix are signed. The service client is used because the
 * request carries no session, only the pass.
 */
export async function GET(request: NextRequest) {
  const pass = request.nextUrl.searchParams.get("pass") || ""
  const path = (request.nextUrl.searchParams.get("path") || "").trim()
  const userId = readMediaPass(pass)
  if (!userId) return NextResponse.json({ error: "This link has expired. Show the storyboard again." }, { status: 401 })
  if (!path || path.includes("..") || !path.startsWith(`${userId}/`)) {
    return NextResponse.json({ error: "That file does not belong to you" }, { status: 403 })
  }
  const { data, error } = await createServiceClient().storage.from(MEDIA_BUCKET).createSignedUrl(path, MEDIA_PASS_SECONDS)
  if (error || !data?.signedUrl) return NextResponse.json({ error: "File not found" }, { status: 404 })
  const response = NextResponse.redirect(data.signedUrl, 302)
  response.headers.set("cache-control", "private, max-age=600")
  return response
}
