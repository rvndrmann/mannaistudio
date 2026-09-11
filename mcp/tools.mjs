import { execFile } from "node:child_process"
import { basename, resolve } from "node:path"
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { baseUrl, idempotencyKey, studioFetch } from "./studio-client.mjs"
import { directorToolNames } from "./director-tools.mjs"

const MIME = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg",
}

const run = promisify(execFile)

/**
 * A small inline thumbnail for one stored image.
 *
 * A signed URL is enough for a browser and useless inside a widget sandbox,
 * which blocks remote images — the storyboard rendered as eight alt-text boxes.
 * A data URI always draws. They are downscaled first because a storyboard of
 * full-size frames is megabytes of base64, and macOS ships sips; anywhere
 * without it the original bytes are used, which still renders.
 */
async function thumbnailDataUri(url, maxPixels = 160) {
  const response = await fetch(url)
  if (!response.ok) return null
  const original = Buffer.from(await response.arrayBuffer())
  let workspace = null
  try {
    workspace = await mkdtemp(join(tmpdir(), "studio-thumb-"))
    const source = join(workspace, "source.png")
    const out = join(workspace, "thumb.jpg")
    await writeFile(source, original)
    // JPEG, not PNG, and small: these are inlined into a page that travels
    // through a conversation, where a storyboard of full-size frames costs more
    // to send than everything written about it.
    await run("sips", ["-Z", String(maxPixels), "-s", "format", "jpeg", "-s", "formatOptions", "40", source, "--out", out])
    const resized = await readFile(out)
    return `data:image/jpeg;base64,${resized.toString("base64")}`
  } catch {
    if (original.byteLength > 400_000) return null
    return `data:image/png;base64,${original.toString("base64")}`
  } finally {
    if (workspace) await rm(workspace, { recursive: true, force: true }).catch(() => {})
  }
}

const text = (value) => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
})

/** Resolves the episode to act on when the caller did not name one. */
async function resolveEpisode(projectId, episodeId) {
  if (episodeId) return episodeId
  const { projects } = await studioFetch("/api/studio/external/projects")
  const project = (projects || []).find((item) => item.id === projectId)
  if (!project) throw new Error(`Project ${projectId} was not found on this account.`)
  if (!project.defaultEpisodeId) throw new Error(`Project "${project.name}" has no episodes yet.`)
  return project.defaultEpisodeId
}

/** The workspace payload, which carries shots, entities, proposals and jobs. */
async function projectState(projectId, episodeId) {
  const query = episodeId ? `?episodeId=${encodeURIComponent(episodeId)}` : ""
  return studioFetch(`/api/studio/projects/${projectId}${query}`)
}

function shotSummary(shot, index) {
  return {
    number: index + 1,
    id: shot.id,
    title: shot.title || null,
    prompt: typeof shot.prompt === "string" ? shot.prompt.slice(0, 400) : null,
    durationSeconds: shot.duration_seconds,
    aspectRatio: shot.aspect_ratio,
    keyframeImage: shot.keyframe_image || null,
    videoUrl: shot.video_url || null,
    videoStatus: shot.video_status || null,
    referencedEntities: shot.referenced_entities || [],
  }
}

