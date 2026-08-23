import { z } from "zod"
import type { AuthenticatedProjectContext } from "./server-context"
import { creativeBriefSchema } from "./domain"
import { mergeCreativeBrief } from "./creative-brief"
import { continuityFactSchema, findContinuityConflicts } from "./continuity"
import { entityHandle, entityKindSchema, legacyEntityType, seriesBibleSchema } from "./story"
import { generationRequestSchema, routeGeneration } from "./model-routing"
import { revisionRequestSchema } from "./revisions"
import { deductUserCredits } from "./credits"
import { decideBilling } from "@/lib/byok/billing"
import { hasCredential } from "@/lib/byok/credential-service"
import { ownKeysOnly } from "@/lib/byok/preferences"
import { byokProviderFor, isByokProvider } from "@/lib/byok/providers"
import { executeGenerationJobsInBackground } from "./execute-generation"
import { findMentionedEntityIds, findShotCastEntityIds, type MentionableEntity } from "./entity-mentions"
import { describeUntaggedEntities, findUntaggedEntities } from "./untagged-entities"
import { sceneNotFrameReason, stripIdentityDescriptions } from "./prompt-sanitizer"
import { ensureProjectShotLocations, ensureShotLocations, inheritedShotLocations } from "./shot-location"
import { estimateShotSeconds } from "./shot-duration"
import { beatRuntimeSeconds, describeBeatProblems, readShotVideoPrompt, writeShotVideoPrompt } from "./shot-video-prompt"
import { aspectMismatch, restateAspect } from "./shot-aspect"
import { assertShotPromptShape, normalizeShotColumns } from "./shot-writes"
import { withCandidateNumbers } from "./generation-candidates"
import { mergeEntityMetadata } from "./entity-writes"
import { metadataAcceptingEntityArt, metadataAcceptingKeyframe } from "./accept-existing-art"
import { buildGenerationTargetSnapshot } from "./generation-target"
import { scriptContentSchema, normalizeScriptContent } from "./script"
import { buildEntityReferenceImagePrompt, projectVisualStyle } from "./entity-image-workflow"
import { composeLookDirectives, projectStyleDna, styleBlockForEntityType } from "./style-dna"

export type ToolRisk = "read" | "write" | "costly" | "destructive"

export type DirectorTool<TInput extends z.ZodType, TOutput> = {
  name: string
  version: number
  risk: ToolRisk
  requiresApproval: boolean
  input: TInput
  execute: (context: AuthenticatedProjectContext, input: z.infer<TInput>) => Promise<TOutput>
}

export function defineDirectorTool<TInput extends z.ZodType, TOutput>(tool: DirectorTool<TInput, TOutput>) {
  if ((tool.risk === "costly" || tool.risk === "destructive") && !tool.requiresApproval) {
    throw new Error(`${tool.name} must require approval`)
  }
  return tool
}

export const inspectCurrentProjectTool = defineDirectorTool({
  name: "inspect_current_project",
  version: 1,
  risk: "read",
  requiresApproval: false,
  input: z.object({}),
  async execute(context) {
    const { id, user_id, name, description, production_mode, project_type, creative_brief, default_style, default_aspect } = context.project
    return { id, userId: user_id, name, description, productionMode: production_mode, projectType: project_type, creativeBrief: creative_brief, defaultStyle: default_style, defaultAspect: default_aspect }
  },
})

export const readEpisodeScriptTool = defineDirectorTool({
  name: "read_episode_script",
  version: 1,
  risk: "read",
  requiresApproval: false,
  input: z.object({ episodeId: z.string().uuid() }),
  async execute(context, input) {
    const { data, error } = await context.supabase.from("creator_episodes").select("id,name,description,script_content,script_updated_at").eq("id", input.episodeId).eq("project_id", context.project.id).single()
    if (error) throw error
    return data
  },
})

/**
 * The prompt sheet is written in one pass for the whole script and then read
 * back by the agents that build art and shots, so the plan the user reviewed is
 * the plan that gets generated.
 */
export const saveScriptPromptsTool = defineDirectorTool({
  name: "save_script_prompts",
  version: 1,
  risk: "write",
  requiresApproval: false,
  input: z.object({
    episodeId: z.string().uuid(),
    prompts: z.array(z.object({
      orderIndex: z.number().int().min(0).max(999).optional(),
      title: z.string().trim().max(240).default(""),
      prompt: z.string().trim().min(1).max(4_000),
      entityNames: z.array(z.string().trim().min(1).max(160)).max(24).default([]),
      notes: z.string().trim().max(2_000).default(""),
    })).min(1).max(200),
  }),
  async execute(context, input) {
    const { data: episode } = await context.supabase.from("creator_episodes").select("id").eq("id", input.episodeId).eq("project_id", context.project.id).maybeSingle()
    if (!episode) throw new Error("Episode not found in this project")
    const prompts = input.prompts.map((entry, index) => ({ ...entry, orderIndex: entry.orderIndex ?? index, prompt: stripIdentityDescriptions(entry.prompt) }))
    const { data, error } = await context.supabase.rpc("save_script_prompt_sheet", { p_episode_id: input.episodeId, p_prompts: prompts })
    if (error) throw error
    return { saved: data ?? prompts.length, episodeId: input.episodeId }
  },
})

/**
 * The episode's master prompt — the document everything else is extracted from.
 *
 * Characters, keyframe prompts, and video prompts were each written from the
 * script independently, so nothing held them to one another. Deriving all three
 * from one document is what keeps a character's look, a shot's framing, and a
 * clip's motion describing the same scene.
 *
 * Stored exactly as written, unlike every prompt downstream: the master prompt
 * is the one place a CHARACTER / ASSET LOCK block belongs, because that block is
 * what the entities are created from. Everything extracted out of it is
 * sanitised on the way out.
 */
export const writeEpisodeMasterPromptTool = defineDirectorTool({
  name: "write_episode_master_prompt",
  version: 1,
  risk: "write",
  requiresApproval: true,
  input: z.object({
    episodeId: z.string().uuid(),
    masterPrompt: z.string().trim().min(1).max(60_000),
  }),
  async execute(context, input) {
    const { data: episode } = await context.supabase.from("creator_episodes").select("id").eq("id", input.episodeId).eq("project_id", context.project.id).maybeSingle()
    if (!episode) throw new Error("Episode does not belong to this project")
    const { data, error } = await context.supabase
      .from("creator_episodes")
      // Deliberately not stripped. This is the source the character and asset
      // descriptions are read out of; sanitising here would delete them.
      .update({ master_prompt: input.masterPrompt, master_prompt_updated_at: new Date().toISOString() })
      .eq("id", input.episodeId)
      .select("id,master_prompt_updated_at")
      .single()
    if (error) throw error
    return { episodeId: data.id, characters: input.masterPrompt.length, updatedAt: data.master_prompt_updated_at }
  },
})

export const readEpisodeMasterPromptTool = defineDirectorTool({
  name: "read_episode_master_prompt",
  version: 1,
  risk: "read",
  requiresApproval: false,
  input: z.object({ episodeId: z.string().uuid() }),
  async execute(context, input) {
    const { data, error } = await context.supabase
      .from("creator_episodes")
      .select("id,name,master_prompt,master_prompt_updated_at")
      .eq("id", input.episodeId)
      .eq("project_id", context.project.id)
      .single()
    if (error) throw error
    return {
      episodeId: data.id,
      episodeName: data.name,
      masterPrompt: data.master_prompt || null,
      updatedAt: data.master_prompt_updated_at || null,
      // Said plainly so a missing master prompt reads as a stage to do rather
      // than as a tool that failed.
      status: data.master_prompt ? "written" : "not written yet",
    }
  },
})

export const readScriptPromptsTool = defineDirectorTool({
  name: "read_script_prompts",
  version: 1,
  risk: "read",
  requiresApproval: false,
  input: z.object({ episodeId: z.string().uuid() }),
  async execute(context, input) {
    const { data, error } = await context.supabase
      .from("creator_script_prompts")
      .select("id,order_index,title,prompt,entity_names,notes,shot_id")
      .eq("episode_id", input.episodeId)
      .eq("project_id", context.project.id)
      .order("order_index")
    if (error) throw error
    return { prompts: data || [], count: (data || []).length }
  },
})

export const searchEpisodeScriptTool = defineDirectorTool({
  name: "search_episode_script",
  version: 1,
  risk: "read",
  requiresApproval: false,
  input: z.object({ episodeId: z.string().uuid(), query: z.string().trim().max(200).default(""), startLine: z.number().int().min(1).default(1), endLine: z.number().int().min(1).max(5_000).default(200) }),
  async execute(context, input) {
    if (input.endLine < input.startLine || input.endLine - input.startLine > 499) throw new Error("Script ranges may contain at most 500 lines")
    const { data, error } = await context.supabase.from("creator_episodes").select("id,name,script_content").eq("id", input.episodeId).eq("project_id", context.project.id).single()
    if (error) throw error
    const text = typeof data.script_content === "string" ? data.script_content : JSON.stringify(data.script_content || {}, null, 2)
    const lines = text.split("\n")
    const selected = lines.slice(input.startLine - 1, input.endLine).map((line, index) => ({ line: input.startLine + index, text: line }))
    const query = input.query.toLowerCase()
    return { totalLines: lines.length, startLine: input.startLine, endLine: Math.min(input.endLine, lines.length), lines: query ? selected.filter((line) => line.text.toLowerCase().includes(query)) : selected }
  },
})

