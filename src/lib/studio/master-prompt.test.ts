import { describe, expect, it } from "vitest"
import { stripIdentityDescriptions } from "./prompt-sanitizer"

/**
 * The master prompt is the one document that holds the CHARACTER / ASSET LOCK,
 * because that block is what the characters and assets are created from. It
 * must never travel from there into a shot's image or video prompt: written
 * appearance competes with the reference image and wins, which is what makes a
 * character's look change between shots.
 *
 * So the rule has two halves, and both have to hold — the block survives in the
 * master prompt, and does not survive anywhere downstream of it.
 */

const masterPrompt = `🎬 SEEDANCE 2.0 SCENE PROMPT — "She Came Back"

🎭 CHARACTER / ASSET LOCK
@Ethan — Male, late 20s, lean build, short dark hair, grey t-shirt.
@Lena — Female, mid 20s, shoulder-length auburn hair, cream knit sweater.

🌍 SETTING & ATMOSPHERE
Cramped apartment bathroom, night, cold overhead light.

🎥 SCENE PROMPT — TIMELINE
⏱️ 0–2s — SUDDEN TURN
@Ethan spins from the mirror. <Tap drips>`

describe("the master prompt keeps what everything downstream must not", () => {
  it("holds on to the lock block, because the entities are created from it", () => {
    // Nothing sanitises the master prompt on the way in; this is the check that
    // the block it depends on is the kind that would be stripped elsewhere.
    expect(masterPrompt).toContain("CHARACTER / ASSET LOCK")
    expect(masterPrompt).toContain("short dark hair")
  })

  it("drops the lock block out of anything extracted from it", () => {
    const extracted = stripIdentityDescriptions(masterPrompt)
    expect(extracted).not.toContain("CHARACTER / ASSET LOCK")
    expect(extracted).not.toContain("short dark hair")
    expect(extracted).not.toContain("cream knit sweater")
  })

  it("keeps the scene itself, which is what a shot prompt is written from", () => {
    const extracted = stripIdentityDescriptions(masterPrompt)
    expect(extracted).toContain("Cramped apartment bathroom")
    expect(extracted).toContain("@Ethan spins from the mirror")
    // The characters are still named — by tag, which is the whole point: the
    // reference art supplies the likeness the words are no longer describing.
    expect(extracted).toContain("@Ethan")
  })
})
