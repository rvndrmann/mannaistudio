import { describe, expect, it } from "vitest"
import {
  composeLookDirectives,
  isEmptyStyleDna,
  projectStyleDna,
  projectStyleReferenceImages,
  resolveStyleDna,
  styleBlockForEntityType,
  styleDnaDirective,
  styleDnaSchema,
  styleReferenceClause,
  styleReferenceImagesOf,
} from "./style-dna"

const full = styleDnaSchema.parse({
  summary: "Sodium-lit rain-slick street at night",
  feeling: { coreEmotions: ["tension", "loneliness"], mood: "gritty and nocturnal", atmosphere: ["rain haze", "steam"] },
  influences: { art: "high-contrast street photography", film: "hard practical sources, wet asphalt reflections", design: "", cultural: "" },
  color: { dominant: ["sodium orange", "deep cyan"], accent: ["magenta"], tone: "cool with warm practicals, high contrast" },
  lighting: { type: "hard, direct", sourceDirection: "low side and back", key: "low-key", atmospherics: ["volumetric haze"] },
  composition: { layout: "asymmetrical", perspective: "low angle", depthOfField: "shallow", framing: "strong leading lines" },
  texture: { textures: ["wet asphalt", "peeling paint"], materials: ["rain-beaded glass"] },
  scale: { senseOfScale: "intimate", viewerRelationship: "close and observing" },
  subject: { realism: "photorealistic", overarchingStyle: "neo-noir", criticalDetails: ["visible rain streaks"] },
  negatives: ["flat daylight", "pastel palettes"],
})

describe("styleDnaSchema", () => {
  it("fills in the sections the model left out instead of failing the whole extraction", () => {
    const parsed = styleDnaSchema.parse({ summary: "Soft daylight interior", color: { dominant: ["bone white"] } })
    expect(parsed.summary).toBe("Soft daylight interior")
    expect(parsed.color.dominant).toEqual(["bone white"])
    expect(parsed.lighting.type).toBe("")
    expect(parsed.negatives).toEqual([])
  })

  it("survives a section that came back as the wrong type", () => {
    const parsed = styleDnaSchema.parse({ color: "warm", negatives: "none" })
    expect(parsed.color.dominant).toEqual([])
    expect(parsed.negatives).toEqual([])
  })

  it("defaults to letting the project's visual style keep the last word", () => {
    expect(styleDnaSchema.parse({}).overrideProjectStyle).toBe(false)
  })
})

describe("isEmptyStyleDna", () => {
  it("treats a parsed but blank extraction as nothing to apply", () => {
    expect(isEmptyStyleDna(styleDnaSchema.parse({}))).toBe(true)
    expect(isEmptyStyleDna(null)).toBe(true)
  })

  it("treats one filled section as something to apply", () => {
    expect(isEmptyStyleDna(styleDnaSchema.parse({ color: { dominant: ["sodium orange"] } }))).toBe(false)
  })
})

describe("styleDnaDirective", () => {
  it("gives a shot the whole look", () => {
    const directive = styleDnaDirective(full, "shot")
    expect(directive).toContain("sodium orange")
    expect(directive).toContain("Lighting:")
    expect(directive).toContain("Composition:")
    expect(directive).toContain("Scale:")
    expect(directive).toContain("Avoid: flat daylight, pastel palettes.")
  })

  it("keeps lighting, composition, and scale out of a character reference sheet", () => {
    // The turnaround's job is an identity lock on a neutral backdrop. A low-key
    // side-lit low angle would make it useless as a reference.
    const directive = styleDnaDirective(full, "character")
    expect(directive).toContain("sodium orange")
    expect(directive).toContain("wet asphalt")
    expect(directive).not.toContain("Lighting:")
    expect(directive).not.toContain("Composition:")
    expect(directive).not.toContain("Scale:")
    expect(directive).toContain("keep the neutral backdrop")
  })

  it("gives a scene plate the light and the air but not the framing", () => {
    const directive = styleDnaDirective(full, "scene")
    expect(directive).toContain("Lighting:")
    expect(directive).toContain("Mood:")
    expect(directive).not.toContain("Composition:")
    expect(directive).not.toContain("Scale:")
  })

  it("says nothing when there is nothing extracted", () => {
    expect(styleDnaDirective(null, "shot")).toBe("")
    expect(styleDnaDirective(styleDnaSchema.parse({}), "shot")).toBe("")
  })

  it("withholds the reference's realism while the project still owns the medium", () => {
    expect(styleDnaDirective(full, "shot")).not.toContain("photorealistic")
    const overriding = styleDnaSchema.parse({ ...full, overrideProjectStyle: true })
    expect(styleDnaDirective(overriding, "shot")).toContain("photorealistic")
  })
})

