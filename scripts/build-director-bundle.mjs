/**
 * Builds the Director turn for the Deno runtime the Edge Function uses.
 *
 * Deno cannot read this project's TypeScript directly — extensionless imports
 * and the `@/` alias are both Node conventions — so the turn is bundled into
 * one ES module the function imports. The dependencies Deno can fetch itself
 * are left external and mapped to `npm:` specifiers by the function's
 * deno.json, which keeps the bundle to this project's own code.
 *
 * Two modules are replaced rather than bundled, both because they are Next.js
 * facts rather than turn logic: `server-only` guards a client bundle that does
 * not exist here, and the cookie-reading Supabase client has no request to read
 * cookies from.
 *
 * Run: node scripts/build-director-bundle.mjs
 */
import { build } from "esbuild"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const out = resolve(root, "supabase/functions/director-chat/_turn.js")

// Left for Deno to fetch. Everything else is this project's own code and is
// bundled, so the function has no install step and no node_modules.
const external = [
  "zod",
  "@supabase/supabase-js",
  "@google/genai",
  "@fal-ai/client",
  // Every Node builtin, not a list of the ones seen so far: Deno implements
  // them under the same specifiers, and enumerating them means the build breaks
  // the first time the turn reaches for one more.
  "node:*",
]

await build({
  entryPoints: [resolve(root, "src/lib/studio/director-edge-entry.ts")],
  outfile: out,
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  mainFields: ["module", "main"],
  conditions: ["import", "module", "default"],
  external,
  alias: {
    "server-only": resolve(root, "supabase/functions/_shims/server-only.ts"),
    "@/lib/supabase/server": resolve(root, "supabase/functions/_shims/next-server-client.ts"),
  },
  logLevel: "info",
})

console.log(`\nBundled the Director turn -> ${out}`)
