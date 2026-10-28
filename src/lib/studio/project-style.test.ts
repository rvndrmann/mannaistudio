import { describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { setProjectVisualStyle } from "./project-style"

type Shot = { id: string; style: string | null; metadata: Record<string, unknown> | null }

/** Just enough of Supabase for the style functions: one project, its episode, its shots. */
function fakeProject(projectStyle: string, shots: Shot[]) {
  const project = { default_style: projectStyle, metadata: { basic_settings: { visualStyle: projectStyle } } }
  const update = vi.fn()
  const from = (table: string) => {
    let patch: Record<string, unknown> | null = null
    const q: Record<string, unknown> = {
      select: () => q, in: () => table === "creator_shots" && !patch ? Promise.resolve({ data: shots, error: null }) : q,
      update: (value: Record<string, unknown>) => { patch = value; update(table, value); return q },
      eq: (_key: string, value: unknown) => {
        if (table === "creator_episodes") return Promise.resolve({ data: [{ id: "episode" }], error: null })
        if (table === "creator_shots" && patch) {
          const shot = shots.find((item) => item.id === value)
          if (shot) Object.assign(shot, patch)
          return Promise.resolve({ error: null })
        }
        if (table === "creator_projects" && patch) { Object.assign(project, patch); return Promise.resolve({ error: null }) }
        return q
      },
      single: async () => ({ data: project, error: null }),
    }
    return q
  }
  return { supabase: { from } as unknown as SupabaseClient, shots, update }
}

describe("switching a held generation to claymation", () => {
  it("releases shots pinned to photorealistic on a project that is already claymation", async () => {
    const { supabase, shots } = fakeProject("claymation", [
      { id: "a", style: "photorealistic", metadata: { style_override: true, video_prompt: "kept" } },
      { id: "b", style: "anime", metadata: { style_override: true } },
      { id: "c", style: "claymation", metadata: {} },
    ])
    const result = await setProjectVisualStyle(supabase, "project", "claymation", true, true)
    expect(result.released).toBe(1)
    expect(shots[0]).toEqual({ id: "a", style: "claymation", metadata: { video_prompt: "kept" } })
    // A shot set to another style on purpose is not the conflict, and stays.
    expect(shots[1]).toEqual({ id: "b", style: "anime", metadata: { style_override: true } })
  })
  it("leaves pinned shots alone unless asked", async () => {
    const { supabase, shots } = fakeProject("claymation", [{ id: "a", style: "photorealistic", metadata: { style_override: true } }])
    const result = await setProjectVisualStyle(supabase, "project", "claymation")
    expect(result.released).toBe(0)
    expect(shots[0]).toMatchObject({ style: "photorealistic", metadata: { style_override: true } })
  })
})
