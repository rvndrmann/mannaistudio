/**
 * Reads a generation response the host answered instead of the route.
 *
 * A render is held open on the request that started it, and a function that
 * runs past the host's budget is killed mid-call — the browser is answered by
 * the platform's own error page, which is HTML. `response.json()` on that
 * rejects with the parser's complaint about the first few characters of the
 * markup, and the generation call sites put that string on screen as the reason
 * the render failed:
 *
 *     Unexpected token '<', "<HTML> <HE"... is not valid JSON
 *
 * Which is not a reason. It names neither what happened to the render nor what
 * became of the credits, and it reads as a fault in the picture rather than a
 * request that never reached an answer. Parsing is done here, once, so a body
 * that is not JSON becomes a sentence about the request instead.
 */
export type GenerationResponseBody = {
  error?: string
  jobId?: string
  creditBalance?: number
  path?: string
  imageUrl?: string
  inputImages?: string[]
  [field: string]: unknown
}

export async function readGenerationResponse(response: Response): Promise<GenerationResponseBody> {
  const body = await response.text()
  try {
    if (!body.trim()) throw new Error("empty body")
    return JSON.parse(body) as GenerationResponseBody
  } catch {
    throw new Error(unreadableResponseMessage(response.status))
  }
}

/**
 * What to tell the user when the body could not be read as JSON.
 *
 * A 5xx here is the host, not the route: every error this API raises itself is
 * JSON, so an unparseable one means the function was killed or never ran. The
 * workspace does recover from that on its own — a render still going at the
 * provider is picked up by the job poll, and one that is not is settled and
 * refunded by the stalled-job sweep — so say so, rather than leaving the user
 * to guess whether to pay for the render again.
 */
export function unreadableResponseMessage(status: number): string {
  if (status >= 500) {
    return `The server closed this request before the render answered (HTTP ${status}) — it ran longer than the host allows. A render still going at the provider appears here when it finishes; one that is not is settled and its credits returned within a few minutes.`
  }
  return `The server answered with something other than JSON (HTTP ${status}), so nothing here can say what happened to this render.`
}
