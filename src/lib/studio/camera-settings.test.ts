import { describe, expect, it } from "vitest"
import {
  BLOCK_CAMERA_DEFAULTS,
  DEFAULT_PROJECT_CAMERA_SETTINGS,
  applyCameraSettings,
  buildCameraPrompt,
  isCameraSettings,
  normalizeCameraSettings,
  projectCameraDefaults,
  resolveCameraSettings,
} from "./camera-settings"

/**
 * The camera clause is the whole payload of the feature: a pure function from
 * four picked values to a sentence appended to the prompt. Everything else —
 * the picker, the override toggle, the snapshot on the generated row — only
 * decides which four values arrive here.
 */

describe("buildCameraPrompt", () => {
  it("composes the worked example exactly", () => {
    const base = "Portrait of Elena, mid-30s detective, rain-soaked trench coat, standing under a streetlight"
    expect(buildCameraPrompt(base, "Grand Format 70mm Film", "Classic Anamorphic", 85, "f/1.4")).toBe(
      "Portrait of Elena, mid-30s detective, rain-soaked trench coat, standing under a streetlight, "
      + "shot on a grand format 70mm film camera, "
      + "using a classic anamorphic lens at 85mm (classic portrait perspective), "
      + "aperture f/1.4, shallow depth of field, creamy bokeh, "
      + "cinematic lighting, natural color science, high dynamic range, "
      + "professional photography, ultra-detailed, 8K resolution",
    )
  })

  it("leads with the subject and never prepends the camera", () => {
    const composed = buildCameraPrompt("A red door", "Classic 16mm Film", "Vintage Prime", 24, "f/11")
    expect(composed.startsWith("A red door,")).toBe(true)
  })

  it("drops the perspective clause rather than emitting empty parentheses for an unmapped focal length", () => {
    const composed = buildCameraPrompt("A red door", "Classic 16mm Film", "Vintage Prime", 63, "f/11")
    expect(composed).toContain("using a vintage prime lens at 63mm,")
    expect(composed).not.toContain("()")
  })

  it("passes an unmapped camera or lens through as written instead of dropping it", () => {
    const composed = buildCameraPrompt("A red door", "Some Future Body", "Some Future Glass", 35, "f/4")
    expect(composed).toContain("shot on a Some Future Body")
    expect(composed).toContain("using a Some Future Glass at 35mm")
  })

  it("composes the same string from a settings object", () => {
    const settings = { camera: "Studio Digital S35", lens: "Warm Cinema Prime", focalLength: 50, aperture: "f/4" }
    expect(applyCameraSettings("A kitchen", settings)).toBe(
      buildCameraPrompt("A kitchen", "Studio Digital S35", "Warm Cinema Prime", 50, "f/4"),
    )
  })

  it("does not double-append when the base prompt is composed twice from the same base", () => {
    const settings = { camera: "Studio Digital S35", lens: "Warm Cinema Prime", focalLength: 50, aperture: "f/4" }
    const first = applyCameraSettings("A kitchen", settings)
    const second = applyCameraSettings("A kitchen", settings)
    expect(second).toBe(first)
    expect(second.match(/cinematic lighting/g)).toHaveLength(1)
  })
})

describe("normalizeCameraSettings", () => {
  it("keeps every value that is still a live map key", () => {
    const stored = { camera: "Classic 16mm Film", lens: "Halation Diffusion", focalLength: 14, aperture: "f/11" }
    expect(normalizeCameraSettings(stored, BLOCK_CAMERA_DEFAULTS.shot)).toEqual(stored)
  })

  it("falls back per field when a stored key no longer exists", () => {
    const stored = { camera: "Retired Body", lens: "Halation Diffusion", focalLength: 63, aperture: "f/2.8" }
    expect(normalizeCameraSettings(stored, BLOCK_CAMERA_DEFAULTS.shot)).toEqual({
      camera: BLOCK_CAMERA_DEFAULTS.shot.camera,
      lens: "Halation Diffusion",
      focalLength: BLOCK_CAMERA_DEFAULTS.shot.focalLength,
      aperture: BLOCK_CAMERA_DEFAULTS.shot.aperture,
    })
  })

  it("reads a focal length that came back from JSON as a string", () => {
    expect(normalizeCameraSettings({ focalLength: "85" }, BLOCK_CAMERA_DEFAULTS.shot).focalLength).toBe(85)
  })

  it("returns the fallback whole for a value that is not an object", () => {
    expect(normalizeCameraSettings("nonsense", BLOCK_CAMERA_DEFAULTS.asset)).toEqual(BLOCK_CAMERA_DEFAULTS.asset)
  })
})

