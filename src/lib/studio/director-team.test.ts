import { describe, expect, it } from "vitest"
import { agentForTool, defaultDirectorTeam, directorAgentKeys, normalizeDirectorTeam, teamInstructions } from "./director-team"

describe("director agent team", () => {
  it("normalizes unknown values to the default team", () => {
    expect(normalizeDirectorTeam(null)).toEqual(defaultDirectorTeam)
    expect(normalizeDirectorTeam("bad")).toEqual(defaultDirectorTeam)
  })

  it("keeps admin edits and fills gaps from defaults", () => {
    const team = normalizeDirectorTeam({ storyboard: { name: "Shot Builder", instructions: "Custom rules.", enabled: true, skills: "Shots." } })
    expect(team.storyboard.name).toBe("Shot Builder")
    expect(team.storyboard.instructions).toBe("Custom rules.")
    expect(team.character_asset).toEqual(defaultDirectorTeam.character_asset)
  })

  it("attributes tools to their owning agent", () => {
    expect(agentForTool("create_production_entities_batch")).toBe("character_asset")
    expect(agentForTool("create_storyboard_batch")).toBe("storyboard")
    expect(agentForTool("submit_generation")).toBe("video_prompt")
    expect(agentForTool("update_script")).toBe("script")
    expect(agentForTool("inspect_continuity")).toBe("continuity")
    expect(agentForTool("inspect_current_project")).toBeNull()
  })

  it("includes every enabled agent in the instruction block and omits disabled ones", () => {
    const block = teamInstructions(defaultDirectorTeam)
    for (const key of directorAgentKeys) expect(block).toContain(defaultDirectorTeam[key].name)

    const withoutScript = normalizeDirectorTeam({ ...defaultDirectorTeam, script: { ...defaultDirectorTeam.script, enabled: false } })
    const partial = teamInstructions(withoutScript)
    expect(partial).not.toContain(defaultDirectorTeam.script.name)
    expect(partial).toContain(defaultDirectorTeam.storyboard.name)
  })
})
