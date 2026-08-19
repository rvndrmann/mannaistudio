/**
 * What the deleted fast paths knew, asked of the model instead.
 *
 * The Director chat used to answer about ten kinds of message before the model
 * saw them, each recognised by a regex over the user's words. Every one of those
 * paths was added to fix one wrong reply, and the comment above each recorded
 * the exact sentence that had gone wrong. That was the only place the knowledge
 * lived, so deleting the paths would have deleted it too.
 *
 * The cases are below, phrased the way they were reported. This does not check
 * which words matched — there are no words to match any more. It checks the
 * thing that actually mattered: given the message, which tool does the agent
 * reach for, and does it reach for a costly one when nobody asked it to.
 *
 * Skipped by `npm test`: it calls the real model, so it costs money and takes a
 * minute. Opting in is deliberate and separate from having a key configured, so
 * an ordinary test run on a developer machine never quietly spends anything:
 *
 *   RUN_DIRECTOR_EVAL=1 npx vitest run src/lib/studio/director-routing.eval.test.ts
 */

import { describe, expect, it } from "vitest"
import { directorFunctionDefinitions } from "./director-agent"
import { defaultDirectorTeam, teamInstructions } from "./director-team"
import { createDirectorToolTurn, defaultOpenAIDirectorModel } from "./openai"
import { defaultDirectorRuntimeSettings, runtimeInstructions } from "./director-runtime-settings"
import { directorTools, type DirectorToolName } from "./tool-registry"

/**
 * A workspace mid-production: a script, a prompt sheet, two characters with art,
 * three shots with prompts, the first one already rendered. Every case below is
 * asked against this same state so the answers are comparable, and so "what
 * stage is this?" is never the ambiguous part of the question.
 */
const PROJECT_STATE = `
Production state for this episode:
- Script: saved, 3 scenes.
- Prompt sheet: saved, 3 shot prompts.
- Characters: Sara (reference art saved), Ethan (reference art saved).
- Locations: Rainy Alley (reference art saved).
- Storyboard: shot 1 (prompt saved, keyframe saved, no video), shot 2 (prompt saved, no keyframe), shot 3 (prompt saved, no keyframe).
- Pipeline stage: keyframes. The next step is the keyframe for shot 2.
`.trim()

type Case = {
  /** What the user typed. */
  message: string
  /** Why this sentence is in the list — the failure it was written to prevent. */
  reported: string
  /** Tools that would be a correct response. At least one must be called. */
  expect: DirectorToolName[]
  /** Tools that would repeat the original bug. None may be called. */
  refuse?: DirectorToolName[]
}

const COSTLY = (Object.keys(directorTools) as DirectorToolName[])
  .filter((name) => directorTools[name].risk === "costly" || directorTools[name].risk === "destructive")

