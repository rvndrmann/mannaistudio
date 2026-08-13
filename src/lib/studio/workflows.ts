import type { SupabaseClient } from "@supabase/supabase-js"

export type DirectorWorkflowStatus = "active" | "paused"

export type DirectorWorkflowConfig = {
  id: string
  title: string
  description: string
  skill: string
  instructions: string
  appliesTo: "project_default" | "episode"
  status: DirectorWorkflowStatus
}

export const defaultDirectorWorkflows: DirectorWorkflowConfig[] = [
  {
    id: "keyframe_images_to_video",
    title: "Keyframes Images to Video",
    description: "Generate multi grid keyframe images first, then use them as reference to create the video.",
    skill: "Storyboard continuity, keyframe image generation, image-to-video prompting",
    instructions: "Create storyboard keyframes for every shot before video. Use approved characters and assets as references, keep shot order, then generate video from selected keyframes.",
    appliesTo: "project_default",
    status: "active",
  },
  {
    id: "elements_sequential",
    title: "Elements to Video Sequential",
    description: "Generate video sequentially from character reference images to ensure continuity between clips.",
    skill: "Sequential generation, character consistency, clip-to-clip continuity",
    instructions: "Generate shots one by one. Use the previous approved shot and character references to maintain continuity before moving to the next clip.",
    appliesTo: "project_default",
    status: "active",
  },
  {
    id: "video_reference",
    title: "Video Reference",
    description: "Drive video generation with reference video style and motion rhythm.",
    skill: "Reference-video direction, motion rhythm, style transfer",
    instructions: "Use the selected reference video as the motion/style guide. Preserve character references and adapt storyboard prompts to match the reference rhythm.",
    appliesTo: "project_default",
    status: "active",
  },
  {
    id: "elements_parallel",
    title: "Elements to Video Parallel",
    description: "Generate video concurrently from character reference images; no keyframe images needed.",
    skill: "Parallel shot generation, batch prompting, fast storyboard production",
    instructions: "Generate all selected shots in parallel from storyboard prompts and asset references. Use when speed matters more than strict clip-to-clip continuity.",
    appliesTo: "project_default",
    status: "active",
  },
]

export function normalizeDirectorWorkflows(input: unknown): DirectorWorkflowConfig[] {
  const rows = Array.isArray(input) ? input : defaultDirectorWorkflows
  const normalized = rows
    .map((row) => {
      if (!row || typeof row !== "object") return null
      const value = row as Partial<DirectorWorkflowConfig>
      const id = typeof value.id === "string" && value.id.trim() ? value.id.trim() : ""
      const title = typeof value.title === "string" && value.title.trim() ? value.title.trim() : ""
      if (!id || !title) return null
      return {
        id,
        title,
        description: typeof value.description === "string" ? value.description : "",
        skill: typeof value.skill === "string" ? value.skill : "",
        instructions: typeof value.instructions === "string" ? value.instructions : "",
        appliesTo: value.appliesTo === "episode" ? "episode" : "project_default",
        status: value.status === "paused" ? "paused" : "active",
      } satisfies DirectorWorkflowConfig
    })
    .filter((workflow): workflow is DirectorWorkflowConfig => Boolean(workflow))
  return normalized.length ? normalized : defaultDirectorWorkflows
}

export function activeDirectorWorkflows(input: unknown): DirectorWorkflowConfig[] {
  return normalizeDirectorWorkflows(input).filter((workflow) => workflow.status === "active")
}

export async function fetchDirectorWorkflows(supabase: SupabaseClient): Promise<DirectorWorkflowConfig[]> {
  const { data } = await supabase.from("site_settings").select("value").eq("key", "ai_director_workflows").maybeSingle()
  return normalizeDirectorWorkflows(data?.value)
}


/**
 * The workflow chosen for this episode: the episode's own choice, else the
 * project default, else whatever Basic Settings last saved. Returns "" when the
 * project has never picked one.
 */
export function selectedWorkflowId(project: Record<string, unknown>, episodeId: string): string {
  const metadata = (project.metadata as Record<string, unknown> | undefined) || {}
  const episodeWorkflows = (metadata.episode_workflows as Record<string, unknown> | undefined) || {}
  if (typeof episodeWorkflows[episodeId] === "string") return episodeWorkflows[episodeId] as string
  if (typeof metadata.default_workflow_id === "string") return metadata.default_workflow_id
  const basicSettings = metadata.basic_settings as Record<string, unknown> | undefined
  if (typeof basicSettings?.workflow === "string") return basicSettings.workflow
  return ""
}

/**
 * Whether a plain "generate shot 3 video" should carry the previous shot's
 * finished clip into the new one.
 *
 * Video Reference and Elements Sequential are both defined by clip-to-clip
 * continuity, so under them continuity is the default rather than something the
 * user has to ask for by naming the reference shot every time. Under the
 * keyframe and parallel workflows a shot is rendered on its own, and inheriting
 * a neighbour's motion would be the surprise.
 */
export function workflowContinuesFromPreviousClip(workflowId: string): boolean {
  return workflowId === "video_reference" || workflowId === "elements_sequential"
}