describe("isCameraSettings", () => {
  it("accepts a complete, live settings object", () => {
    expect(isCameraSettings(BLOCK_CAMERA_DEFAULTS.character)).toBe(true)
  })

  it("rejects a partial one", () => {
    expect(isCameraSettings({ camera: "Classic 16mm Film" })).toBe(false)
    expect(isCameraSettings(null)).toBe(false)
  })
})

describe("projectCameraDefaults", () => {
  it("is null while the project has never chosen a camera package", () => {
    expect(projectCameraDefaults({ metadata: { basic_settings: { imageQuality: "High" } } })).toBeNull()
    expect(projectCameraDefaults({})).toBeNull()
    expect(projectCameraDefaults(null)).toBeNull()
  })

  it("reads and validates what Basic Settings saved", () => {
    const project = { metadata: { basic_settings: { cameraDefaults: { camera: "Classic 16mm Film", lens: "Vintage Prime", focalLength: 24, aperture: "f/11" } } } }
    expect(projectCameraDefaults(project)).toEqual({ camera: "Classic 16mm Film", lens: "Vintage Prime", focalLength: 24, aperture: "f/11" })
  })

  it("repairs a stored package that references a retired key", () => {
    const project = { metadata: { basic_settings: { cameraDefaults: { camera: "Retired Body", lens: "Vintage Prime", focalLength: 24, aperture: "f/11" } } } }
    expect(projectCameraDefaults(project)?.camera).toBe(DEFAULT_PROJECT_CAMERA_SETTINGS.camera)
  })
})

describe("resolveCameraSettings", () => {
  it("gives each block its own preset while the project has chosen nothing", () => {
    expect(resolveCameraSettings({ block: "character" })).toEqual(BLOCK_CAMERA_DEFAULTS.character)
    expect(resolveCameraSettings({ block: "asset" })).toEqual(BLOCK_CAMERA_DEFAULTS.asset)
    expect(resolveCameraSettings({ block: "shot" })).toEqual(BLOCK_CAMERA_DEFAULTS.shot)
  })

  it("locks a character block to the project package once one is set", () => {
    const projectDefaults = { camera: "Classic 16mm Film", lens: "Vintage Prime", focalLength: 24, aperture: "f/11" }
    expect(resolveCameraSettings({ block: "character", projectDefaults })).toEqual(projectDefaults)
  })

  it("lets a block override win over the project package", () => {
    const projectDefaults = { camera: "Classic 16mm Film", lens: "Vintage Prime", focalLength: 24, aperture: "f/11" }
    const override = { camera: "Grand Format 70mm Film", lens: "Classic Anamorphic", focalLength: 85, aperture: "f/1.4" }
    expect(resolveCameraSettings({ block: "shot", override, projectDefaults })).toEqual(override)
  })

  it("treats a null override as no override rather than as empty settings", () => {
    const projectDefaults = { camera: "Classic 16mm Film", lens: "Vintage Prime", focalLength: 24, aperture: "f/11" }
    expect(resolveCameraSettings({ block: "asset", override: null, projectDefaults })).toEqual(projectDefaults)
  })

  it("falls an unknown key in an override back to the project package, not to the block preset", () => {
    const projectDefaults = { camera: "Classic 16mm Film", lens: "Vintage Prime", focalLength: 24, aperture: "f/11" }
    const override = { camera: "Retired Body", lens: "Classic Anamorphic", focalLength: 85, aperture: "f/1.4" }
    expect(resolveCameraSettings({ block: "shot", override, projectDefaults }).camera).toBe("Classic 16mm Film")
  })
})
