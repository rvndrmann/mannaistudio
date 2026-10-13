/**
 * Whether the code is running somewhere it may wait.
 *
 * The app's own host stops a request after a short, fixed time, so nothing
 * there can sit out a provider's per-minute limit. The background worker has
 * fifteen minutes, and says so here on its way in; everything else reads the
 * default and behaves as it always has.
 */
let longBudget = false

export function allowLongWaits() {
  longBudget = true
}

export function mayWaitLong() {
  return longBudget
}
