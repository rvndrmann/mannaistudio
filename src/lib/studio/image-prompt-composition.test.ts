import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { composeImagePrompt, assertImageReferenceCapacity, prepareImageModelPrompt, type ImagePromptOptions } from "./image-prompt-composition"
import { composeQuickImagePrompt, composeQuickPrompt } from "./quick-generation"
import { buildEntityReferenceImagePrompt } from "./entity-image-workflow"
import { buildEntityMentionContext, type MentionableEntity } from "./entity-mentions"
import { styleDnaSchema } from "./style-dna"
import { runWithCredential } from "@/lib/byok/active-credential"
import { generateOpenAIImage } from "./openai"

const style = "Realistic - Photorealistic"
const scenarios: Array<{ name: string; path: "panel" | "quick" | "director"; options: ImagePromptOptions }> = [
  { name: "04:30 footballer", path: "panel", options: { prompt: "A footballer training alone at 04:30 AM before sunrise under stadium floodlights, wide sideline frame.", style, aspectRatio: "16:9" } },
  { name: "indoor UGC skincare", path: "quick", options: { prompt: "A natural photographic indoor AI UGC skincare testimonial, talking to a consumer camera beside a window.", aspectRatio: "9:16" } },
  { name: "premium exact packaging", path: "panel", options: { prompt: 'A premium photographic product advertisement: the reference bottle, label reading "AURORA SPF 50", brand colours and geometry unchanged, close-up on a stone shelf in the studio.', style, block: "asset", aspectRatio: "4:3" } },
  { name: "daytime fashion", path: "quick", options: { prompt: "A daytime outdoor fashion photograph of a woman mid-step, unchanged outfit, in soft daylight.", aspectRatio: "3:4" } },
  { name: "consistent character", path: "director", options: { prompt: "@Maya stands beside the window in @Room, medium frame, with her approved wardrobe unchanged.", style, aspectRatio: "16:9", entityContext: buildEntityMentionContext([{ id: "maya", type: "character", name: "Maya", description: "Approved lead", reference_images: ["maya.png"] } as MentionableEntity]) } },
  { name: "animated project", path: "panel", options: { prompt: "An animated footballer on a stylized pitch.", style: "Pixar 3D animation", aspectRatio: "16:9" } },
]
const compose = (row: typeof scenarios[number]) => row.path === "quick"
  ? composeQuickImagePrompt(row.options.prompt, row.options.aspectRatio!) : composeImagePrompt(row.options)
afterEach(() => vi.restoreAllMocks())

describe("six requested scenarios — actual mocked outgoing image payloads", () => {
  for (const row of scenarios) it(row.name, async () => {
    const prompt = compose(row)
    expect(prompt).toMatchSnapshot()
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: Buffer.from("mock image").toString("base64") }] }), { status: 200 }))
    await runWithCredential("openai", { apiKey: "offline-test-key" }, () => generateOpenAIImage({ userId: "test", model: "gpt-image-2", prompt, aspectRatio: row.options.aspectRatio }))
    const [url, request] = fetch.mock.calls[0]
    expect(url).toBe("https://api.openai.com/v1/images/generations")
    expect(JSON.parse(String(request?.body)).prompt).toBe(prompt)
    expect(prompt).not.toMatch(/8K resolution|ultra-detailed|high dynamic range/)
    if (row.name === "animated project") expect(prompt).not.toContain("Photographic treatment:")
    else expect(prompt).toContain("Photographic treatment:")
    if (row.name === "04:30 footballer") {
      expect(prompt).toContain("no sunlight or glowing sunrise horizon")
      expect(prompt).toContain("local sweat from exertion")
      expect(prompt).not.toMatch(/sweaty sheen|skin completely matte|golden-hour sunlight/)
    }
    if (row.name === "premium exact packaging") {
      expect(prompt).toContain('"AURORA SPF 50"')
      expect(prompt).toContain("preserve required product lettering")
      expect(prompt).not.toContain("typography, labels, captions, or UI")
    }
    if (row.name === "consistent character") {
      expect(prompt).toContain("LIKENESS LOCK")
      expect(prompt).toContain("WARDROBE LOCK")
      expect(prompt).toContain("1 reference image available")
    }
  })
})