export const tools = [
  {
    name: "studio_list_projects",
    description:
      "List every AI Director project on the connected account, with its episodes and the default episode/session ids other tools need. Start here when you do not already have a projectId.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async run() {
      const data = await studioFetch("/api/studio/external/projects")
      const projects = (data.projects || []).map((project) => ({
        id: project.id,
        name: project.name,
        productionMode: project.production_mode,
        projectType: project.project_type,
        updatedAt: project.updated_at,
        defaultEpisodeId: project.defaultEpisodeId,
        defaultSessionId: project.defaultSessionId,
        episodes: (project.episodes || []).map((episode) => ({ id: episode.id, name: episode.name, status: episode.status })),
      }))
      return text({ baseUrl: baseUrl(), projectCount: projects.length, projects })
    },
  },

  {
    name: "studio_storyboard",
    description:
      "Read one episode's storyboard: every shot in order with its prompt, duration, keyframe and video status, plus the project's characters and assets. Use this to render a storyboard block or to find the shot id you want to work on.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project uuid from studio_list_projects." },
        episodeId: { type: "string", description: "Episode uuid. Defaults to the project's first episode." },
        includeSignedUrls: {
          type: "boolean",
          description: "Also return one-hour signed URLs for every keyframe and clip. Off by default.",
        },
        includeThumbnails: {
          type: "boolean",
          description: "Also return each keyframe as a small inline data: URI. Use this when rendering a storyboard block — widget sandboxes block remote images, so signed URLs show as broken frames. Off by default.",
        },
      },
      required: ["projectId"],
      additionalProperties: false,
    },
    async run({ projectId, episodeId, includeSignedUrls, includeThumbnails }) {
      const state = await projectState(projectId, episodeId)
      const shots = (state.shots || []).map(shotSummary)
      if (includeSignedUrls || includeThumbnails) {
        // Signed in one pass rather than one tool call per shot: a storyboard
        // block needs every frame at once, and inlining eight images costs more
        // than the page that displays them.
        await Promise.all(shots.map(async (shot) => {
          for (const [field, target] of [["keyframeImage", "keyframeUrl"], ["videoUrl", "videoSignedUrl"]]) {
            if (!shot[field]) continue
            const signed = await studioFetch(
              `/api/studio/projects/${projectId}/media?path=${encodeURIComponent(shot[field])}`,
            ).catch(() => null)
            if (!signed?.url) continue
            if (includeSignedUrls) shot[target] = signed.url
            if (includeThumbnails && field === "keyframeImage") {
              shot.keyframeThumbnail = await thumbnailDataUri(signed.url)
            }
          }
        }))
      }
      return text({
        project: { id: state.project?.id, name: state.project?.name, defaultAspect: state.project?.default_aspect },
        episode: { id: state.activeEpisode?.id || state.episode?.id, name: state.activeEpisode?.name || state.episode?.name },
        shotCount: shots.length,
        shots,
        entities: (state.entities || []).map((entity) => ({
          id: entity.id, name: entity.name, type: entity.type,
          referenceImages: entity.reference_images || [],
        })),
        creditBalance: state.creditAccount?.balance ?? null,
      })
    },
  },

  {
    name: "studio_chat",
    description:
      "Send a message to the AI Director for a project, exactly as typing it into the studio chat. The Director can write scripts, create characters and assets, build storyboards and propose generations. Costly actions come back as proposals you must pass to studio_decide_proposal. This can take minutes.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        message: { type: "string", description: "What to tell the Director." },
        episodeId: { type: "string", description: "Defaults to the project's first episode." },
        sessionId: { type: "string", description: "Chat session uuid. Defaults to the project's latest session." },
        model: { type: "string", description: "Override the director model." },
      },
      required: ["projectId", "message"],
      additionalProperties: false,
    },
    async run({ projectId, message, episodeId, sessionId, model }) {
      const resolvedEpisode = await resolveEpisode(projectId, episodeId)
      const reply = await studioFetch(`/api/studio/projects/${projectId}/director/chat`, {
        method: "POST",
        body: {
          projectId, episodeId: resolvedEpisode, message,
          ...(sessionId ? { sessionId } : {}),
          ...(model ? { model } : {}),
          idempotencyKey: idempotencyKey("chat"),
          mentionedEntityIds: [], stream: false, automated: false,
        },
      })
      return text({
        episodeId: resolvedEpisode,
        sessionId: reply.sessionId || sessionId || null,
        reply: reply.message?.content || reply.reply || reply.content || null,
        proposals: (reply.proposals || []).map((proposal) => ({
          id: proposal.id, title: proposal.title, summary: proposal.summary,
          actionType: proposal.action_type, status: proposal.status,
          estimatedCredits: proposal.estimated_credits,
        })),
        toolCalls: reply.toolCalls || reply.executions || undefined,
      })
    },
  },

  {
    name: "studio_run_director_tool",
    description:
      "Call one of the AI Director's own tools directly, skipping the conversation. Use it for precise work: create_storyboard_batch, update_shot, create_production_entity, submit_generation, attach_media_to_shot, attach_media_to_asset, generate_entity_reference_art, and the rest. Costly and destructive tools return a proposal to approve rather than acting immediately. Call studio_list_director_tools first if you are unsure of a name, and read the validation error if the input shape is wrong — it names the field.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        tool: { type: "string", description: "Director tool name, e.g. create_storyboard_batch." },
        input: { type: "object", description: "That tool's own arguments.", additionalProperties: true },
        episodeId: { type: "string", description: "Scopes shot numbers. Defaults to the first episode." },
      },
      required: ["projectId", "tool"],
      additionalProperties: false,
    },
    async run({ projectId, tool, input, episodeId }) {
      const names = await directorToolNames()
      if (!names.includes(tool)) {
        throw new Error(`Unknown director tool "${tool}". Available: ${names.join(", ")}`)
      }
      const resolvedEpisode = await resolveEpisode(projectId, episodeId)
      // The episode is set on the request envelope *and* offered to the tool's
      // own arguments. Eight of the tools take an episodeId of their own, and
      // the envelope only reaches submit_generation — so a caller who named no
      // episode got "episodeId: Invalid input" from the tool's schema while the
      // bridge had the id in hand the whole time. Schemas here are non-strict,
      // so a tool that does not want one ignores it; anything the caller passed
      // explicitly wins.
      const toolInput = { episodeId: resolvedEpisode, ...(input || {}) }
      const result = await studioFetch(`/api/studio/projects/${projectId}/director/tools`, {
        method: "POST",
        body: { tool, input: toolInput, episodeId: resolvedEpisode, idempotencyKey: idempotencyKey(tool) },
      })
      return text(result)
    },
  },

  {
    name: "studio_list_director_tools",
    description: "List every AI Director tool name available to studio_run_director_tool.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async run() {
      return text({ tools: await directorToolNames() })
    },
  },

  {
    name: "studio_upload_media",
    description:
      "Upload a local image or video into a project so it can be used as a reference — a character's face, an asset photo, a style frame, a motion clip. Returns the storage path to hand to attach_media_to_shot, attach_media_to_asset, or a generation's referenceImages.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        filePath: { type: "string", description: "Absolute path to a local file (png, jpg, webp, gif, mp4, webm, mov, or audio)." },
        episodeId: { type: "string", description: "Defaults to the project's first episode." },
      },
      required: ["projectId", "filePath"],
      additionalProperties: false,
    },
    async run({ projectId, filePath, episodeId }) {
      const absolute = resolve(filePath)
      const info = await stat(absolute).catch(() => null)
      if (!info?.isFile()) throw new Error(`No file at ${absolute}`)
      if (info.size > 100 * 1024 * 1024) throw new Error("That file is over the 100MB upload limit.")
      const extension = basename(absolute).split(".").pop()?.toLowerCase() || ""
      const contentType = MIME[extension]
      if (!contentType) throw new Error(`Unsupported file type ".${extension}". Allowed: ${Object.keys(MIME).join(", ")}`)

      const resolvedEpisode = await resolveEpisode(projectId, episodeId)
      const form = new FormData()
      form.append("episodeId", resolvedEpisode)
      form.append("file", new Blob([await readFile(absolute)], { type: contentType }), basename(absolute))
      const result = await studioFetch(`/api/studio/projects/${projectId}/director/uploads`, { method: "POST", formData: form })
      return text({
        storagePath: result.media?.path,
        type: result.media?.type,
        sessionId: result.sessionId,
        note: "Pass storagePath to attach_media_to_shot / attach_media_to_asset, or as a generation reference image.",
      })
    },
  },

  {
    name: "studio_decide_proposal",
    description:
      "Approve or reject a proposal the Director created for a costly or destructive action. Approving spends credits and starts the work. Always show the user what a proposal will cost and get their word before approving one.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        proposalId: { type: "string" },
        decision: { type: "string", enum: ["approved", "rejected"] },
        overrides: { type: "object", description: "Edits merged into the stored payload before it runs.", additionalProperties: true },
      },
      required: ["projectId", "proposalId", "decision"],
      additionalProperties: false,
    },
    async run({ projectId, proposalId, decision, overrides }) {
      const result = await studioFetch(`/api/studio/projects/${projectId}/director/proposals/${proposalId}`, {
        method: "POST",
        body: { decision, ...(overrides ? { overrides } : {}) },
      })
      return text(result)
    },
  },

  {
    name: "studio_pending_work",
    description:
      "Everything waiting on a decision or still running: pending proposals, generation jobs and their status, and the credit balance. Poll this after approving a generation.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" }, episodeId: { type: "string" } },
      required: ["projectId"],
      additionalProperties: false,
    },
    async run({ projectId, episodeId }) {
      const state = await projectState(projectId, episodeId)
      const jobs = (state.generationJobs || []).slice(0, 20)
      return text({
        creditBalance: state.creditAccount?.balance ?? null,
        pendingProposals: (state.actionProposals || [])
          .filter((proposal) => proposal.status === "pending")
          .map((proposal) => ({
            id: proposal.id, title: proposal.title, summary: proposal.summary,
            actionType: proposal.action_type, estimatedCredits: proposal.estimated_credits,
          })),
        jobs: jobs.map((job) => ({
          id: job.id, type: job.type, status: job.status, model: job.model,
          shotId: job.shot_id, entityId: job.entity_id,
          resultUrl: job.result_url, error: job.error,
          creditsUsed: job.credits_used, completedAt: job.completed_at,
        })),
      })
    },
  },

  {
    name: "studio_view_media",
    description:
      "Look at a stored file — a shot keyframe, a character reference, a generated image. Returns the picture itself so it renders in the conversation. Videos and audio come back as a signed link instead.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        path: { type: "string", description: "Storage path, e.g. a shot's keyframeImage value." },
      },
      required: ["projectId", "path"],
      additionalProperties: false,
    },
    async run({ projectId, path }) {
      const signed = await studioFetch(`/api/studio/projects/${projectId}/media?path=${encodeURIComponent(path)}`)
      const extension = path.split("?")[0].split(".").pop()?.toLowerCase() || ""
      const contentType = MIME[extension] || "image/png"
      if (!contentType.startsWith("image/")) {
        return text({ path, url: signed.url, note: "Not an image — open the link to view it." })
      }
      const response = await fetch(signed.url)
      if (!response.ok) throw new Error(`Could not download that file (${response.status}).`)
      const buffer = Buffer.from(await response.arrayBuffer())
      // Anything much larger than this is refused by the client anyway, and a
      // rejected message loses the text beside it too.
      if (buffer.byteLength > 4 * 1024 * 1024) {
        return text({ path, url: signed.url, note: "Too large to inline; open the link." })
      }
      return {
        content: [
          { type: "text", text: `${path} (signed link valid one hour: ${signed.url})` },
          { type: "image", data: buffer.toString("base64"), mimeType: contentType },
        ],
      }
    },
  },
]

export const toolsByName = new Map(tools.map((tool) => [tool.name, tool]))