export const listProductionEntitiesTool = defineDirectorTool({
  name: "list_production_entities",
  version: 1,
  risk: "read",
  requiresApproval: false,
  input: z.object({
    types: z.array(z.enum(["character", "scene", "prop"])).max(3).default([]),
    search: z.string().trim().max(200).default(""),
    offset: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(1).max(50).default(25),
  }),
  async execute(context, input) {
    let query = context.supabase.from("creator_entities").select("id,type,kind,name,handle,description,reference_images,status,approval_status,metadata", { count: "exact" }).eq("project_id", context.project.id).order("created_at").range(input.offset, input.offset + input.limit - 1)
    if (input.types.length) query = query.in("type", input.types)
    if (input.search) query = query.ilike("name", `%${input.search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`)
    const { data, error, count } = await query
    if (error) throw error
    return { items: data || [], total: count || 0, offset: input.offset, limit: input.limit, hasMore: input.offset + input.limit < (count || 0) }
  },
})

export const listStoryboardShotsTool = defineDirectorTool({
  name: "list_storyboard_shots",
  version: 1,
  risk: "read",
  requiresApproval: false,
  input: z.object({ episodeId: z.string().uuid(), offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(50).default(25) }),
  async execute(context, input) {
    const { data: episode } = await context.supabase.from("creator_episodes").select("id").eq("id", input.episodeId).eq("project_id", context.project.id).maybeSingle()
    if (!episode) throw new Error("Episode does not belong to this project")
    const { data, error, count } = await context.supabase.from("creator_shots").select("id,order_index,title,description,script_text,prompt,keyframe_image,video_url,video_status,duration_seconds,aspect_ratio,referenced_entities,metadata", { count: "exact" }).eq("episode_id", input.episodeId).order("order_index").range(input.offset, input.offset + input.limit - 1)
    if (error) throw error
    // order_index is 0-based but the storyboard labels shots from 1. Without an
    // explicit number the Director maps "shot 2" onto order_index 2 and acts on
    // the wrong shot, so the user-visible number travels with every row.
    //
    // The video prompt is lifted out of metadata and named, because revising a
    // prompt starts with reading the one that is there. Left buried, the model
    // rewrote from scratch and quietly dropped whatever the user had liked
    // about it.
    const items = (data || []).map((shot) => ({ ...shot, number: shot.order_index + 1, video_prompt: readShotVideoPrompt(shot) || null }))
    return { items, total: count || 0, offset: input.offset, limit: input.limit, hasMore: input.offset + input.limit < (count || 0) }
  },
})

export const updateCreativeBriefTool = defineDirectorTool({
  name: "update_creative_brief",
  version: 1,
  risk: "write",
  requiresApproval: true,
  input: z.object({
    patch: creativeBriefSchema.partial(),
    confirm: z.array(creativeBriefSchema.keyof()).max(20).default([]),
  }),
  async execute(context, input) {
    const creativeBrief = mergeCreativeBrief(context.project.creative_brief, input.patch, input.confirm)
    const { data, error } = await context.supabase
      .from("creator_projects")
      .update({ creative_brief: creativeBrief, schema_version: 1 })
      .eq("id", context.project.id)
      .eq("user_id", context.user.id)
      .select("creative_brief")
      .single()
    if (error) throw error
    return data
  },
})

export const createSeriesTool = defineDirectorTool({
  name: "create_series",
  version: 1,
  risk: "write",
  requiresApproval: true,
  input: z.object({ name: z.string().trim().min(1).max(200), bible: seriesBibleSchema.optional() }),
  async execute(context, input) {
    const bible = seriesBibleSchema.parse(input.bible ?? {})
    const { data, error } = await context.supabase.from("creator_series").insert({ project_id: context.project.id, name: input.name, premise: bible.premise || null, genre: bible.genre || null, tone: bible.tone || null, audience: bible.audience || null, format: bible.format, bible }).select("*").single()
    if (error) throw error
    return data
  },
})

export const writeSeriesBibleTool = defineDirectorTool({
  name: "write_series_bible",
  version: 1,
  risk: "write",
  requiresApproval: true,
  input: z.object({ seriesId: z.string().uuid(), bible: seriesBibleSchema }),
  async execute(context, input) {
    const { data, error } = await context.supabase.from("creator_series").update({ premise: input.bible.premise || null, genre: input.bible.genre || null, tone: input.bible.tone || null, audience: input.bible.audience || null, format: input.bible.format, bible: input.bible }).eq("id", input.seriesId).eq("project_id", context.project.id).select("*").single()
    if (error) throw error
    return data
  },
})

export const createProductionEntityTool = defineDirectorTool({
  name: "create_production_entity",
  version: 1,
  risk: "write",
  requiresApproval: true,
  input: z.object({ kind: entityKindSchema, name: z.string().trim().min(1).max(200), description: z.string().trim().max(10_000).default(""), metadata: z.record(z.string(), z.unknown()).default({}), referenceImages: z.array(z.string().max(2_000)).max(30).default([]) }),
  async execute(context, input) {
    const { data, error } = await context.supabase.from("creator_entities").insert({ project_id: context.project.id, type: legacyEntityType(input.kind), kind: input.kind, name: input.name, handle: entityHandle(input.name), description: input.description || null, reference_images: input.referenceImages, metadata: input.metadata, status: "draft", approval_status: "pending" }).select("*").single()
    if (error) throw error
    // Same as the batch: a location made after the shots were written has to be
    // carried back onto them, or they stay set nowhere.
    await ensureProjectShotLocations(context.supabase, { projectId: context.project.id, entities: [data as { id: string; type: string }] })
    return data
  },
})

export const createProductionEntitiesBatchTool = defineDirectorTool({
  name: "create_production_entities_batch",
  version: 1,
  risk: "write",
  requiresApproval: true,
  // `referenceImages` is how a user's own photo reaches an entity at creation
  // time. The approval card lets them attach one per entity before approving,
  // and an entity that arrives with art is already past the reference-art stage
  // — so their photo defines the look instead of a generated one replacing it.
  input: z.object({ entities: z.array(z.object({ kind: entityKindSchema, name: z.string().trim().min(1).max(200), description: z.string().trim().max(10_000).default(""), metadata: z.record(z.string(), z.unknown()).default({}), referenceImages: z.array(z.string().max(2_000)).max(10).default([]) })).min(1).max(50), skipExisting: z.boolean().default(true) }),
  async execute(context, input) {
    const handles = input.entities.map((entity) => entityHandle(entity.name))
    const { data: existing, error: existingError } = await context.supabase.from("creator_entities").select("id,handle,name").eq("project_id", context.project.id).in("handle", handles)
    if (existingError) throw existingError
    const existingHandles = new Set((existing || []).map((entity) => entity.handle))
    if (!input.skipExisting && existingHandles.size) throw new Error(`Entities already exist: ${(existing || []).map((entity) => entity.name).join(", ")}`)
    const rows = input.entities.filter((entity) => !existingHandles.has(entityHandle(entity.name))).map((entity) => ({ project_id: context.project.id, type: legacyEntityType(entity.kind), kind: entity.kind, name: entity.name, handle: entityHandle(entity.name), description: entity.description || null, reference_images: entity.referenceImages, metadata: entity.metadata, status: "draft", approval_status: "pending" }))
    if (!rows.length) return { created: [], skipped: existing || [] }
    const { data, error } = await context.supabase.from("creator_entities").insert(rows).select("*")
    if (error) throw error
    // A location created after the storyboard is the ordinary case here — the
    // entities are made from the finished prompt sheet, so the shots already
    // exist. Repairing now is what gives those shots the scene they were
    // written in; nothing else would ever revisit them.
    const locatedShots = await ensureProjectShotLocations(context.supabase, { projectId: context.project.id, entities: (data || []) as { id: string; type: string }[] })
    return { created: data || [], skipped: existing || [], shotsGivenLocation: locatedShots }
  },
})

