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
  /**
   * A generation already running for this shot. The card must not offer to
   * generate what is being generated: the shot has no keyframe yet, so on state
   * alone it reads as the obvious next step, and pressing it pays for the same
   * frame twice.
   */
  imageInFlight?: boolean
  videoInFlight?: boolean
  /** Passed over at the user's request; not work the pipeline should offer. */
  skipped?: boolean
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
  /**
   * The other moves that make sense from here — finish the rest of the images
   * in one batch, start a clip on a shot whose frame is already approved. Shown
   * beside the primary step so a user who has just watched one shot finish does
   * not have to type the next request from scratch.
   */
  alternatives: PipelineAction[]
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

/** Shots that need a keyframe and are not already having one made. */
export function shotsAwaitingKeyframe(snapshot: ProductionSnapshot): SnapshotShot[] {
  return snapshot.shots.filter((shot) => shot.hasPrompt && !shot.hasKeyframe && !shot.imageInFlight && !shot.skipped)
}

/** Shots whose keyframe is ready, with no clip and none being rendered. */
export function shotsAwaitingVideo(snapshot: ProductionSnapshot): SnapshotShot[] {
  return snapshot.shots.filter((shot) => shot.hasKeyframe && !shot.hasVideo && !shot.videoInFlight && !shot.skipped)
}

/** Shots with a generation running right now, for the "still rendering" line. */
export function shotsInFlight(snapshot: ProductionSnapshot): SnapshotShot[] {
  return snapshot.shots.filter((shot) => shot.imageInFlight || shot.videoInFlight)
}

/** What the production still owes, in one phrase for the summary line. */
export function remainingWork(snapshot: ProductionSnapshot): string {
  const images = shotsAwaitingKeyframe(snapshot).length
  const videos = snapshot.shots.filter((shot) => !shot.hasVideo).length
  if (!images && !videos) return "Nothing is outstanding."
  return `${images} ${plural(images, "image")} and ${videos} ${plural(videos, "video")} still to generate.`
}

export function entitiesWithoutArt(snapshot: ProductionSnapshot): string[] {
  return snapshot.entities.filter((entity) => !entity.hasReferenceImage).map((entity) => entity.name)
}

/** The lowest-numbered shot still missing its keyframe, or null. */
export function nextShotWithoutKeyframe(snapshot: ProductionSnapshot): SnapshotShot | null {
  return shotsAwaitingKeyframe(snapshot)[0] || null
}

/**
 * The lowest-numbered shot still missing its clip. A shot is only ready for
 * video once its keyframe exists, because the clip is generated from the frame
 * the user already accepted.
 */
export function nextShotWithoutVideo(snapshot: ProductionSnapshot): SnapshotShot | null {
  return shotsAwaitingVideo(snapshot)[0] || null
}

/**
 * The same snapshot with certain shots passed over.
 *
 * "Skip shot 6 and continue" names a shot in order to exclude it, which is the
 * opposite of naming one to work on. Marking it here keeps the decision in the
 * state rather than in the phrasing of whatever comes next.
 */
