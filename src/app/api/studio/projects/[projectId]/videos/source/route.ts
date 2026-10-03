import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAuthenticatedProject, studioErrorMessage } from "@/lib/studio/server-context"
import { readSourceVideoDuration } from "@/lib/studio/source-video-duration"
import { HiggsfieldProviderError } from "@/lib/studio/higgsfield"

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const context = await requireAuthenticatedProject(projectId)
    const { path, model } = z.object({ path: z.string().min(1).max(2083), model: z.string().optional() }).parse(await request.json())
    let url = path
    if (/^https?:\/\//.test(path)) return NextResponse.json({ error: "Select a saved video from this project." }, { status: 400 })
    {
      if (!path.startsWith(`${context.user.id}/${projectId}/`)) return NextResponse.json({ error: "Select a source video from this project." }, { status: 400 })
      const { data, error } = await context.supabase.storage.from("creator-studio-media").createSignedUrl(path, 3600)
      if (error || !data) throw error || new Error("Source video not found")
      url = data.signedUrl
    }
    return NextResponse.json(await readSourceVideoDuration(url, model === "higgsfield/genjutsu/object-swap/v1.0"))
  } catch (error) {
    return NextResponse.json({ error: studioErrorMessage(error, "Could not read source video") }, { status: error instanceof HiggsfieldProviderError ? error.status : 400 })
  }
}
