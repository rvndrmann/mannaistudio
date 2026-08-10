import { describe, expect, it } from "vitest"
import { directorFunctionDefinitions, selectSpecialists } from "./director-agent"

describe("Director agent tools", () => {
  it("exposes script, paginated entity, storyboard, and approval tools", () => {
    const tools = directorFunctionDefinitions()
    const names = tools.map((tool) => tool.name)
    expect(names).toContain("read_episode_script")
    expect(names).toContain("list_production_entities")
    expect(names).toContain("list_storyboard_shots")
    expect(names).toContain("create_production_entity")
    expect(names).toContain("create_production_entities_batch")
    expect(names).toContain("create_storyboard_batch")
    expect(names).toContain("validate_production")
    expect(names).toContain("inspect_generation_jobs")
    expect(new Set(names).size).toBe(names.length)
    expect(tools.every((tool) => tool.parameters.type === "object")).toBe(true)
  })

  it("activates only relevant specialists plus recovery", () => {
    expect(selectSpecialists("Read the script and create missing characters")).toEqual(["script", "entities", "recovery"])
    expect(selectSpecialists("Validate storyboard keyframes for continuity")).toEqual(["storyboard", "visuals", "continuity", "recovery"])
  })
})
