import { NextRequest, NextResponse } from "next/server"
import { studioErrorStatus } from "@/lib/studio/server-context"
import { requireProjectFromRequest } from "@/lib/studio/external-auth"
import { storeDirectorUpload, UploadError } from "@/lib/studio/director-upload"

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const context = await requireProjectFromRequest(request, projectId, "director:uploads")
    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
    return NextResponse.json(await storeDirectorUpload(context, {
      episodeId: String(form.get("episodeId") || ""),
      sessionId: String(form.get("sessionId") || ""),
      name: file.name,
      contentType: file.type,
      body: file,
    }))
  } catch (error) {
    if (error instanceof UploadError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: studioErrorStatus(error) })
  }
}
