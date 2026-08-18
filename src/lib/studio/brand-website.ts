import { lookup } from "node:dns/promises"

/**
 * Reading the brand's own website.
 *
 * The strategist kept asking a brand to describe products that are already
 * written on their home page. The site is the one source they maintain
 * themselves, so it is read once, stored on the brand, and handed to the agents
 * as reference — which also means a stale snapshot is visibly stale rather than
 * quietly wrong.
 *
 * Everything the fetch returns is treated as untrusted: it is somebody's HTML,
 * and on a compromised or hostile page it is somebody else's HTML.
 */

export const websiteFetchTimeoutMs = 8_000
export const websitePageLimit = 5
export const websiteMaxBytes = 2 * 1024 * 1024
/** Room for the whole site inside the briefing without crowding out the brand record. */
export const websiteSnapshotLimit = 12_000
const perPageLimit = 3_000
/** A snapshot older than this is re-read the next time an agent runs. */
export const websiteStaleAfterMs = 7 * 24 * 60 * 60 * 1000

export type WebsitePage = { url: string; title: string; text: string }

/**
 * Hosts that must never be fetched. A brand's website URL is user input that
 * the server then requests, which is a server-side request forgery hole unless
 * the private network is closed off: cloud metadata endpoints and internal
 * services sit on exactly these ranges.
 */
const blockedHostnames = new Set(["localhost", "metadata.google.internal", "instance-data"])

export function isBlockedAddress(address: string): boolean {
  const value = address.trim().toLowerCase()
  if (!value) return true
  // IPv6 loopback, unique-local, and link-local.
  if (value === "::" || value === "::1") return true
  if (/^f[cd][0-9a-f]{2}:/.test(value)) return true
  if (/^fe[89ab][0-9a-f]:/.test(value)) return true
  // IPv4-mapped IPv6 is still an IPv4 address for our purposes.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value)
  const candidate = mapped ? mapped[1] : value
  const octets = candidate.split(".")
  if (octets.length !== 4) return false
  const [a, b] = octets.map((part) => Number(part))
  if (!Number.isInteger(a) || !Number.isInteger(b)) return true
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a >= 224) return true
  return false
}

/** A fetchable public http(s) URL, or null. */
export function normalizeWebsiteUrl(value: string): string | null {
  const trimmed = (value || "").trim()
  if (!trimmed) return null
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  const hostname = url.hostname.toLowerCase()
  if (!hostname || !hostname.includes(".") && hostname !== "localhost") return null
  if (blockedHostnames.has(hostname) || hostname.endsWith(".localhost") || hostname.endsWith(".internal")) return null
  // A literal private address needs no DNS round trip to reject.
  if (/^[\d.]+$/.test(hostname) || hostname.includes(":")) {
    if (isBlockedAddress(hostname)) return null
  }
  url.hash = ""
  return url.toString()
}

/** Rejects a host whose DNS points into the private network. */
export async function resolvesToPublicAddress(urlValue: string): Promise<boolean> {
  try {
    const { hostname } = new URL(urlValue)
    if (/^[\d.]+$/.test(hostname)) return !isBlockedAddress(hostname)
    const addresses = await lookup(hostname, { all: true })
    if (!addresses.length) return false
    return addresses.every((entry) => !isBlockedAddress(entry.address))
  } catch {
    return false
  }
}

const BLOCK_ELEMENTS = /<\/(p|div|section|article|h[1-6]|li|tr|br)>/gi

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
}

export function extractPageTitle(html: string): string {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
  const ogTitle = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]
  return decodeEntities((title || ogTitle || "").replace(/\s+/g, " ").trim()).slice(0, 200)
}

export function extractMetaDescription(html: string): string {
  const description =
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1] ||
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1] ||
    ""
  return decodeEntities(description.replace(/\s+/g, " ").trim()).slice(0, 500)
}

/**
 * Turns a page into the words a reader would see.
 *
 * Scripts, styles, and templates are removed before tags are stripped —
 * otherwise a site's inline JSON state ends up in the briefing as thousands of
 * tokens of noise the agent then tries to reason about.
 */
export function extractReadableText(html: string): string {
  const withoutCode = (html || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe)[^>]*>[\s\S]*?<\/\1>/gi, " ")
  const spaced = withoutCode.replace(BLOCK_ELEMENTS, "\n")
  const stripped = spaced.replace(/<[^>]+>/g, " ")
  return decodeEntities(stripped)
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Pages worth reading after the home page, most descriptive first. */
const PREFERRED_PATHS = /(about|product|service|shop|collection|pricing|story|brand|work|menu)/i

/**
 * Pages that describe nobody's brand. A sign-in page returns a redirect stub of
 * a few dozen characters and a terms page returns a lawyer's boilerplate, and
 * either one costs a slot that the product pages needed.
 */
const SKIPPED_PATHS = /(^|\/)(login|signin|sign-in|signup|sign-up|register|logout|auth|cart|checkout|account|profile|settings|admin|privacy|terms|refund|legal|cookie)/i

