import { describe, expect, it } from "vitest"
import { directorRecovery } from "./recovery"

describe("Director recovery", () => {
  it("turns query limits into a paginated retry", () => {
    const result = directorRecovery(new Error("too many rows for return limit"))
    expect(result.code).toBe("result_limit")
    expect(result.suggestedIntent).toContain("pages")
  })

  it("does not suggest bypassing a provider safety block", () => {
    const result = directorRecovery(new Error("moderation_blocked safety violation"))
    expect(result.code).toBe("safety_block")
    expect(result.message).toContain("policy-compliant")
  })
})
