import { pollImages } from "@/lib/studio/poll-images"
import { NextRequest, NextResponse } from "next/server"
import { requireAuthenticatedProject } from "@/lib/studio/server-context"
import { imageGenerationErrorResponse, imageRequestSchema, renderProjectImage } from "@/lib/studio/project-image-render"

// Declared for the hosts that honour it, and it is not the one this app is
// deployed to: `maxDuration` is a Vercel directive, and Netlify stops a
// function at its own limit — thirty seconds, measured — whatever this says.
// Which is why a model that cannot be submitted as a recoverable background
// response does not render here at all; see project-image-render, and the
// render-image Edge Function that runs those.
export const maxDuration = 300

export async function GET(request: NextRequest, options: { params: Promise<{ projectId: string }> }) {
  return pollImages(request, options)
}

/**
 * One image generation, on the host the browser reached.
 *
 * The work itself lives in project-image-render, because the Supabase Edge
 * Function runs exactly the same generation for the models this host cannot
 * hold open long enough to finish. Everything here is the translation between
 * that function and an HTTP response.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const context = await requireAuthenticatedProject(projectId)
    const input = imageRequestSchema.parse(await request.json())
    return NextResponse.json(await renderProjectImage(context, projectId, input))
  } catch (error) {
    const { body, status } = imageGenerationErrorResponse(error)
    return NextResponse.json(body, { status })
  }
}