describe("composeLookDirectives", () => {
  it("keeps the project's style clause when the reference only refines it", () => {
    const lines = composeLookDirectives("Realistic - Photorealistic", full, "shot")
    expect(lines.some((line) => line.includes("Required project style"))).toBe(true)
    expect(lines.some((line) => line.includes("No anime"))).toBe(true)
    expect(lines.some((line) => line.includes("sodium orange"))).toBe(true)
  })

  it("drops the project's style clause when the reference is the medium", () => {
    // Otherwise a painterly board in a photoreal project ships both "match this
    // painting" and "no painting" in the same prompt.
    const lines = composeLookDirectives("Realistic - Photorealistic", styleDnaSchema.parse({ ...full, overrideProjectStyle: true }), "shot")
    expect(lines.some((line) => line.includes("Required project style"))).toBe(false)
    expect(lines.some((line) => line.includes("No anime"))).toBe(false)
    expect(lines.some((line) => line.includes("sodium orange"))).toBe(true)
  })

  it("falls back to the style clause alone when no look was extracted", () => {
    const lines = composeLookDirectives("Anime - Ghibli", null, "shot")
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain("Anime - Ghibli")
  })
})

describe("styleReferenceClause", () => {
  it("tells the model the trailing images are a look and not a subject", () => {
    expect(styleReferenceClause(1)).toContain("The final reference image is")
    expect(styleReferenceClause(1)).toContain("Do not copy the subject")
    expect(styleReferenceClause(2)).toContain("The final 2 reference images are")
  })

  it("says nothing when no look reference is attached", () => {
    expect(styleReferenceClause(0)).toBe("")
  })
})

describe("styleBlockForEntityType", () => {
  it("separates a scene from the other assets, unlike the camera package", () => {
    expect(styleBlockForEntityType("character")).toBe("character")
    expect(styleBlockForEntityType("scene")).toBe("scene")
    expect(styleBlockForEntityType("prop")).toBe("asset")
    expect(styleBlockForEntityType(null)).toBe("asset")
  })
})

describe("projectStyleDna", () => {
  it("reads the look out of Basic Settings", () => {
    const project = { metadata: { basic_settings: { styleDna: { ...full, sourceImages: ["a/b.png"] } } } }
    expect(projectStyleDna(project)?.color.dominant).toEqual(["sodium orange", "deep cyan"])
    expect(projectStyleReferenceImages(project)).toEqual(["a/b.png"])
  })

  it("is null for a project that has never extracted one", () => {
    expect(projectStyleDna({})).toBeNull()
    expect(projectStyleDna({ metadata: { basic_settings: {} } })).toBeNull()
    expect(projectStyleReferenceImages({})).toEqual([])
  })

  it("is null for a stored look whose every field was cleared", () => {
    // Emptying the panel has to mean "no look", not "a look that says nothing" —
    // otherwise the camera clause stays stripped for no benefit.
    expect(projectStyleDna({ metadata: { basic_settings: { styleDna: { summary: "" } } } })).toBeNull()
  })

  it("never lets the look references crowd out the cast", () => {
    const project = { metadata: { basic_settings: { styleDna: { ...full, sourceImages: ["a.png", "b.png", "c.png", "d.png"] } } } }
    expect(projectStyleReferenceImages(project)).toHaveLength(2)
  })
})

describe("resolveStyleDna", () => {
  const projectDefault = styleDnaSchema.parse({ summary: "project look", color: { dominant: ["bone white"] } })
  const override = styleDnaSchema.parse({ summary: "this shot only", color: { dominant: ["sodium orange"] } })

  it("falls back to the project look when the image names none", () => {
    expect(resolveStyleDna({ projectDefault })?.summary).toBe("project look")
    expect(resolveStyleDna({ override: undefined, projectDefault })?.summary).toBe("project look")
  })

  it("lets one image be shot under its own look", () => {
    expect(resolveStyleDna({ override, projectDefault })?.summary).toBe("this shot only")
  })

  it("treats an explicit null as 'this image has no look', not as 'inherit'", () => {
    // The distinction is the whole point of the per-image lock: clearing the
    // look on one frame must not quietly hand it the project's back.
    expect(resolveStyleDna({ override: null, projectDefault })).toBeNull()
  })

  it("repairs an unusable override against the project look rather than shipping it", () => {
    expect(resolveStyleDna({ override: "sodium orange", projectDefault })?.summary).toBe("project look")
    expect(resolveStyleDna({ override: {}, projectDefault })?.summary).toBe("project look")
  })

  it("is null when neither the image nor the project has a look", () => {
    expect(resolveStyleDna({})).toBeNull()
    expect(resolveStyleDna({ override: {}, projectDefault: null })).toBeNull()
  })
})

describe("styleReferenceImagesOf", () => {
  it("takes the pixels from whichever look won, not always the project's", () => {
    // A shot shot under its own look has to send its own reference, or the
    // override would be described in words while the project's board is what
    // the provider actually sees.
    expect(styleReferenceImagesOf(styleDnaSchema.parse({ ...full, sourceImages: ["shot-ref.png"] }))).toEqual(["shot-ref.png"])
    expect(styleReferenceImagesOf(null)).toEqual([])
  })
})
