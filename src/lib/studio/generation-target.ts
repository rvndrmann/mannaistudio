import { createHash } from "node:crypto"

export type GenerationTargetSnapshot = {
  projectId: string
  episodeId: string | null
  shotId: string
  shotNumber: number | null
  type: "image" | "video"
  promptHash: string
  entityReferenceIds: string[]
  createdAt: string
}

export function generationPromptHash(prompt: string) {
  return createHash("sha256").update(prompt).digest("hex")
}

export function buildGenerationTargetSnapshot(input: Omit<GenerationTargetSnapshot, "promptHash" | "entityReferenceIds" | "createdAt"> & { prompt: string; entityReferenceIds: string[]; createdAt?: string }): GenerationTargetSnapshot {
  return {
    projectId: input.projectId,
    episodeId: input.episodeId,
    shotId: input.shotId,
    shotNumber: input.shotNumber,
    type: input.type,
    promptHash: generationPromptHash(input.prompt),
    entityReferenceIds: Array.from(new Set(input.entityReferenceIds)).sort(),
    createdAt: input.createdAt || new Date().toISOString(),
  }
}

export function verifyGenerationTarget(input: {
  target: Partial<GenerationTargetSnapshot>
  actual: { shotId: string; episodeId: string | null; prompt: string; entityReferenceIds: string[]; resultPath: string | null }
  expectedResultPath: string
}) {
  const expectedReferences = Array.isArray(input.target.entityReferenceIds) ? [...input.target.entityReferenceIds].sort() : []
  const actualReferences = Array.from(new Set(input.actual.entityReferenceIds)).sort()
  const checks = {
    shot: !input.target.shotId || input.actual.shotId === input.target.shotId,
    episode: !input.target.episodeId || input.actual.episodeId === input.target.episodeId,
    prompt: !input.target.promptHash || generationPromptHash(input.actual.prompt) === input.target.promptHash,
    references: expectedReferences.every((id) => actualReferences.includes(id)),
    attachment: input.actual.resultPath === input.expectedResultPath,
  }
  return { ok: Object.values(checks).every(Boolean), checks }
}
