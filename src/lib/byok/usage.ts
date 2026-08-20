export type TokenCounts = { input_tokens?: number; output_tokens?: number; total_tokens?: number }

/**
 * Adds one model round trip's token counts onto the running total for a turn.
 *
 * A Director turn is six or seven round trips, each carrying a context that
 * grows as it goes. Keeping only the last one's usage — which is what assigning
 * rather than adding does — reports a fraction of what the turn cost, and any
 * metering built on it undercharges by roughly that factor while looking
 * perfectly reasonable.
 */
export function addTokenUsage(total: Record<string, unknown>, step: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!step) return total
  const sum = (key: string) => (Number(total[key]) || 0) + (Number(step[key]) || 0)
  return {
    ...total,
    ...step,
    input_tokens: sum("input_tokens"),
    output_tokens: sum("output_tokens"),
    total_tokens: sum("total_tokens"),
  }
}

/** Whether a provider actually told us what a turn cost. */
export function hasTokenCounts(usage: Record<string, unknown> | undefined): boolean {
  if (!usage) return false
  return (Number(usage.input_tokens) || 0) + (Number(usage.output_tokens) || 0) > 0
}
