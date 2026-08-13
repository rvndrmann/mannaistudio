import { entityHandle } from "./story"

/**
 * The production pipeline as a state machine over what the workspace actually
 * contains, rather than over what the last message happened to say.
 *
 * Script → prompt sheet → the characters and assets the sheet needs → their
 * reference art → the storyboard → keyframes shot by shot → video shot by shot.
 *
 * Every Director reply ends on the one step that comes next, so a run finishes
 * with something the user can press instead of a paragraph telling them which
 * tab to open. The user stays in the loop by pressing it: nothing downstream
 * runs until they do. Full-auto, when it lands, is the same chain with the
 * pressing done for them.
 */

export const pipelineStageKeys = ["script", "prompt_sheet", "entities", "entity_images", "storyboard", "keyframes", "videos", "complete"] as const
export type PipelineStageKey = (typeof pipelineStageKeys)[number]

export type SnapshotEntity = {
  name: string
  type: string
  hasReferenceImage: boolean
}

export type SnapshotShot = {
  /** 1-based, the number shown in the storyboard. */
  number: number
  hasPrompt: boolean
  hasKeyframe: boolean
  hasVideo: boolean
}

export type ProductionSnapshot = {
  episodeName: string
  hasScript: boolean
  promptSheetCount: number
  /** Entity names the saved prompt sheet references, in sheet order. */
  promptSheetEntityNames: string[]
  entities: SnapshotEntity[]
  shots: SnapshotShot[]
}

export type PipelineAction = {
  id: string
  label: string
  /**
   * Sent back to the Director verbatim when the button is pressed, so it is
   * read by the same intent matching as anything the user types. The wording is
   * deliberate: "create ... characters" would be taken as a request for
   * reference art, and "generate the image ... assets" would be taken as a
   * request for entity art rather than a shot keyframe. Each stage's intent is
   * phrased to land on the path that stage actually needs.
   */
  intent: string
  risk: "read" | "write" | "costly" | "destructive"
  recommended: boolean
}

export type PipelineStage = {
  key: PipelineStageKey
  /** Shown as the heading of the next-step card. */
  title: string
  /** One sentence on where the production stands. */
  summary: string
  nextAction: PipelineAction | null
}

export const emptySnapshot: ProductionSnapshot = {
  episodeName: "Episode 1",
  hasScript: false,
  promptSheetCount: 0,
  promptSheetEntityNames: [],
  entities: [],
  shots: [],
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return count === 1 ? singular : pluralForm
}

function list(names: string[], limit = 6) {
  const shown = names.slice(0, limit)
  const rest = names.length - shown.length
  return rest > 0 ? `${shown.join(", ")}, and ${rest} more` : shown.join(", ")
}

/**
 * The names the prompt sheet asks for that the entity library does not have.
 * Compared on handles so "Detective Rao" and "detective rao" are one character
 * rather than a duplicate the Character & Asset Agent would go on to create.
 */
export function missingEntityNames(snapshot: ProductionSnapshot): string[] {
  const existing = new Set(snapshot.entities.map((entity) => entityHandle(entity.name)))
  const missing = new Map<string, string>()
  for (const name of snapshot.promptSheetEntityNames) {
    const handle = entityHandle(name)
    if (existing.has(handle) || missing.has(handle)) continue
    missing.set(handle, name)
  }
  return Array.from(missing.values())
}

export function entitiesWithoutArt(snapshot: ProductionSnapshot): string[] {
  return snapshot.entities.filter((entity) => !entity.hasReferenceImage).map((entity) => entity.name)
}

/** The lowest-numbered shot still missing its keyframe, or null. */
export function nextShotWithoutKeyframe(snapshot: ProductionSnapshot): SnapshotShot | null {
  return snapshot.shots.find((shot) => shot.hasPrompt && !shot.hasKeyframe) || null
}

/**
 * The lowest-numbered shot still missing its clip. A shot is only ready for
 * video once its keyframe exists, because the clip is generated from the frame
 * the user already accepted.
 */
export function nextShotWithoutVideo(snapshot: ProductionSnapshot): SnapshotShot | null {
  return snapshot.shots.find((shot) => shot.hasKeyframe && !shot.hasVideo) || null
}

