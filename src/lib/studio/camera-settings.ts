/**
 * The camera package a project shoots on.
 *
 * Every image in a storyboard — character references, asset plates, and shot
 * frames — drifts optically when the prompt carries no fixed lens vocabulary.
 * One camera body, one lens, one focal length, and one aperture, appended to
 * the prompt in the same words every time, is what makes a set of generations
 * look like they came off the same rig.
 *
 * The left side of each map is what the user picks; the right side is what the
 * image model reads. The right side is tuned phrasing — changing it changes
 * every image the project generates afterwards.
 */

export const CAMERA_MAP: Record<string, string> = {
  "Modular 8K Digital": "modular 8K digital cinema camera",
  "Full-Frame Cine Digital": "full-frame digital cinema camera",
  "Grand Format 70mm Film": "grand format 70mm film camera",
  "Studio Digital S35": "Super 35 studio digital camera",
  "Classic 16mm Film": "classic 16mm film camera",
  "Premium Large Format Digital": "premium large-format digital cinema camera",
}

export const LENS_MAP: Record<string, string> = {
  "Creative Tilt Lens": "creative tilt lens effect",
  "Compact Anamorphic": "compact anamorphic lens",
  "Extreme Macro": "extreme macro lens",
  "70s Cinema Prime": "1970s cinema prime lens",
  "Classic Anamorphic": "classic anamorphic lens",
  "Premium Modern Prime": "premium modern prime lens",
  "Warm Cinema Prime": "warm-toned cinema prime lens",
  "Swirl Bokeh Portrait": "swirl bokeh portrait lens",
  "Vintage Prime": "vintage prime lens",
  "Halation Diffusion": "halation diffusion filter",
  "Clinical Sharp Prime": "ultra-sharp clinical prime lens",
}

/**
 * Six focal lengths, not a slider. Each key owns a prose fragment, so an
 * unmapped value like 63mm would silently drop the perspective clause and
 * quietly weaken the prompt instead of failing loudly.
 */
export const FOCAL_PERSPECTIVE: Record<number, string> = {
  8: "ultra-wide perspective",
  14: "wide-angle perspective",
  24: "wide-angle dynamic perspective",
  35: "natural cinematic perspective",
  50: "standard portrait perspective",
  85: "classic portrait perspective",
}

export const APERTURE_EFFECT: Record<string, string> = {
  "f/1.4": "shallow depth of field, creamy bokeh",
  "f/4": "balanced depth of field",
  "f/11": "deep focus clarity, sharp foreground to background",
}

export type CameraSettings = {
  camera: string
  lens: string
  focalLength: number
  aperture: string
}

export const cameraOptions = Object.keys(CAMERA_MAP)
export const lensOptions = Object.keys(LENS_MAP)
export const focalLengthOptions = Object.keys(FOCAL_PERSPECTIVE).map(Number).sort((a, b) => a - b)
export const apertureOptions = Object.keys(APERTURE_EFFECT)

/**
 * Which block is asking. A character reference wants a portrait length and
 * subject separation; an asset plate wants readable detail rather than bokeh;
 * a shot wants whatever the director says.
 */
export type CameraBlock = "character" | "asset" | "shot"

export const BLOCK_CAMERA_DEFAULTS: Record<CameraBlock, CameraSettings> = {
  character: { camera: "Full-Frame Cine Digital", lens: "Premium Modern Prime", focalLength: 85, aperture: "f/1.4" },
  asset: { camera: "Full-Frame Cine Digital", lens: "Clinical Sharp Prime", focalLength: 50, aperture: "f/4" },
  shot: { camera: "Full-Frame Cine Digital", lens: "Premium Modern Prime", focalLength: 35, aperture: "f/1.4" },
}

/** What a project starts on before anyone opens Basic Settings. */
export const DEFAULT_PROJECT_CAMERA_SETTINGS: CameraSettings = BLOCK_CAMERA_DEFAULTS.shot

/** The block an entity type belongs to: a character is a character, everything else is an asset. */
export function cameraBlockForEntityType(type: string | null | undefined): CameraBlock {
  return type === "character" ? "character" : "asset"
}

/**
 * Read settings that came out of the database, where the maps may have moved
 * underneath them. Anything unrecognised falls back field by field rather than
 * being passed through to the prompt as a raw string.
 */
export function normalizeCameraSettings(value: unknown, fallback: CameraSettings): CameraSettings {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {}
  const camera = typeof record.camera === "string" && record.camera in CAMERA_MAP ? record.camera : fallback.camera
  const lens = typeof record.lens === "string" && record.lens in LENS_MAP ? record.lens : fallback.lens
  const focalRaw = typeof record.focalLength === "number" ? record.focalLength : Number(record.focalLength)
  const focalLength = Number.isFinite(focalRaw) && focalRaw in FOCAL_PERSPECTIVE ? focalRaw : fallback.focalLength
  const aperture = typeof record.aperture === "string" && record.aperture in APERTURE_EFFECT ? record.aperture : fallback.aperture
  return { camera, lens, focalLength, aperture }
}

