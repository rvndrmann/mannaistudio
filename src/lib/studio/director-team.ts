import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import type { DirectorToolName } from "./tool-registry"

/**
 * The Director's agent team. Each agent is a named role with its own
 * instructions, skills summary, and tool scope, all editable in admin. The
 * orchestrator (the Director itself) routes work to agents based on the tools
 * being called, not on keyword matching against the user's message.
 */

export const directorAgentKeys = ["character_asset", "storyboard", "video_prompt", "script", "continuity"] as const
export type DirectorAgentKey = (typeof directorAgentKeys)[number]

export const directorAgentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  enabled: z.boolean(),
  instructions: z.string().trim().max(10_000),
  skills: z.string().trim().max(2_000),
}).strict()

export type DirectorAgent = z.infer<typeof directorAgentSchema>

export const directorTeamSchema = z.object({
  character_asset: directorAgentSchema,
  storyboard: directorAgentSchema,
  video_prompt: directorAgentSchema,
  script: directorAgentSchema,
  continuity: directorAgentSchema,
}).strict()

export type DirectorTeam = z.infer<typeof directorTeamSchema>

export const defaultDirectorTeam: DirectorTeam = {
  character_asset: {
    name: "Character & Asset Agent",
    enabled: true,
    skills: "Creates and maintains characters, locations, props, and their reference art.",
    instructions: "You own the production entity library. Inspect existing entities before creating new ones and never create duplicates. Every character, location, and prop needs a canonical description strong enough to drive image generation. When an entity has no reference image, propose generating one before it is used in any shot. When reference art exists, treat it as the locked visual identity: reuse it, never contradict it.",
  },
  storyboard: {
    name: "Storyboard Agent",
    enabled: true,
    skills: "Builds and orders shots from the saved script, keeps entity references valid.",
    instructions: "You own the storyboard. Build shots from the saved script in story order, one clear action per shot. Every shot prompt must name the entities that appear via their entity IDs and stay inside the project's aspect ratio and style. Validate entity references before proposing generation, and flag shots whose referenced entities are missing reference art.",
  },
  video_prompt: {
    name: "Video Prompt Agent",
    enabled: true,
    skills: "Writes provider-ready video generation prompts with camera, motion, and continuity detail.",
    instructions: "You turn approved shots into video generation prompts. Each prompt describes one continuous camera action with subject, motion, framing, lighting, and mood, grounded in the shot's keyframe and the entities' reference art. Respect the project style and duration limits. Never invent characters or settings that are not in the shot's references.",
  },
  script: {
    name: "Script Agent",
    enabled: true,
    skills: "Reads, writes, and revises the saved episode script.",
    instructions: "You own the saved script. Read the complete saved script before editing; never ask the user to paste content that is already saved. Keep character names exactly matching the entity library. Preserve structure the user has approved and propose replacements rather than silently rewriting.",
  },
  continuity: {
    name: "Continuity Agent",
    enabled: true,
    skills: "Guards approved looks, recorded facts, and cross-shot consistency.",
    instructions: "You guard continuity. Check approved continuity facts before any visual or script change. Flag contradictions between shots, script, and entity descriptions instead of silently accepting them. Locked assets and approved decisions may only change when the user explicitly asks.",
  },
}

export function normalizeDirectorTeam(value: unknown): DirectorTeam {
  if (!value || typeof value !== "object" || Array.isArray(value)) return structuredClone(defaultDirectorTeam)
  const raw = value as Record<string, unknown>
  return directorTeamSchema.parse(Object.fromEntries(directorAgentKeys.map((key) => {
    const agent = raw[key] && typeof raw[key] === "object" ? raw[key] as Record<string, unknown> : {}
    const fallback = defaultDirectorTeam[key]
    return [key, {
      name: typeof agent.name === "string" && agent.name.trim() ? agent.name : fallback.name,
      enabled: typeof agent.enabled === "boolean" ? agent.enabled : fallback.enabled,
      instructions: typeof agent.instructions === "string" && agent.instructions.trim() ? agent.instructions : fallback.instructions,
      skills: typeof agent.skills === "string" && agent.skills.trim() ? agent.skills : fallback.skills,
    }]
  })))
}

export async function fetchDirectorTeam(supabase: SupabaseClient): Promise<DirectorTeam> {
  const { data } = await supabase.from("site_settings").select("value").eq("key", "ai_director_team").maybeSingle()
  return normalizeDirectorTeam(data?.value)
}

/** Which agent owns each Director tool. The orchestrator and read tools stay unowned. */
export const toolAgentOwnership: Partial<Record<DirectorToolName, DirectorAgentKey>> = {
  create_production_entity: "character_asset",
  create_production_entities_batch: "character_asset",
  update_asset: "character_asset",
  delete_asset: "character_asset",
  attach_media_to_asset: "character_asset",
  create_storyboard_batch: "storyboard",
  update_shot: "storyboard",
  delete_shot: "storyboard",
  attach_media_to_shot: "storyboard",
  list_storyboard_shots: "storyboard",
  submit_generation: "video_prompt",
  estimate_generation_cost: "video_prompt",
  inspect_generation_jobs: "video_prompt",
  update_script: "script",
  read_episode_script: "script",
  search_episode_script: "script",
  record_continuity_fact: "continuity",
  inspect_continuity: "continuity",
  validate_production: "continuity",
  create_revision_request: "continuity",
}

export function agentForTool(tool: string): DirectorAgentKey | null {
  return toolAgentOwnership[tool as DirectorToolName] ?? null
}

/**
 * Instruction block describing the whole team. Included on every run so the
 * orchestrator knows who exists and what each agent is for; per-agent
 * instructions are stated under the agent's own name.
 */
export function teamInstructions(team: DirectorTeam): string {
  const active = directorAgentKeys.filter((key) => team[key].enabled)
  if (!active.length) return ""
  return [
    "You lead a team of specialist production agents. When work belongs to an agent, act in that agent's role and follow its instructions exactly.",
    ...active.map((key) => {
      const agent = team[key]
      return [`## ${agent.name}`, `Skills: ${agent.skills}`, agent.instructions].join("\n")
    }),
    "Disabled agents' duties fall back to you. Never present the team as separate people; they are roles you perform.",
  ].join("\n\n")
}
