/**
 * Builds the OpenReel editor the Timeline tab embeds, into public/editor.
 *
 * OpenReel (MIT, github.com/Augani/openreel-video) is a Vite app in a pnpm
 * monorepo — too large and too unlike this codebase to vendor. So the upstream
 * commit named in editor/openreel/UPSTREAM is fetched into a cache, our files
 * from editor/openreel/overlay are laid over it, a handful of small edits are
 * applied below, and the result is built with base /editor/.
 *
 * Each edit names the exact upstream text it replaces and fails the build when
 * that text is gone, so moving UPSTREAM to a newer commit can never silently
 * drop the studio bridge.
 *
 * Skipped when public/editor was already built from the same inputs.
 * Run: npm run editor:build   (add --force to rebuild regardless)
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const editorDir = join(root, "editor/openreel")
const overlayDir = join(editorDir, "overlay")
const protocolFile = join(root, "src/lib/studio/openreel-protocol.ts")
const cacheDir = join(root, ".cache/openreel")
const outDir = join(root, "public/editor")
const stampFile = join(outDir, ".openreel-build")
const force = process.argv.includes("--force")

const [repository, commit] = readFileSync(join(editorDir, "UPSTREAM"), "utf8").trim().split(/\s+/)
if (!repository || !/^[0-9a-f]{40}$/.test(commit || "")) throw new Error("editor/openreel/UPSTREAM must hold a repository URL and a full commit sha")

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

// Everything that decides the output: the upstream commit, our overlay, the
// shared protocol, and this script's own edits.
const inputs = createHash("sha256")
inputs.update(commit)
for (const file of [...filesUnder(overlayDir).sort(), protocolFile, fileURLToPath(import.meta.url)]) {
  inputs.update(relative(root, file))
  inputs.update(readFileSync(file))
}
const fingerprint = inputs.digest("hex")

if (!force && existsSync(stampFile) && readFileSync(stampFile, "utf8").trim() === fingerprint) {
  console.log("[openreel] public/editor is up to date")
  process.exit(0)
}

function run(command, args, cwd = cacheDir) {
  execFileSync(command, args, { cwd, stdio: "inherit", env: { ...process.env, CI: "true" } })
}

function git(...args) {
  return execFileSync("git", args, { cwd: cacheDir, encoding: "utf8" }).trim()
}

// --- Fetch the pinned commit, discarding any edits from a previous build -----
mkdirSync(cacheDir, { recursive: true })
if (!existsSync(join(cacheDir, ".git"))) {
  run("git", ["init", "--quiet"])
  run("git", ["remote", "add", "origin", repository])
}
const head = existsSync(join(cacheDir, ".git/HEAD")) ? (() => { try { return git("rev-parse", "HEAD") } catch { return "" } })() : ""
if (head !== commit) {
  console.log(`[openreel] fetching ${commit.slice(0, 12)}`)
  run("git", ["fetch", "--quiet", "--depth", "1", "origin", commit])
}
run("git", ["checkout", "--quiet", "--force", commit])
run("git", ["clean", "--quiet", "-fdx", "-e", "node_modules"])

// --- Overlay and edits -------------------------------------------------------
cpSync(overlayDir, cacheDir, { recursive: true })
cpSync(protocolFile, join(cacheDir, "apps/web/src/studio/openreel-protocol.ts"))

function edit(file, from, to) {
  const path = join(cacheDir, file)
  const source = readFileSync(path, "utf8")
  if (!source.includes(from)) throw new Error(`[openreel] ${file} no longer contains the text this build edits:\n${from}`)
  writeFileSync(path, source.replace(from, to))
}

// Opened with ?embed=studio the page mounts the studio bridge instead of
// OpenReel's own welcome-and-recovery shell.
edit(
  "apps/web/src/main.tsx",
  `import App from "./App";`,
  `import App from "./App";\nimport { StudioApp } from "./studio/StudioApp";`,
)
edit(
  "apps/web/src/main.tsx",
  `      ) : (\n        <App />\n      );`,
  `      ) : new URLSearchParams(window.location.search).get("embed") === "studio" ? (\n        <StudioApp />\n      ) : (\n        <App />\n      );`,
)
// Its service worker registers at /sw.js. Served from this site that is the
// whole origin's scope, and it would start answering the Next app's requests.
edit(
  "apps/web/src/main.tsx",
  `registerServiceWorker().then((registration) => {\n  if (registration) {\n  }\n});`,
  `void registerServiceWorker;`,
)
// A browser export ends in triggerAnchorDownload. In the studio a video is
// both downloaded and handed to the project; the temporary export file is
// released only once both are done with it.
edit(
  "apps/web/src/services/export-runner.ts",
  `function triggerAnchorDownload(data: Blob, filename: string, onRelease?: () => void): void {`,
  `function triggerAnchorDownload(data: Blob, filename: string, onRelease?: () => void, skipStudio = false): void {
  const studioHandoff = skipStudio
    ? null
    : (window as { __openreelStudioExport?: (file: Blob, name: string) => Promise<boolean> | null }).__openreelStudioExport?.(data, filename);
  if (studioHandoff) {
    let holders = 2;
    const releaseShared = () => {
      holders -= 1;
      if (holders === 0) onRelease?.();
    };
    triggerAnchorDownload(data, filename, releaseShared, true);
    void studioHandoff.then(releaseShared, releaseShared);
    return;
  }`,
)
// ...and so the save picker is never offered: its file would bypass the studio.
edit(
  "apps/web/src/services/export-runner.ts",
  `  if (options?.delivery === "download") return createFallbackWritable(filename, mime);`,
  `  if (options?.delivery === "download" || "__openreelStudioExport" in window) return createFallbackWritable(filename, mime);`,
)
// The export dialog's "Save video" choice does not apply there; say where it goes.
edit(
  "apps/web/src/components/editor/ExportDialog.tsx",
  `            {!isDesktop && (\n              <div className="space-y-1.5">\n                <Selector label="Save video"`,
  `            {!isDesktop && "__openreelStudioExport" in window && (\n              <p className="text-[11px] text-fg-muted">The video downloads to your computer and is saved to this episode in your studio project.</p>\n            )}\n            {!isDesktop && !("__openreelStudioExport" in window) && (\n              <div className="space-y-1.5">\n                <Selector label="Save video"`,
)
// Compact layout (a narrow editor, as it is beside the Director panel): the
// player's share of the height becomes a draggable split instead of a fixed 48%.
edit(
  "apps/web/src/components/editor/EditorInterface.tsx",
  `import "./editor-responsive.css";`,
  `import "./editor-responsive.css";\nimport { CompactStageResizer, useCompactStageSplit } from "../../studio/CompactStageResizer";`,
)
edit(
  "apps/web/src/components/editor/EditorInterface.tsx",
  `  const [timelineVh, setTimelineVh] = useState(DEFAULT_TIMELINE_VH);`,
  `  const [timelineVh, setTimelineVh] = useState(DEFAULT_TIMELINE_VH);\n  const [compactStagePct, setCompactStagePct] = useCompactStageSplit();`,
)
edit(
  "apps/web/src/components/editor/EditorInterface.tsx",
  "    ? { gridTemplateColumns: \"minmax(0, 1fr)\", gridTemplateRows: \"minmax(220px, 48%) minmax(0, 1fr)\", gridTemplateAreas: `'stage' '${compactPanel}'` }",
  "    ? { gridTemplateColumns: \"minmax(0, 1fr)\", gridTemplateRows: `minmax(160px, ${compactStagePct}%) ${RESIZE_HANDLE}px minmax(0, 1fr)`, gridTemplateAreas: `'stage' 'sh' '${compactPanel}'` }",
)
edit(
  "apps/web/src/components/editor/EditorInterface.tsx",
  `        <div\n          className="editor-stage bg-stage-bg`,
  `        {compact && <CompactStageResizer pct={compactStagePct} onChange={setCompactStagePct} />}\n\n        <div\n          className="editor-stage bg-stage-bg`,
)
// The 3D text fonts are fetched from the site root; the editor lives under /editor/.
edit(
  "apps/web/src/components/editor/preview/threejs-layer-renderer.ts",
  `const DEFAULT_3D_FONT_URL = "/fonts/helvetiker_regular.typeface.json";\nconst DEFAULT_3D_BOLD_FONT_URL = "/fonts/helvetiker_bold.typeface.json";`,
  `const DEFAULT_3D_FONT_URL = \`\${import.meta.env.BASE_URL}fonts/helvetiker_regular.typeface.json\`;\nconst DEFAULT_3D_BOLD_FONT_URL = \`\${import.meta.env.BASE_URL}fonts/helvetiker_bold.typeface.json\`;`,
)

// --- Our name on it ----------------------------------------------------------
// To users this is the studio's own editor. Every "OpenReel" in the sources is
// display text (titles, labels, messages, prompts) rather than an identifier,
// so a whole-word, case-sensitive rename is safe; OpenReelMark and the
// lowercase window.openreel bridge do not match. The MIT notice still ships as
// public/editor/LICENSE.txt.
const BRAND = "AI Director Editor"
edit("apps/web/index.html", `<title>OpenReel Video - Professional Video Editor</title>`, `<title>${BRAND}</title>`)
const brandRoots = ["apps/web/src", "apps/web/index.html", "apps/web/public/manifest.json", ...readdirSync(join(cacheDir, "packages")).map((name) => `packages/${name}/src`)]
let rebranded = 0
for (const rootPath of brandRoots) {
  const absolute = join(cacheDir, rootPath)
  if (!existsSync(absolute)) continue
  const files = statSync(absolute).isDirectory() ? filesUnder(absolute) : [absolute]
  for (const file of files) {
    if (!/\.(tsx?|html|json|css)$/.test(file) || /\.test\.|__tests__/.test(file)) continue
    const source = readFileSync(file, "utf8")
    if (!/\bOpenReel\b/.test(source)) continue
    writeFileSync(file, source.replace(/\bOpenReel\b/g, BRAND))
    rebranded += 1
  }
}
console.log(`[openreel] named ${rebranded} files "${BRAND}"`)

// --- Install and build -------------------------------------------------------
// pnpm 11, which the upstream lockfile names, needs Node 22.13+. pnpm 10 reads
// the same lockfile, so an older Node (a build image's default) still builds.
const declared = JSON.parse(readFileSync(join(cacheDir, "package.json"), "utf8")).packageManager?.replace(/^pnpm@/, "") || "10"
const [major, minor] = process.versions.node.split(".").map(Number)
const pnpm = major > 22 || (major === 22 && minor >= 13) ? `pnpm@${declared}` : "pnpm@10"
run("npx", ["--yes", pnpm, "install", "--frozen-lockfile", "--ignore-scripts"])
if (process.argv.includes("--check")) run("npx", ["--yes", pnpm, "--filter", "@openreel/web", "exec", "tsc", "--noEmit"])
const buildDir = join(cacheDir, "apps/web/dist-studio")
rmSync(buildDir, { recursive: true, force: true })
run("npx", ["--yes", pnpm, "--filter", "@openreel/web", "exec", "vite", "build", "--base=/editor/", `--outDir=${buildDir}`, "--emptyOutDir"])

// --- Publish into public/editor ----------------------------------------------
rmSync(outDir, { recursive: true, force: true })
cpSync(buildDir, outDir, { recursive: true })
// Upstream's hosting files: _headers forbids framing, _redirects sends every
// path to the editor, and sw.js is the worker disabled above.
for (const name of ["_headers", "_redirects", "sw.js"]) rmSync(join(outDir, name), { force: true })
writeFileSync(join(outDir, "LICENSE.txt"), readFileSync(join(cacheDir, "LICENSE")))
writeFileSync(stampFile, `${fingerprint}\n`)
console.log(`[openreel] built ${commit.slice(0, 12)} into public/editor`)
