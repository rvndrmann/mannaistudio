import { NextRequest, NextResponse } from "next/server"
import { requireManagedProject, managedErrorMessage, managedErrorStatus } from "@/lib/managed/server"
import { managedChatContext } from "@/lib/managed/chat-context"
import { parseManagedBrief } from "@/lib/managed-brief"
import { MANAGED_MEDIA_BUCKET } from "@/lib/managed-production"
import type { ManagedDeliverable, ManagedVersion } from "@/components/managed/types"
export const dynamic = "force-dynamic"
export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const { supabase, project } = await requireManagedProject(projectId, request)
    const [deliverables, versions, messages] = await Promise.all([
      supabase.from("managed_deliverables").select("*").eq("project_id", projectId).order("position"),
      supabase.from("managed_deliverable_versions").select("*").eq("project_id", projectId).order("version_number"),
      supabase.from("managed_messages").select("id,body,sender_is_admin,kind,created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(30),
    ])
    if (deliverables.error || versions.error || messages.error) throw new Error("Could not load the project's published information")
    const context = managedChatContext(project, deliverables.data as ManagedDeliverable[] || [], versions.data as ManagedVersion[] || [])
    const files = await Promise.all(context.files.map(async (file) => {
      const { data, error } = await supabase.storage.from(MANAGED_MEDIA_BUCKET).createSignedUrl(file.storagePath, 3600)
      if (error || !data?.signedUrl) throw new Error("Could not open a published file. Please try again.")
      return { ...file, url: data.signedUrl, expiresInSeconds: 3600 }
    }))
    return NextResponse.json({ ...context, files, brief: parseManagedBrief(project.brief), messages: (messages.data || []).reverse() }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json({ error: managedErrorMessage(error, "Could not load the project for chat") }, { status: managedErrorStatus(error) })
  }
}