export function withSkippedShots(snapshot: ProductionSnapshot, numbers: number[]): ProductionSnapshot {
  if (!numbers.length) return snapshot
  const skip = new Set(numbers)
  return { ...snapshot, shots: snapshot.shots.map((shot) => skip.has(shot.number) ? { ...shot, skipped: true } : shot) }
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
      alternatives: [],
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
      alternatives: [],
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
      alternatives: [],
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
      alternatives: [],
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
      alternatives: [],
    }
  }

  const keyframed = snapshot.shots.filter((shot) => shot.hasKeyframe).length
  const rendered = snapshot.shots.filter((shot) => shot.hasVideo).length
  const awaitingKeyframe = shotsAwaitingKeyframe(snapshot)
  const awaitingVideo = shotsAwaitingVideo(snapshot)
  const nextKeyframe = awaitingKeyframe[0] || null
  const nextVideo = awaitingVideo[0] || null

  // A shot whose frame is already approved can be filmed now. Offering that
  // beside the images means a user who wants one shot finished end to end does
  // not have to wait for every keyframe first, or ask for it by hand.
  const videoAction = (shot: SnapshotShot): PipelineAction => ({
    id: `pipeline-video-${shot.number}`,
    label: `Generate the video for shot ${shot.number}`,
    intent: `Generate the video for shot ${shot.number} from its approved keyframe and saved prompt, carrying continuity from the previous shot's clip.`,
    risk: "costly",
    recommended: false,
  })

  if (nextKeyframe) {
    return {
      key: "keyframes",
      title: "Storyboard images",
      summary: `${keyframed} of ${snapshot.shots.length} ${plural(snapshot.shots.length, "shot")} ${plural(keyframed, "has", "have")} a keyframe and ${rendered} ${plural(rendered, "is", "are")} rendered. ${remainingWork(snapshot)} Shot ${nextKeyframe.number} is the next image.`,
      nextAction: {
        id: `pipeline-keyframe-${nextKeyframe.number}`,
        label: `Generate the image for shot ${nextKeyframe.number}`,
        intent: `Generate the storyboard keyframe image for shot ${nextKeyframe.number} from its saved prompt, using the reference art that shot already links to.`,
        risk: "costly",
        recommended: true,
      },
      alternatives: [
        ...(awaitingKeyframe.length > 1 ? [{
          id: "pipeline-keyframes-remaining",
          label: `Generate the remaining ${awaitingKeyframe.length} images`,
          intent: `Generate the storyboard keyframe images for shot ${awaitingKeyframe.map((shot) => shot.number).join(", ")} from their saved prompts, each using the reference art its own shot links to.`,
          risk: "costly" as const,
          recommended: false,
        }] : []),
        ...(nextVideo ? [videoAction(nextVideo)] : []),
      ],
    }
  }

  if (nextVideo) {
    return {
      key: "videos",
      title: "Shot video",
      summary: `Every shot has a keyframe. ${rendered} of ${snapshot.shots.length} ${plural(snapshot.shots.length, "shot")} ${plural(rendered, "is", "are")} rendered. ${remainingWork(snapshot)} Shot ${nextVideo.number} is next.`,
      nextAction: { ...videoAction(nextVideo), recommended: true },
      alternatives: awaitingVideo.length > 1
        ? [{
          id: "pipeline-videos-remaining",
          label: `Generate the remaining ${awaitingVideo.length} videos`,
          intent: `Generate the videos for shot ${awaitingVideo.map((shot) => shot.number).join(", ")} from their approved keyframes and saved prompts.`,
          risk: "costly" as const,
          recommended: false,
        }]
        : [],
    }
  }

  // Nothing left to offer, but the workspace is still working. Falling through
  // to "Review" here would announce a finished episode over shots that are
  // mid-render, and offering the shot being rendered would charge for it twice.
  const inFlight = shotsInFlight(snapshot)
  if (inFlight.length) {
    const numbers = inFlight.map((shot) => shot.number)
    return {
      key: "keyframes",
      title: "Generating",
      summary: `Shot ${numbers.join(", ")} ${plural(numbers.length, "is", "are")} generating now. ${remainingWork(snapshot)} Nothing to start until ${plural(numbers.length, "it lands", "they land")}.`,
      nextAction: null,
      alternatives: [],
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
    alternatives: [],
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
    `Outstanding: ${remainingWork(snapshot)}`,
    stage.alternatives.length
      ? `Also offered beside it: ${stage.alternatives.map((action) => `"${action.label}"`).join(", ")}.`
      : "",
    stage.nextAction ? `The workspace is showing the user a button for the next step: "${stage.nextAction.label}". Close your reply by saying what you just finished, what is still outstanding, and what that step will do, so pressing it is the obvious move. Never tell the user to open a tab or click through the interface themselves — you do the work when they press it.` : "",
    "Do the stage you are on, then stop and hand back. Never skip a stage, never re-create something that already exists, and never generate media for a stage the user has not reached.",
    "===========================",
  ].filter(Boolean).join("\n")
}