export const createStoryboardBatchTool = defineDirectorTool({
  name: "create_storyboard_batch",
  version: 1,
  risk: "write",
  requiresApproval: true,
  input: z.object({
    episodeId: z.string().uuid(),
    replaceExisting: z.boolean().default(false),
    /**
     * Where the new shots go, as a 1-based shot number: 1 puts them after shot
     * 1, and 0 puts them at the very front. Omitted, they append to the end.
     * Without this a shot asked for "after shot 8" landed at the end of the
     * storyboard, which is a different scene order than the one requested.
     */
    insertAfterShotNumber: z.number().int().min(0).max(1_000).optional(),
    shots: z.array(z.object({
      title: z.string().trim().min(1).max(200),
      description: z.string().trim().max(5_000).default(""),
      scriptText: z.string().trim().max(10_000).default(""),
      prompt: z.string().trim().min(1).max(20_000),
      /**
       * Written here, beside the image prompt, rather than in a later pass.
       *
       * The two describe the same shot from one reading of the script — the
       * frame it opens on and what happens across it — and splitting them into
       * separate stages meant the storyboard was built, approved, and then
       * revisited by a second tool that had to re-derive the same intent from
       * the same source. A shot whose video prompt was never written falls back
       * to its image prompt at generation, which is a single frame filmed as
       * though it were a scene.
       */
      videoPrompt: z.string().trim().min(1).max(20_000).describe(
        "Required. What happens across THIS ONE SHOT, as contiguous timed beats starting at 0s — `0-4s: <action>`, or the timestamped-title form `0-2s — BEAT TITLE`. Write it in the same pass as `prompt`: that one is the single frame the keyframe is drawn from, this one is the motion the clip is filmed from. The beats are also what decides how long the shot runs — the last beat ends where the shot ends, and that overrides durationSeconds — so give a shot the time its action actually takes, up to 15 seconds. Without beats a shot is sized from its spoken words alone, and a wordless one falls to the four-second floor however much happens in it. Name every character and asset by @tag on every mention, because the @tag is what binds them to their reference image at the provider; a subject described in words instead of tagged is rendered from the words and drifts. Never describe a referenced character's face, hair, build, or wardrobe. Dialogue in braces, sound in angle brackets.",
      ),
      durationSeconds: z.number().positive().max(120).default(4),
      aspectRatio: z.string().trim().max(20).default("16:9"),
      referencedEntityIds: z.array(z.string().uuid()).max(30).default([]),
    })).min(1).max(100),
  }),
  async execute(context, input) {
    const { data: episode } = await context.supabase.from("creator_episodes").select("id").eq("id", input.episodeId).eq("project_id", context.project.id).maybeSingle()
    if (!episode) throw new Error("Episode does not belong to this project")
    // A shot's image prompt is one frame; the master prompt it may have been
    // extracted from is a whole scene in named sections. The two are easy to
    // conflate when writing many shots at once, and the result is not a messy
    // prompt but the wrong document sitting in the field.
    const sceneShots = input.shots
      .map((shot, index) => ({ index, reason: sceneNotFrameReason(shot.prompt) }))
      .filter((entry): entry is { index: number; reason: string } => Boolean(entry.reason))
    if (sceneShots.length) throw new Error(sceneShots.slice(0, 4).map((entry) => `Shot "${input.shots[entry.index].title}": ${entry.reason}`).join(" "))
    // Beats that do not add up render unpredictably, and only the writer can
    // fix them — so the same check write_shot_video_prompts applies is applied
    // here, rather than storing a broken timeline to be discovered as a bad clip.
    const beatFaults = input.shots.flatMap((shot) => describeBeatProblems(shot.videoPrompt).map((problem) => `Shot "${shot.title}": ${problem}`))
    if (beatFaults.length) throw new Error(beatFaults.slice(0, 8).join(" "))
    // An id the model guessed is dropped, not fatal.
    //
    // referencedEntityIds is a hint: the cast that actually gets stored is
    // derived from the prompt's @mentions by findShotCastEntityIds below, and
    // only falls back to this list when the prompt names nobody. So an id that
    // does not resolve costs nothing — but failing the whole batch on one cost
    // the user eleven shots and a turn, with an error naming no id, so the
    // Director could not tell which one to fix and simply proposed the same
    // thing again.
    const referencedIds = Array.from(new Set(input.shots.flatMap((shot) => shot.referencedEntityIds)))
    let unknownEntityIds: string[] = []
    if (referencedIds.length) {
      const { data: entities, error: entityError } = await context.supabase.from("creator_entities").select("id").eq("project_id", context.project.id).in("id", referencedIds)
      if (entityError) throw entityError
      const known = new Set((entities || []).map((entity) => entity.id as string))
      unknownEntityIds = referencedIds.filter((id) => !known.has(id))
    }
    const knownEntityId = (id: string) => !unknownEntityIds.includes(id)
    if (input.replaceExisting) {
      const { error } = await context.supabase.from("creator_shots").delete().eq("episode_id", input.episodeId)
      if (error) throw error
    }
    const { count } = await context.supabase.from("creator_shots").select("id", { count: "exact", head: true }).eq("episode_id", input.episodeId)
    // Inserting into the middle means everything after the anchor moves down by
    // as many shots as are going in. Done before the insert, so the new rows
    // land in a gap rather than sharing an index with the shots they displace.
    const insertAt = input.replaceExisting || input.insertAfterShotNumber === undefined
      ? null
      : Math.min(Math.max(input.insertAfterShotNumber, 0), count || 0)
    if (insertAt !== null) {
      const { data: displaced, error: displacedError } = await context.supabase
        .from("creator_shots")
        .select("id,order_index")
        .eq("episode_id", input.episodeId)
        .gte("order_index", insertAt)
        .order("order_index", { ascending: false })
      if (displacedError) throw displacedError
      for (const row of displaced || []) {
        const { error } = await context.supabase
          .from("creator_shots")
          .update({ order_index: row.order_index + input.shots.length })
          .eq("id", row.id)
        if (error) throw error
      }
    }
    const offset = input.replaceExisting ? 0 : insertAt ?? (count || 0)
    // A shot's cast is what its own prompt names. Models routinely pass the
    // project's whole entity list on every shot, which then reaches generation
    // as references and puts unrelated characters and props in the frame.
    const { data: batchEntityRows } = await context.supabase.from("creator_entities").select("id,name,type").eq("project_id", context.project.id)
    const batchEntities = (batchEntityRows || []) as MentionableEntity[]
    // An asset written as words instead of tagged ships with its reference
    // image attached and nothing in the prompt pointing at it, so the model
    // renders it from the words. Checked rather than asked for: the tool
    // descriptions and both agent briefs already say to tag every subject, and
    // prompts still came back with the character tagged and the car described.
    const untagged = input.shots.flatMap((shot) => {
      const found = [
        ...findUntaggedEntities(shot.prompt, batchEntities),
        ...findUntaggedEntities(shot.videoPrompt, batchEntities),
      ]
      const unique = found.filter((entity, index) => found.findIndex((other) => other.id === entity.id) === index)
      return unique.length ? [describeUntaggedEntities(unique, `Shot "${shot.title}"`)] : []
    })
    if (untagged.length) throw new Error(untagged.slice(0, 4).join(" "))
    const rows = input.shots.map((shot, index) => {
      const text = `${shot.prompt}\n${shot.description}\n${shot.scriptText}`
      const cast = findShotCastEntityIds(text, batchEntities, shot.referencedEntityIds)
      // The cast is read from the prompt as written, then the written identity
      // is dropped before the prompt is stored. A saved "CHARACTER / ASSET LOCK"
      // block overrides the reference art at generation time, so it must never
      // reach the row in the first place.
      // A shot runs as long as what happens in it. Left on the schema default,
      // every shot in a storyboard came out the same four seconds, and a shot
      // carrying a long line was clipped mid-sentence.
      // Written in the same pass as the image prompt, so a shot leaves this
      // tool ready to film. Sanitised the same way: identity prose overrides
      // the reference art whichever prompt it is written into.
      const videoPrompt = stripIdentityDescriptions(shot.videoPrompt)
      // The beats are the runtime when there are beats. Otherwise the estimate
      // from the script stands, as it always did.
      const beatSeconds = videoPrompt ? beatRuntimeSeconds(videoPrompt) : null
      const durationSeconds = beatSeconds
        ?? (shot.durationSeconds === 4
          ? estimateShotSeconds(`${shot.prompt}\n${shot.scriptText}`)
          : shot.durationSeconds)
      return {
        episode_id: input.episodeId,
        order_index: offset + index,
        title: shot.title,
        description: shot.description || null,
        script_text: shot.scriptText || null,
        prompt: stripIdentityDescriptions(shot.prompt),
        duration_seconds: durationSeconds,
        aspect_ratio: shot.aspectRatio,
        referenced_entities: cast.length ? cast : shot.referencedEntityIds.filter(knownEntityId),
        ...(videoPrompt ? { metadata: writeShotVideoPrompt(null, videoPrompt) } : {}),
      }
    })
    // A prompt names the location only where it changes, so the shots in
    // between were built with none and later rendered nowhere. The scene runs
    // on until the script moves it, exactly as it does on set.
    const staged = rows.map((row, index) => ({ id: String(index), order_index: row.order_index, referenced_entities: row.referenced_entities }))
    const inherited = inheritedShotLocations(staged, batchEntities)
    for (const [index, locationId] of Array.from(inherited.entries())) {
      const row = rows[Number(index)]
      if (row) row.referenced_entities = Array.from(new Set([...row.referenced_entities, locationId]))
    }
    const { data, error } = await context.supabase.from("creator_shots").insert(rows).select("*")
    if (error) throw error
    return {
      created: data || [],
      replacedExisting: input.replaceExisting,
      // Reported rather than thrown, so the Director can see it guessed an id
      // and read the real ones next time instead of proposing the same batch.
      ...(unknownEntityIds.length
        ? { ignoredEntityIds: unknownEntityIds, note: `${unknownEntityIds.length} referencedEntityIds did not match any asset in this project and were ignored. Each shot's cast came from the @mentions in its prompt. Read the real ids with list_production_entities before passing them.` }
        : {}),
    }
  },
})

export const validateProductionTool = defineDirectorTool({
  name: "validate_production",
  version: 1,
  risk: "read",
  requiresApproval: false,
  input: z.object({ episodeId: z.string().uuid() }),
  async execute(context, input) {
    const { data: episode } = await context.supabase.from("creator_episodes").select("id,script_content").eq("id", input.episodeId).eq("project_id", context.project.id).maybeSingle()
    if (!episode) throw new Error("Episode does not belong to this project")
    const [{ data: shots, error: shotError }, { data: entities, error: entityError }] = await Promise.all([
      context.supabase.from("creator_shots").select("id,title,prompt,referenced_entities,keyframe_image,video_url,aspect_ratio").eq("episode_id", input.episodeId).order("order_index"),
      context.supabase.from("creator_entities").select("id,name,handle,type,description,reference_images,status").eq("project_id", context.project.id),
    ])
    if (shotError) throw shotError
    if (entityError) throw entityError
    const entityIds = new Set((entities || []).map((entity) => entity.id))
    const issues = (shots || []).flatMap((shot) => {
      const values: Array<{ severity: "warning" | "blocking"; code: string; shotId: string; message: string }> = []
      if (!shot.prompt?.trim()) values.push({ severity: "blocking", code: "missing_prompt", shotId: shot.id, message: `${shot.title} has no generation prompt.` })
      const missing = (shot.referenced_entities || []).filter((id: string) => !entityIds.has(id))
      if (missing.length) values.push({ severity: "blocking", code: "invalid_entity_reference", shotId: shot.id, message: `${shot.title} references ${missing.length} missing entities.` })
      if (!(shot.referenced_entities || []).length) values.push({ severity: "warning", code: "no_entity_references", shotId: shot.id, message: `${shot.title} has no linked production entities.` })
      return values
    })
    return { valid: !issues.some((issue) => issue.severity === "blocking"), issues, counts: { shots: (shots || []).length, entities: (entities || []).length }, scriptPresent: Boolean(episode.script_content) }
  },
})

