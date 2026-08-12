import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import type { DirectorToolName } from "./tool-registry"
import { promptAgentInstructions } from "./prompt-agent-instructions"

/**
 * The Director's agent team. Each agent is a named role with its own
 * instructions, skills summary, and tool scope, all editable in admin. The
 * orchestrator (the Director itself) routes work to agents based on the tools
 * being called, not on keyword matching against the user's message.
 */

export const directorAgentKeys = ["script", "prompt", "character_asset", "storyboard", "video_prompt", "continuity"] as const
export type DirectorAgentKey = (typeof directorAgentKeys)[number]

/**
 * The production pipeline, in the order work is handed off. The orchestrator
 * follows this chain so a request that arrives mid-pipeline still knows what
 * must already exist upstream.
 */
export const directorPipeline: DirectorAgentKey[] = ["script", "prompt", "character_asset", "storyboard"]

/**
 * Instructions are generous because a real agent brief runs to pages, not
 * paragraphs. They are sent on every Director run, so the cap is a guard against
 * a runaway paste rather than a style limit.
 */
export const agentInstructionsLimit = 40_000

export const directorAgentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  enabled: z.boolean(),
  instructions: z.string().trim().max(agentInstructionsLimit),
  skills: z.string().trim().max(4_000),
}).strict()

export type DirectorAgent = z.infer<typeof directorAgentSchema>

export const directorTeamSchema = z.object({
  script: directorAgentSchema,
  prompt: directorAgentSchema,
  character_asset: directorAgentSchema,
  storyboard: directorAgentSchema,
  video_prompt: directorAgentSchema,
  continuity: directorAgentSchema,
}).strict()

export type DirectorTeam = z.infer<typeof directorTeamSchema>

export const defaultDirectorTeam: DirectorTeam = {
  prompt: {
    name: "Prompt Agent",
    enabled: true,
    skills: "Turns the saved script into the project's prompt sheet: one saved, editable, Seedance-ready scene prompt per shot for the whole script.",
    instructions: promptAgentInstructions,
  },
  character_asset: {
    name: "Character & Asset Agent",
    enabled: true,
    skills: "Creates and maintains characters, locations, props, and their reference art.",
    instructions: "You own the production entity library and build the art the rest of the pipeline references. Work out which entities the production actually needs from the prompt sheet when one exists, and read the script directly when it does not — a missing prompt sheet is not a reason to refuse to create characters. Inspect existing entities before creating any so you never duplicate one. Every character, location, and prop needs a canonical description strong enough to drive image generation on its own. Each type is rendered differently, and the difference is what makes the art reusable. A character is rendered as a character sheet on a plain, uncluttered background: the same person in a consistent multi-view turnaround — full-body front, three-quarter, and profile, plus a head-and-shoulders close-up — with identical face, hair, build, and wardrobe across every view, so later shots have a real identity lock rather than one lucky angle. A prop is rendered alone on a plain, uncluttered background: one object, clear silhouette, no scene, no hands, nobody holding it. A location is rendered as an empty establishing plate of the place itself with nobody in it at all — no named characters and no incidental people, crowds, or figures — so characters can be placed into it later without fighting someone already standing there. Never render a character or prop as a scene. When an entity has no reference image, generate one before it is used in a shot, and match the look of the project's existing reference art so the library stays consistent. When reference art exists it is the locked visual identity: reuse it and never contradict it.",
  },
  storyboard: {
    name: "Storyboard Agent",
    enabled: true,
    skills: "Builds shots from the prompt sheet and attaches only the reference art each shot actually needs.",
    instructions: "You own the storyboard. Build shots from the saved prompt sheet in story order, one clear action per shot, and use the saved prompt for a shot rather than rewriting it. When generating a shot image, attach as references only the entities that actually appear in that shot: pulling in unrelated characters or props contaminates the frame. Every shot must stay inside the project's aspect ratio and style. Validate entity references before proposing generation and flag any shot whose entities still have no reference art, so the Character & Asset Agent can build it first. Shot video is generated from the prompt sheet entry for that shot, keyed to the approved keyframe so the motion starts from the frame the user already accepted. In a continuing sequence, pass the previous shot's finished clip as a video reference so motion, lighting, and pacing carry across the cut instead of restarting cold. Seedance 2.0 accepts at most 3 video references totalling 15 seconds (2.5 accepts 10 totalling 30), so reference the most recent clips rather than the whole sequence, and trim to the closing seconds that actually carry the continuity. IMPORTANT: Ensure that every scene's timeline and generated runtime strictly stays under 15 seconds.",
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
  save_script_prompts: "prompt",
  read_script_prompts: "prompt",
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
  const chain = directorPipeline.filter((key) => team[key].enabled).map((key) => team[key].name)
  return [
    "You lead a team of specialist production agents. When work belongs to an agent, act in that agent's role and follow its instructions exactly.",
    chain.length > 1
      ? [
        `Production runs in this order: ${chain.join(" → ")}.`,
        "Work arrives mid-pipeline all the time. Before acting, check what the stage before yours should already have produced, and if it is missing say so and offer to build it first rather than improvising a substitute.",
        "When you move between agents, say which agent is taking over and why in one short sentence, using that agent's name.",
      ].join(" ")
      : "",
    ...active.map((key) => {
      const agent = team[key]
      return [`## ${agent.name}`, `Skills: ${agent.skills}`, agent.instructions].join("\n")
    }),
    "Disabled agents' duties fall back to you. Never present the team as separate people; they are roles you perform.",
  ].filter(Boolean).join("\n\n")
}
