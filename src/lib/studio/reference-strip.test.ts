import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { assetReferencesNotShown } from "./reference-strip"

const cast = [
  { id: "a", name: "CharacterA", type: "character", reference_images: ["u/p/a.png"], primary_reference_image: "u/p/a.png" },
  { id: "b", name: "CharacterB", type: "character", reference_images: ["u/p/b-old.png", "u/p/b-new.png"], primary_reference_image: "u/p/b-old.png" },
  { id: "set", name: "LoungeSet", type: "scene", reference_images: ["u/p/set.png"], primary_reference_image: "u/p/set.png" },
] as Parameters<typeof assetReferencesNotShown>[0]

describe("the reference strip is what the render gets", () => {
  it("holds back nothing while every named asset's picture is still a tile", () => {
    expect(assetReferencesNotShown(cast, ["a", "b", "set"], ["u/p/a.png", "u/p/b-old.png", "u/p/set.png"])).toEqual([])
  })

  it("holds back the picture of an asset whose tile was removed", () => {
    expect(assetReferencesNotShown(cast, ["a", "b", "set"], ["u/p/a.png", "u/p/b-old.png"])).toEqual(["u/p/set.png"])
  })

  it("holds back the pre-selected picture when a different one was chosen in its place", () => {
    // The character is still named, and still described in the prompt; only
    // the picture the user took out stays out.
    expect(assetReferencesNotShown(cast, ["a", "b"], ["u/p/a.png", "u/p/b-new.png"])).toEqual(["u/p/b-old.png"])
  })

  it("says nothing about assets the render does not name", () => {
    expect(assetReferencesNotShown(cast, ["a"], [])).toEqual(["u/p/a.png"])
  })
})

describe("every place that attaches an asset's picture honours the strip", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")

  it("skips a held-back picture when an image is rendered", () => {
    const source = read("src/lib/studio/project-image-render.ts")
    expect(source).toContain("excludedReferenceImages")
    expect(source).toMatch(/excludedReferences\.has\(shown\)\) continue/)
  })

  it("skips a held-back picture when a clip is submitted", () => {
    expect(read("src/lib/studio/project-video-submit.ts")).toMatch(/referenceExclusions\.has\(chosenReference\)\) continue/)
  })

  it("sends the held-back list with both kinds of render", () => {
    const panel = read("src/app/studio/project/[projectId]/page.tsx")
    expect(panel).toMatch(/requestProjectImage\(projectId, \{ target: "shot"[^\n]*excludedReferenceImages: hiddenAssetReferences\(/)
    expect(panel).toMatch(/\/videos`[^\n]*excludedReferenceImages:[^\n]*hiddenAssetReferences\(/)
  })
})