export const recordContinuityFactTool = defineDirectorTool({
  name: "record_continuity_fact",
  version: 1,
  risk: "write",
  requiresApproval: true,
  input: continuityFactSchema,
  async execute(context, input) {
    if (input.entityId) {
      const { data: entity } = await context.supabase.from("creator_entities").select("id").eq("id", input.entityId).eq("project_id", context.project.id).maybeSingle()
      if (!entity) throw new Error("Entity does not belong to this project")
    }
    const { data, error } = await context.supabase.from("creator_continuity_facts").insert({ project_id: context.project.id, entity_id: input.entityId, scope: input.scope, scope_id: input.scopeId, category: input.category, fact_key: input.key, fact_value: input.value, locked: input.locked, created_by: context.user.id }).select("*").single()
    if (error) throw error
    return data
  },
})

export const inspectContinuityTool = defineDirectorTool({
  name: "inspect_continuity",
  version: 1,
  risk: "read",
  requiresApproval: false,
  input: z.object({ entityId: z.string().uuid().optional() }),
  async execute(context, input) {
    let query = context.supabase.from("creator_continuity_facts").select("*").eq("project_id", context.project.id).eq("status", "approved")
    if (input.entityId) query = query.eq("entity_id", input.entityId)
    const { data, error } = await query
    if (error) throw error
    const facts = (data ?? []).map((fact) => ({ entityId: fact.entity_id, scope: fact.scope, scopeId: fact.scope_id, category: fact.category, key: fact.fact_key, value: fact.fact_value, locked: fact.locked }))
    return { facts: data ?? [], conflicts: findContinuityConflicts(facts) }
  },
})

export const estimateGenerationCostTool = defineDirectorTool({
  name: "estimate_generation_cost",
  version: 1,
  risk: "read",
  requiresApproval: false,
  input: generationRequestSchema,
  async execute(_context, input) {
    const routing = routeGeneration(input)
    return { shots: routing.request.shotIds.length, provider: routing.selected.provider, model: routing.selected.model, creditsPerShot: routing.creditsPerShot, estimatedCredits: routing.estimatedCredits, reason: routing.reason, providerConfigured: routing.selected.provider !== "unconfigured" }
  },
})

export const inspectGenerationJobsTool = defineDirectorTool({
  name: "inspect_generation_jobs",
  version: 1,
  risk: "read",
  requiresApproval: false,
  // Shots are named by their storyboard number in conversation, so the filter
  // takes numbers as well as ids. Without it, picking between the images for
  // one shot meant reading the newest 25 jobs in the whole project and joining
  // uuids by hand — and a shot generated a while ago had no candidates in the
  // window at all.
  input: z.object({ episodeId: z.string().uuid().optional(), shotIds: z.array(z.string().uuid()).max(50).default([]), shotNumbers: z.array(z.number().int().positive().max(10_000)).max(50).default([]), statuses: z.array(z.enum(["queued", "awaiting_approval", "approved", "processing", "completed", "failed", "cancelled"])).max(7).default([]), limit: z.number().int().min(1).max(100).default(25) }),
  async execute(context, input) {
    let shotIds: string[] | null = null
    const shotNumberById = new Map<string, number>()
    if (input.episodeId) {
      const { data: episode } = await context.supabase.from("creator_episodes").select("id").eq("id", input.episodeId).eq("project_id", context.project.id).maybeSingle()
      if (!episode) throw new Error("Episode does not belong to this project")
      const { data: shots, error } = await context.supabase.from("creator_shots").select("id,order_index").eq("episode_id", input.episodeId)
      if (error) throw error
      for (const shot of shots || []) shotNumberById.set(shot.id, shot.order_index + 1)
      const requested = new Set(input.shotIds)
      for (const number of input.shotNumbers) {
        const match = (shots || []).find((shot) => shot.order_index + 1 === number)
        if (!match) throw new Error(`This episode has no shot ${number}.`)
        requested.add(match.id)
      }
      shotIds = requested.size ? Array.from(requested) : (shots || []).map((shot) => shot.id)
    } else if (input.shotIds.length) {
      shotIds = input.shotIds
    } else if (input.shotNumbers.length) {
      throw new Error("Naming shots by number needs an episodeId, because the numbers are per episode.")
    }
    let query = context.supabase.from("creator_generation_jobs").select("id,shot_id,type,status,model,provider,prompt,estimated_credits,credits_used,result_url,result_thumbnail,error,created_at,started_at,completed_at").eq("project_id", context.project.id).order("created_at", { ascending: false }).limit(input.limit)
    if (input.statuses.length) query = query.in("status", input.statuses)
    if (shotIds) query = shotIds.length ? query.in("shot_id", shotIds) : query.is("shot_id", null)
    const { data, error } = await query
    if (error) throw error
    const jobs = data || []
    return { jobs: withCandidateNumbers(jobs, shotNumberById), counts: jobs.reduce((counts: Record<string, number>, job) => ({ ...counts, [job.status]: (counts[job.status] || 0) + 1 }), {}) }
  },
})

