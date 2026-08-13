import { describe, expect, it } from "vitest"
import { hasIdentityDescriptions, stripIdentityDescriptions, stripIdentityDescriptionsFromPrompts } from "./prompt-sanitizer"

const shotPrompt = `🎬 SEEDANCE 2.0 SCENE PROMPT — "Ethan Wakes to Lena Watching"

🎭 CHARACTER / ASSET LOCK
@Ethan — Young adult man, lean build, short dark hair, tired intense eyes, tense jaw, wearing dark casual T-shirt and lounge pants. Starts half-asleep, vulnerable, then unsettled.
@Lena — Young woman mid-20s, fair freckled skin, blue-green eyes, light brown hair with warm highlights and wispy bangs, oversized taupe-gray knit sweater and blue jeans.

🌍 SETTING & ATMOSPHERE
Small lived-in apartment bedroom in early morning, dim blue-gray daylight through window mixed with weak warm bedside lamp.

🎥 SCENE PROMPT — TIMELINE
⏱️ 0–1.5s — WAKE-UP REVEAL
Medium close-up from Ethan's pillow height. @Ethan wakes abruptly, then the camera racks focus to reveal @Lena sitting upright beside the bed.

🚫 NEGATIVE RULES
Avoid text, watermarks, UI overlays, distorted faces.`

describe("shot prompt identity stripping", () => {
  const cleaned = stripIdentityDescriptions(shotPrompt)

  it("drops the character lock block", () => {
    expect(cleaned).not.toContain("CHARACTER / ASSET LOCK")
    expect(cleaned).not.toContain("freckled skin")
    expect(cleaned).not.toContain("lounge pants")
  })

  it("keeps the cast so the model still knows who is in frame", () => {
    expect(cleaned).toContain("Cast in frame: @Ethan, @Lena.")
  })

  it("keeps setting, action, and negative rules", () => {
    expect(cleaned).toContain("SETTING & ATMOSPHERE")
    expect(cleaned).toContain("bedside lamp")
    expect(cleaned).toContain("@Ethan wakes abruptly")
    expect(cleaned).toContain("Avoid text, watermarks")
  })

  it("leaves a prompt that never described anyone untouched", () => {
    const plain = "Wide shot of @Ethan crossing the empty hallway, handheld, cold morning light. No text, no subtitles."
    expect(stripIdentityDescriptions(plain)).toBe(plain)
    expect(hasIdentityDescriptions(plain)).toBe(false)
  })

  it("drops a stray identity line even without the heading", () => {
    const prompt = "@Lena — Young woman mid-20s, fair freckled skin, blue-green eyes, wispy bangs.\nShe stands at the door as the rain starts."
    const result = stripIdentityDescriptions(prompt)
    expect(result).not.toContain("freckled")
    expect(result).toContain("She stands at the door")
    expect(result).toContain("Cast in frame: @Lena.")
  })

  // The prompts already saved in this project have no line breaks at all, and a
  // line-based filter saw one enormous line and stripped nothing.
  it("strips the same block when the prompt was saved as one paragraph", () => {
    const inline = shotPrompt.replace(/\n+/g, " ")
    const result = stripIdentityDescriptions(inline)
    expect(result).not.toContain("freckled skin")
    expect(result).not.toContain("lounge pants")
    expect(result).toContain("Cast in frame: @Ethan, @Lena.")
    expect(result).toContain("bedside lamp")
    expect(result).toContain("@Ethan wakes abruptly")
  })

  it("does not treat an action line that names a character as identity", () => {
    const prompt = "Slow push-in on @Lena's calm smile while @Ethan whispers the question and the room goes still."
    expect(stripIdentityDescriptions(prompt)).toBe(prompt)
  })

  it("sanitizes the continuation prompt before it appears in a generation proposal", () => {
    const continuation = `Extend from video @previous shot video into the next scene while following @storyboard shot 2 image.\n\nPhotorealistic, hyper realistic.\n\n${shotPrompt}`
    const result = stripIdentityDescriptionsFromPrompts({ "2": continuation })["2"]
    expect(result).toContain("Extend from video @previous shot video")
    expect(result).toContain("Photorealistic, hyper realistic.")
    expect(result).not.toContain("CHARACTER / ASSET LOCK")
    expect(result).not.toContain("Young adult man")
    expect(result).not.toContain("Young woman mid-20s")
    expect(result).toContain("Cast in frame: @Ethan, @Lena.")
  })
})
