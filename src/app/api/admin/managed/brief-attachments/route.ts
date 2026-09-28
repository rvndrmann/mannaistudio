import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { isAdminUser } from "@/lib/membership"
import { parseManagedBrief } from "@/lib/managed-brief"
import { MANAGED_MEDIA_BUCKET, managedUploadPrefix } from "@/lib/managed-production"

export const dynamic = "force-dynamic"

const querySchema = z.object({
  draftId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
}).refine(({ draftId, projectId }) => Boolean(draftId) !== Boolean(projectId))

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!await isAdminUser(supabase, user.id)) return NextResponse.json({ error: "Admins only" }, { status: 403 })

    const { draftId, projectId } = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
    const admin = createServiceClient()
    let brief: unknown
    let ownerId: string | null = null
    let attachedProjectId = projectId

    if (draftId) {
      const { data, error } = await admin.from("managed_brief_drafts")
        .select("brief,profile_id,converted_project_id").eq("id", draftId).maybeSingle()
      if (error) throw error
      if (!data) return NextResponse.json({ error: "Brief not found." }, { status: 404 })
      brief = data.brief
      ownerId = data.profile_id
      // Checkout can move uploads to the order folder. Use its current manifest.
      attachedProjectId = data.converted_project_id || undefined
    }

    if (attachedProjectId) {
      const { data, error } = await admin.from("managed_projects")
        .select("brief,user_id").eq("id", attachedProjectId).maybeSingle()
      if (error) throw error
      if (!data) return NextResponse.json({ error: "Order not found." }, { status: 404 })
      brief = data.brief
      ownerId = data.user_id
    }

    const storage = admin.storage.from(MANAGED_MEDIA_BUCKET)
    const files = await Promise.all(parseManagedBrief(brief).attachments.map(async (attachment) => {
      // The saved manifest is client-authored. Never sign arbitrary storage paths.
      const prefixes = [
        ...(ownerId ? [`${ownerId}/managed-briefs/`] : []),
        ...(attachedProjectId ? [`${managedUploadPrefix(attachedProjectId)}/`] : []),
      ]
      const safe = !attachment.path.includes("..") && !attachment.path.includes("\\") &&
        prefixes.some((prefix) => attachment.path.startsWith(prefix) && Boolean(attachment.path.slice(prefix.length)) && !attachment.path.slice(prefix.length).includes("/"))
      const file = { name: attachment.name || attachment.path.split("/").pop() || "File", contentType: attachment.contentType, kind: attachment.kind }
      if (!safe) return { ...file, url: null, error: "This file is not in the brief's upload folder." }
      const { data, error } = await storage.createSignedUrl(attachment.path, 3600)
      return { ...file, url: data?.signedUrl || null, error: error ? "File unavailable. The upload may have been removed." : null }
    }))

    return NextResponse.json({ files }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Choose a valid brief or order." }, { status: 400 })
    console.error("Could not load brief attachments", error)
    return NextResponse.json({ error: "Could not load attached files. Please try again." }, { status: 500 })
  }
}