export const submitGenerationTool = defineDirectorTool({
  name: "submit_generation",
  version: 1,
  risk: "costly",
  requiresApproval: true,
  input: z.object({ request: generationRequestSchema, prompts: z.record(z.string(), z.string().trim().min(1).max(20_000)), idempotencyKey: z.string().min(8).max(200), workflowRunId: z.string().uuid().optional() }),
  async execute(context, input) {
    // Storyboard numbers are resolved here, against the episode, so a model
    // that only knows "shot 2" cannot target the wrong shot. order_index is
    // 0-based, matching the number list_storyboard_shots reports.
    let request = input.request
    // Enforced here rather than on the shared schema: estimate_generation_cost
    // uses the same shape and legitimately quotes a price before any shot is
    // chosen, so a schema-level rule failed that tool for no reason.
    if (!request.shotIds.length && !request.shotNumbers.length) {
      throw new Error("Name the shots to generate, either as shot numbers from the storyboard or as shot ids from a tool result.")
    }
    let promptsByNumber = new Map<number, string>()
    if (request.shotNumbers.length || request.videoReferenceShotNumbers.length) {
      const { data: episode } = await context.supabase.from("creator_episodes").select("id").eq("id", request.episodeId!).eq("project_id", context.project.id).maybeSingle()
      if (!episode) throw new Error("Episode does not belong to this project")
      const { data: numbered, error: numberedError } = await context.supabase.from("creator_shots").select("id,order_index,video_url,video_status").eq("episode_id", episode.id).order("order_index")
      if (numberedError) throw numberedError
      const byNumber = new Map((numbered || []).map((shot) => [shot.order_index + 1, shot]))
      const resolved: string[] = []
      for (const number of request.shotNumbers) {
        const shot = byNumber.get(number)
        if (!shot) throw new Error(`Shot ${number} does not exist in this episode. It has ${(numbered || []).length} shots.`)
        resolved.push(shot.id)
        promptsByNumber.set(number, shot.id)
      }
      const targetNumbers = new Set(request.shotNumbers)
      const referenceClips: string[] = []
      for (const number of request.videoReferenceShotNumbers) {
        if (targetNumbers.has(number)) throw new Error(`Shot ${number} cannot be both the generation target and its own video reference.`)
        const shot = byNumber.get(number)
        if (!shot) throw new Error(`Reference shot ${number} does not exist in this episode. It has ${(numbered || []).length} shots.`)
        if (request.shotIds.includes(shot.id)) throw new Error(`Shot ${number} cannot be both the generation target and its own video reference.`)
        if (!shot.video_url || shot.video_status !== "completed") throw new Error(`Reference shot ${number} does not have a completed video.`)
        referenceClips.push(shot.video_url)
      }
      request = {
        ...request,
        shotIds: Array.from(new Set([...request.shotIds, ...resolved])),
        videoReferencePaths: Array.from(new Set([...request.videoReferencePaths, ...referenceClips])).slice(0, 10),
      }
    }

    const routing = routeGeneration(request)
    if (routing.selected.provider === "unconfigured") throw new Error("No generation provider is configured for this model")
    const { data: episodes, error: episodeError } = await context.supabase.from("creator_episodes").select("id").eq("project_id", context.project.id)
    if (episodeError) throw episodeError
    const episodeIds = (episodes ?? []).map((episode) => episode.id)
    const { data: shots, error: shotError } = episodeIds.length ? await context.supabase.from("creator_shots").select("id").in("episode_id", episodeIds).in("id", request.shotIds) : { data: [], error: null }
    if (shotError) throw shotError
    if ((shots ?? []).length !== request.shotIds.length) throw new Error("One or more shots do not belong to this project")
    const { data: projectEntityRows } = await context.supabase.from("creator_entities").select("id,name,type").eq("project_id", context.project.id)
    const entityIndex = (projectEntityRows || []) as MentionableEntity[]
    // Every shot happens somewhere, and a prompt names the location only where
    // it changes — so the interior shots between two exteriors carry no scene
    // and would render with no location reference at all.
    //
    // ensureShotLocations was written for exactly this and nothing called it:
    // the inheritance ran once, inside create_storyboard_batch, over the batch
    // being written. A storyboard built before its location entity existed —
    // which is the ordinary order here, since the entities are created from the
    // finished sheet — therefore had nothing to inherit and was never revisited.
    // Repairing at generation is what makes it true whenever it matters, and
    // the repair is saved, so the assets column agrees with what was rendered.
    const repairEpisodeId = request.episodeId || (await context.supabase.from("creator_shots").select("episode_id").in("id", request.shotIds).limit(1).maybeSingle()).data?.episode_id
    if (repairEpisodeId) {
      const { data: episodeShots } = await context.supabase.from("creator_shots").select("id,order_index,referenced_entities,metadata").eq("episode_id", repairEpisodeId).order("order_index")
      if (episodeShots?.length) {
        await ensureShotLocations(context.supabase, { shots: episodeShots, entities: (projectEntityRows || []) as { id: string; type: string }[] })
      }
    }
    const { data: generationShots, error: validationError } = await context.supabase.from("creator_shots").select("id,prompt,metadata,referenced_entities,keyframe_image,video_url").in("id", request.shotIds)
    if (validationError) throw validationError
    const referencedIds = Array.from(new Set([...(generationShots || []).flatMap((shot) => shot.referenced_entities || []), ...request.mentionedEntityIds]))
    if (referencedIds.length) {
      const { data: references, error: referenceError } = await context.supabase.from("creator_entities").select("id").eq("project_id", context.project.id).in("id", referencedIds)
      if (referenceError) throw referenceError
      if ((references || []).length !== referencedIds.length) throw new Error("Generation blocked: one or more shot entity references are stale")
    }
    // Generation reads a shot's cast; it does not widen it. Unioning every
    // mention of a batch into every shot made one shot accumulate the whole
    // project, and the storyboard then showed all of it as that shot's assets.
    if (request.mentionedEntityIds.length) {
      const updates = await Promise.all((generationShots || []).map((shot) => {
        const mentionedInThisShot = findMentionedEntityIds(shot.prompt || "", entityIndex)
        const additions = request.mentionedEntityIds.filter((id) => mentionedInThisShot.includes(id))
        if (!additions.length) return Promise.resolve({ error: null })
        return context.supabase
          .from("creator_shots")
          .update({ referenced_entities: Array.from(new Set([...(shot.referenced_entities || []), ...additions])) })
          .eq("id", shot.id)
      }))
      const updateError = updates.find((result) => result.error)?.error
      if (updateError) throw updateError
    }
    // References chosen in the generation block replace the ones captured when
    // the proposal was created, so an edited proposal generates from what the
    // user can actually see on the card.
    // One referencePaths list covers the whole batch, but a shot's keyframe is
    // a composition reference for that shot alone. Without this, generating
    // four shots fed every shot's keyframe into all four of them.
    const shotOwnedMedia = new Map<string, string>()
    for (const shot of generationShots || []) {
      for (const path of [shot.keyframe_image, shot.video_url]) {
        if (typeof path === "string" && path.trim()) shotOwnedMedia.set(path, shot.id)
      }
    }
    // A continuing video shot inherits the previous shot's finished clip so
    // motion, lighting, and pacing carry across the cut. Resolved here because
    // it depends on storyboard order, which the model would have to look up and
    // may simply forget to.
    let request2 = request
    if (request.type === "video" && !request.videoReferencePaths.length && request.episodeId) {
      const { data: ordered } = await context.supabase
        .from("creator_shots").select("id,order_index,video_url,video_status").eq("episode_id", request.episodeId).order("order_index")
      const byId = new Map((ordered || []).map((shot) => [shot.id, shot]))
      const previousClips: string[] = []
      for (const shotId of request.shotIds) {
        const target = byId.get(shotId)
        if (!target) continue
        const previous = (ordered || []).filter((shot) => shot.order_index < target.order_index).pop()
        if (previous?.video_url && previous.video_status === "completed") previousClips.push(previous.video_url)
      }
      if (previousClips.length) request2 = { ...request, videoReferencePaths: Array.from(new Set(previousClips)).slice(0, 10) }
    }
    request = request2

    const inputImagesFor = (shotId: string) => {
      const scoped = request.referencePaths.filter((path) => {
        const owner = shotOwnedMedia.get(path)
        if (!owner) return true
        // Another shot's frame is never this shot's reference. This shot's own
        // frame is only a reference when the user asked to keep the existing
        // composition; otherwise a regenerate would just re-derive the picture
        // it was meant to replace.
        return owner === shotId && request.useExistingFrame
      })
      return scoped.length ? scoped : undefined
    }
    // A model that addressed shots by number keys its prompts the same way, and
    // a shot that already carries a saved storyboard prompt does not need the
    // model to restate it — refusing to generate in that case only blocks work
    // the user can see is ready.
    // A video is filmed from the shot's video prompt; an image is drawn from
    // its image prompt. This map used to hold `prompt` for both, so every video
    // that fell back to the saved text was filmed from a description of a single
    // frame — which is why those clips came back as a still that drifts. The
    // video prompt has been written and stored all along; nothing read it.
    const savedPrompts = new Map((generationShots || []).map((shot) => [
      shot.id,
      request.type === "video"
        ? (readShotVideoPrompt(shot) || (shot.prompt || "").trim())
        : (shot.prompt || "").trim(),
    ]))
    const promptFor = (shotId: string) => {
      if (input.prompts[shotId]?.trim()) return input.prompts[shotId].trim()
      for (const [number, id] of Array.from(promptsByNumber.entries())) {
        const byNumber = input.prompts[String(number)]
        if (id === shotId && byNumber?.trim()) return byNumber.trim()
      }
      return savedPrompts.get(shotId) || ""
    }
    // Who pays for this. A customer who has connected their own key for the
    // provider that will actually serve these shots is billed by that provider
    // directly, so no credits are taken — and the decision is written onto each
    // job, because a job that charged nothing has to stay recognisable for the
    // rest of its life or the failure path refunds a charge that never happened.
    const servingProvider = routing.selected.provider
    const byokProvider = byokProviderFor(servingProvider)
    const billing = decideBilling({
      hasCredential: byokProvider
        ? await hasCredential(context.user.id, byokProvider)
        : false,
      platformCredits: routing.creditsPerShot,
      ownKeysOnly: await ownKeysOnly(context.user.id).catch(() => false),
      provider: servingProvider,
    })
    const shotNumberById = new Map(Array.from(promptsByNumber.entries()).map(([number, id]) => [id, number]))
    const jobs = request.shotIds.map((shotId, index) => {
      const prompt = promptFor(shotId)
      const shot = (generationShots || []).find((item) => item.id === shotId)
      const entityReferenceIds = Array.from(new Set([...(shot?.referenced_entities || []), ...request.mentionedEntityIds]))
      const targetSnapshot = buildGenerationTargetSnapshot({ projectId: context.project.id, episodeId: request.episodeId || null, shotId, shotNumber: shotNumberById.get(shotId) || null, type: request.type, prompt, entityReferenceIds })
      return { user_id: context.user.id, project_id: context.project.id, workflow_run_id: input.workflowRunId || null, shot_id: shotId, type: request.type, status: "approved", model: routing.selected.model, provider: routing.selected.provider, prompt, settings: request, target_snapshot: targetSnapshot, ...((): Record<string, unknown> => { const images = inputImagesFor(shotId); return images ? { input_images: images } : {} })(), estimated_credits: billing.credits, billing_mode: billing.mode, requires_approval: true, approved_at: new Date().toISOString(), operation: request.type === "video" ? "submit_video_generation" : "submit_image_generation", idempotency_key: `${input.idempotencyKey}:${index}`, routing_decision: routing, cost_estimate: { credits: billing.credits, billingMode: billing.mode } }
    })
    const unprompted = jobs.filter((job) => !job.prompt).map((job) => job.shot_id)
    if (unprompted.length) throw new Error(`No prompt available for ${unprompted.length} shot(s). Add a prompt to the storyboard shot, or pass one in prompts.`)
    const { data, error } = await context.supabase.from("creator_generation_jobs").insert(jobs).select("*")
    if (error) throw error
    const jobIds = (data ?? []).map((job) => job.id)
    // Chat proposal approvals must charge the same account used by the Studio
    // credit badge and direct image/video endpoints. The legacy reservation
    // table is a separate ledger and therefore could leave the visible balance
    // unchanged after an approved Director generation.
    // Nothing to deduct when the customer's own provider account is paying.
    const deduction = billing.mode === "byok" ? { success: true, newBalance: 0, errorMessage: null } : await deductUserCredits(
      context.user.id,
      routing.estimatedCredits,
      routing.selected.model,
      `AI Director approved ${request.type} generation (${request.shotIds.length} shot${request.shotIds.length === 1 ? "" : "s"})`,
      context.supabase,
    )
    if (!deduction.success) {
      await context.supabase.rpc("creator_cancel_unreserved_jobs", { p_job_ids: jobIds })
      throw new Error(deduction.errorMessage || "Insufficient credits")
    }
    if (billing.mode !== "byok") {
      await context.supabase.from("creator_generation_jobs").update({ credits_used: routing.creditsPerShot }).in("id", jobIds)
    }
    // Trigger background generation for the approved jobs
    executeGenerationJobsInBackground(context, jobIds)

    return {
      jobs: data,
      billingMode: billing.mode,
      estimatedCredits: billing.mode === "byok" ? 0 : routing.estimatedCredits,
      creditsCharged: billing.mode === "byok" ? 0 : routing.estimatedCredits,
      // Omitted rather than reported as zero when nothing was charged: the
      // Studio broadcasts this straight onto the credit badge, and a BYOK
      // generation would have shown the user a balance of nought.
      ...(billing.mode === "byok" ? {} : { creditBalance: deduction.newBalance }),
    }
  },
})


/**
 * Reference art for characters, locations, and props — the same generation
 * block a storyboard keyframe gets.
 *
 * Asset art used to be generated by the chat route itself: it charged the user
 * and called the image model directly, with no job row, no approval card, and
 * nothing in the generation history. So the one kind of art the user was most
 * likely to want redone was the one kind they could not review before paying
 * for. It now writes the same job a shot writes, and the same card asks first.
 */
