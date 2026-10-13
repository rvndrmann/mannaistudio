import { z } from "zod"
import type { AuthenticatedProjectContext } from "@/lib/studio/server-context"
import { getModelLabel, isVideoGenerationModel, projectDefaultImageModels } from "@/lib/studio/generation-models"

/**
 * Choosing a project's default models from outside the studio page.
 *
 * A provider is not one model: Higgsfield alone offers a dozen. Naming one on
 * every render works, but the Director's own renders, and any render that names
 * nothing, use the project's defaults — so a user whose keys cannot run those
 * defaults needs to be able to change them, not just route around them.
 *
 * Only these three settings are written. The studio's own settings dialog saves
 * the whole form, including aspect ratio and style; merging three keys into
 * what is stored leaves everything else exactly as the user last set it.
 */

const defaultImageIds = projectDefaultImageModels.map((model) => model.id) as [string, ...string[]]
const imageModel = z.enum(defaultImageIds, { message: "Not an image model that can be a project default. Call studio_list_models for the ids." })
const videoModel = z.string().refine(isVideoGenerationModel, "Not a video model this studio offers. Call studio_list_models for the ids.")

export const projectModelsSchema = z.object({
  storyboardImageModel: imageModel.optional().describe("Model for storyboard frames."),
  characterImageModel: imageModel.optional().describe("Model for character, location and asset reference art."),
  videoModel: videoModel.optional().describe("Model for shot videos."),
}).refine((input) => input.storyboardImageModel || input.characterImageModel || input.videoModel, { message: "Name at least one model to set" })

export async function setProjectModels(context: AuthenticatedProjectContext, raw: unknown) {
  const input = projectModelsSchema.parse(raw)
  const { data: current, error: readError } = await context.supabase.from("creator_projects").select("metadata").eq("id", context.project.id).single()
  if (readError) throw readError
  const metadata = (current?.metadata && typeof current.metadata === "object" ? current.metadata : {}) as Record<string, unknown>
  const settings = (metadata.basic_settings && typeof metadata.basic_settings === "object" ? metadata.basic_settings : {}) as Record<string, unknown>
  const chosen = Object.fromEntries(Object.entries(input).filter(([, value]) => typeof value === "string")) as Record<string, string>
  const { error } = await context.supabase.from("creator_projects")
    .update({ metadata: { ...metadata, basic_settings: { ...settings, ...chosen } } })
    .eq("id", context.project.id)
  if (error) throw error
  return {
    saved: Object.fromEntries(Object.entries(chosen).map(([setting, model]) => [setting, { id: model, label: getModelLabel(model) }])),
    note: "Saved as this project's defaults. Renders that do not name a model, including the AI Director's, use these from now on.",
  }
}
