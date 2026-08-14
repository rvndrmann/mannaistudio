import { describe, expect, it } from "vitest"
import { episodeFootageInstructions, fetchEpisodeFootage, handoffAlias, previousEpisodeHandoff, type EpisodeFootage } from "./episode-continuity"

/**
 * Episodes are cuts of one story, so shot 1 of Episode 3 continues from where
 * Episode 2 ended. Everything else reads one episode at a time, which left that
 * clip unreachable and every episode opening cold.
 */

const episode = (over: Partial<EpisodeFootage> & { id: string; orderIndex: number }): EpisodeFootage => ({
  name: `Episode ${over.orderIndex + 1}`,
  shotCount: 12,
  finalClip: null,
  ...over,
})

function supabaseWith(episodes: unknown[], shots: unknown[]) {
  const table = (rows: unknown[]) => {
    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: async () => ({ data: rows, error: null }),
    })
    return builder
  }
  return { from: (name: string) => table(name === "creator_episodes" ? episodes : shots) } as never
}

describe("episode footage", () => {
  it("reads each episode's handover point as its last rendered shot", async () => {
    const footage = await fetchEpisodeFootage(supabaseWith(
      [{ id: "ep-1", name: "Episode 1", order_index: 0 }, { id: "ep-2", name: "Episode 2", order_index: 1 }],
      [
        { episode_id: "ep-1", order_index: 0, video_url: "clips/e1s1.mp4", video_status: "completed" },
        { episode_id: "ep-1", order_index: 1, video_url: "clips/e1s2.mp4", video_status: "completed" },
        // Rendering, not rendered: the clip behind it is still where it ends.
        { episode_id: "ep-1", order_index: 2, video_url: null, video_status: "processing" },
        { episode_id: "ep-2", order_index: 0, video_url: null, video_status: "none" },
      ],
    ), "project-1")

    expect(footage[0].finalClip).toEqual({ shotNumber: 2, videoPath: "clips/e1s2.mp4" })
    expect(footage[0].shotCount).toBe(3)
    expect(footage[1].finalClip).toBeNull()
  })
})

describe("previousEpisodeHandoff", () => {
  const footage = [
    episode({ id: "ep-1", orderIndex: 0, finalClip: { shotNumber: 9, videoPath: "clips/e1s9.mp4" } }),
    // Scheduled but not shot — a gap in the schedule, not a break in the story.
    episode({ id: "ep-2", orderIndex: 1, shotCount: 0 }),
    episode({ id: "ep-3", orderIndex: 2 }),
  ]

  it("reaches past an episode with no footage to the last one that has some", () => {
    expect(previousEpisodeHandoff(footage, "ep-3")).toEqual({
      episodeId: "ep-1",
      episodeName: "Episode 1",
      shotNumber: 9,
      videoPath: "clips/e1s9.mp4",
    })
  })

  it("has nothing to hand over from the first episode", () => {
    expect(previousEpisodeHandoff(footage, "ep-1")).toBeNull()
    expect(previousEpisodeHandoff(footage, "not-in-this-project")).toBeNull()
  })

  it("never reaches forward into an episode that comes later", () => {
    const withLaterFootage = [
      episode({ id: "ep-1", orderIndex: 0 }),
      episode({ id: "ep-2", orderIndex: 1, finalClip: { shotNumber: 4, videoPath: "clips/e2s4.mp4" } }),
    ]
    expect(previousEpisodeHandoff(withLaterFootage, "ep-1")).toBeNull()
  })

  it("names the carried clip so the prompt cannot read it as this episode's", () => {
    expect(handoffAlias({ episodeId: "ep-1", episodeName: "Episode 2", shotNumber: 12, videoPath: "x" }))
      .toBe("@Episode 2 shot 12 video")
  })
})

describe("episodeFootageInstructions", () => {
  it("gives the Director the ids it needs and marks the one it is standing in", () => {
    const text = episodeFootageInstructions([
      episode({ id: "ep-1", orderIndex: 0, finalClip: { shotNumber: 9, videoPath: "clips/e1s9.mp4" } }),
      episode({ id: "ep-2", orderIndex: 1 }),
    ], "ep-2")
    expect(text).toContain("id ep-1")
    expect(text).toContain("last rendered clip: shot 9")
    expect(text).toContain("Episode 2 (the episode open now)")
    expect(text).toContain("no rendered clips yet")
    // A number from another episode would resolve against the wrong storyboard.
    expect(text).toContain("Leave videoReferenceShotNumbers empty")
  })

  it("says nothing when there is only one episode to talk about", () => {
    expect(episodeFootageInstructions([episode({ id: "ep-1", orderIndex: 0 })], "ep-1")).toBe("")
  })
})