export const generateEntityReferenceArtTool = defineDirectorTool({
  name: "generate_entity_reference_art",
  version: 1,
  risk: "costly",
  requiresApproval: true,
  input: z.object({
    entityIds: z.array(z.string().uuid()).min(1).max(12),
    // Written per entity when the look needs saying in this run's words; the
    // entity's saved description is used for anything left out.
    prompts: z.record(z.string(), z.string().trim().min(1).max(12_000)).default({}),
    model: z.string().trim().max(100).optional(),
    idempotencyKey: z.string().min(8).max(200),
    workflowRunId: z.string().uuid().optional(),
  }),
  async execute(context, input) {
    const { data: entities, error } = await context.supabase
      .from("creator_entities")
      .select("id,name,type,description,reference_images")
      .eq("project_id", context.project.id)
      .in("id", input.entityIds)
    if (error) throw error
    const found = entities || []
    if (found.length !== input.entityIds.length) {
      throw new Error("One or more of those characters or assets do not belong to this project.")
    }

    const style = projectVisualStyle(context.project)
    const styleDna = projectStyleDna(context.project)
    const routing = routeGeneration({
      type: "image",
      source: "text",
      model: input.model,
      aspectRatio: typeof context.project.default_aspect === "string" ? context.project.default_aspect : "9:16",
      // Reference art exists to lock an identity, so the routing preference is
      // the one that keeps a face the same between renders.
      characterConsistencyPriority: true,
    })
    if (routing.selected.provider === "unconfigured") throw new Error("No generation provider is configured for this model")

    const jobs = found.map((entity, index) => {
      const written = input.prompts[entity.id]?.trim() || input.prompts[entity.name]?.trim()
      const prompt = written || buildEntityReferenceImagePrompt(
        entity as MentionableEntity,
        style,
        composeLookDirectives(style, styleDna, styleBlockForEntityType(typeof entity.type === "string" ? entity.type : null)),
      )
      return {
        user_id: context.user.id,
        project_id: context.project.id,
        workflow_run_id: input.workflowRunId || null,
        entity_id: entity.id,
        shot_id: null,
        type: "image" as const,
        status: "approved",
        model: routing.selected.model,
        provider: routing.selected.provider,
        prompt,
        settings: { type: "image", aspectRatio: routing.request.aspectRatio, target: "asset", entityType: entity.type },
        estimated_credits: routing.creditsPerShot,
        requires_approval: true,
        approved_at: new Date().toISOString(),
        operation: "generate_entity_reference_art",
        idempotency_key: `${input.idempotencyKey}:${index}`,
        routing_decision: routing,
        cost_estimate: { credits: routing.creditsPerShot },
      }
    })

    const { data, error: insertError } = await context.supabase.from("creator_generation_jobs").insert(jobs).select("*")
    if (insertError) throw insertError
    const jobIds = (data ?? []).map((job) => job.id)
    const estimatedCredits = routing.creditsPerShot * jobs.length
    const deduction = await deductUserCredits(
      context.user.id,
      estimatedCredits,
      routing.selected.model,
      `AI Director approved reference art (${jobs.length} asset${jobs.length === 1 ? "" : "s"})`,
      context.supabase,
    )
    if (!deduction.success) {
      await context.supabase.rpc("creator_cancel_unreserved_jobs", { p_job_ids: jobIds })
      throw new Error(deduction.errorMessage || "Insufficient credits")
    }
    await context.supabase.from("creator_generation_jobs").update({ credits_used: routing.creditsPerShot }).in("id", jobIds)
    executeGenerationJobsInBackground(context, jobIds)

    return {
      jobs: data,
      assets: found.map((entity) => ({ id: entity.id, name: entity.name, type: entity.type })),
      estimatedCredits,
      creditsCharged: estimatedCredits,
      creditBalance: deduction.newBalance,
    }
  },
})

export const updateScriptTool = defineDirectorTool({
  name: "update_script",
  version: 1,
  risk: "write",
  requiresApproval: true,
  input: z.object({
    episodeId: z.string().uuid(),
    content: scriptContentSchema,
    summary: z.string().trim().min(1).max(500).default("Update script from AI Director chat"),
  }),
  async execute(context, input) {
    const { data, error } = await context.supabase
      .from("creator_episodes")
      .update({ script_content: normalizeScriptContent(input.content), script_updated_at: new Date().toISOString(), status: "draft" })
      .eq("id", input.episodeId)
      .eq("project_id", context.project.id)
      .select("*")
      .single()
    if (error) throw error
    return data
  },
})

/**
 * Accepts a patch whether it was nested or flattened.
 *
 * These tools take `{ shotId, patch: { ... } }`, and a model that puts the
 * fields at the top level instead — `{ shotId, prompt: "..." }` — produced
 * "patch: Invalid input" and lost the work. On a six-shot revision that is four
 * shots silently dropped while the other two go through, which reads as the
 * revision half-applying for no reason anybody can see. The shape it meant is
 * unambiguous, so it is accepted rather than refused.
 */
function liftPatch(idField: string, fields: readonly string[]) {
  return (value: unknown) => {
    if (!value || typeof value !== "object") return value
    const input = value as Record<string, unknown>
    const patch = input.patch
    if (patch && typeof patch === "object" && !Array.isArray(patch)) return input
    const lifted: Record<string, unknown> = {}
    for (const field of fields) {
      if (input[field] !== undefined) lifted[field] = input[field]
    }
    if (!Object.keys(lifted).length) return input
    return { [idField]: input[idField], patch: lifted }
  }
}

const shotPatchFields = [
  "title", "description", "script_text", "prompt", "video_prompt",
  "duration_seconds", "aspect_ratio", "resolution", "style",
  "keyframe_image", "video_url",
] as const

const assetPatchFields = ["name", "description", "status", "voice_id", "metadata"] as const

export const updateShotTool = defineDirectorTool({
  name: "update_shot",
  version: 1,
  risk: "write",
  requiresApproval: true,
  input: z.preprocess(liftPatch("shotId", shotPatchFields), z.object({
    shotId: z.string().uuid(),
    patch: z.object({
      title: z.string().trim().min(1).max(200).optional(),
      description: z.string().trim().max(5_000).nullable().optional(),
      script_text: z.string().trim().max(10_000).nullable().optional(),
      prompt: z.string().trim().max(20_000).nullable().optional(),
      // The image prompt and the video prompt are different pieces of writing
      // for different models, so revising one must never overwrite the other.
      video_prompt: z.string().trim().max(20_000).nullable().optional(),
      duration_seconds: z.number().positive().max(120).optional(),
      aspect_ratio: z.string().trim().max(20).optional(),
      resolution: z.string().trim().max(20).optional(),
      style: z.string().trim().max(200).optional(),
      keyframe_image: z.string().trim().max(2_000).nullable().optional(),
      video_url: z.string().trim().max(2_000).nullable().optional(),
    }),
  })),
  async execute(context, input) {
    const { data: episodes, error: episodeError } = await context.supabase.from("creator_episodes").select("id").eq("project_id", context.project.id)
    if (episodeError) throw episodeError
    const episodeIds = (episodes ?? []).map((episode) => episode.id)
    // Same rule as create_storyboard_batch: this shot's image prompt is one
    // frame, and the master prompt it may have been extracted from is a whole
    // scene in named sections. The two are not to be confused.
    assertShotPromptShape(input.patch)
    const currentMetadata = "video_prompt" in input.patch
      ? (await context.supabase.from("creator_shots").select("metadata").eq("id", input.shotId).maybeSingle()).data?.metadata
      : undefined
    const columns = normalizeShotColumns(input.patch, currentMetadata)
    const { data, error } = await context.supabase
      .from("creator_shots")
      .update(columns)
      .eq("id", input.shotId)
      .in("episode_id", episodeIds.length ? episodeIds : ["00000000-0000-0000-0000-000000000000"])
      .select("*")
      .single()
    if (error) throw error
    return data
  },
})

/**
 * Writes the video prompts for a storyboard, in one pass.
 *
 * One shot at a time meant one approval card per shot, which for a fifteen-shot
 * episode is fifteen decisions about the same piece of work. The whole
 * storyboard is one decision, so it is one card.
 *
 * The beat format lives here rather than in the agent's instructions because
 * instructions can be replaced from the admin screen and this cannot: a saved
 * team that has never heard of timed beats still gets them from the schema it
 * has to fill in.
 */
