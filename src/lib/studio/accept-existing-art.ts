/**
 * Accepting the art that is already there.
 *
 * Staleness is a comparison: an entity's art is stale when the description no
 * longer matches the one recorded at generation time, and a keyframe is stale
 * when the shot's prompt no longer matches the prompt it was made from. That
 * comparison had exactly one way to come out even — generate again — because
 * the recorded description was only ever written by a generation.
 *
 * So a user looking at art they are happy with, whose description they tweaked
 * a word of, had no way to say so. The pipeline offered "Regenerate art for X ·
 * uses credits" and kept offering it. Saying "these are good enough, move on"
 * in chat did nothing to the stored state, so the reply said finalised while
 * the button still asked for money — the workspace arguing with itself, which
 * is the failure the pipeline was built to avoid.
 *
 * Accepting records the current text as the text the existing art was made
 * from. It generates nothing and costs nothing; it is the user saying the
 * picture already answers the description.
 */

export type AcceptedProvenance = Record<string, unknown>

/**
 * The entity metadata to write so its current art reads as current.
 *
 * `source_description` is the exact test `artIsStale` applies first, so setting
 * it to the description as it stands settles the question outright rather than
 * leaving the prompt-fragment fallback to guess.
 */
export function metadataAcceptingEntityArt(metadata: unknown, description: string, at = new Date()): AcceptedProvenance {
  const base = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {}
  const generation = base.image_generation && typeof base.image_generation === "object" && !Array.isArray(base.image_generation)
    ? base.image_generation as Record<string, unknown>
    : {}
  return {
    ...base,
    image_generation: {
      ...generation,
      status: "completed",
      source_description: description.trim(),
      // Kept so the record shows this art was accepted rather than rendered
      // from the description it now claims to match.
      accepted_at: at.toISOString(),
    },
  }
}

/**
 * The shot metadata to write so its current keyframe reads as current.
 *
 * `keyframeIsStale` compares the shot's prompt against `image_generation.prompt`,
 * and treats a missing one as nothing to judge — so accepting sets it to the
 * prompt the shot has now.
 */
export function metadataAcceptingKeyframe(metadata: unknown, prompt: string, at = new Date()): AcceptedProvenance {
  const base = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {}
  const generation = base.image_generation && typeof base.image_generation === "object" && !Array.isArray(base.image_generation)
    ? base.image_generation as Record<string, unknown>
    : {}
  return {
    ...base,
    image_generation: {
      ...generation,
      prompt: prompt.trim(),
      accepted_at: at.toISOString(),
    },
  }
}
