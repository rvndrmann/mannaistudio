import { describe, expect, it } from "vitest"
import { activeAgentInstructions, agentBriefFor, agentForStage, defaultDirectorTeam, teamRoster } from "./director-team"
import { directorFunctionDefinitions } from "./director-agent"
import { directorTools, type DirectorToolName } from "./tool-registry"

const allNames = Object.keys(directorTools) as DirectorToolName[]
const readNames = allNames.filter((name) => directorTools[name].risk === "read")

describe("which specialist opens the turn", () => {
  it("reads the stage the workspace is on, not the words in the message", () => {
    expect(agentForStage("script")).toBe("script")
    expect(agentForStage("prompt_sheet")).toBe("prompt")
    expect(agentForStage("entities")).toBe("character_asset")
    expect(agentForStage("entity_images")).toBe("character_asset")
    expect(agentForStage("storyboard")).toBe("storyboard")
    expect(agentForStage("keyframes")).toBe("storyboard")
    expect(agentForStage("videos")).toBe("video_prompt")
  })

  it("falls back to the Director itself when no stage owns the work", () => {
    expect(agentForStage("complete")).toBeNull()
    expect(agentForStage("")).toBeNull()
  })
})

describe("one brief per turn instead of all six", () => {
  it("sends the active agent's brief and leaves the other five out", () => {
    const instructions = activeAgentInstructions(defaultDirectorTeam, "script")
    expect(instructions).toContain(defaultDirectorTeam.script.name)
    // The Prompt Agent's brief alone is over four thousand tokens and is only
    // relevant at the prompt-sheet stage, yet it used to ship on every turn.
    expect(instructions).not.toContain(defaultDirectorTeam.prompt.instructions)
    expect(instructions).not.toContain(defaultDirectorTeam.storyboard.instructions)
  })

  it("is dramatically smaller than carrying the whole team", () => {
    const scoped = activeAgentInstructions(defaultDirectorTeam, "script").length
    const everyBrief = Object.values(defaultDirectorTeam).map((agent) => agent.instructions).join("").length
    expect(scoped).toBeLessThan(everyBrief / 3)
  })

  it("still names the rest of the team, so a handover can address a real one", () => {
    const roster = teamRoster(defaultDirectorTeam, "script")
    expect(roster).toContain("character_asset")
    expect(roster).toContain("storyboard")
    expect(roster).not.toContain("- script —")
  })

  it("gives a consulted agent its own brief", () => {
    expect(agentBriefFor(defaultDirectorTeam, "continuity")).toContain(defaultDirectorTeam.continuity.instructions)
  })
})

describe("what each agent is allowed to reach", () => {
  it("offers every tool when no specialist holds the turn", () => {
    expect(directorFunctionDefinitions().length).toBe(allNames.length)
  })

  it("offers a consulted agent read-only tools and nothing that spends or writes", () => {
    const offered = directorFunctionDefinitions(readNames).map((tool) => tool.name) as DirectorToolName[]
    expect(offered.length).toBeGreaterThan(0)
    for (const name of offered) {
      expect(directorTools[name].risk, `${name} is not read-only`).toBe("read")
    }
    expect(offered).not.toContain("submit_generation")
    expect(offered).not.toContain("generate_entity_reference_art")
    expect(offered).not.toContain("delete_shot")
  })
})
