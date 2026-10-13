import { normalizeWebsiteUrl, resolvesToPublicAddress } from "./brand-website"
import { UPLOAD_MAX_BYTES, uploadMediaTypes } from "./director-upload"

/**
 * Fetching a file a user pointed at.
 *
 * An assistant working over MCP cannot hand the studio a file, only a link to
 * one, so the server goes and gets it. A link is user input that the server
 * then requests, which makes this a way to reach whatever the server can reach
 * unless it is closed off: the address is checked before every hop, redirects
 * are followed by hand so a public link cannot bounce into the private network,
 * only https is accepted, and the body is cut off at the upload limit rather
 * than trusted to be the size it claims.
 */

const MAX_REDIRECTS = 3
const FETCH_TIMEOUT_MS = 60_000

const typeByExtension: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg",
}

export class MediaImportError extends Error {
  readonly status = 400
  constructor(message: string) { super(message); this.name = "MediaImportError" }
}

function fileName(url: string) {
  const last = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "")
  return last.replace(/[^\w.\- ]+/g, "_").slice(0, 120)
}

/** The type to store it as: what the server said, or failing that, what the name says. */
function mediaType(header: string | null, url: string) {
  const declared = (header || "").split(";")[0].trim().toLowerCase()
  if (uploadMediaTypes.includes(declared)) return declared
  // Storage hosts often answer "application/octet-stream" for a perfectly
  // ordinary jpeg. The extension is believed only when the header says nothing
  // useful, never to override a header that names a type we do not accept.
  if (declared && declared !== "application/octet-stream" && declared !== "binary/octet-stream") return null
  return typeByExtension[fileName(url).split(".").pop()?.toLowerCase() || ""] || null
}

async function readCapped(response: Response, limit: number) {
  const reader = response.body?.getReader()
  if (!reader) throw new MediaImportError("That link returned no file.")
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel().catch(() => {})
      throw new MediaImportError("That file is larger than the 100MB upload limit.")
    }
    chunks.push(value)
  }
  if (!total) throw new MediaImportError("That link returned an empty file.")
  return Buffer.concat(chunks)
}

export async function fetchPublicMedia(rawUrl: string, limit = UPLOAD_MAX_BYTES) {
  if (!/^https:\/\//i.test((rawUrl || "").trim())) throw new MediaImportError("Give a public https link to the image, video or audio file.")
  const start = normalizeWebsiteUrl(rawUrl)
  if (!start) throw new MediaImportError("That is not a link this studio can fetch.")
  let current: string = start
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!current.startsWith("https://") || !(await resolvesToPublicAddress(current))) throw new MediaImportError("That link does not point to a public address.")
    let response: Response
    try {
      response = await fetch(current, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { Accept: "image/*,video/*,audio/*" } })
    } catch {
      throw new MediaImportError("That link could not be reached.")
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      const next = location ? normalizeWebsiteUrl(new URL(location, current).toString()) : null
      if (!next) throw new MediaImportError("That link redirects somewhere this studio cannot follow.")
      current = next
      continue
    }
    if (!response.ok) throw new MediaImportError(`That link answered with an error (${response.status}). It may need a sign-in, or have expired.`)
    const contentType = mediaType(response.headers.get("content-type"), current)
    if (!contentType) throw new MediaImportError("That link is not an image, video or audio file this studio accepts (png, jpg, webp, gif, mp4, webm, mov, mp3, m4a, wav, ogg). A web page that shows a picture is not the picture itself: use the file's own link.")
    if (Number(response.headers.get("content-length") || 0) > limit) throw new MediaImportError("That file is larger than the 100MB upload limit.")
    const bytes = await readCapped(response, limit)
    return { bytes, contentType, name: fileName(current) || "upload" }
  }
  throw new MediaImportError("That link redirects too many times.")
}
