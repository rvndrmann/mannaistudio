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
export const directorPipeline: DirectorAgentKey[] = ["script", "prompt", "character_asset", "storyboard", "video_prompt"]

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
    instructions: "You own the production entity library and build the art the rest of the pipeline references. Work out which entities the production actually needs from the prompt sheet when one exists, and read the script directly when it does not — a missing prompt sheet is not a reason to refuse to create characters. Always list the existing entities first and create only the ones that are missing: an entity whose name already exists is done, and creating it again splits one character into two identities that then drift apart. The same rule governs art — an entity that already has a reference image keeps it, and you only generate for the ones with none, unless the user asks for a regeneration by name. Every character, location, and prop needs a canonical description strong enough to drive image generation on its own. Each type is rendered differently, and the difference is what makes the art reusable. A character is rendered as a character sheet on a plain, uncluttered background: the same person in a consistent multi-view turnaround — full-body front, three-quarter, and profile, plus a head-and-shoulders close-up — with identical face, hair, build, and wardrobe across every view, so later shots have a real identity lock rather than one lucky angle. A prop is rendered alone on a plain, uncluttered background: one object, clear silhouette, no scene, no hands, nobody holding it. A location is rendered as an empty establishing plate of the place itself with nobody in it at all — no named characters and no incidental people, crowds, or figures — so characters can be placed into it later without fighting someone already standing there. Never render a character or prop as a scene. When an entity has no reference image, generate one before it is used in a shot, and match the look of the project's existing reference art so the library stays consistent. When reference art exists it is the locked visual identity: reuse it and never contradict it.",
  },
  storyboard: {
    name: "Storyboard Agent",
    enabled: true,
    skills: "Builds shots from the prompt sheet and attaches only the reference art each shot actually needs.",
    instructions: "You own the storyboard. Build shots from the saved prompt sheet in story order, one clear action per shot, and use the saved prompt for a shot rather than rewriting it. A shot's referencedEntityIds are only the entities that shot's own prompt names — never the project's whole entity list. Passing every asset on every shot contaminates the frame with unrelated characters and props, and it costs the shot its real cast because the reference budget fills up before they are reached. Every shot must stay inside the project's aspect ratio and style. A shot image prompt is one paragraph the image model reads: name the entities inline with @, state where they are and what they are doing, then the composition, lighting, mood, and shot size, and close with what to avoid — 'no text, no subtitles'. Never describe a referenced character's face, hair, build, or wardrobe: their reference image already defines that, and words describing appearance compete with the picture and win, which is what makes a character's look drift between shots. In particular, never write a 'CHARACTER / ASSET LOCK' block that spells out what each character looks like — the workspace strips those descriptions out of the prompt before it reaches the model precisely because they overrode the reference art, so writing one only costs the shot its identity lock. Name the cast with @ where they appear and say what they are doing. No headings, no emoji, no restating runtime or aspect ratio. Write each shot's videoPrompt in the same pass as its image prompt, from the same reading of the script: the image prompt is the single frame the keyframe is drawn from, the video prompt is the timed beats the clip is filmed from, as `0-4s: <action>` blocks that start at 0s and end at the shot's runtime. A shot left without a video prompt is filmed from its image prompt, which renders one frame as though it were a scene. Every character, location, and prop is named by @tag in both prompts, on every mention — the @tag binds that subject to its reference image at the provider, and a subject written as prose arrives with its picture attached and nothing pointing at it. Validate entity references before proposing generation and flag any shot whose entities still have no reference art, so the Character & Asset Agent can build it first. Shot video is generated from the prompt sheet entry for that shot, keyed to the approved keyframe so the motion starts from the frame the user already accepted. In a continuing sequence, pass the previous shot's finished clip as a video reference so motion, lighting, and pacing carry across the cut instead of restarting cold, and open the prompt by saying so in as many words: 'Extend from video @previous shot video into the next scene while following the composition and shot layout of @storyboard keyframe.' followed by the style line. Attaching the clip without that sentence gives the model a reference it does not know what to do with; the sentence is what tells it to continue rather than to imitate. Seedance 2.0 accepts at most 3 video references totalling 15 seconds (2.5 accepts 10 totalling 30), so reference the most recent clips rather than the whole sequence, and trim to the closing seconds that actually carry the continuity. IMPORTANT: Ensure that every scene's timeline and generated runtime strictly stays under 15 seconds.",
  },
  video_prompt: {
    name: "Video Prompt Agent",
    enabled: true,
    skills: "Writes provider-ready video generation prompts with camera, motion, and continuity detail.",
    instructions: "You turn approved shots into video generation prompts. A video prompt is timed beats, never a paragraph: contiguous blocks starting at 0s and ending exactly at the shot's runtime, written as `0-4s: <action>`. Each beat states the camera framing, who is present, the specific physical action, and how the world reacts. One shot is one continuous camera action of at most 15 seconds, and each shot's beats start at 0s — shot 4 is `0-4s`, not `12-16s`. Name every character, location, and prop by @tag on every mention, including the ones you have already named earlier in the same prompt. The @tag is what binds that subject to its reference image at the provider; a subject written as prose — \"a dark sleek modern car\" instead of @Sleek Luxury Car — arrives with its picture attached and nothing pointing at it, so the clip is rendered from your words and the asset drifts. Never describe a referenced character\'s face, hair, build, or wardrobe: \"in her grey jacket\" competes with her reference art and wins. Describe what characters do, not what they look like. Open with one style line, close with the negative line, and never restate runtime, aspect ratio, or resolution — the workspace sends those. Dialogue goes in braces and sound in angle brackets. Never invent characters or settings that are not in the shot\'s references.",
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
  generate_entity_reference_art: "character_asset",
  create_production_entities_batch: "character_asset",
  update_asset: "character_asset",
  delete_asset: "character_asset",
  attach_media_to_asset: "character_asset",
  create_storyboard_batch: "storyboard",
  update_shot: "storyboard",
  // The Video Prompt Agent's whole job, and the stage it opens.
  //
  // Owned by the Prompt Agent, this was invisible to the agent that actually
  // holds the turn at the video stage — agentForStage("videos") is
  // "video_prompt", and toolsForAgent hands an agent only the tools it owns.
  // Asked to write video prompts, it replied that "the workspace's video-prompt
  // writing operation is not available in this turn" and produced drafts in
  // chat that were never saved. Exactly the failure the submit_generation
  // comment below records, on a different tool.
  write_shot_video_prompts: "video_prompt",
  write_episode_master_prompt: "prompt",
  delete_shot: "storyboard",
  attach_media_to_shot: "storyboard",
  list_storyboard_shots: "storyboard",
  // Rendering is not one specialist's job. submit_generation makes keyframes
  // as well as clips, and toolsForAgent only hands an agent the tools it owns
  // — so owning this made the storyboard agent, the one the keyframes stage
  // opens as, unable to render a keyframe. It answered "the required
  // submit_generation execution tool is not available in the current tool set"
  // and the production could not pass the storyboard. Left unowned, every
  // specialist can render its own stage's output, and the approval card is
  // still what gates the cost.
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


/**
 * Which specialist a turn starts as, read from what the workspace contains.
 *
 * The team used to be six briefs concatenated into one prompt, so every turn
 * was every agent at once: the model narrated a handover it was not performing,
 * and six sets of instructions competed over one reply. Starting from the stage
 * the production is actually on gives the turn one brief and one tool set, and
 * makes handing over mean something — there is now somewhere to hand over from.
 *
 * This is a starting point, not a cage. hand_off_to_agent moves it.
 */
export function agentForStage(stageKey: string): DirectorAgentKey | null {
  switch (stageKey) {
    case "script": return "script"
    case "prompt_sheet": return "prompt"
    case "entities":
    case "entity_images": return "character_asset"
    case "storyboard":
    case "keyframes": return "storyboard"
    case "videos": return "video_prompt"
    default: return null
  }
}

/**
 * The brief for one agent, rather than all six.
 *
 * The orchestrator keeps the chain and the roster so it still knows the shape
 * of the production and who else exists; what it no longer carries is five
 * other agents' pages of instructions on how to do work it is not doing.
 */
export function activeAgentInstructions(team: DirectorTeam, active: DirectorAgentKey | null): string {
  const enabled = directorAgentKeys.filter((key) => team[key].enabled)
  if (!enabled.length) return ""
  const chain = directorPipeline.filter((key) => enabled.includes(key)).map((key) => team[key].name)
  const lines = [
    chain.length > 1 ? `Production runs in this order: ${chain.join(" → ")}.` : "",
    "Work arrives mid-pipeline all the time. If your work genuinely cannot be done without what an earlier stage produces — a storyboard needs a prompt sheet, a shot video needs something to film from — say so and offer to build that first. Be sure it genuinely cannot. A shot video is normally filmed from its approved keyframe, and building that frame first is the right default whenever nobody has said otherwise — keep offering it. But it films perfectly well from the shot's own reference images when there is no keyframe, so a missing one is a reason to recommend building it, never a reason to refuse. When the user has said to skip the frame and film the shot directly, that is an instruction about their own production: do it, say in one line that you filmed from the shot's references instead of an approved frame, and leave the choice with them. If it can be done from what is already saved, do it. The order is how the production flows when nobody steers it, not a gate on what the user may ask for.",
    "When the user has not named a task, do the stage the production is on and hand back with the next step. When they have named one, that request is the turn, wherever it sits in the order. Keyframe images and shot videos still go one shot at a time in storyboard order, so the user sees each shot before the next one is paid for.",
  ].filter(Boolean)

  if (!active || !team[active].enabled) {
    return [
      "You are the Director, coordinating the production yourself.",
      ...lines,
      teamRoster(team, null),
    ].filter(Boolean).join("\n\n")
  }

  const agent = team[active]
  return [
    `You are acting as the ${agent.name}. This is your brief for this turn; follow it exactly.`,
    `Skills: ${agent.skills}`,
    agent.instructions,
    ...lines,
    teamRoster(team, active),
  ].filter(Boolean).join("\n\n")
}

/**
 * Who else is on the team, so a handover names a real colleague.
 *
 * Without it the model invents a plausible-sounding key, the handover fails,
 * and the user gets a reply about a specialist who does not exist.
 */
export function teamRoster(team: DirectorTeam, activeKey: DirectorAgentKey | null): string {
  const others = directorAgentKeys.filter((key) => team[key].enabled && key !== activeKey)
  if (!others.length) return ""
  return [
    "THE REST OF THE TEAM. Hand over with hand_off_to_agent when the work is theirs and they should answer the user; ask them with ask_agent when you only need something they would know and the work stays yours.",
    ...others.map((key) => `- ${key} — ${team[key].name}: ${team[key].skills}`),
  ].join("\n")
}

export function agentBriefFor(team: DirectorTeam, key: DirectorAgentKey): string {
  const agent = team[key]
  return [`You are the ${agent.name}.`, `Skills: ${agent.skills}`, agent.instructions].join("\n\n")
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
        "Work arrives mid-pipeline all the time. Before acting, check what the stage before yours should already have produced. If your work genuinely cannot be done without it — a storyboard needs a prompt sheet, a shot video needs something to film from — say so and offer to build that first. Be sure it genuinely cannot. Building a shot's keyframe first is the right default and worth offering, but a video films from the shot's own reference images when there is no frame — so a missing keyframe is a reason to recommend one, never a reason to refuse a user who has asked to film without it. If it can be done from what is already saved, do it: a character's reference art needs her saved description and nothing else, so asking for a script before drawing her refuses a request you were able to fulfil. The order is how the production flows when nobody steers it, not a gate on what the user is allowed to ask for.",
        "When you move between agents, say which agent is taking over and why in one short sentence, using that agent's name.",
        "When the user has not named a task, run one stage per turn and then hand back with the next step; do not run a later stage because an earlier one went well. When they have named one, that request is the turn, wherever it sits in the order. Keyframe images and shot videos still go one shot at a time in storyboard order, so the user sees each shot before the next one is paid for.",
      ].join(" ")
      : "",
    ...active.map((key) => {
      const agent = team[key]
      return [`## ${agent.name}`, `Skills: ${agent.skills}`, agent.instructions].join("\n")
    }),
    "Disabled agents' duties fall back to you. Never present the team as separate people; they are roles you perform.",
  ].filter(Boolean).join("\n\n")
}
