import { describe, expect, it } from "vitest"
import { confirmsScriptReplacement } from "./script"

describe("confirmsScriptReplacement", () => {
  it.each([
    "yes, replace the current script",
    "confirmed — replace it",
    "ok do it, replace the current script",
  ])("treats %s as the go-ahead", (message) => {
    expect(confirmsScriptReplacement(message)).toBe(true)
  })

  it.each([
    "ok, but don't replace the current script",
    "no, keep the current script",
    "yes to the shots, but never replace the current script",
  ])("does not overwrite the script on %s", (message) => {
    // The confirmation is acted on a turn later, against the script text from
    // an earlier message, so misreading it destroys writing the user asked to
    // keep and there is nothing on screen to undo it from.
    expect(confirmsScriptReplacement(message)).toBe(false)
  })
})
