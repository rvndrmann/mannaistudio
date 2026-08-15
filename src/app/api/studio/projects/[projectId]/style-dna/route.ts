import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { analyzeImagesAsJson, OpenAIProviderError } from "@/lib/studio/openai"
import { inlineImage } from "@/lib/studio/director-vision"
import { requireAuthenticatedProject, studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"
import { isVideoReferencePath } from "@/lib/studio/media-reference"
import { MAX_STYLE_REFERENCE_IMAGES, STYLE_DNA_INSTRUCTIONS, styleDnaSchema } from "@/lib/studio/style-dna"

const MEDIA_BUCKET = "creator-studio-media"
// Matches the Director's own attachment budget. A board of six full-resolution
// PNGs is otherwise a slow upload for very little extra signal about the look.
const MAX_TOTAL_BYTES = 12 * 1024 * 1024

const requestSchema = z.object({
  referenceImages: z.array(z.string().trim().min(1).max(2_000)).min(1).max(6),
  /** Anything the user wants to say about the board in their own words. */
  notes: z.string().trim().max(2_000).optional(),
}).strict()

/**
 * Reads a set of reference images once and returns the look as structured
 * fields. The result is not stored here — the panel shows it, the user can
 * correct it, and it is saved with the rest of Basic Settings, so a bad
 * extraction never silently becomes the look every image inherits.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const context = await requireAuthenticatedProject(projectId)
    const input = requestSchema.parse(await request.json())

    const stills = input.referenceImages.filter((path) => !isVideoReferencePath(path))
    if (!stills.length) {
      return NextResponse.json({ error: "A look reference has to be an image. Video references cannot be analysed." }, { status: 400 })
    }

    const imageUrls: string[] = []
    const usablePaths: string[] = []
    let totalBytes = 0
    for (const path of stills) {
      let url = path
      if (!/^https?:\/\//i.test(path)) {
        const { data, error } = await context.supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 60 * 60)
        if (error || !data?.signedUrl) continue
        url = data.signedUrl
      }
      // Inlined rather than handed over as a URL: the provider fetches a remote
      // image itself and gives up quickly, which turns storage latency into a
      // failed analysis. See the same reasoning in director-vision.
      const inlined = await inlineImage(url, MAX_TOTAL_BYTES - totalBytes)
      if (!inlined) continue
      totalBytes += inlined.bytes
      imageUrls.push(inlined.dataUrl)
      usablePaths.push(path)
    }
    if (!imageUrls.length) {
      return NextResponse.json({ error: "None of those references could be read. Try a smaller image, under 4 MB." }, { status: 400 })
    }

    const text = [
      `Define the visual intent shared by these ${imageUrls.length} reference image${imageUrls.length === 1 ? "" : "s"}.`,
      input.notes ? `The user describes what they are after as: ${input.notes}` : "",
    ].filter(Boolean).join("\n\n")

    const raw = await analyzeImagesAsJson({
      userId: context.user.id,
      instructions: STYLE_DNA_INSTRUCTIONS,
      text,
      imageUrls,
    })

    const parsed = styleDnaSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: "The reference analysis came back in an unexpected shape. Try again." }, { status: 502 })
    }

    return NextResponse.json({
      styleDna: {
        ...parsed.data,
        // The paths that were actually read, not the ones that were asked for:
        // an unreadable reference must not be listed as one the look came from,
        // and the same list is what gets attached to generations later.
        sourceImages: usablePaths.slice(0, MAX_STYLE_REFERENCE_IMAGES),
        extractedAt: new Date().toISOString(),
      },
      analysedCount: imageUrls.length,
      skippedCount: input.referenceImages.length - imageUrls.length,
    })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid style reference request", issues: error.flatten() }, { status: 400 })
    return NextResponse.json(
      { error: studioErrorMessage(error, "Could not analyse the reference images") },
      { status: error instanceof OpenAIProviderError ? error.status : studioErrorStatus(error) },
    )
  }
}
