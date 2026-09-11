/**
 * The HTTP half of the MCP bridge: one authenticated caller for the studio's
 * external API surface.
 *
 * Everything here goes out with a minted `aih_` token, which the server trades
 * for the user it belongs to before any row is read. That is the whole security
 * model — the bridge holds a key, never a service credential, so a tool called
 * from a chat can reach exactly what its owner could reach in their own tab.
 */

import { readFileSync } from "node:fs"

/**
 * The token is read from .env.local rather than from the MCP config, because
 * the MCP config is checked into the repository and .env.local is not. A
 * credential in a tracked file is one `git push` away from being public.
 */
function envFromLocalFile() {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    const values = {}
    for (const line of raw.split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (match) values[match[1]] = match[2].trim().replace(/^["']|["']$/g, "")
    }
    return values
  } catch {
    return {}
  }
}

const fileEnv = envFromLocalFile()
// AI_DIRECTOR_* are the names the CLI already used; both are accepted so one
// token in one place serves the CLI and the bridge.
const BASE_URL = (
  process.env.STUDIO_BASE_URL || process.env.AI_DIRECTOR_BASE_URL
  || fileEnv.STUDIO_BASE_URL || fileEnv.AI_DIRECTOR_BASE_URL
  || "http://localhost:3000"
).replace(/\/+$/, "")
const TOKEN = process.env.STUDIO_ACCESS_TOKEN || process.env.AI_DIRECTOR_TOKEN
  || fileEnv.STUDIO_ACCESS_TOKEN || fileEnv.AI_DIRECTOR_TOKEN || ""

export function requireToken() {
  if (!TOKEN) {
    throw new Error(
      "STUDIO_ACCESS_TOKEN is not set. Mint one with `node scripts/mint-studio-token.mjs <your-email>` and add it to .env.local.",
    )
  }
  return TOKEN
}

export function baseUrl() {
  return BASE_URL
}

/** A random key long enough for the tool routes, which require one per call. */
export function idempotencyKey(label = "mcp") {
  return `${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

async function readBody(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text.slice(0, 2_000) }
  }
}

export async function studioFetch(path, { method = "GET", body, formData, timeoutMs = 300_000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${requireToken()}`,
        ...(formData ? {} : { "Content-Type": "application/json" }),
      },
      body: formData || (body === undefined ? undefined : JSON.stringify(body)),
      signal: controller.signal,
    })
    const payload = await readBody(response)
    if (!response.ok) {
      const message = payload?.error || payload?.raw || `${response.status} ${response.statusText}`
      // A 401 from here is nearly always one of two fixable things, and saying
      // which saves a round of guessing at a token that is merely out of date.
      if (response.status === 401) {
        throw new Error(`${message} — the token is invalid, revoked, or minted against a different Supabase project. Check STUDIO_ACCESS_TOKEN.`)
      }
      if (response.status === 404 && /not found/i.test(String(message))) {
        throw new Error(`${message} — note that a token only opens projects owned by the user who minted it.`)
      }
      const issues = payload?.issues ? ` ${JSON.stringify(payload.issues)}` : ""
      throw new Error(`${message}${issues}`)
    }
    return payload
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`The studio did not answer within ${Math.round(timeoutMs / 1000)}s. Is the dev server running at ${BASE_URL}?`)
    }
    if (error?.cause?.code === "ECONNREFUSED") {
      throw new Error(`Nothing is listening at ${BASE_URL}. Start it with \`npm run dev\`, or point STUDIO_BASE_URL at your deployed site.`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}
