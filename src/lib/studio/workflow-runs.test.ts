import { describe, expect, it } from "vitest"
import { abandonedRunSilentAfterMs, failAbandonedRuns, isAbandonedRun, runHardTimeoutMs } from "./workflow-runs"

/**
 * A run outlives the browser that started it, so the chat rejoins whatever the
 * table says is still in flight. When the server holding a run is killed there
 * is nobody left to write the ending, and the chat waited on the reply forever
 * — a thinking bubble that never resolved.
 *
 * The sweep goes by silence rather than age, because a run of several minutes
 * is normal and only one that has stopped writing steps has actually stopped.
 */

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

const run = (over: Partial<Parameters<typeof isAbandonedRun>[0]> = {}) => ({
  id: "run-1",
  user_id: "user-1",
  status: "running",
  completed_at: null,
  started_at: minutesAgo(20),
  updated_at: minutesAgo(20),
  ...over,
})

function supabaseRecording(calls: { filters: Array<[string, unknown]>; patch?: Record<string, unknown> }) {
  const builder: Record<string, unknown> = {}
  const record = (column: string, value: unknown) => { calls.filters.push([column, value]); return builder }
  Object.assign(builder, {
    update: (value: Record<string, unknown>) => { calls.patch = value; return builder },
    eq: (column: string, value: unknown) => record(column, value),
    is: (column: string, value: unknown) => record(`is:${column}`, value),
    in: (column: string, value: unknown) => record(`in:${column}`, value),
    then: (resolve: (result: unknown) => unknown) => resolve({ error: null }),
  })
  return { from: () => builder } as never
}

describe("abandoned Director runs", () => {
  it("tells a dead run from a slow one by how long it has been silent", () => {
    expect(isAbandonedRun(run({ updated_at: minutesAgo(20) }))).toBe(true)
    // Runs of several minutes finish successfully, so age inside the cap proves
    // nothing on its own — a run writing steps is a run still working.
    expect(isAbandonedRun(run({ started_at: minutesAgo(4), updated_at: minutesAgo(1) }))).toBe(false)
    expect(isAbandonedRun(run({
      started_at: minutesAgo(4),
      updated_at: new Date(Date.now() - abandonedRunSilentAfterMs + 30_000).toISOString(),
    }))).toBe(false)
  })

  it("leaves alone the runs that are waiting on the user rather than on a server", () => {
    expect(isAbandonedRun(run({ status: "awaiting_approval" }))).toBe(false)
    expect(isAbandonedRun(run({ status: "blocked" }))).toBe(false)
    expect(isAbandonedRun(run({ status: "completed", completed_at: minutesAgo(19) }))).toBe(false)
  })

  it("closes only the silent runs, and corrects them in place for the response that found them", async () => {
    const calls: { filters: Array<[string, unknown]>; patch?: Record<string, unknown> } = { filters: [] }
    const dead = run({ id: "dead" })
    const alive = run({ id: "alive", started_at: minutesAgo(4), updated_at: minutesAgo(1) })
    const somebodyElses = run({ id: "theirs", user_id: "user-2" })

    const closed = await failAbandonedRuns(supabaseRecording(calls), { projectId: "project-1", userId: "user-1", runs: [dead, alive, somebodyElses] })

    expect(closed.map((item) => item.id)).toEqual(["dead"])
    expect(calls.patch?.status).toBe("failed")
    expect(calls.filters).toContainEqual(["in:id", ["dead"]])
    expect(calls.filters).toContainEqual(["project_id", "project-1"])
    expect(calls.filters).toContainEqual(["user_id", "user-1"])
    // The chat reads the rows it was handed, so the correction has to be on them.
    expect(dead.status).toBe("failed")
    expect(dead.completed_at).toBeTruthy()
    expect(alive.status).toBe("running")
  })

  it("does not write at all when every run is accounted for", async () => {
    const calls: { filters: Array<[string, unknown]>; patch?: Record<string, unknown> } = { filters: [] }
    const closed = await failAbandonedRuns(supabaseRecording(calls), { projectId: "project-1", userId: "user-1", runs: [run({ started_at: minutesAgo(4), updated_at: minutesAgo(1) })] })
    expect(closed).toEqual([])
    expect(calls.patch).toBeUndefined()
    expect(calls.filters).toEqual([])
  })
})

describe("a run that outlived the request that was running it", () => {
  it("is abandoned once it passes the route's own duration cap, however recently it wrote", () => {
    expect(isAbandonedRun(run({
      started_at: new Date(Date.now() - runHardTimeoutMs - 1_000).toISOString(),
      updated_at: new Date(Date.now() - 10_000).toISOString(),
    }))).toBe(true)
  })

  it("leaves a long run alone while it is still inside that cap", () => {
    expect(isAbandonedRun(run({
      started_at: new Date(Date.now() - runHardTimeoutMs + 30_000).toISOString(),
      updated_at: new Date(Date.now() - 10_000).toISOString(),
    }))).toBe(false)
  })
})

describe("telling a lost browser from a lost server", () => {
  it("closes a run whose page let go of it with a reason the user can act on", async () => {
    const calls: { filters: Array<[string, unknown]>; patch?: Record<string, unknown> } = { filters: [] }
    const disconnected = run({ id: "left", summary: { client_disconnected_at: minutesAgo(19) } })
    await failAbandonedRuns(supabaseRecording(calls), { projectId: "project-1", userId: "user-1", runs: [disconnected] })
    expect((disconnected as { error?: { code?: string } }).error?.code).toBe("run_disconnected")
  })

  it("still blames the server when nothing recorded a disconnect", async () => {
    const calls: { filters: Array<[string, unknown]>; patch?: Record<string, unknown> } = { filters: [] }
    const died = run({ id: "died" })
    await failAbandonedRuns(supabaseRecording(calls), { projectId: "project-1", userId: "user-1", runs: [died] })
    expect((died as { error?: { code?: string } }).error?.code).toBe("run_interrupted")
  })
})
