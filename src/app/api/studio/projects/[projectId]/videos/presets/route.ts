import { NextResponse } from "next/server"
import { getGenjutsuPresets } from "@/lib/studio/higgsfield"
import { requireAuthenticatedProject, studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    await requireAuthenticatedProject(projectId)
    return NextResponse.json({ items: await getGenjutsuPresets() }, { headers: { "Cache-Control": "private, max-age=300" } })
  } catch (error) {
    return NextResponse.json({ error: studioErrorMessage(error, "Could not load Restyle styles") }, { status: studioErrorStatus(error) })
  }
}
