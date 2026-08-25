import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { directorTools } from "./tool-registry"
import { agentForStage, agentForTool } from "./director-team"

const chatRoute = readFileSync("src/app/api/studio/projects/[projectId]/director/chat/route.ts", "utf8")
// The turn moved out of the route so that something other than a Next.js route
// could run it. The guarantees below are about the turn, not about the file it
// happens to live in, so they are checked against both — a charge site creeping
// back into either one is the mistake this guards against.
const directorTurn = readFileSync("src/lib/studio/director-turn.ts", "utf8")
const turnCode = `${chatRoute}\n${directorTurn}`

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
describe("the chat route cannot spend the user's credits on generation", () => {
  // The rule narrowed when chat turns became metered, and the reason it existed
  // is worth restating so it is not widened back by accident. What it guards
  // against is the route billing for *generation* outside the tool registry,
  // producing a charge where submit_generation would have produced an approval
  // card the user could refuse.
  //
  // Charging for the turn itself is not that. A turn has no approval card by
  // nature — the user already chose to send the message — and the amount comes
  // from tokens the provider counted, not from a generation rate card. So the
  // deduction is allowed, and pinned instead to the shape that makes it safe.
  it("prices nothing from the generation rate card", () => {
    for (const primitive of ["refundGenerationCredits", "calculateCreditCost"]) {
      expect(turnCode).not.toContain(primitive)
    }
  })

  it("charges only for measured token usage, through one function", () => {
    expect(turnCode).toContain("chatTurnCredits")
    // One charge site. Two would be a turn billed twice on the streaming path.
    expect((turnCode.match(/deductUserCredits\(/g) || []).length).toBe(1)
  })

  it("charges nothing for a turn the customer's own provider billed them for", () => {
    expect(turnCode).toContain("ranOnCustomerKey")
    expect(turnCode).toMatch(/if \(ranOnCustomerKey\) return 0/)
  })

  it("calls no generation provider directly", () => {
    for (const entry of ["generateProjectImage", "createBytePlusAsset", "execute-generation"]) {
      expect(turnCode).not.toContain(entry)
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

describe("every stage can render what that stage produces", () => {
  // toolsForAgent hands an agent the read-only tools, the tools it owns, and
  // the tools nobody owns. So a tool every specialist needs must stay unowned:
  // the keyframes stage opens as the storyboard agent, and while the video
  // agent owned submit_generation that agent was handed a tool set without the
  // only tool that renders a keyframe. It said so — "the required
  // submit_generation execution tool is not available in the current tool set"
  // — and the production could not pass the storyboard.
  const stageAgents = ["storyboard", "keyframes", "videos", "entity_images"].map(agentForStage)

  it("keeps rendering unowned, so no specialist is excluded from it", () => {
    expect(agentForTool("submit_generation")).toBeNull()
    expect(agentForTool("estimate_generation_cost")).toBeNull()
  })

  it("covers the stages that actually render something", () => {
    expect(stageAgents).toEqual(["storyboard", "storyboard", "video_prompt", "character_asset"])
    for (const active of stageAgents) {
      const owner = agentForTool("submit_generation")
      expect(owner === null || owner === active, `${active} cannot reach submit_generation`).toBe(true)
    }
  })
})
