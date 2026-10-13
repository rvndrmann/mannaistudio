/**
 * Work that has to outlive the request that started it.
 *
 * A render is started by a request that answers at once and leaves the render
 * running. On a serverless host the function is frozen the moment the response
 * is sent, so "leaves it running" meant the first job stopped part-way through
 * and sat at "processing" until it was written off six minutes later.
 *
 * The host can be asked to keep the function alive until a promise settles,
 * but only by its own API, and this module is also bundled for a runtime that
 * has no such API. So the request handler says how to keep work alive, here,
 * and everything else calls runInBackground without knowing which host it is on.
 */

type KeepAlive = (work: Promise<unknown>) => void

let keepAlive: KeepAlive | null = null

export function setBackgroundKeepAlive(next: KeepAlive | null) {
  keepAlive = next
}

export function runInBackground(work: Promise<unknown>) {
  // A rejection nobody is waiting for would otherwise be an unhandled one.
  const settled = work.catch((error) => { console.warn("Background work failed:", error instanceof Error ? error.message : error) })
  if (!keepAlive) return
  try { keepAlive(settled) } catch { /* outside a request: the work still runs, unextended */ }
}