export const writeShotVideoPromptsTool = defineDirectorTool({
  name: "write_shot_video_prompts",
  version: 1,
  risk: "write",
  requiresApproval: true,
  input: z.object({
    episodeId: z.string().uuid(),
    shots: z.array(z.object({
      shotNumber: z.number().int().positive().max(10_000).describe("The storyboard number as shown to the user, counting from 1."),
      videoPrompt: z.string().trim().min(1).max(20_000).describe(
        "What happens across THIS ONE SHOT, as contiguous timed beats. Each shot is its own self-contained timeline: it starts at 0s, runs to that shot's own length, and never carries a timestamp from the scene it belongs to — shot 4 is `0-4s`, not `12-16s`. One shot is a single continuous camera action of at most 15 seconds; a scene longer than that is already split across the storyboard's shots, so write each shot's slice of it rather than the whole scene. Two beat forms are accepted: `0-4s: <action>` or the timestamped-title form `0-2s — BEAT TITLE` followed by the action lines. Every beat states camera framing, who is present by @tag, the specific physical action, and the environmental reaction. Dialogue goes in braces — @Ethan says: {\"Wait.\"} — and sound in angle brackets — <Door slams>. Roughly three words a second is the ceiling for a speakable line, so a line that will not fit needs a longer shot, not a faster read. Never describe a referenced character's face, hair, build, or wardrobe, and never write a CHARACTER / ASSET LOCK block: reference art defines appearance, and written descriptions are stripped before the prompt reaches the provider.",
      ),
    })).min(1).max(100),
  }),
  async execute(context, input) {
    const { data: episode } = await context.supabase.from("creator_episodes").select("id").eq("id", input.episodeId).eq("project_id", context.project.id).maybeSingle()
    if (!episode) throw new Error("Episode does not belong to this project")
    const { data: shots, error: shotsError } = await context.supabase.from("creator_shots").select("id,order_index,metadata,duration_seconds").eq("episode_id", input.episodeId).order("order_index")
    if (shotsError) throw shotsError
    const byNumber = new Map((shots || []).map((shot) => [shot.order_index + 1, shot]))

    const missing = input.shots.filter((entry) => !byNumber.has(entry.shotNumber)).map((entry) => entry.shotNumber)
    if (missing.length) throw new Error(`Shot ${missing.join(", ")} does not exist in this episode. It has ${(shots || []).length} shots.`)
    // A prompt whose beats do not add up renders unpredictably, and the writer
    // is the only one who can fix it — so it is refused with the reason rather
    // than stored and discovered later as a bad clip.
    const faults = input.shots.flatMap((entry) => describeBeatProblems(entry.videoPrompt).map((problem) => `Shot ${entry.shotNumber}: ${problem}`))
    if (faults.length) throw new Error(faults.slice(0, 8).join(" "))

    // The path that actually produced "a dark sleek modern car" while the
    // project held reference art for @Sleek Luxury Car. The tag is what binds a
    // subject to its picture at the provider, so an untagged asset is rendered
    // from the words and comes back as a different one.
    const { data: entityRows } = await context.supabase
      .from("creator_entities")
      .select("id,name,type,reference_images,primary_reference_image")
      .eq("project_id", context.project.id)
    const projectEntities = (entityRows || []) as MentionableEntity[]
    const untagged = input.shots.flatMap((entry) => {
      const found = findUntaggedEntities(entry.videoPrompt, projectEntities)
      return found.length ? [describeUntaggedEntities(found, `Shot ${entry.shotNumber}'s video prompt`)] : []
    })
    if (untagged.length) throw new Error(untagged.slice(0, 4).join(" "))

    const written = await Promise.all(input.shots.map(async (entry) => {
      const shot = byNumber.get(entry.shotNumber)!
      // Identity descriptions override the reference art, exactly as they do in
      // the image prompt, so they never reach the row here either.
      const videoPrompt = stripIdentityDescriptions(entry.videoPrompt)
      const runtime = beatRuntimeSeconds(videoPrompt)
      const { error } = await context.supabase
        .from("creator_shots")
        .update({
          metadata: writeShotVideoPrompt(shot.metadata, videoPrompt),
          // The beats are the runtime; storing anything else would film a
          // prompt that scripts eight seconds for four.
          ...(runtime ? { duration_seconds: runtime } : {}),
        })
        .eq("id", shot.id)
      if (error) throw error
      return { shotNumber: entry.shotNumber, seconds: runtime ?? shot.duration_seconds }
    }))
    return { episodeId: input.episodeId, written: written.length, shots: written }
  },
})

/**
 * Corrects the aspect a shot's prompt states in words, to match the aspect the
 * shot is actually set to.
 *
 * A prompt opens by stating its framing — "16:9 cinematic medium shot" — and
 * the shot carries the same framing as a setting. Change the project's aspect
 * mid-production and the setting moves while the sentence does not, so every
 * shot then tells two different stories about its own composition.
 *
 * One card for the whole episode, not one per shot: this is a single decision
 * — bring every prompt back in line with what the shot is already set to —
 * not fifteen separate ones. The stored prompt is what changes, so the
 * storyboard shows the corrected text without waiting for a render.
 */
export const fixShotAspectMismatchTool = defineDirectorTool({
  name: "fix_shot_aspect_mismatch",
  version: 1,
  risk: "write",
  requiresApproval: true,
  input: z.object({ episodeId: z.string().uuid() }),
  async execute(context, input) {
    const { data: episode } = await context.supabase.from("creator_episodes").select("id").eq("id", input.episodeId).eq("project_id", context.project.id).maybeSingle()
    if (!episode) throw new Error("Episode does not belong to this project")
    const { data: shots, error } = await context.supabase.from("creator_shots").select("id,order_index,prompt,aspect_ratio").eq("episode_id", input.episodeId).order("order_index")
    if (error) throw error
    const mismatched = (shots || []).filter(aspectMismatch)
    if (!mismatched.length) return { episodeId: input.episodeId, corrected: 0, shots: [] }
    const corrected = await Promise.all(mismatched.map(async (shot) => {
      const prompt = restateAspect(shot.prompt as string, shot.aspect_ratio as string)
      const { error: updateError } = await context.supabase.from("creator_shots").update({ prompt }).eq("id", shot.id)
      if (updateError) throw updateError
      return { shotNumber: shot.order_index + 1, aspectRatio: shot.aspect_ratio }
    }))
    return { episodeId: input.episodeId, corrected: corrected.length, shots: corrected }
  },
})

export const deleteShotTool = defineDirectorTool({
  name: "delete_shot",
  version: 1,
  risk: "destructive",
  requiresApproval: true,
  input: z.object({ shotId: z.string().uuid() }),
  async execute(context, input) {
    const { data: episodes, error: episodeError } = await context.supabase.from("creator_episodes").select("id").eq("project_id", context.project.id)
    if (episodeError) throw episodeError
    const episodeIds = (episodes ?? []).map((episode) => episode.id)
    const { data, error } = await context.supabase
      .from("creator_shots")
      .delete()
      .eq("id", input.shotId)
      .in("episode_id", episodeIds.length ? episodeIds : ["00000000-0000-0000-0000-000000000000"])
      .select("id,title")
      .single()
    if (error) throw error
    return data
  },
})

