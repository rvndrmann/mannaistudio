/**
 * Builds the background worker Netlify runs beside the app.
 *
 * The worker is this project's own submission code, run where it has fifteen
 * minutes instead of a request's budget. Netlify bundles a function from its
 * file, and that file cannot be the TypeScript: the `@/` alias and the
 * `server-only` guard are Next.js conventions its bundler does not read. So the
 * whole function is generated here as one module, with the project's code
 * inlined and its packages left for Netlify to trace from node_modules.
 *
 * Generated rather than committed, so it can never drift from the code it was
 * built from. It runs before `next build`; a deploy that somehow skips it has
 * no worker, and the route then submits in the request as it did before.
 *
 * Run: npm run netlify:build
 */
import { build } from "esbuild"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const out = resolve(root, "netlify/functions/submit-video-background.mjs")

await build({
  entryPoints: [resolve(root, "src/lib/studio/video-worker-entry.ts")],
  outfile: out,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  packages: "external",
  alias: {
    "server-only": resolve(root, "supabase/functions/_shims/server-only.ts"),
    "@/lib/supabase/server": resolve(root, "supabase/functions/_shims/next-server-client.ts"),
  },
  logLevel: "info",
})
console.log(`Bundled the video worker -> ${out}`)
