import { describe, expect, it } from "vitest"
import { formatBytePlusError } from "./byteplus"

describe("formatBytePlusError", () => {
  it("uses nested BytePlus error messages and redacts provider identifiers", () => {
    expect(formatBytePlusError({
      error: {
        code: "ModelNotOpen",
        message: "Your account 3000000000 has not activated the model test-model. Request id: 021786093786564fd2e0ebdb3eb064cbe39fbfe58bf7263e4d192",
      },
    }, 404)).toBe("BytePlus request failed (404): Your account has not activated the model test-model. Request id: redacted")
  })
})
