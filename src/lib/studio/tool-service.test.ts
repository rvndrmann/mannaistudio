import { describe, expect, it } from "vitest"
import { toolRequestSchema, withRunEpisode } from "./tool-service"
import { generationRequestSchema } from "./model-routing"
import { directorTools } from "./tool-registry"
import { directorFunctionDefinitions } from "./director-agent"

/**
 * A tool used to be listed twice: once in the registry, and again in the gate
 * every call passes through. Registering one without the other left it offered
 * to the model, owned by an agent, described in its instructions — and rejected
 * on arrival as "tool: Invalid input", which names the gate rather than the
 * list nobody remembered to update.
 */

describe("the tool gate", () => {
  it("admits every registered tool", () => {
    const rejected = Object.keys(directorTools).filter((tool) => !toolRequestSchema.safeParse({
      tool,
      input: {},
      idempotencyKey: "idempotency-key",
    }).success)
    expect(rejected).toEqual([])
  })

  it("admits every tool the model is offered", () => {
    const offered = directorFunctionDefinitions().map((definition) => definition.name)
    expect(offered.length).toBe(Object.keys(directorTools).length)
    const rejected = offered.filter((tool) => !toolRequestSchema.safeParse({
      tool,
      input: {},
      idempotencyKey: "idempotency-key",
    }).success)
    expect(rejected).toEqual([])
  })

  it("still refuses a tool that does not exist", () => {
    expect(toolRequestSchema.safeParse({ tool: "drop_all_shots", input: {}, idempotencyKey: "idempotency-key" }).success).toBe(false)
  })

  it("forgives a model that writes the name with spaces", () => {
    const parsed = toolRequestSchema.safeParse({ tool: " write shot video prompts ", input: {}, idempotencyKey: "idempotency-key" })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.tool).toBe("write_shot_video_prompts")
  })
})

/**
 * A model naming shots by number has to hand the tool an episode uuid too, and
 * when it truncated or hallucinated that uuid the whole media step failed with
 * "request.episodeId: Invalid UUID". The episode is a fact of the run, so the
 * server writes it and the model's value never decides the outcome.
 */
describe("the run's episode overrides the model", () => {
  const runEpisode = "11111111-1111-4111-8111-111111111111"

  it("rescues a submit_generation the model gave a broken episode uuid", () => {
    const fromModel = { request: { type: "video", shotNumbers: [1], episodeId: "episode-5" }, prompts: { "1": "a shot" } }
    const scoped = withRunEpisode(fromModel, runEpisode) as { request: unknown }
    const parsed = generationRequestSchema.safeParse((scoped.request))
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.episodeId).toBe(runEpisode)
  })

  it("still supplies the episode when the model omitted it entirely", () => {
    const fromModel = { request: { type: "video", shotNumbers: [2] }, prompts: { "2": "a shot" } }
    const scoped = withRunEpisode(fromModel, runEpisode) as { request: { episodeId?: string } }
    expect(scoped.request.episodeId).toBe(runEpisode)
  })

  it("leaves a call with no request object for its own validation to reject", () => {
    const fromModel = { prompts: { "1": "a shot" } }
    expect(withRunEpisode(fromModel, runEpisode)).toEqual(fromModel)
  })

  it("does nothing without a run episode", () => {
    const fromModel = { request: { type: "image", shotIds: [] } }
    expect(withRunEpisode(fromModel, undefined)).toEqual(fromModel)
  })
})
