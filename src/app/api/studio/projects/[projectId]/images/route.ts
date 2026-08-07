import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { generateOpenAIImage, openAIImageModels, OpenAIProviderError } from "@/lib/studio/openai"
import { generateBytePlusImage, BytePlusProviderError } from "@/lib/studio/byteplus"
import { generationProvider, isImageGenerationModel } from "@/lib/studio/generation-models"
import { requireAuthenticatedProject, studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"

const imageRequestSchema = z.object({
  target: z.enum(["asset", "shot"]),
  targetId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(12_000),
  model: z.string().refine(isImageGenerationModel, "Unsupported image model"),
  referenceImages: z.array(z.string().max(2_000)).max(8).default([]),
}).strict()

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const context = await requireAuthenticatedProject(projectId)
    const input = imageRequestSchema.parse(await request.json())
    if (input.target === "asset") {
      const { data } = await context.supabase.from("creator_entities").select("id, reference_images, metadata").eq("id", input.targetId).eq("project_id", projectId).maybeSingle()
      if (!data) return NextResponse.json({ error: "Asset not found" }, { status: 404 })
    } else {
      const { data } = await context.supabase.from("creator_shots").select("id, episode_id").eq("id", input.targetId).maybeSingle()
      if (!data) return NextResponse.json({ error: "Shot not found" }, { status: 404 })
      const { data: episode } = await context.supabase.from("creator_episodes").select("id").eq("id", data.episode_id).eq("project_id", projectId).maybeSingle()
      if (!episode) return NextResponse.json({ error: "Shot not found" }, { status: 404 })
    }
    const provider = generationProvider(input.model)
    const referenceUrls: string[] = []
    for (const reference of input.referenceImages) {
      if (/^https?:\/\//i.test(reference)) referenceUrls.push(reference)
      else {
        const { data, error } = await context.supabase.storage.from("creator-studio-media").createSignedUrl(reference, 60 * 60)
        if (error) throw error
        referenceUrls.push(data.signedUrl)
      }
    }
    let image: Buffer
    let contentType = "image/png"
    if (provider === "openai") {
      image = await generateOpenAIImage({ userId: context.user.id, model: input.model as (typeof openAIImageModels)[number], prompt: input.prompt, referenceUrls })
    } else {
      const generated = await generateBytePlusImage({ model: input.model, prompt: input.prompt, referenceUrls })
      const download = await fetch(generated.url)
      if (!download.ok) throw new BytePlusProviderError(`Could not download Seedream output (${download.status}).`)
      image = Buffer.from(await download.arrayBuffer())
      contentType = generated.contentType
    }
    const extension = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png"
    const storagePath = `${context.user.id}/${projectId}/${provider}-image-${randomUUID()}.${extension}`
    const { error: uploadError } = await context.supabase.storage.from("creator-studio-media").upload(storagePath, image, { contentType, upsert: false })
    if (uploadError) throw uploadError
    if (input.target === "asset") {
      const { data: asset, error: readError } = await context.supabase.from("creator_entities").select("reference_images, metadata").eq("id", input.targetId).eq("project_id", projectId).single()
      if (readError) throw readError
      const metadata = { ...(asset.metadata || {}), image_generation: { provider, model: input.model, prompt: input.prompt, reference_images: input.referenceImages, status: "completed", completed_at: new Date().toISOString() } }
      const { error } = await context.supabase.from("creator_entities").update({ reference_images: [...(asset.reference_images || []), storagePath], metadata, status: "draft" }).eq("id", input.targetId).eq("project_id", projectId)
      if (error) throw error
    } else {
      const { error } = await context.supabase.from("creator_shots").update({ keyframe_image: storagePath, metadata: { image_generation: { provider, model: input.model, prompt: input.prompt, reference_images: input.referenceImages, status: "completed", completed_at: new Date().toISOString() } } }).eq("id", input.targetId)
      if (error) throw error
    }
    return NextResponse.json({ path: storagePath, provider, model: input.model })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid image request", issues: error.flatten() }, { status: 400 })
    return NextResponse.json({ error: studioErrorMessage(error, "Image generation failed") }, { status: error instanceof OpenAIProviderError || error instanceof BytePlusProviderError ? error.status : studioErrorStatus(error) })
  }
}
