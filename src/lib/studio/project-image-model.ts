import { imageGenerationModels, isImageGenerationModel, type ImageGenerationModelId } from "./generation-models"

/**
 * The image model a project actually asked for.
 *
 * The Director generated every keyframe and every piece of character art on
 * gpt-image-2, hardcoded, so a project set to Nano Banana still got GPT Image —
 * the setting only reached the manual storyboard buttons. These read the same
 * Basic Settings the picker writes, so the agent and the buttons agree.
 */
function basicSettings(project: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const metadata = project?.metadata && typeof project.metadata === "object" ? project.metadata as Record<string, unknown> : {}
  return metadata.basic_settings && typeof metadata.basic_settings === "object" ? metadata.basic_settings as Record<string, unknown> : {}
}

function pick(value: unknown): ImageGenerationModelId | null {
  return typeof value === "string" && isImageGenerationModel(value) ? value : null
}

/** Keyframes and shot continuity. */
export function projectStoryboardImageModel(project: Record<string, unknown> | null | undefined): ImageGenerationModelId {
  const settings = basicSettings(project)
  return pick(settings.storyboardImageModel) || pick(settings.imageModel) || imageGenerationModels[0].id
}

/** Character, prop, and location reference art. */
export function projectCharacterImageModel(project: Record<string, unknown> | null | undefined): ImageGenerationModelId {
  const settings = basicSettings(project)
  return pick(settings.characterImageModel) || projectStoryboardImageModel(project)
}
