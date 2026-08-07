import { z } from "zod"
import type { AuthenticatedProjectContext } from "./server-context"
import { creativeBriefSchema } from "./domain"
import { mergeCreativeBrief } from "./creative-brief"
import { continuityFactSchema, findContinuityConflicts } from "./continuity"
import { entityHandle, entityKindSchema, legacyEntityType, seriesBibleSchema } from "./story"
import { generationRequestSchema, routeGeneration } from "./model-routing"
import { revisionRequestSchema } from "./revisions"

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
  input: z.object({}).strict(),
  async execute(context) {
    const { id, user_id, name, description, production_mode, project_type, creative_brief, default_style, default_aspect } = context.project
    return { id, userId: user_id, name, description, productionMode: production_mode, projectType: project_type, creativeBrief: creative_brief, defaultStyle: default_style, defaultAspect: default_aspect }
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
  }).strict(),
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
  input: z.object({ name: z.string().trim().min(1).max(200), bible: seriesBibleSchema.optional() }).strict(),
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
  input: z.object({ seriesId: z.string().uuid(), bible: seriesBibleSchema }).strict(),
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
  input: z.object({ kind: entityKindSchema, name: z.string().trim().min(1).max(200), description: z.string().trim().max(10_000).default(""), metadata: z.record(z.string(), z.unknown()).default({}), referenceImages: z.array(z.string().max(2_000)).max(30).default([]) }).strict(),
  async execute(context, input) {
    const { data, error } = await context.supabase.from("creator_entities").insert({ project_id: context.project.id, type: legacyEntityType(input.kind), kind: input.kind, name: input.name, handle: entityHandle(input.name), description: input.description || null, reference_images: input.referenceImages, metadata: input.metadata, status: "draft", approval_status: "pending" }).select("*").single()
    if (error) throw error
    return data
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
  input: z.object({ entityId: z.string().uuid().optional() }).strict(),
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

export const submitGenerationTool = defineDirectorTool({
  name: "submit_generation",
  version: 1,
  risk: "costly",
  requiresApproval: true,
  input: z.object({ request: generationRequestSchema, prompts: z.record(z.string(), z.string().trim().min(1).max(20_000)), idempotencyKey: z.string().min(8).max(200) }).strict(),
  async execute(context, input) {
    const routing = routeGeneration(input.request)
    if (routing.selected.provider === "unconfigured") throw new Error("No generation provider is configured for this model")
    const { data: episodes, error: episodeError } = await context.supabase.from("creator_episodes").select("id").eq("project_id", context.project.id)
    if (episodeError) throw episodeError
    const episodeIds = (episodes ?? []).map((episode) => episode.id)
    const { data: shots, error: shotError } = episodeIds.length ? await context.supabase.from("creator_shots").select("id").in("episode_id", episodeIds).in("id", input.request.shotIds) : { data: [], error: null }
    if (shotError) throw shotError
    if ((shots ?? []).length !== input.request.shotIds.length) throw new Error("One or more shots do not belong to this project")
    const jobs = input.request.shotIds.map((shotId, index) => ({ user_id: context.user.id, project_id: context.project.id, shot_id: shotId, type: input.request.type, status: "approved", model: routing.selected.model, provider: routing.selected.provider, prompt: input.prompts[shotId], settings: input.request, estimated_credits: routing.creditsPerShot, requires_approval: true, approved_at: new Date().toISOString(), operation: input.request.type === "video" ? "submit_video_generation" : "submit_image_generation", idempotency_key: `${input.idempotencyKey}:${index}`, routing_decision: routing, cost_estimate: { credits: routing.creditsPerShot } }))
    if (jobs.some((job) => !job.prompt)) throw new Error("Every shot requires a validated prompt")
    const { data, error } = await context.supabase.from("creator_generation_jobs").insert(jobs).select("*")
    if (error) throw error
    const jobIds = (data ?? []).map((job) => job.id)
    const { error: reserveError } = await context.supabase.rpc("creator_reserve_generation_credits_batch", { p_job_ids: jobIds })
    if (reserveError) {
      await context.supabase.rpc("creator_cancel_unreserved_jobs", { p_job_ids: jobIds })
      throw reserveError
    }
    return { jobs: data, estimatedCredits: routing.estimatedCredits }
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

export const directorTools = {
  inspect_current_project: inspectCurrentProjectTool,
  update_creative_brief: updateCreativeBriefTool,
  create_series: createSeriesTool,
  write_series_bible: writeSeriesBibleTool,
  create_production_entity: createProductionEntityTool,
  record_continuity_fact: recordContinuityFactTool,
  inspect_continuity: inspectContinuityTool,
  estimate_generation_cost: estimateGenerationCostTool,
  submit_generation: submitGenerationTool,
  create_revision_request: createRevisionRequestTool,
} as const

export type DirectorToolName = keyof typeof directorTools
