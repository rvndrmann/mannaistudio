import { describe, expect, it } from "vitest"
import {
  backgroundJobValidForMs,
  shouldRunInBackground,
  signBackgroundJob,
  verifyBackgroundJob,
  type BackgroundRunJob,
} from "./background-run"

const secret = "a-test-secret"

const job = (over: Partial<BackgroundRunJob> = {}): BackgroundRunJob => ({
  projectId: "project-1",
  episodeId: "episode-1",
  sessionId: "session-1",
  accessToken: "the-user-access-token",
  message: "Pick up where the production left off",
  model: "gpt-5.6",
  mentionedEntityIds: [],
  issuedAt: Date.now(),
  ...over,
})

describe("choosing which turns leave the browser", () => {
  it("changes nothing at all until the worker is configured", () => {
    expect(shouldRunInBackground({ mode: "full_auto", automated: true, secret: undefined }))
      .toEqual({ background: false, reason: "worker-not-configured" })
  })

  it("keeps a turn the user typed on the stream, so they watch it arrive", () => {
    expect(shouldRunInBackground({ mode: "semi_auto", automated: false, secret }).background).toBe(false)
  })

  it("keeps manual mode exactly as it is", () => {
    expect(shouldRunInBackground({ mode: "manual", automated: true, secret }).background).toBe(false)
  })

  it("sends an autopilot turn to the worker, where no tab can interrupt it", () => {
    expect(shouldRunInBackground({ mode: "semi_auto", automated: true, secret }).background).toBe(true)
    expect(shouldRunInBackground({ mode: "full_auto", automated: true, secret }).background).toBe(true)
  })
})

describe("the signed handoff to the worker", () => {
  it("accepts a job it signed itself", () => {
    const work = job()
    expect(verifyBackgroundJob(work, signBackgroundJob(work, secret), secret)).toEqual(work)
  })

  it("refuses a job whose contents were changed after signing", () => {
    const work = job()
    const signature = signBackgroundJob(work, secret)
    expect(verifyBackgroundJob({ ...work, accessToken: "somebody-elses-token" }, signature, secret)).toBeNull()
  })

  it("refuses a signature made with a different secret", () => {
    const work = job()
    expect(verifyBackgroundJob(work, signBackgroundJob(work, "another-secret"), secret)).toBeNull()
  })

  it("refuses a job old enough to be a replay", () => {
    const work = job({ issuedAt: Date.now() - backgroundJobValidForMs - 1_000 })
    expect(verifyBackgroundJob(work, signBackgroundJob(work, secret), secret)).toBeNull()
  })

  it("refuses anything that is not a job at all", () => {
    expect(verifyBackgroundJob(null, "whatever", secret)).toBeNull()
    expect(verifyBackgroundJob({ projectId: "project-1" }, "whatever", secret)).toBeNull()
    expect(verifyBackgroundJob(job(), null, secret)).toBeNull()
  })
})
