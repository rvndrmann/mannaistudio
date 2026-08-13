import { describe, expect, it } from "vitest"
import { defaultDirectorWorkflows, selectedWorkflowId, workflowContinuesFromPreviousClip } from "./workflows"

const project = (metadata: Record<string, unknown>) => ({ id: "p", metadata })

describe("selected workflow", () => {
  it("prefers the episode's own choice", () => {
    expect(selectedWorkflowId(project({
      episode_workflows: { "ep-1": "video_reference", "ep-2": "elements_parallel" },
      default_workflow_id: "keyframe_images_to_video",
    }), "ep-1")).toBe("video_reference")
  })

  it("falls back to the project default, then to Basic Settings", () => {
    expect(selectedWorkflowId(project({ default_workflow_id: "elements_sequential" }), "ep-1")).toBe("elements_sequential")
    expect(selectedWorkflowId(project({ basic_settings: { workflow: "video_reference" } }), "ep-1")).toBe("video_reference")
    expect(selectedWorkflowId(project({}), "ep-1")).toBe("")
  })

  // The workflow picker used to reach the model as advice only, so a plain
  // "generate shot 3 video" rendered the shot cold even under Video Reference.
  it("continues from the previous clip only under the continuity workflows", () => {
    expect(workflowContinuesFromPreviousClip("video_reference")).toBe(true)
    expect(workflowContinuesFromPreviousClip("elements_sequential")).toBe(true)
    expect(workflowContinuesFromPreviousClip("keyframe_images_to_video")).toBe(false)
    expect(workflowContinuesFromPreviousClip("elements_parallel")).toBe(false)
    expect(workflowContinuesFromPreviousClip("")).toBe(false)
  })

  it("names workflows that actually exist", () => {
    const ids = new Set(defaultDirectorWorkflows.map((workflow) => workflow.id))
    for (const id of ["video_reference", "elements_sequential", "keyframe_images_to_video", "elements_parallel"]) {
      expect(ids.has(id)).toBe(true)
    }
  })
})
