import { createClient } from "@/lib/supabase/client"

/**
 * Signs storage paths in batches, with a cache.
 *
 * Every thumbnail used to sign its own URL. Opening a workspace with a
 * generation strip, a reference row, and an asset grid fired dozens of
 * concurrent requests, each needing the Supabase auth token — and supabase-js
 * steals its own web lock to break a stalled refresh, so the losing callers
 * rejected and their images silently stayed blank until a reload warmed the
 * token. Collecting the paths requested in the same tick into one
 * createSignedUrls call removes the contention rather than tolerating it.
 */
const BUCKET = "creator-studio-media"
const TTL_SECONDS = 60 * 60
// Re-sign a little before expiry so a long-open workspace never shows a
// silently dead URL.
const REFRESH_MARGIN_MS = 5 * 60 * 1000

const cache = new Map<string, { url: string; expiresAt: number }>()
const inFlight = new Map<string, Promise<string | null>>()
let queue: string[] = []
let scheduled: Promise<void> | null = null

function isDirectUrl(path: string) {
  return /^https?:\/\//i.test(path) || /^blob:/i.test(path) || /^data:/i.test(path)
}

async function flush() {
  const paths = Array.from(new Set(queue))
  queue = []
  scheduled = null
  if (!paths.length) return
  const resolve = (path: string, url: string | null) => {
    if (url) cache.set(path, { url, expiresAt: Date.now() + TTL_SECONDS * 1000 })
    resolvers.get(path)?.forEach((fn) => fn(url))
    resolvers.delete(path)
    inFlight.delete(path)
  }
  try {
    // Supabase caps a batch; chunk so a large grid still resolves in one pass.
    for (let index = 0; index < paths.length; index += 100) {
      const chunk = paths.slice(index, index + 100)
      const { data, error } = await createClient().storage.from(BUCKET).createSignedUrls(chunk, TTL_SECONDS)
      if (error || !data) {
        for (const path of chunk) resolve(path, null)
        continue
      }
      const signed = new Map(data.map((entry) => [entry.path || "", entry.signedUrl || ""]))
      for (const path of chunk) resolve(path, signed.get(path) || null)
    }
  } catch {
    for (const path of paths) resolve(path, null)
  }
}

const resolvers = new Map<string, Array<(url: string | null) => void>>()

export function getSignedMediaUrl(path: string): Promise<string | null> {
  if (!path) return Promise.resolve(null)
  if (isDirectUrl(path)) return Promise.resolve(path)

  const cached = cache.get(path)
  if (cached && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) return Promise.resolve(cached.url)

  const existing = inFlight.get(path)
  if (existing) return existing

  const promise = new Promise<string | null>((resolveOne) => {
    const list = resolvers.get(path) || []
    list.push(resolveOne)
    resolvers.set(path, list)
  })
  inFlight.set(path, promise)
  queue.push(path)
  // Batch everything requested in this tick, then sign it in one request.
  if (!scheduled) scheduled = Promise.resolve().then(flush)
  return promise
}

/** Drops a cached signature so freshly written media is re-signed on next read. */
export function forgetSignedMediaUrl(path: string) {
  cache.delete(path)
  inFlight.delete(path)
}

/**
 * Downloads media to disk under a real filename.
 *
 * A storage path is not a URL, so an anchor pointing at one navigates nowhere,
 * and the `download` attribute is ignored across origins anyway — the signed
 * URL lives on Supabase. Fetching the bytes and handing the browser a blob is
 * what actually saves the file with the name we choose.
 */
export async function downloadSignedMedia(path: string, filename?: string) {
  const url = await getSignedMediaUrl(path)
  if (!url) throw new Error("This file could not be prepared for download.")
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Download failed (${response.status}).`)
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = objectUrl
  anchor.download = filename || path.split("/").pop() || "download"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoked on the next tick so the click has already been handled.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}