export function computePipelineStage(snapshot: ProductionSnapshot): PipelineStage {
  if (!snapshot.hasScript) {
    return {
      key: "script",
      title: "Script",
      summary: "No script is saved for this episode yet.",
      nextAction: {
        id: "pipeline-script",
        label: "Confirm the script",
        intent: "Check whether this episode already has a script. If it does, tell me what is in it and confirm it is ready to work from. If it does not, ask me to paste the script text.",
        risk: "write",
        recommended: true,
      },
    }
  }

  if (!snapshot.promptSheetCount) {
    return {
      key: "prompt_sheet",
      title: "Prompt sheet",
      summary: "The script is saved. It has no prompt sheet yet, so nothing downstream knows what the shots are.",
      nextAction: {
        id: "pipeline-prompt-sheet",
        label: "Write the prompt sheet",
        intent: "Read the saved script and, as the Prompt Agent, write the prompt sheet for the whole script — one shot prompt per shot, in story order, naming the characters and assets each shot needs.",
        risk: "write",
        recommended: true,
      },
    }
  }

  const missing = missingEntityNames(snapshot)
  if (missing.length) {
    return {
      key: "entities",
      title: "Characters & assets",
      summary: `The prompt sheet names ${missing.length} ${plural(missing.length, "character or asset", "characters and assets")} the project does not have yet: ${list(missing)}.`,
      nextAction: {
        id: "pipeline-entities",
        label: `Create ${missing.length} missing ${plural(missing.length, "asset")}`,
        intent: `As the Character & Asset Agent, add the characters and assets the prompt sheet needs that this project does not have yet: ${list(missing, 24)}. List the existing library first and skip everything already there — never duplicate one that exists.`,
        risk: "write",
        recommended: true,
      },
    }
  }

  const withoutArt = entitiesWithoutArt(snapshot)
  if (withoutArt.length) {
    return {
      key: "entity_images",
      title: "Reference art",
      summary: `${withoutArt.length} ${plural(withoutArt.length, "character or asset", "characters and assets")} still ${plural(withoutArt.length, "has", "have")} no reference image: ${list(withoutArt)}.`,
      nextAction: {
        id: "pipeline-entity-images",
        label: `Generate reference art for ${withoutArt.length} ${plural(withoutArt.length, "asset")}`,
        intent: `As the Character & Asset Agent, generate reference art only for the characters and assets that have none yet: ${list(withoutArt, 24)}. Leave every existing reference image alone.`,
        risk: "costly",
        recommended: true,
      },
    }
  }

  if (!snapshot.shots.length) {
    return {
      key: "storyboard",
      title: "Storyboard",
      summary: `The prompt sheet has ${snapshot.promptSheetCount} ${plural(snapshot.promptSheetCount, "shot")} and every asset it names exists with reference art. The storyboard is still empty.`,
      nextAction: {
        id: "pipeline-storyboard",
        label: `Build the storyboard (${snapshot.promptSheetCount} ${plural(snapshot.promptSheetCount, "shot")})`,
        intent: "As the Storyboard Agent, build the storyboard from the saved prompt sheet: one shot per prompt, in story order, each shot referencing only the assets its own prompt names.",
        risk: "write",
        recommended: true,
      },
    }
  }

  const keyframed = snapshot.shots.filter((shot) => shot.hasKeyframe).length
  const nextKeyframe = nextShotWithoutKeyframe(snapshot)
  if (nextKeyframe) {
    return {
      key: "keyframes",
      title: "Storyboard images",
      summary: `${keyframed} of ${snapshot.shots.length} ${plural(snapshot.shots.length, "shot")} ${plural(keyframed, "has", "have")} a keyframe. Shot ${nextKeyframe.number} is next.`,
      nextAction: {
        id: `pipeline-keyframe-${nextKeyframe.number}`,
        label: `Generate the image for shot ${nextKeyframe.number}`,
        intent: `Generate the storyboard keyframe image for shot ${nextKeyframe.number} from its saved prompt, using the reference art that shot already links to.`,
        risk: "costly",
        recommended: true,
      },
    }
  }

  const rendered = snapshot.shots.filter((shot) => shot.hasVideo).length
  const nextVideo = nextShotWithoutVideo(snapshot)
  if (nextVideo) {
    return {
      key: "videos",
      title: "Shot video",
      summary: `Every shot has a keyframe. ${rendered} of ${snapshot.shots.length} ${plural(snapshot.shots.length, "shot")} ${plural(rendered, "is", "are")} rendered. Shot ${nextVideo.number} is next.`,
      nextAction: {
        id: `pipeline-video-${nextVideo.number}`,
        label: `Generate the video for shot ${nextVideo.number}`,
        intent: `Generate the video for shot ${nextVideo.number} from its approved keyframe and saved prompt, carrying continuity from the previous shot's clip.`,
        risk: "costly",
        recommended: true,
      },
    }
  }

  return {
    key: "complete",
    title: "Review",
    summary: `All ${snapshot.shots.length} ${plural(snapshot.shots.length, "shot")} ${plural(snapshot.shots.length, "has", "have")} a keyframe and a rendered clip.`,
    nextAction: {
      id: "pipeline-review",
      label: "Review the cut for continuity",
      intent: "Review the rendered shots in order for continuity, and tell me which shots you would re-render and why.",
      risk: "read",
      recommended: true,
    },
  }
}

/**
 * The stage as the Director reads it. Written so the reply names the same step
 * the button offers, rather than the model inventing a different next move.
 */
export function pipelineInstructionBlock(snapshot: ProductionSnapshot): string {
  const stage = computePipelineStage(snapshot)
  const missing = missingEntityNames(snapshot)
  const withoutArt = entitiesWithoutArt(snapshot)
  return [
    "=== PRODUCTION PIPELINE ===",
    "Order of work: script → prompt sheet → missing characters and assets → their reference art → storyboard → keyframe images shot by shot → shot video shot by shot.",
    `Script saved: ${snapshot.hasScript ? "yes" : "no"}`,
    `Prompt sheet entries: ${snapshot.promptSheetCount}`,
    `Characters and assets: ${snapshot.entities.length} saved, ${missing.length} named by the prompt sheet but missing${missing.length ? ` (${list(missing, 24)})` : ""}, ${withoutArt.length} without reference art${withoutArt.length ? ` (${list(withoutArt, 24)})` : ""}`,
    `Storyboard: ${snapshot.shots.length} shots, ${snapshot.shots.filter((shot) => shot.hasKeyframe).length} with a keyframe, ${snapshot.shots.filter((shot) => shot.hasVideo).length} rendered`,
    `Current stage: ${stage.title} — ${stage.summary}`,
    stage.nextAction ? `The workspace is showing the user one button for the next step: "${stage.nextAction.label}". Close your reply by saying in plain language what that step will do, so pressing it is the obvious move. Never tell the user to open a tab or click through the interface themselves — you do the work when they press it.` : "",
    "Do the stage you are on, then stop and hand back. Never skip a stage, never re-create something that already exists, and never generate media for a stage the user has not reached.",
    "===========================",
  ].filter(Boolean).join("\n")
}
