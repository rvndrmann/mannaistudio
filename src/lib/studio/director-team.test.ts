import { describe, expect, it } from "vitest"
import { activeAgentInstructions, agentForStage, agentForTool, defaultDirectorTeam, directorAgentKeys, directorPipeline, normalizeDirectorTeam, teamInstructions } from "./director-team"
import { toolsForAgent } from "./director-agent"
import type { DirectorToolName } from "./tool-registry"

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

/**
 * The Video Prompt Agent's brief used to read "Each prompt describes one
 * continuous camera action…" — an instruction to write a paragraph. It was
 * producing exactly what it was asked for: a single-paragraph frame
 * description with assets named in prose, which binds to nothing at the
 * provider and renders from the words instead of the reference art.
 */
describe("the briefs that decide how a video prompt is written", () => {
  const videoPrompt = defaultDirectorTeam.video_prompt.instructions
  const storyboard = defaultDirectorTeam.storyboard.instructions

  it("asks the Video Prompt Agent for timed beats, not a paragraph", () => {
    expect(videoPrompt).toContain("0-4s")
    expect(videoPrompt).not.toContain("one continuous camera action with subject")
  })

  it("tells it that every subject must be @tagged on every mention", () => {
    expect(videoPrompt).toMatch(/@tag on every mention/i)
  })

  it("tells it why prose instead of a tag breaks the binding", () => {
    expect(videoPrompt).toMatch(/nothing pointing at it/i)
  })

  it("forbids describing a character's wardrobe", () => {
    expect(videoPrompt).toMatch(/wardrobe/i)
  })

  it("tells the Storyboard Agent to write both prompts in one pass", () => {
    expect(storyboard).toContain("videoPrompt")
    expect(storyboard).toMatch(/same pass/i)
  })

  it("warns the Storyboard Agent what happens when it skips the video prompt", () => {
    expect(storyboard).toMatch(/filmed from its image prompt/i)
  })
})

/**
 * The invariant that keeps a stage able to do its own work.
 *
 * toolsForAgent hands an agent the read tools, the tools it owns, and the
 * unowned ones — nothing else. So a tool owned by the wrong agent is invisible
 * to the agent that actually holds the turn at that stage, and the model
 * answers that the operation "is not available in this turn" while the user
 * watches nothing happen.
 *
 * This has now bitten twice: submit_generation at the keyframes stage, and
 * write_shot_video_prompts at the video stage. Asserted per stage so a third
 * ownership move fails here instead of in production.
 */
describe("every stage's opening agent can reach the tool that stage needs", () => {
  const cases: Array<{ stage: string; tool: DirectorToolName }> = [
    { stage: "prompt_sheet", tool: "save_script_prompts" },
    { stage: "prompt_sheet", tool: "write_episode_master_prompt" },
    { stage: "entity_images", tool: "generate_entity_reference_art" },
    { stage: "storyboard", tool: "create_storyboard_batch" },
    { stage: "keyframes", tool: "submit_generation" },
    { stage: "videos", tool: "write_shot_video_prompts" },
    { stage: "videos", tool: "submit_generation" },
  ]

  for (const { stage, tool } of cases) {
    it(`${stage} can reach ${tool}`, () => {
      expect(toolsForAgent(agentForStage(stage))).toContain(tool)
    })
  }

  it("gives the Video Prompt Agent the tool it is named after", () => {
    // It owned nothing at all, so the stage named after it could do nothing.
    expect(agentForStage("videos")).toBe("video_prompt")
    expect(agentForTool("write_shot_video_prompts")).toBe("video_prompt")
  })
})

describe("what a specialist may refuse for", () => {
  /**
   * Asked to skip shot 2's image and film the shot directly, the Director
   * refused: "Shot 2 cannot be filmed directly because it has no approved
   * keyframe; the video workflow requires that frame as its first image." The
   * workflow requires no such thing — the keyframe is added as a reference when
   * a shot has one, and multi-image mode films from the shot's own references
   * when it does not. The refusal came from this instruction, which offered a
   * missing keyframe as its worked example of work that genuinely cannot be
   * done, so a request the system could fulfil was turned down.
   */
  it("keeps keyframe-first as the default but honors an explicit direct-video request", () => {
    const instructions = activeAgentInstructions(normalizeDirectorTeam(null), "video_prompt")

    expect(instructions).toContain("normally filmed from its approved keyframe")
    expect(instructions).toContain("right default whenever nobody has said otherwise")
    expect(instructions).toContain("said to skip the frame and film the shot directly")
    expect(instructions).toContain("missing one is a reason to recommend building it, never a reason to refuse")
  })
})
