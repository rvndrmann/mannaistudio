import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
const mocks = vi.hoisted(() => ({ required: true, connected: false }))
vi.mock("./preferences", () => ({ ownKeysOnly: async () => mocks.required }))
vi.mock("./credential-service", () => ({ hasByokSubscription: async () => true, hasCredential: async () => mocks.connected, withCredential: async (_: unknown, work: (parts: unknown) => unknown) => work({ apiKey: "customer-test-key" }) }))
import { runUserProvider } from "./run-user-provider"
describe("provider execution gate", () => {
  beforeEach(() => { mocks.required = true; mocks.connected = false })
  it("never calls the model when the user's key is absent", async () => {
    const model = vi.fn()
    await expect(runUserProvider("other-account", "openai", model)).rejects.toThrow("openai API key")
    expect(model).not.toHaveBeenCalled()
  })
  it("blocks unsupported providers without executing them", async () => {
    const model = vi.fn()
    await expect(runUserProvider("other-account", null, model)).rejects.toThrow()
    expect(model).not.toHaveBeenCalled()
  })
  it("runs when an eligible customer key is connected", async () => {
    mocks.connected = true
    expect(await runUserProvider("subscriber", "openai", async () => "reply")).toBe("reply")
  })
})
