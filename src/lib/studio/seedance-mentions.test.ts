import { describe, expect, it } from "vitest"
import { bindSeedanceMentions, unboundMentions } from "./seedance-mentions"

const sara = { name: "Sara", imageIndex: 1 }
const car = { name: "Sleek Luxury Car", imageIndex: 2 }
const street = { name: "Sunny Urban Street", imageIndex: 3 }

describe("the binding Seedance actually reads", () => {
  it("rewrites a mention as subject-then-image, which is the documented order", () => {
    // The guide's own form: "Zhang San@Image 1". Ours said "@Sara", which the
    // provider reads as literal text and binds to nothing.
    const result = bindSeedanceMentions("@Sara turns toward the camera.", [sara])
    expect(result.prompt).toBe("Sara@Image 1 turns toward the camera.")
    expect(result.bound).toEqual(["Sara"])
  })

  it("binds every mention, not just the first", () => {
    // "Each time a subject is involved, it must be explicitly referred to to
    // avoid omission."
    const result = bindSeedanceMentions("@Sara grips the wheel as @Sara glances left.", [sara])
    expect(result.prompt).toBe("Sara@Image 1 grips the wheel as Sara@Image 1 glances left.")
  })

  it("binds each subject to its own image index", () => {
    const result = bindSeedanceMentions("@Sara drives the @Sleek Luxury Car down @Sunny Urban Street.", [sara, car, street])
    expect(result.prompt).toBe("Sara@Image 1 drives the Sleek Luxury Car@Image 2 down Sunny Urban Street@Image 3.")
    expect(result.bound).toEqual(expect.arrayContaining(["Sara", "Sleek Luxury Car", "Sunny Urban Street"]))
  })

  it("binds the longest name first so a shorter one cannot eat its prefix", () => {
    // Binding "Sara" first would leave "Sara@Image 1's Car@..." — a subject that
    // does not exist, pointing at the wrong picture.
    const saras = { name: "Sara's Car", imageIndex: 2 }
    const result = bindSeedanceMentions("@Sara leans on @Sara's Car.", [sara, saras])
    expect(result.prompt).toBe("Sara@Image 1 leans on Sara's Car@Image 2.")
  })

  it("leaves a mention alone when nothing in the request pictures it", () => {
    // Inventing an index would point the model at another subject's photo.
    const result = bindSeedanceMentions("@Sara opens the @Briefcase.", [sara], ["Sara", "Briefcase"])
    expect(result.prompt).toBe("Sara@Image 1 opens the @Briefcase.")
    expect(result.unbound).toEqual(["Briefcase"])
  })

  it("does not bind a name that merely starts another word", () => {
    const result = bindSeedanceMentions("@Sarah waves.", [sara])
    expect(result.prompt).toBe("@Sarah waves.")
    expect(result.bound).toEqual([])
  })

  it("binds a mention at the very start and the very end of the prompt", () => {
    expect(bindSeedanceMentions("@Sara", [sara]).prompt).toBe("Sara@Image 1")
    expect(bindSeedanceMentions("The camera finds @Sara", [sara]).prompt).toBe("The camera finds Sara@Image 1")
  })

  it("binds a mention inside brackets and before punctuation", () => {
    expect(bindSeedanceMentions("(@Sara), still.", [sara]).prompt).toBe("(Sara@Image 1), still.")
  })

  it("matches case-insensitively but writes the entity's saved name", () => {
    expect(bindSeedanceMentions("@sara turns.", [sara]).prompt).toBe("Sara@Image 1 turns.")
  })

  it("leaves a prompt with no mentions untouched", () => {
    const prompt = "Wide shot of an empty highway at dusk."
    expect(bindSeedanceMentions(prompt, [sara])).toEqual({ prompt, bound: [], unbound: [] })
  })

  it("ignores a subject with no usable image index", () => {
    const result = bindSeedanceMentions("@Sara turns.", [{ name: "Sara", imageIndex: 0 }])
    expect(result.prompt).toBe("@Sara turns.")
  })
})

describe("spotting a cast member nobody pointed at", () => {
  it("reports a mention that never got bound", () => {
    expect(unboundMentions("Sara@Image 1 opens the @Briefcase.")).toEqual(["Briefcase"])
  })

  it("does not mistake a completed binding for a loose mention", () => {
    expect(unboundMentions("Sara@Image 1 drives Sleek Luxury Car@Image 2.")).toEqual([])
  })

  it("finds nothing in a prompt with no mentions", () => {
    expect(unboundMentions("A wide establishing shot of the highway.")).toEqual([])
  })
})