export const updateAssetTool = defineDirectorTool({
  name: "update_asset",
  version: 1,
  risk: "write",
  requiresApproval: true,
  input: z.preprocess(liftPatch("assetId", assetPatchFields), z.object({
    assetId: z.string().uuid(),
    patch: z.object({
      name: z.string().trim().min(1).max(200).optional(),
      description: z.string().trim().max(10_000).nullable().optional(),
      status: z.string().trim().max(80).optional(),
      voice_id: z.string().trim().max(200).nullable().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
  })),
  async execute(context, input) {
    // A patch carrying metadata replaces the whole jsonb column, and the column
    // holds image_generation — the record of which description the reference
    // art was made from. Revising a location's description wrote the new look
    // and erased that record in the same statement, so artIsStale() hit its
    // "no provenance" branch and reported the art clean. The pipeline then
    // called the assets done and the revision moved on to the storyboard, while
    // the location plates still showed the look the user had just replaced.
    const patch = { ...input.patch } as Record<string, unknown>
    if (patch.metadata && typeof patch.metadata === "object") {
      const { data: existing, error: readError } = await context.supabase
        .from("creator_entities")
        .select("metadata")
        .eq("id", input.assetId)
        .eq("project_id", context.project.id)
        .single()
      if (readError) throw readError
      patch.metadata = mergeAssetMetadata(existing?.metadata, patch.metadata as Record<string, unknown>)
    }
    const { data, error } = await context.supabase
      .from("creator_entities")
      .update(patch)
      .eq("id", input.assetId)
      .eq("project_id", context.project.id)
      .select("*")
      .single()
    if (error) throw error
    return data
  },
})

/**
 * The saved metadata with the patch laid over it, one key at a time.
 *
 * Provenance the agent never names — image_generation above all — has to
 * survive an edit that only meant to record a palette or a time of day.
 */
/** Kept as a named export for existing callers; the merge itself is shared. */
export const mergeAssetMetadata = mergeEntityMetadata

export const attachMediaToAssetTool = defineDirectorTool({
  name: "attach_media_to_asset",
  version: 1,
  risk: "write",
  requiresApproval: true,
  input: z.object({ assetId: z.string().uuid(), storagePath: z.string().trim().min(1).max(2_000) }),
  async execute(context, input) {
    const { data: asset, error: readError } = await context.supabase.from("creator_entities").select("reference_images,metadata").eq("id", input.assetId).eq("project_id", context.project.id).single()
    if (readError) throw readError
    const referenceImages = Array.from(new Set([...(asset.reference_images || []), input.storagePath]))
    const { data, error } = await context.supabase.from("creator_entities").update({
      reference_images: referenceImages,
      metadata: { ...((asset.metadata as Record<string, unknown>) || {}), last_chat_reference: input.storagePath },
    }).eq("id", input.assetId).eq("project_id", context.project.id).select("*").single()
    if (error) throw error
    return data
  },
})

export const deleteAssetTool = defineDirectorTool({
  name: "delete_asset",
  version: 1,
  risk: "destructive",
  requiresApproval: true,
  input: z.object({ assetId: z.string().uuid() }),
  async execute(context, input) {
    const { data, error } = await context.supabase
      .from("creator_entities")
      .delete()
      .eq("id", input.assetId)
      .eq("project_id", context.project.id)
      .select("id,name,type")
      .single()
    if (error) throw error
    return data
  },
})

export const attachMediaToShotTool = defineDirectorTool({
  name: "attach_media_to_shot",
  version: 1,
  risk: "write",
  requiresApproval: true,
  input: z.object({ shotId: z.string().uuid(), storagePath: z.string().trim().min(1).max(2_000), mediaType: z.enum(["image", "video", "audio"]).default("image") }),
  async execute(context, input) {
    const { data: episodes, error: episodeError } = await context.supabase.from("creator_episodes").select("id").eq("project_id", context.project.id)
    if (episodeError) throw episodeError
    const episodeIds = (episodes ?? []).map((episode) => episode.id)
    const updates: Record<string, unknown> = input.mediaType === "video"
      ? { video_url: input.storagePath, video_status: "completed" }
      : input.mediaType === "image"
        ? { keyframe_image: input.storagePath }
        : { metadata: { audio_reference: input.storagePath } }
    const { data, error } = await context.supabase.from("creator_shots")
      .update(updates)
      .eq("id", input.shotId)
      .in("episode_id", episodeIds.length ? episodeIds : ["00000000-0000-0000-0000-000000000000"])
      .select("*")
      .single()
    if (error) throw error
    return data
  },
})

export const updateFullAutoModeTool = defineDirectorTool({
  name: "update_full_auto_mode",
  version: 1,
  risk: "write",
  requiresApproval: true,
  input: z.object({
    enabled: z.boolean(),
    creditCap: z.number().int().positive().max(100_000).default(500),
    maxJobsPerRun: z.number().int().positive().max(100).default(10),
    allowDestructiveActions: z.boolean().default(false),
  }),
  async execute(context, input) {
    const metadata = {
      ...((context.project.metadata as Record<string, unknown> | undefined) ?? {}),
      ai_director_full_auto: {
        enabled: input.enabled,
        credit_cap: input.creditCap,
        max_jobs_per_run: input.maxJobsPerRun,
        allow_destructive_actions: input.allowDestructiveActions,
        updated_at: new Date().toISOString(),
      },
    }
    const { data, error } = await context.supabase
      .from("creator_projects")
      .update({ metadata })
      .eq("id", context.project.id)
      .eq("user_id", context.user.id)
      .select("id,metadata")
      .single()
    if (error) throw error
    return data
  },
})

export const createRevisionRequestTool = defineDirectorTool({
  name: "create_revision_request",
  version: 1,
  risk: "write",
  requiresApproval: true,
  input: revisionRequestSchema,
  async execute(context, input) {
    const { data, error } = await context.supabase.from("creator_revision_requests").insert({ project_id: context.project.id, user_id: context.user.id, instruction: input.instruction, parsed_change: input.change, affected_entities: input.change.targetIds, dependencies: input.dependencies, locked_assets: input.lockedAssets, estimated_credits: input.estimatedCredits, status: "approved" }).select("*").single()
    if (error) throw error
    return data
  },
})

/**
 * Marks the art an entity or shot already has as matching the text it has now.
 *
 * The counterpart to regenerating. Staleness is a comparison against the text
 * recorded at generation time, and only a generation ever wrote that text — so
 * art the user was happy with, whose description they had since reworded, could
 * only be settled by paying to render it again. This settles it by recording
 * what the user is telling us: the picture already answers the description.
 */
export const acceptExistingArtTool = defineDirectorTool({
  name: "accept_existing_art",
  version: 1,
  risk: "write",
  requiresApproval: true,
  input: z.object({
    entityNames: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
    shotNumbers: z.array(z.number().int().positive().max(10_000)).max(100).default([]),
    episodeId: z.string().uuid().optional(),
  }),
  async execute(context, input) {
    if (!input.entityNames.length && !input.shotNumbers.length) {
      throw new Error("Name the characters, assets, or shots whose existing art is being accepted.")
    }
    const acceptedEntities: string[] = []
    const acceptedShots: number[] = []

    if (input.entityNames.length) {
      const { data: entities, error } = await context.supabase.from("creator_entities").select("id,name,description,reference_images,metadata").eq("project_id", context.project.id)
      if (error) throw error
      const byHandle = new Map((entities || []).map((entity) => [entityHandle(entity.name), entity]))
      for (const name of input.entityNames) {
        const entity = byHandle.get(entityHandle(name))
        if (!entity) throw new Error(`This project has no character or asset called ${name}.`)
        if (!Array.isArray(entity.reference_images) || !entity.reference_images.length) {
          throw new Error(`${entity.name} has no reference art to accept. Generate it first.`)
        }
        const { error: writeError } = await context.supabase
          .from("creator_entities")
          .update({ metadata: metadataAcceptingEntityArt(entity.metadata, typeof entity.description === "string" ? entity.description : "") })
          .eq("id", entity.id)
          .eq("project_id", context.project.id)
        if (writeError) throw writeError
        acceptedEntities.push(entity.name)
      }
    }

    if (input.shotNumbers.length) {
      if (!input.episodeId) throw new Error("Naming shots by number needs an episodeId, because the numbers are per episode.")
      const { data: episode } = await context.supabase.from("creator_episodes").select("id").eq("id", input.episodeId).eq("project_id", context.project.id).maybeSingle()
      if (!episode) throw new Error("Episode does not belong to this project")
      const { data: shots, error } = await context.supabase.from("creator_shots").select("id,order_index,prompt,keyframe_image,metadata").eq("episode_id", input.episodeId)
      if (error) throw error
      for (const number of input.shotNumbers) {
        const shot = (shots || []).find((row) => row.order_index + 1 === number)
        if (!shot) throw new Error(`This episode has no shot ${number}.`)
        if (!shot.keyframe_image) throw new Error(`Shot ${number} has no keyframe to accept. Generate it first.`)
        const { error: writeError } = await context.supabase
          .from("creator_shots")
          .update({ metadata: metadataAcceptingKeyframe(shot.metadata, typeof shot.prompt === "string" ? shot.prompt : "") })
          .eq("id", shot.id)
        if (writeError) throw writeError
        acceptedShots.push(number)
      }
    }

    return { acceptedEntities, acceptedShots, generated: false, creditsUsed: 0 }
  },
})

/**
 * Reads back a tool result that was too large to carry in the conversation.
 *
 * Oversized results are cut to a head and a tail before they reach the model,
 * which keeps a turn affordable but would lose the middle if there were no way
 * back to it. There is: every tool result is written whole to
 * creator_workflow_steps.output the moment the tool finishes, so the full text
 * is already sitting there under the step number the marker names.
 *
 * Scoped to the run that is asking. The run id is supplied by the tool service
 * from the live run rather than by the model, so this cannot be pointed at
 * another conversation's results — and RLS on creator_workflow_steps scopes it
 * to the owner besides.
 */
export const readToolOutputTool = defineDirectorTool({
  name: "read_tool_output",
  version: 1,
  risk: "read",
  requiresApproval: false,
  input: z.object({
    stepSequence: z.number().int().positive(),
    /** Code points to skip, so a long result can be walked in pages. */
    offset: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(256).max(24_000).default(8_000),
    // Filled in by the tool service from the run in flight, never by the model.
    workflowRunId: z.string().uuid().optional(),
  }),
  async execute(context, input) {
    if (!input.workflowRunId) throw new Error("read_tool_output is only available inside a running workflow.")
    const { data: run } = await context.supabase
      .from("creator_workflow_runs")
      .select("id")
      .eq("id", input.workflowRunId)
      .eq("project_id", context.project.id)
      .eq("user_id", context.user.id)
      .maybeSingle()
    if (!run) throw new Error("That workflow run does not belong to this project.")

    const { data: step, error } = await context.supabase
      .from("creator_workflow_steps")
      .select("output,label,status")
      .eq("run_id", input.workflowRunId)
      .eq("sequence", input.stepSequence)
      .order("attempt", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (!step) throw new Error(`This run has no step ${input.stepSequence}.`)
    if (step.output === null || step.output === undefined) throw new Error(`Step ${input.stepSequence} (${step.label}) recorded no output to read.`)

    // Code points, matching how the pruner counted when it reported the number
    // of omitted characters — otherwise an offset taken from that marker lands
    // in the wrong place, and can land inside a character.
    const points = Array.from(JSON.stringify(step.output) ?? "null")
    const slice = points.slice(input.offset, input.offset + input.limit).join("")
    const nextOffset = input.offset + input.limit
    return {
      label: step.label,
      totalCharacters: points.length,
      offset: input.offset,
      content: slice,
      // Told rather than implied: a model that has to infer whether it reached
      // the end will either stop early or keep asking past it.
      hasMore: nextOffset < points.length,
      ...(nextOffset < points.length ? { nextOffset } : {}),
    }
  },
})

export const directorTools = {
  read_tool_output: readToolOutputTool,
  inspect_current_project: inspectCurrentProjectTool,
  read_episode_script: readEpisodeScriptTool,
  save_script_prompts: saveScriptPromptsTool,
  write_episode_master_prompt: writeEpisodeMasterPromptTool,
  read_episode_master_prompt: readEpisodeMasterPromptTool,
  read_script_prompts: readScriptPromptsTool,
  search_episode_script: searchEpisodeScriptTool,
  list_production_entities: listProductionEntitiesTool,
  list_storyboard_shots: listStoryboardShotsTool,
  update_creative_brief: updateCreativeBriefTool,
  create_series: createSeriesTool,
  write_series_bible: writeSeriesBibleTool,
  create_production_entity: createProductionEntityTool,
  create_production_entities_batch: createProductionEntitiesBatchTool,
  create_storyboard_batch: createStoryboardBatchTool,
  validate_production: validateProductionTool,
  record_continuity_fact: recordContinuityFactTool,
  inspect_continuity: inspectContinuityTool,
  estimate_generation_cost: estimateGenerationCostTool,
  inspect_generation_jobs: inspectGenerationJobsTool,
  submit_generation: submitGenerationTool,
  generate_entity_reference_art: generateEntityReferenceArtTool,
  update_script: updateScriptTool,
  update_shot: updateShotTool,
  write_shot_video_prompts: writeShotVideoPromptsTool,
  fix_shot_aspect_mismatch: fixShotAspectMismatchTool,
  delete_shot: deleteShotTool,
  update_asset: updateAssetTool,
  accept_existing_art: acceptExistingArtTool,
  attach_media_to_asset: attachMediaToAssetTool,
  delete_asset: deleteAssetTool,
  attach_media_to_shot: attachMediaToShotTool,
  update_full_auto_mode: updateFullAutoModeTool,
  create_revision_request: createRevisionRequestTool,
} as const

export type DirectorToolName = keyof typeof directorTools