it("keeps identity and wardrobe locks across different shots without inventing a face", () => {
  const opts = scenarios[4].options
  for (const action of ["@Maya stands beside the window.", "@Maya walks through @Room."]) {
    const prompt = composeImagePrompt({ ...opts, prompt: action })
    expect(prompt).toContain("Reproduce that person exactly")
    expect(prompt).toContain("same garments")
    expect(prompt).not.toMatch(/blue eyes|blonde hair|new outfit/)
  }
})
it("does not duplicate its own layer, camera or locks when composed again", () => {
  const options = { ...scenarios[4].options, camera: { camera: "Full-Frame Cine Digital", lens: "Premium Modern Prime", focalLength: 85, aperture: "f/11" } }
  const first = composeImagePrompt(options)
  const second = composeImagePrompt({ ...options, prompt: first })
  expect(second.match(/Photographic treatment:/g)).toHaveLength(1)
  expect(second.match(/shot on a/g)).toHaveLength(1)
  expect(second.match(/LIKENESS LOCK/g)).toHaveLength(1)
  expect(second).toContain("aperture f/11")
  expect(second).not.toContain("aperture f/1.4")
})
it("permits reference grids but not a conflicting no-grid house clause", () => {
  const base = buildEntityReferenceImagePrompt({ id: "maya", name: "Maya", type: "character" } as MentionableEntity, style)
  const prompt = composeImagePrompt({ prompt: base, style, block: "character" })
  expect(prompt).toContain("grid layout")
  expect(prompt).not.toContain("collage, grid")
})
it("Style DNA may choose an illustrated medium without realism leaking in", () => {
  const dna = styleDnaSchema.parse({ overrideProjectStyle: true, subject: { realism: "watercolour painting", overarchingStyle: "hand-painted" } })
  expect(composeImagePrompt({ prompt: "A footballer", style, styleDna: dna })).not.toContain("Photographic treatment:")
})
it("draw edits do not authorize photographic re-rendering", () => {
  expect(composeImagePrompt({ prompt: "Remove the marked spot", style, drawEdit: true })).not.toContain("Photographic treatment:")
})
it("rejects overlong Soul prompts instead of dropping composition or product locks", () => {
  const prompt = "x".repeat(10_001) + " EXACT PACKAGING LOCK"
  expect(() => prepareImageModelPrompt(prompt, "higgsfield-ai/soul/v2/standard")).toThrow("not truncated")
})
it("refuses unsupported references instead of silently discarding identity", () => {
  expect(() => assertImageReferenceCapacity("gpt-image-2", 17)).toThrow("none were silently discarded")
  expect(() => assertImageReferenceCapacity("google-nano-banana-2", 4)).toThrow("none were silently discarded")
  expect(() => assertImageReferenceCapacity("fal-flux-3", 2)).toThrow()
  expect(() => assertImageReferenceCapacity("fal-gpt-image-2-5-sunburst", 1)).toThrow()
  expect(() => assertImageReferenceCapacity("higgsfield-ai/soul/v2/image-to-image", 2)).toThrow()
})
it("keeps standalone video prompt construction unchanged", () => {
  expect(composeQuickPrompt("photographic sports video", "16:9")).toBe("photographic sports video\n\nRequired composition: 16:9.")
})
it("all production paths use the shared composer", () => {
  const root = `${process.cwd()}/src/`
  expect(readFileSync(root + "lib/studio/execute-generation.ts", "utf8").match(/composeImagePrompt\(/g)).toHaveLength(1)
  expect(readFileSync(root + "lib/studio/project-image-render.ts", "utf8")).toContain("composeImagePrompt({")
  expect(readFileSync(root + "app/api/studio/generate/image/route.ts", "utf8")).toContain("composeQuickImagePrompt(input.prompt")
})

it("an explicit illustrated shot overrides a photographic project default", () => {
  const prompt = composeImagePrompt({ prompt: "An anime style footballer", style })
  expect(prompt).not.toContain("Strict live-action photorealism")
  expect(prompt).not.toContain("Photographic treatment:")
})
