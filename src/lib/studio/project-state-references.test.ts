import { expect, it } from "vitest"
import { requiredPromptEntityNames } from "./project-state-summary"
import { computePipelineStage, emptySnapshot } from "./pipeline"
it("does not skip an unlisted footballer when the only existing asset is a product", () => {
  const entities = [{ id: "product", name: "Untitled design", type: "prop" as const, reference_images: ["product.png"] }]
  const names = requiredPromptEntityNames([{ prompt: "@footballer wearing @Untitled design", entity_names: [] }], entities)
  expect(names).toEqual(["Untitled design", "footballer"])
  expect(computePipelineStage({ ...emptySnapshot, hasScript: true, promptSheetCount: 8, promptSheetEntityNames: names, entities: [{ name: "Untitled design", type: "prop", hasReferenceImage: true }] }).key).toBe("entities")
})
it("waits for the existing footballer's art instead of recreating the entity", () => {
  const snapshot = { ...emptySnapshot, hasScript: true, promptSheetCount: 8, promptSheetEntityNames: ["Footballer"], entities: [{ name: "Footballer", type: "character", hasReferenceImage: false }] }
  expect(computePipelineStage(snapshot).key).toBe("entity_images")
})