/** True only for an object every one of whose four keys is a live map key. */
export function isCameraSettings(value: unknown): value is CameraSettings {
  if (!value || typeof value !== "object") return false
  const record = value as Record<string, unknown>
  return typeof record.camera === "string" && record.camera in CAMERA_MAP
    && typeof record.lens === "string" && record.lens in LENS_MAP
    && typeof record.focalLength === "number" && record.focalLength in FOCAL_PERSPECTIVE
    && typeof record.aperture === "string" && record.aperture in APERTURE_EFFECT
}

/**
 * The project's camera package, or null when nobody has chosen one. Null is
 * meaningful: it is what lets a character block sit on its portrait default
 * instead of inheriting a wide-angle project default that was never set.
 */
export function projectCameraDefaults(project: Record<string, unknown> | null | undefined): CameraSettings | null {
  const metadata = project?.metadata && typeof project.metadata === "object" ? project.metadata as Record<string, unknown> : {}
  const basicSettings = metadata.basic_settings && typeof metadata.basic_settings === "object" ? metadata.basic_settings as Record<string, unknown> : {}
  const stored = basicSettings.cameraDefaults
  if (!stored || typeof stored !== "object") return null
  return normalizeCameraSettings(stored, DEFAULT_PROJECT_CAMERA_SETTINGS)
}

/**
 * project.cameraDefaults → block override → the settings the prompt is built
 * from. A block's own preset is the floor, used only while the project has
 * chosen nothing.
 */
export function resolveCameraSettings({
  block,
  override,
  projectDefaults,
}: {
  block: CameraBlock
  override?: unknown
  projectDefaults?: CameraSettings | null
}): CameraSettings {
  const base = projectDefaults ? normalizeCameraSettings(projectDefaults, BLOCK_CAMERA_DEFAULTS[block]) : BLOCK_CAMERA_DEFAULTS[block]
  if (override === null || override === undefined) return base
  return normalizeCameraSettings(override, base)
}

/**
 * Append the optical language to a prompt. The subject leads — the camera
 * clause is only ever added to the end.
 *
 * Compose at submit time from the stored base prompt and never write the
 * result back into the prompt field: a composed string fed back in stacks
 * another camera clause on every regeneration until the prompt is noise.
 */
export function buildCameraPrompt(
  basePrompt: string,
  camera: string,
  lens: string,
  focalLength: number,
  aperture: string,
  options?: { opticsOnly?: boolean },
) {
  const cameraDesc = CAMERA_MAP[camera] || camera
  const lensDesc = LENS_MAP[lens] || lens
  const perspective = FOCAL_PERSPECTIVE[focalLength] || ""
  const depthEffect = APERTURE_EFFECT[aperture] || ""

  // The tail is generic look language — the fallback for a project that has
  // described its look nowhere else. A project with an extracted Style DNA has
  // described it precisely, so the tail is dropped rather than left to argue
  // with it: "cinematic lighting" and "natural color science" pull every frame
  // back toward a neutral house look and quietly undo a specific reference.
  const tail = options?.opticsOnly
    ? []
    : ["cinematic lighting", "natural color science", "high dynamic range", "professional photography, ultra-detailed, 8K resolution"]

  const parts = [
    basePrompt,
    `shot on a ${cameraDesc}`,
    `using a ${lensDesc} at ${focalLength}mm ${perspective ? `(${perspective})` : ""}`,
    `aperture ${aperture}`,
    depthEffect,
    ...tail,
  ]

  // Trimmed as well as filtered: a focal length with no mapped perspective
  // leaves the lens clause ending in a space, which reaches the model as
  // "at 63mm ,". The mapped values are unaffected.
  return parts.filter((p) => p && p.trim() !== "").map((p) => p.trim()).join(", ")
}

/** The same composition, taking the settings object the rest of the app passes around. */
export function applyCameraSettings(basePrompt: string, settings: CameraSettings, options?: { opticsOnly?: boolean }) {
  return buildCameraPrompt(basePrompt, settings.camera, settings.lens, settings.focalLength, settings.aperture, options)
}

/** "Full-Frame Cine Digital · Premium Modern Prime · 35mm · f/1.4" — for read-only summaries. */
export function describeCameraSettings(settings: CameraSettings) {
  return `${settings.camera} · ${settings.lens} · ${settings.focalLength}mm · ${settings.aperture}`
}
