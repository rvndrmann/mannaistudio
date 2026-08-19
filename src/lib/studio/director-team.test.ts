import { describe, expect, it } from "vitest"
import { agentForTool, defaultDirectorTeam, directorAgentKeys, directorPipeline, normalizeDirectorTeam, teamInstructions } from "./director-team"

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
    // Rendering is deliberately unowned: it makes keyframes as well as clips,
    // and an owner is an exclusion for every other specialist.
    expect(agentForTool("submit_generation")).toBeNull()
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

  it("states the handoff order using the admin's agent names", () => {
    const team = structuredClone(defaultDirectorTeam)
    team.prompt.name = "Nexus Prompt Writer"
    const block = teamInstructions(team)
    expect(block).toContain("Script Agent → Nexus Prompt Writer → Character & Asset Agent → Storyboard Agent → Video Prompt Agent")
    expect(block).toContain("## Nexus Prompt Writer")
  })

  it("drops a disabled agent from the pipeline chain", () => {
    const team = normalizeDirectorTeam({ ...defaultDirectorTeam, character_asset: { ...defaultDirectorTeam.character_asset, enabled: false } })
    expect(teamInstructions(team)).toContain("Script Agent → Prompt Agent → Storyboard Agent → Video Prompt Agent")
  })

  it("routes prompt sheet tools to the prompt agent", () => {
    expect(agentForTool("save_script_prompts")).toBe("prompt")
    expect(agentForTool("read_script_prompts")).toBe("prompt")
    expect(directorPipeline).toEqual(["script", "prompt", "character_asset", "storyboard", "video_prompt"])
  })

  it("fills in an agent that a saved team predates", () => {
    const team = normalizeDirectorTeam({ script: { name: "Writer", enabled: true, instructions: "x", skills: "y" } })
    expect(team.script.name).toBe("Writer")
    expect(team.prompt).toEqual(defaultDirectorTeam.prompt)
  })
})
