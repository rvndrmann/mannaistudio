import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { rendersOnEdgeFunction, supportsBackgroundImageResponse } from "./image-render-host"
import { imageGenerationModels } from "./generation-models"

describe("where an image model renders", () => {
  it("sends Sunburst to the Edge Function", () => {
    // The whole reason this split exists: OpenAI serves this model only on the
    // synchronous endpoints, so the render is held on the connection, and the
    // app's own host stops a request long before a render finishes.
    expect(rendersOnEdgeFunction("gpt-image-2.5-sunburst")).toBe(true)
  })

  it("leaves every other model on the app's own host", () => {
    for (const model of imageGenerationModels) {
      if (model.id === "gpt-image-2.5-sunburst") continue
      expect(rendersOnEdgeFunction(model.id), `${model.id} was moved off its host`).toBe(false)
    }
  })

  it("moves exactly the models that have no recoverable handle", () => {
    // A render that can be recovered survives a killed request; one that cannot
    // loses the picture and the money. If these two answers ever disagree, one
    // of them is wrong.
    for (const model of imageGenerationModels) {
      expect(rendersOnEdgeFunction(model.id)).toBe(!supportsBackgroundImageResponse(model.id))
    }
  })
})

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(path) ? [path] : []
  })
}

describe("no call site can put a render on the wrong host", () => {
  it("posts every image generation through requestProjectImage", () => {
    // A fourth call site will be added one day by someone who has never heard
    // of any of this. Posting straight to the route would work for most models
    // and quietly lose the picture on the one that cannot finish there — which
    // is exactly how this bug reached production the first time.
    const posts = /\/api\/studio\/projects\/\$\{projectId\}\/images`,\s*\{[^}]*method:\s*"POST"/
    const offenders = sourceFiles(join(process.cwd(), "src"))
      .map((path) => path.replace(`${process.cwd()}/`, ""))
      // The one place allowed to name the route: it is the thing doing the
      // choosing.
      .filter((path) => path !== "src/lib/studio/image-request.ts")
      .filter((path) => posts.test(readFileSync(join(process.cwd(), path), "utf8")))
    expect(offenders, "these POST to the image route directly instead of letting requestProjectImage choose the host").toEqual([])
  })
})

describe("the Edge Function and its bundle agree", () => {
  it("imports only what the entry actually exports", () => {
    // The bundle is generated and git-ignored, so a name that stopped being
    // exported would not fail a build, a test run, or a checkout — it would
    // fail at deploy, or worse, at the first render after one.
    const fn = readFileSync(join(process.cwd(), "supabase/functions/render-image/index.ts"), "utf8")
    const entry = readFileSync(join(process.cwd(), "src/lib/studio/image-edge-entry.ts"), "utf8")
    const imported = fn.match(/import\s*\{([^}]+)\}\s*from\s*"\.\/_render\.js"/)
    expect(imported, "the function no longer imports from the bundle").not.toBeNull()
    const names = imported![1].split(",").map((name) => name.trim()).filter(Boolean)
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      expect(entry, `render-image imports ${name}, which image-edge-entry does not export`).toContain(name)
    }
  })
})
