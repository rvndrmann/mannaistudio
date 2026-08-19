import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { directorTools } from "./tool-registry"

const chatRoute = readFileSync("src/app/api/studio/projects/[projectId]/director/chat/route.ts", "utf8")

/**
 * The Director chat route decides nothing about what the user wants, and spends
 * nothing on its own.
 *
 * Both of those were true the other way round for a long time. The route ran
 * about ten regex fast paths that read the message, decided what it was asking
 * for, and acted — and two of them charged the user directly, outside the tool
 * registry, so they produced a bill where the agent's own submit_generation
 * would have produced an approval card that could be refused.
 *
 * These are cheap tests for an expensive mistake. Every fix in that layer was a
 * new negative regex on top of the last one, so the failure mode is not that
 * someone reinstates the whole thing — it is that one helper creeps back in.
 */
describe("the chat route cannot spend the user's credits", () => {
  it("imports no credit primitives", () => {
    for (const primitive of ["deductUserCredits", "refundGenerationCredits", "calculateCreditCost"]) {
      expect(chatRoute).not.toContain(primitive)
    }
  })

  it("calls no generation provider directly", () => {
    for (const entry of ["generateProjectImage", "createBytePlusAsset", "execute-generation"]) {
      expect(chatRoute).not.toContain(entry)
    }
  })

  it("keeps every costly and destructive tool behind an approval card", () => {
    const gated = Object.entries(directorTools)
      .filter(([, tool]) => tool.risk === "costly" || tool.risk === "destructive")
      .map(([name, tool]) => [name, tool.requiresApproval] as const)

    expect(gated.length).toBeGreaterThan(0)
    for (const [name, requiresApproval] of gated) {
      expect(requiresApproval, `${name} spends or destroys without approval`).toBe(true)
    }
  })
})

describe("the chat route does not guess what the user meant", () => {
  it("reads no intent out of the message before the agent runs", () => {
    // Each of these decided an action from the words in a sentence. "make" is
    // the verb in "make me some images" and also in "edit the character to make
    // her hair red", which is how an edit request came to be answered by
    // generating art and replacing the art it already had.
    const readers = [
      "parseBulkEntityImageIntent",
      "parseShotImageBatchIntent",
      "parseVideoShotReferenceIntent",
      "isAmbiguousShotRedo",
      "wantsShotSkipped",
      "wantsRedo",
      "requestsPromptCleanup",
      "requestsWrittenStory",
      "forbidsMediaGeneration",
      "forbidsImageGeneration",
      "forbidsVideoGeneration",
      "describesReplacementState",
      "describesLookChange",
      "asksAboutOwnPhotos",
      "declinesOwnPhotos",
      "requestsFullAutoEnable",
    ]
    for (const reader of readers) {
      expect(chatRoute, `${reader} is deciding again before the model is asked`).not.toContain(reader)
    }
  })

  it("still reads shot numbers, which only scopes the buttons a finished turn offers", () => {
    // The one survivor, and it is not a decision: it never changes what the turn
    // does, only which of the pipeline's own next steps are worth showing beside
    // the reply.
    expect(chatRoute).toContain("parseTargetShotNumbers")
    expect(chatRoute).toContain("nextStepBlock")
  })
})
