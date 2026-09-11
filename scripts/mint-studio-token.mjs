#!/usr/bin/env node
/**
 * Mints an external access token for the MCP bridge.
 *
 * The in-app route that does this authenticates with a browser cookie, and the
 * account signs in with Google, so there is no password to hand a script. This
 * takes the service-role key from .env.local instead, finds the user by email,
 * and writes the same row the route would — the key never leaves the machine
 * and the token it prints is scoped, revocable, and tied to that one user.
 *
 *   node scripts/mint-studio-token.mjs you@example.com
 */

import { createHash, randomBytes } from "node:crypto"
import { readFile } from "node:fs/promises"
import { createClient } from "@supabase/supabase-js"

const SCOPES = ["director:chat", "director:tools", "director:uploads", "director:proposals", "projects:read"]

async function loadEnv() {
  const raw = await readFile(new URL("../.env.local", import.meta.url), "utf8").catch(() => "")
  for (const line of raw.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "")
    }
  }
}

async function main() {
  const email = process.argv[2]
  if (!email) {
    console.error("Usage: node scripts/mint-studio-token.mjs <account-email> [token name]")
    process.exit(1)
  }
  await loadEnv()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local")
    process.exit(1)
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  // listUsers pages; the account is nearly always on the first page, but a
  // silent miss here would read as "no such user" for a user that exists.
  let user = null
  for (let page = 1; page <= 20 && !user; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    if (!data.users.length) break
    user = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase()) || null
  }
  if (!user) {
    console.error(`No account found for ${email}. Sign in to the studio once with that address first.`)
    process.exit(1)
  }

  const token = `aih_${randomBytes(32).toString("base64url")}`
  const { error } = await supabase.from("creator_external_access_tokens").insert({
    user_id: user.id,
    name: process.argv[3] || "Claude Code MCP",
    token_hash: createHash("sha256").update(token).digest("hex"),
    token_prefix: token.slice(0, 12),
    scopes: SCOPES,
  })
  if (error) throw error

  console.log(`\nToken for ${email} (${user.id}):\n\n${token}\n`)
  console.log("Put it in .mcp.json as STUDIO_ACCESS_TOKEN. It is shown once — the database keeps only a hash.")
  console.log("Revoke it any time by setting revoked_at on its row in creator_external_access_tokens.\n")
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
