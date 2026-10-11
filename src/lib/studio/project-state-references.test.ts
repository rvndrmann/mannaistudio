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

it("reads the snapshot using only valid database job statuses", async () => {
  const { loadProductionSnapshot } = await import("./project-state-summary")
  const tables: Record<string, unknown[]> = {
    creator_episodes: [{ id: "episode", name: "Episode 1", script_content: "A footballer trains before a match with a featured product." }],
    creator_entities: [{ id: "player", name: "Footballer", type: "character", reference_images: [] }],
    creator_script_prompts: [{ prompt: "@Footballer trains alone", entity_names: [] }],
  }
  const client = { from(table: string) {
    const query = { select: () => query, eq: () => query, order: () => query, gte: () => query,
      in(_column: string, values: string[]) {
        if (table === "creator_generation_jobs" && values.includes("generating")) throw new Error("invalid enum creator_job_status")
        return query
      },
      then(resolve: (result: unknown) => unknown) { return Promise.resolve({ data: tables[table] || [], error: null }).then(resolve) },
    }
    return query
  } }
  const snapshot = await loadProductionSnapshot(client as never, "project", "episode")
  expect(computePipelineStage(snapshot).key).toBe("entity_images")
})
