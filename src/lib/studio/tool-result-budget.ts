/**
 * What a tool result is allowed to cost the conversation.
 *
 * Every tool result was pushed into the model context whole, and the context is
 * re-sent on every step of a loop that runs up to ten of them. One
 * list_storyboard_shots over a fifty-shot episode is a megabyte of JSON — each
 * shot carries a prompt of up to twenty thousand characters and a video prompt
 * beside it — and the turn then pays for that megabyte nine more times. Since
 * chat turns started being metered, that is the user's money.
 *
 * So an oversized result is cut down to its head and its tail with a marker
 * between them saying what was removed and how to read it. Head and tail rather
 * than a plain truncation because both ends carry meaning: the head holds the
 * shape of the result and its first rows, the tail holds the counts, ids and
 * error fields that JSON puts last.
 *
 * Nothing is lost. The full result is already written to
 * creator_workflow_steps.output before this runs, and read_tool_output reads it
 * back a slice at a time.
 */

/** The point past which a result is worth cutting at all. */
const DEFAULT_THRESHOLD = 8_192
const DEFAULT_HEAD = 4_096
const DEFAULT_TAIL = 1_024

export type PruneOptions = {
  threshold?: number
  head?: number
  tail?: number
  /** Named in the marker so the model knows which step to read back. */
  stepSequence?: number
}

export type PrunedToolOutput = {
  output: string
  pruned: boolean
  /** Code points removed, zero when nothing was. */
  omitted: number
}

/**
 * Tools whose whole point is that the model reads the document.
 *
 * A master prompt cut to four thousand characters is a master prompt with its
 * timeline missing, and every shot extracted from it afterwards is extracted
 * from a document the model only half saw. These get a budget large enough to
 * carry the real thing, and are still capped so a runaway script cannot take
 * the context on its own.
 */
const TOOL_BUDGETS: Record<string, PruneOptions> = {
  read_episode_master_prompt: { threshold: 60_000, head: 56_000, tail: 4_000 },
  read_episode_script: { threshold: 60_000, head: 56_000, tail: 4_000 },
  search_episode_script: { threshold: 24_000, head: 20_000, tail: 4_000 },
  read_script_prompts: { threshold: 24_000, head: 20_000, tail: 4_000 },
}

export function budgetForTool(tool: string): PruneOptions {
  return TOOL_BUDGETS[tool] || {}
}

/**
 * The marker left in place of what was cut.
 *
 * It has to be recognisable on sight, because finding it again is what makes a
 * second pass a no-op — see the idempotency note in pruneToolOutput.
 */
const MARKER_OPEN = "\n\n…[«"
const MARKER_CLOSE = "»]…\n\n"

function marker(omitted: number, stepSequence?: number) {
  const how = typeof stepSequence === "number"
    ? ` Call read_tool_output with stepSequence ${stepSequence} to read any of it.`
    : ""
  return `${MARKER_OPEN}${omitted} characters omitted here to keep the conversation affordable.${how}${MARKER_CLOSE}`
}

/** Whether this text has already been through the pruner. */
export function isPruned(output: string): boolean {
  return output.includes(MARKER_OPEN) && output.includes(MARKER_CLOSE)
}

/**
 * Cuts an oversized serialized tool result down to a head, a marker and a tail.
 *
 * Counted in code points rather than UTF-16 units. A JavaScript string index
 * falls between the two halves of a surrogate pair, so slicing an emoji or a
 * CJK extension character by `.length` produces a lone surrogate — which is not
 * valid text, reaches the provider as a replacement character, and in a JSON
 * payload can break the parse outright.
 *
 * Idempotent by design. A result that already carries the marker is returned
 * untouched, so replaying a stored conversation through the pruner cannot cut
 * it a second time and cannot produce a marker inside a marker.
 */
export function pruneToolOutput(output: string, options: PruneOptions = {}): PrunedToolOutput {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD
  const head = options.head ?? DEFAULT_HEAD
  const tail = options.tail ?? DEFAULT_TAIL

  if (isPruned(output)) return { output, pruned: false, omitted: 0 }

  const points = Array.from(output)
  if (points.length <= threshold) return { output, pruned: false, omitted: 0 }

  // A budget wider than the text itself would "cut" nothing while still
  // stamping a marker on it, which reads as data loss that did not happen.
  if (head + tail >= points.length) return { output, pruned: false, omitted: 0 }

  const omitted = points.length - head - tail
  const kept = `${points.slice(0, head).join("")}${marker(omitted, options.stepSequence)}${points.slice(points.length - tail).join("")}`
  return { output: kept, pruned: true, omitted }
}

/**
 * Serializes a tool result and prunes it in one step, which is the only way the
 * agent loop ever needs it.
 *
 * A result that cannot be serialized at all must not lose the turn: the model
 * is told the tool succeeded but its output could not be carried, which is both
 * true and something it can act on.
 */
export function serializeToolOutput(result: unknown, options: PruneOptions & { tool?: string } = {}): PrunedToolOutput {
  let serialized: string
  try {
    serialized = JSON.stringify(result) ?? "null"
  } catch {
    return { output: JSON.stringify({ note: "This tool succeeded but its output could not be carried into the conversation." }), pruned: false, omitted: 0 }
  }
  return pruneToolOutput(serialized, { ...budgetForTool(options.tool || ""), ...options })
}
