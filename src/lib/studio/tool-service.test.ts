import { describe, expect, it } from "vitest"
import { toolRequestSchema } from "./tool-service"
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
