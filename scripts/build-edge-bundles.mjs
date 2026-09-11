/**
 * Builds the Edge Functions' bundles for the Deno runtime they run on.
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
 * Run: npm run edge:build
 */
import { build } from "esbuild"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

// One entry per function. Both are this project's own code reaching a provider
// from somewhere the app's own host cannot: the Director because a turn takes
// longer than thirty seconds, image generation because a render without a
// recoverable handle takes longer than thirty seconds.
const bundles = [
  { what: "Director turn", entry: "src/lib/studio/director-edge-entry.ts", out: "supabase/functions/director-chat/_turn.js" },
  { what: "image generation", entry: "src/lib/studio/image-edge-entry.ts", out: "supabase/functions/render-image/_render.js" },
]

// Left for Deno to fetch. Everything else is this project's own code and is
// bundled, so the function has no install step and no node_modules.
const external = [
  "zod",
  "@supabase/supabase-js",
  "@google/genai",
  "@fal-ai/client",
  "@anthropic-ai/sdk",
  // Every Node builtin, not a list of the ones seen so far: Deno implements
  // them under the same specifiers, and enumerating them means the build breaks
  // the first time the turn reaches for one more.
  "node:*",
]

for (const bundle of bundles) {
  const out = resolve(root, bundle.out)
  await build({
    entryPoints: [resolve(root, bundle.entry)],
    outfile: out,
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    mainFields: ["module", "main"],
    conditions: ["import", "module", "default"],
    external,
    banner: {
      js: 'import { Buffer } from "node:buffer";\nif (typeof globalThis.Buffer === "undefined") { globalThis.Buffer = Buffer; }',
    },
    alias: {
      "server-only": resolve(root, "supabase/functions/_shims/server-only.ts"),
      "@/lib/supabase/server": resolve(root, "supabase/functions/_shims/next-server-client.ts"),
    },
    logLevel: "info",
  })
  console.log(`Bundled the ${bundle.what} -> ${out}`)
}
