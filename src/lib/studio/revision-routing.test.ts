import { describe, expect, it } from "vitest"
import { buildDirectorInstructions } from "./conversation"
import { revisionRoutes, revisionRoutingInstructions, revisionTargetKeys } from "./revision-routing"
import { projectContextSchema } from "./domain"

const project = projectContextSchema.parse({
  id: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  name: "Aurora launch",
  description: null,
  productionMode: "legacy",
  projectType: "unspecified",
  creativeBrief: {},
  defaultStyle: "photorealistic",
  defaultAspect: "9:16",
  featureFlags: {},
})

describe("revisionRoutes", () => {
  it("covers everything a user can ask to revise", () => {
    expect(revisionRoutes.map((route) => route.key)).toEqual([...revisionTargetKeys])
  })

  it("routes each target to the input that decides its output", () => {
    const byKey = Object.fromEntries(revisionRoutes.map((route) => [route.key, route]))
    expect(byKey.script.tool).toBe("update_script")
    expect(byKey.character.tool).toBe("update_asset")
    expect(byKey.storyboard_image.tool).toContain("patch.prompt")
    expect(byKey.video_prompt.tool).toContain("patch.video_prompt")
    expect(byKey.look.tool).toBe("update_creative_brief")
  })

  it("keeps the image prompt and the video prompt apart", () => {
    const instructions = revisionRoutingInstructions()
    expect(instructions).toContain("editing one must never overwrite the other")
  })
})

describe("revisionRoutingInstructions", () => {
  it("makes the edit come before the regeneration", () => {
    // Regenerating from an unchanged prompt reproduces the same result and
    // spends the credits anyway, which is the whole failure being prevented.
    const instructions = revisionRoutingInstructions()
    expect(instructions).toContain("edits the saved input")
    expect(instructions).toContain("the change does not happen and the credits are spent anyway")
  })

  it("requires the reply to name the input and quote what was written", () => {
    const instructions = revisionRoutingInstructions()
    expect(instructions).toContain("name every input you changed and quote the new text")
    expect(instructions).toContain("never paraphrase what you wrote")
  })

  it("does not let an unnamed approved asset be revised", () => {
    expect(revisionRoutingInstructions()).toContain("not revised unless the user names it")
  })
})

describe("the Director carries the revision rules", () => {
  it("ships them on every run, not on request", () => {
    const instructions = buildDirectorInstructions(project)
    expect(instructions).toContain("REVISIONS — changing something that already exists")
    expect(instructions).toContain("REPORTING AN EDIT")
  })
})