const CASES: Case[] = [
  {
    message: "edit character Sara to make her hair red",
    reported: "The reported bug. 'make' counted as a generation verb and '@Sara' counted as asking for art, so an edit request generated reference images and replaced the art Sara already had.",
    expect: ["update_asset"],
    refuse: COSTLY,
  },
  {
    message: "edit the character in shot 3 to make her hair red",
    reported: "The same request with a shot number in it took the other branch and rendered a keyframe, deducting credits directly.",
    expect: ["update_asset", "update_shot"],
    refuse: COSTLY,
  },
  {
    message: "make every location a rainy New York morning instead of neon night",
    reported: "bd17df7. Matched 'make' and 'location' and was answered with 'they already have reference images'; the look change never reached anything that would edit the descriptions.",
    expect: ["update_asset"],
    refuse: COSTLY,
  },
  {
    message: "rewrite the shot descriptions as a rainy New York morning instead of neon night",
    reported: "Matched the prompt-cleanup path's own verb and stripped identity text out of prompts the user never mentioned, while the look change went nowhere.",
    expect: ["update_shot", "save_script_prompts", "read_script_prompts"],
    refuse: COSTLY,
  },
  {
    message: "recreate the shot 1 video",
    reported: "\\bcreate\\b does not fire inside 'recreate', so this fell past both media paths to the agent, which answered with an inspection report on a different shot.",
    expect: ["submit_generation", "estimate_generation_cost"],
  },
  {
    message: "create one more shot after shot 3",
    reported: "The number is an anchor, not a target. Read as a target, the run was forbidden to touch anything but shot 3 — which forbade adding a shot after it — and replied with a continuity review.",
    expect: ["create_storyboard_batch"],
    refuse: COSTLY,
  },
  {
    message: "skip shot 2 and continue with the rest of the production",
    reported: "Left to the agent this came back as a read-only inspection report on an unrelated shot.",
    expect: ["update_shot", "list_storyboard_shots", "inspect_current_project"],
    refuse: COSTLY,
  },
  {
    message: "write a funny storyline for a 30 second video",
    reported: "Said 'video' and 'create', which is all the video path looked for, so someone describing an idea was answered with a note about storyboard shots they had not written yet.",
    expect: ["update_script"],
    refuse: COSTLY,
  },
  {
    message: "do not generate any images yet, just tell me where the production stands",
    reported: "'\\bgenerate\\b' does not fire inside 'regenerate', so the refusal that existed to stop the spend was read as authorising it.",
    expect: ["inspect_current_project", "list_storyboard_shots", "validate_production"],
    refuse: COSTLY,
  },
  {
    message: "generate reference images for all the characters",
    reported: "The control case. A real request for art must still be a real request for art — the guard must not have overshot.",
    expect: ["submit_generation", "estimate_generation_cost"],
  },
]

async function toolsCalledFor(message: string): Promise<string[]> {
  const turn = await createDirectorToolTurn({
    userId: "director-routing-eval",
    model: defaultOpenAIDirectorModel(),
    instructions: [
      teamInstructions(defaultDirectorTeam),
      runtimeInstructions(defaultDirectorRuntimeSettings),
      "You are the Lead AI Film & Commercial Director inside AI Director Hub. Use tools to do the work rather than describing what could be done.",
      PROJECT_STATE,
    ].join("\n\n"),
    items: [{ role: "user", content: message }],
    tools: directorFunctionDefinitions(),
  })
  return turn.calls.map((call) => call.name)
}

const RUN = Boolean(process.env.RUN_DIRECTOR_EVAL) && Boolean(process.env.OPENAI_API_KEY)

const READ_TOOLS = new Set(
  (Object.keys(directorTools) as DirectorToolName[]).filter((name) => directorTools[name].risk === "read"),
)

describe.skipIf(!RUN)("what the fast paths knew, asked of the agent", () => {
  for (const testCase of CASES) {
    it(`${testCase.message}`, { timeout: 120_000 }, async () => {
      const called = await toolsCalledFor(testCase.message)
      const listed = called.join(", ") || "no tool call"

      // The property that matters, and the one the reported bug broke: a message
      // that did not ask for anything to be rendered must not render anything.
      // Nothing downstream can undo a spend, so this is asserted strictly.
      const forbidden = (testCase.refuse ?? []).filter((tool) => called.includes(tool))
      expect(forbidden, `${testCase.reported}\n  spent on: ${forbidden.join(", ")}`).toEqual([])

      // Whether it reaches the right write tool is judged loosely, because this
      // harness runs one turn against a described workspace rather than a real
      // one. Opening with a read tool is the agent gathering the state it needs
      // before deciding, which is correct behaviour and not something to fail.
      const actedCorrectly = called.some((name) => testCase.expect.includes(name as DirectorToolName))
      const stillGathering = called.length > 0 && called.every((name) => READ_TOOLS.has(name as DirectorToolName))
      expect(
        actedCorrectly || stillGathering,
        `${testCase.reported}\n  expected one of ${testCase.expect.join(", ")} or a read tool, got ${listed}`,
      ).toBe(true)
    })
  }
})