export function discoverPageLinks(html: string, baseUrl: string, limit = websitePageLimit - 1): string[] {
  let origin: URL
  try {
    origin = new URL(baseUrl)
  } catch {
    return []
  }
  const found = new Map<string, boolean>()
  const pattern = /<a[^>]+href=["']([^"'#]+)["']/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html))) {
    let link: URL
    try {
      link = new URL(match[1], origin)
    } catch {
      continue
    }
    // Same site only. Following a link off-origin would read somebody else's
    // pages into this brand's briefing.
    if (link.hostname !== origin.hostname) continue
    if (link.protocol !== "http:" && link.protocol !== "https:") continue
    if (/\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|mp3|css|js)$/i.test(link.pathname)) continue
    if (SKIPPED_PATHS.test(link.pathname)) continue
    link.hash = ""
    const href = link.toString()
    if (href === baseUrl || found.has(href)) continue
    found.set(href, PREFERRED_PATHS.test(link.pathname))
  }

  const entries = Array.from(found.entries())
  const preferred = entries.filter(([, isPreferred]) => isPreferred).map(([href]) => href)
  const rest = entries.filter(([, isPreferred]) => !isPreferred).map(([href]) => href)
  return [...preferred, ...rest].slice(0, Math.max(0, limit))
}

/**
 * The website block the agents read.
 *
 * It opens by saying what this text is, because the pages are fetched from the
 * open internet: anything inside can claim to be an instruction, and the only
 * safe reading of it is as a description of the brand.
 */
export function buildWebsiteSnapshot(pages: WebsitePage[]): string {
  if (!pages.length) return ""
  const lines: string[] = []
  let budget = websiteSnapshotLimit
  for (const page of pages) {
    if (budget <= 0) break
    const body = page.text.slice(0, Math.min(perPageLimit, budget)).trim()
    if (!body) continue
    const header = page.title ? `## ${page.title} — ${page.url}` : `## ${page.url}`
    lines.push(header, body, "")
    budget -= body.length + header.length
  }
  return lines.join("\n").trim()
}

export function websiteSnapshotIsStale(fetchedAt: string | null | undefined, now = Date.now()): boolean {
  if (!fetchedAt) return true
  const timestamp = Date.parse(fetchedAt)
  if (Number.isNaN(timestamp)) return true
  return now - timestamp > websiteStaleAfterMs
}

export type WebsiteReadResult = { pages: WebsitePage[]; snapshot: string; error: string }

const USER_AGENT = "AIDirectorHub-BrandReader/1.0 (+brand website reader)"
const MAX_REDIRECTS = 3

/**
 * Fetches one page, following redirects by hand.
 *
 * fetch follows them itself, which would let a public URL redirect the server
 * into the private network — the check on the address the user typed says
 * nothing about where hop three lands. Each hop is re-validated instead.
 */
async function fetchPage(startUrl: string): Promise<{ url: string; html: string } | null> {
  let current = startUrl
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!(await resolvesToPublicAddress(current))) return null
    let response: Response
    try {
      response = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(websiteFetchTimeoutMs),
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      })
    } catch {
      return null
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location) return null
      const next = normalizeWebsiteUrl(new URL(location, current).toString())
      if (!next) return null
      current = next
      continue
    }

    if (!response.ok) return null
    const contentType = (response.headers.get("content-type") || "").toLowerCase()
    if (contentType && !contentType.includes("html") && !contentType.includes("text/plain")) return null
    const declared = Number(response.headers.get("content-length") || 0)
    if (declared > websiteMaxBytes) return null

    const buffer = await response.arrayBuffer()
    if (buffer.byteLength > websiteMaxBytes) return null
    return { url: current, html: new TextDecoder().decode(buffer) }
  }
  return null
}

/**
 * Reads the brand's site: the page they gave, plus the handful of same-site
 * pages that usually carry the product and positioning copy.
 */
export async function readBrandWebsite(rawUrl: string, options?: { pageLimit?: number }): Promise<WebsiteReadResult> {
  const home = normalizeWebsiteUrl(rawUrl)
  if (!home) {
    return { pages: [], snapshot: "", error: "That is not a public website address we can read." }
  }

  const first = await fetchPage(home)
  if (!first) {
    return { pages: [], snapshot: "", error: "The website did not respond, or returned something we could not read." }
  }

  const description = extractMetaDescription(first.html)
  const homeText = [description, extractReadableText(first.html)].filter(Boolean).join("\n\n")
  const pages: WebsitePage[] = [{ url: first.url, title: extractPageTitle(first.html), text: homeText }]

  const limit = Math.max(1, options?.pageLimit ?? websitePageLimit)
  for (const link of discoverPageLinks(first.html, first.url, limit - 1)) {
    if (pages.length >= limit) break
    const page = await fetchPage(link)
    if (!page) continue
    const text = extractReadableText(page.html)
    if (!text) continue
    pages.push({ url: page.url, title: extractPageTitle(page.html), text })
  }

  return { pages, snapshot: buildWebsiteSnapshot(pages), error: "" }
}
