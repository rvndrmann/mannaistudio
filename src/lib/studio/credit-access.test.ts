import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
import { creditAccessAllowed } from "./credit-access"
describe("admin credit access", () => {
  it("is off for absent and malformed settings", () => {
    for (const config of [null, {}, { enabled: "true" }, { userIds: "u" }]) expect(creditAccessAllowed(config, "u")).toBe(false)
  })
  it("allows global enablement", () => { expect(creditAccessAllowed({ enabled: true }, "u")).toBe(true) })
  it("allows only selected users while globally off", () => {
    expect(creditAccessAllowed({ enabled: false, userIds: ["u"] }, "u")).toBe(true)
    expect(creditAccessAllowed({ enabled: false, userIds: ["u"] }, "other")).toBe(false)
  })
})
