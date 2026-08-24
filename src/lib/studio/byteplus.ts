import { videoModelMaxDuration, type ImageGenerationModelId, type VideoGenerationModelId } from "@/lib/studio/generation-models"

import { activeCredentialPart, isRunningOnCustomerKey } from "@/lib/byok/active-credential"
import { bindSeedanceMentions, unboundMentions, type SeedanceSubject } from "./seedance-mentions"

const defaultBaseUrl = "https://ark.ap-southeast.bytepluses.com/api/v3"

export class BytePlusProviderError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message)
    this.name = "BytePlusProviderError"
  }
}

/**
 * The credentials this call runs on.
 *
 * A customer's own key when one is in force for this job, the platform's
 * otherwise. Every read of an ARK secret goes through these three functions, so
 * no path can reach a provider with a key the caller did not intend — the
 * mistake worth preventing is a missed call site quietly falling back to the
 * platform key and billing us for a customer's generation.
 */
function apiKey() {
  const own = activeCredentialPart("byteplus", "arkApiKey")
  if (own) return own
  const key = process.env.ARK_API_KEY || process.env.BYTEPLUS_ARK_API_KEY
  if (!key) throw new BytePlusProviderError("BytePlus ModelArk is not configured. Add ARK_API_KEY to the server environment.", 503)
  return key
}

/**
 * The Asset Library signing pair, always returned together.
 *
 * Never mixed: signing with the platform's access key and a customer's secret
 * fails authentication in a way that reads like a bad customer key.
 */
function assetSigningKeys(): { ak?: string; sk?: string } {
  const ownAccess = activeCredentialPart("byteplus", "accessKey")
  const ownSecret = activeCredentialPart("byteplus", "secretKey")
  if (ownAccess && ownSecret) return { ak: ownAccess, sk: ownSecret }
  if (isRunningOnCustomerKey("byteplus")) {
    // Their ARK key is serving generation, so registering reference art onto
    // our Asset Library would put their pictures on our account and hand them
    // an asset id their own key cannot resolve.
    throw new BytePlusProviderError(
      "Your BytePlus key is missing the access key and secret needed to register reference images. Add them under Integrations to generate character shots.",
      400,
    )
  }
  return { ak: process.env.ARK_ACCESS_KEY, sk: process.env.ARK_SECRET_KEY }
}

function assetGroupIdFor(): string | undefined {
  const own = activeCredentialPart("byteplus", "assetGroupId")
  if (own) return own
  // A customer's group must never fall back to the platform's: that id does not
  // exist on their account.
  if (isRunningOnCustomerKey("byteplus")) return undefined
  return process.env.ARK_ASSET_GROUP_ID?.trim() || cachedAssetGroupId
}

export function formatBytePlusError(data: Record<string, unknown>, status: number) {
  const nestedError = typeof data.error === "object" && data.error !== null ? data.error as Record<string, unknown> : null
  const detail = typeof nestedError?.message === "string"
    ? nestedError.message
    : typeof data.message === "string"
      ? data.message
      : "BytePlus returned an unexpected error response."
  const redacted = detail
    .replace(/\baccount\s+\d+\b/gi, "account")
    .replace(/\bRequest id:\s*[a-z0-9-]+\b/gi, "Request id: redacted")
  return `BytePlus request failed (${status}): ${redacted}`
}

async function request(path: string, init: RequestInit) {
  const response = await fetch(`${process.env.BYTEPLUS_ARK_BASE_URL || defaultBaseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json", ...init.headers },
  })
  const data = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    throw new BytePlusProviderError(formatBytePlusError(data, response.status), response.status)
  }
  return data
}

export async function generateBytePlusImage(input: { model: ImageGenerationModelId; prompt: string; referenceUrls?: string[] }) {
  const data = await request("/images/generations", {
    method: "POST",
    body: JSON.stringify({
      model: input.model,
      prompt: input.prompt,
      ...(input.referenceUrls?.length ? { image: input.referenceUrls.length === 1 ? input.referenceUrls[0] : input.referenceUrls } : {}),
      size: "2K",
      output_format: "png",
      response_format: "url",
      watermark: false,
    }),
  }) as { data?: Array<{ url?: string }> }
  const url = data.data?.[0]?.url
  if (!url) throw new BytePlusProviderError("Seedream did not return an image URL.")
  return { url, contentType: "image/png" }
}

export function formatBytePlusMediaUrl(url: string): string {
  const trimmed = url.trim()
  if (/^asset:\/\//i.test(trimmed)) return trimmed
  if (/^asset-[a-z0-9-]+$/i.test(trimmed)) return `asset://${trimmed}`
  return trimmed
}

/**
 * Registration exists to clear the real-person privacy check, which only ever
 * applies to faces. The Asset Library holds 50 images, so registering props and
 * locations spends a quota they never needed and fills it within one project.
 */
export async function resolveBytePlusReferenceUrl(rawUrl: string, registerFace = false): Promise<string> {
  const formatted = formatBytePlusMediaUrl(rawUrl)
  if (/^asset:\/\//i.test(formatted)) return formatted
  if (!registerFace) return formatted

  // If HTTP/HTTPS URL, register image to Asset Library to avoid PrivacyInformation real-person error
  if (/^https?:\/\//i.test(formatted)) {
    const signing = assetSigningKeys()
    if (!signing.ak || !signing.sk) {
      throw new BytePlusProviderError(
        "BytePlus Direct requires ARK_ACCESS_KEY and ARK_SECRET_KEY in .env.local to register real-person face photos to the Asset Library. Please add ARK_ACCESS_KEY and ARK_SECRET_KEY to .env.local, or use the fal.ai Seedance model (Seedance 2.0 Mini via fal.ai).",
        400
      )
    }

    try {
      const assetRes = await createBytePlusAsset({ imageUrl: formatted })
      for (let attempt = 0; attempt < 10; attempt++) {
        const assetInfo = await getBytePlusAsset(assetRes.assetId)
        if (assetInfo.status === "Active" || assetInfo.status === "active") {
          return assetInfo.assetUri
        }
        await new Promise((r) => setTimeout(r, 1000))
      }
      return `asset://${assetRes.assetId}`
    } catch (err) {
      if (err instanceof BytePlusProviderError) throw err
      console.warn("Could not auto-register image URL to BytePlus Asset Library:", err)
      return formatted
    }
  }

  return formatted
}

/**
 * Seedance accepts video references alongside images in the same content array,
 * which is how a shot inherits motion and look from the shot before it.
 * Seedance 2.0 takes up to 3 videos totalling 15 seconds; 2.5 takes 10 totalling
 * 30. Videos must be URLs — unlike images, they cannot be sent inline.
 */
export const bytePlusVideoReferenceLimits = {
  "dreamina-seedance-2-5-260628": { maxVideos: 10, maxTotalSeconds: 30 },
  default: { maxVideos: 3, maxTotalSeconds: 15 },
} as const

export function bytePlusVideoReferenceLimit(model: string) {
  return model === "dreamina-seedance-2-5-260628"
    ? bytePlusVideoReferenceLimits["dreamina-seedance-2-5-260628"]
    : bytePlusVideoReferenceLimits.default
}

export function formatBytePlusReferencePrompt(prompt: string, input: { imageCount: number; videoCount: number; subjects?: SeedanceSubject[]; mentionedNames?: string[] }) {
  let formatted = prompt
    .replace(/@previous\s+shot\s+video/gi, "[Video 1]")
    .replace(/@storyboard\s+shot\s+\d+\s+video/gi, "[Video 1]")
    .replace(/@storyboard\s+shot\s+\d+\s+image/gi, "[Image 1]")

  // The cast, bound to the pictures of them that travel with this request.
  // Without this the references arrive as unlabelled images and the prompt's
  // "@Sara" reaches Seedance as literal text pointing at nothing, so the clip
  // is rendered from the words instead of from the reference art.
  if (input.subjects?.length) {
    const binding = bindSeedanceMentions(formatted, input.subjects, input.mentionedNames)
    formatted = binding.prompt
  }

  const guidance: string[] = []
  // A mention with no picture behind it is the one case worth naming out loud:
  // the model will invent that subject, and the invention is what drifts.
  const loose = unboundMentions(formatted)
  if (loose.length) {
    guidance.push(`No reference image was provided for ${loose.join(", ")}; render ${loose.length === 1 ? "it" : "them"} from the description alone.`)
  }
  if (input.videoCount > 0 && !/\[video\s*1\]/i.test(formatted)) {
    guidance.push("Use [Video 1] as the previous-shot continuity and motion reference.")
  }
  if (input.imageCount > 0 && !/\[image\s*1\]/i.test(formatted)) {
    guidance.push("Use [Image 1] as the target storyboard composition reference.")
  }
  if (guidance.length) formatted = `${formatted.trim()}\n\n${guidance.join(" ")}`
  return formatted
}

const bytePlusVideoRatios = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"] as const

/**
 * BytePlus requires adaptive ratio whenever the request contains a video that
 * the prompt asks Seedance to extend. Applying it to all video-reference tasks
 * is safe and lets ModelArk choose from the referenced clip and prompt intent.
 * The Studio keeps its requested ratio separately for layout/display.
 */
export function bytePlusVideoRatio(requestedRatio: string, hasVideoReference: boolean) {
  if (hasVideoReference) return "adaptive"
  return bytePlusVideoRatios.includes(requestedRatio as (typeof bytePlusVideoRatios)[number]) ? requestedRatio : "9:16"
}

export async function submitBytePlusVideo(input: { model: VideoGenerationModelId; prompt: string; duration: number; resolution: string; ratio: string; referenceUrls?: string[]; faceReferenceUrls?: string[]; videoReferenceUrls?: string[]; generationMode?: "keyframe" | "multi_image"; audioEnabled?: boolean; subjects?: SeedanceSubject[]; mentionedNames?: string[]; compositionFrames?: number }) {
  // Only a character's reference is registered; everything else is sent as-is.
  const faces = new Set(input.faceReferenceUrls || [])
  const resolvedUrls = await Promise.all((input.referenceUrls || []).map((url) => resolveBytePlusReferenceUrl(url, faces.has(url))))
  const videoUrls = (input.videoReferenceUrls || []).filter((value) => typeof value === "string" && value.trim())
  const content: Array<Record<string, unknown>> = [{
    type: "text",
    text: formatBytePlusReferencePrompt(input.prompt, { imageCount: resolvedUrls.length, videoCount: videoUrls.length, subjects: input.subjects, mentionedNames: input.mentionedNames }),
  }]

  // Seedance rejects a request that mixes first_frame or last_frame with
  // reference_image in one content block ("first/last frame content cannot be
  // mixed with reference media content"). A storyboard shot's normal payload is
  // exactly that mix — its own keyframe plus its cast — so a keyframe-mode
  // regenerate with any cast attached failed with a 400 and the shot could not
  // be rendered at all. Character consistency matters more than composition
  // lock, so the mix downgrades to multi_image: every image becomes a plain
  // reference, and the keyframe still guides the look without claiming to be
  // the first frame.
  const requestedFrames = input.generationMode === "keyframe"
    ? (typeof input.compositionFrames === "number"
        ? Math.max(0, Math.min(2, input.compositionFrames))
        : Math.min(2, resolvedUrls.length))
    : 0
  const wouldMix = requestedFrames > 0 && resolvedUrls.length > requestedFrames
  const frames = wouldMix ? 0 : requestedFrames
  resolvedUrls.forEach((url, index) => content.push({
    type: "image_url",
    image_url: { url },
    // Only the composition frames get positional roles; anything past them is a
    // plain reference. When wouldMix is true this is every image.
    role: index === 0 && frames >= 1 ? "first_frame" : index === 1 && frames >= 2 ? "last_frame" : "reference_image",
  }))

  const videoLimit = bytePlusVideoReferenceLimit(input.model)
  for (const url of videoUrls.slice(0, videoLimit.maxVideos)) {
    content.push({ type: "video_url", video_url: { url }, role: "reference_video" })
  }
  const maxDuration = videoModelMaxDuration(input.model)
  const data = await request("/contents/generations/tasks", {
    method: "POST",
    body: JSON.stringify({
      model: input.model,
      content,
      generate_audio: input.audioEnabled ?? true,
      duration: Math.min(maxDuration, Math.max(4, Math.round(input.duration))),
      resolution: input.resolution === "480p" ? "480p" : "720p",
      ratio: bytePlusVideoRatio(input.ratio, videoUrls.length > 0),
      watermark: false,
    }),
  })
  if (typeof data.id !== "string") throw new BytePlusProviderError("BytePlus did not return a video task ID.")
  return { id: data.id, response: data }
}

export async function getBytePlusVideoTask(taskId: string) {
  return request(`/contents/generations/tasks/${encodeURIComponent(taskId)}`, { method: "GET" }) as Promise<{
    id: string
    status: "queued" | "running" | "succeeded" | "failed" | "cancelled"
    // Provider's own clocks. Kept because "running with updated_at unchanged
    // from created_at for many minutes" is BytePlus's own signature of a task
    // it accepted but never picked up — the provider queue is stalled, not
    // slow-rendering, and the workspace can settle the job rather than sit on
    // the spinner for ever.
    created_at?: number
    updated_at?: number
    content?: { video_url?: string }
    error?: { message?: string }
    usage?: { completion_tokens?: number; total_tokens?: number }
  }>
}

import crypto from "node:crypto"

function hmacSig(key: Buffer | string, string: string): Buffer {
  return crypto.createHmac("sha256", key).update(string, "utf8").digest()
}

function hashSig(string: string): string {
  return crypto.createHash("sha256").update(string, "utf8").digest("hex")
}

export function signBytePlusRequest(method: string, query: Record<string, string>, body: string, ak: string, sk: string) {
  const host = "ark.ap-southeast-1.byteplusapi.com"
  const service = "ark"
  const region = "ap-southeast-1"
  const now = new Date()
  const dateStr = now.toISOString().replace(/[:-]/g, "").split(".")[0] + "Z"
  const dateShort = dateStr.slice(0, 8)

  const payloadHash = hashSig(body)
  const canonicalQuery = Object.keys(query).sort().map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`).join("&")
  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-content-sha256:${payloadHash}\nx-date:${dateStr}\n`
  const signedHeaders = "content-type;host;x-content-sha256;x-date"

  const canonicalRequest = [method, "/", canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n")
  const credentialScope = `${dateShort}/${region}/${service}/request`
  const stringToSign = ["HMAC-SHA256", dateStr, credentialScope, hashSig(canonicalRequest)].join("\n")

  const kDate = hmacSig(sk, dateShort)
  const kRegion = hmacSig(kDate, region)
  const kService = hmacSig(kRegion, service)
  const kSigning = hmacSig(kService, "request")
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex")

  const authHeader = `HMAC-SHA256 Credential=${ak}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  return {
    "Content-Type": "application/json",
    Host: host,
    "X-Date": dateStr,
    "X-Content-Sha256": payloadHash,
    Authorization: authHeader,
  }
}

// Asset groups are a limited resource on the plan, so the studio uses exactly
// one and remembers it for the life of the process.
const sharedAssetGroupName = "aidirector_character_references"
let cachedAssetGroupId: string | undefined

export async function createBytePlusAssetGroup(name = "portrait_group", description = "Portraits for Seedance") {
  const { ak, sk } = assetSigningKeys()
  if (!ak || !sk) throw new BytePlusProviderError("ARK_ACCESS_KEY and ARK_SECRET_KEY are required for CreateAssetGroup.")

  const query = { Action: "CreateAssetGroup", Version: "2024-01-01" }
  const body = JSON.stringify({ Name: name, Description: description, GroupType: "AIGC" })
  const headers = signBytePlusRequest("POST", query, body, ak, sk)

  const res = await fetch(`https://${headers.Host}/?Action=CreateAssetGroup&Version=2024-01-01`, {
    method: "POST",
    headers,
    body,
  })

  const json = (await res.json().catch(() => ({}))) as { Result?: { Id?: string }; ResponseMetadata?: { Error?: { Message?: string } } }
  if (!res.ok || json.ResponseMetadata?.Error) {
    throw new BytePlusProviderError(`CreateAssetGroup failed: ${json.ResponseMetadata?.Error?.Message || res.statusText}`)
  }

  const groupId = json.Result?.Id
  if (!groupId) throw new BytePlusProviderError("CreateAssetGroup did not return a Group ID.")
  return groupId
}

export async function createBytePlusAsset(input: { imageUrl: string; name?: string; groupId?: string }) {
  const { ak, sk } = assetSigningKeys()

  if (!ak || !sk) {
    throw new BytePlusProviderError(
      "BytePlus Asset Library registration requires ARK_ACCESS_KEY and ARK_SECRET_KEY in .env.local (with ArkFullAccess permission). Please add ARK_ACCESS_KEY and ARK_SECRET_KEY to .env.local, or switch to fal.ai Seedance models (Seedance 2.0 Mini via fal.ai).",
      400
    )
  }

  // GroupId is required by CreateAsset, so there is no "attempt without it".
  // Swallowing a failed group creation here only moved the error one step later
  // and reported it as a missing parameter, hiding why the group was never made.
  let groupId = input.groupId || assetGroupIdFor()
  if (!groupId) {
    try {
      // One group for the whole studio. Naming it after each asset created a
      // new group per registration and exhausted the account's group quota,
      // which then surfaced as an unrelated "GroupId is missing" error.
      groupId = await createBytePlusAssetGroup(sharedAssetGroupName, "AI Director character references")
      cachedAssetGroupId = groupId
    } catch (err) {
      const detail = err instanceof Error ? err.message : "unknown error"
      const quotaHit = /quota|limit/i.test(detail)
      throw new BytePlusProviderError(
        quotaHit
          ? `The BytePlus account has no asset groups left (${detail}). Reuse an existing group by setting ARK_ASSET_GROUP_ID to its id in the server environment, or delete unused groups in the Ark console.`
          : `Could not create the BytePlus asset group needed to register this image: ${detail}`,
        err instanceof BytePlusProviderError ? err.status : 502,
      )
    }
  }
  if (!groupId) throw new BytePlusProviderError("BytePlus returned no asset group id, so the image cannot be registered.")

  const query = { Action: "CreateAsset", Version: "2024-01-01" }
  const body = JSON.stringify({
    GroupId: groupId,
    URL: input.imageUrl,
    Name: input.name || "actor_portrait",
    AssetType: "Image", // strictly 'Image'
  })

  const headers = signBytePlusRequest("POST", query, body, ak, sk)
  const res = await fetch(`https://${headers.Host}/?Action=CreateAsset&Version=2024-01-01`, {
    method: "POST",
    headers,
    body,
  })

  const json = (await res.json().catch(() => ({}))) as { Result?: { Id?: string }; ResponseMetadata?: { Error?: { Message?: string } } }
  if (!res.ok || json.ResponseMetadata?.Error) {
    throw new BytePlusProviderError(`CreateAsset failed: ${json.ResponseMetadata?.Error?.Message || res.statusText}`)
  }

  const assetId = json.Result?.Id
  if (!assetId) throw new BytePlusProviderError("CreateAsset did not return an Asset ID.")
  return { assetId }
}

export async function getBytePlusAsset(assetId: string) {
  const { ak, sk } = assetSigningKeys()

  if (!ak || !sk) {
    return { id: assetId, status: "Active", assetUri: `asset://${assetId}` }
  }

  const query = { Action: "GetAsset", Version: "2024-01-01" }
  const body = JSON.stringify({ Id: assetId })
  const headers = signBytePlusRequest("POST", query, body, ak, sk)

  const res = await fetch(`https://${headers.Host}/?Action=GetAsset&Version=2024-01-01`, {
    method: "POST",
    headers,
    body,
  })

  const json = (await res.json().catch(() => ({}))) as { Result?: { Status?: string; AssetUri?: string }; Items?: Array<{ Status?: string; AssetUri?: string }> }
  const status = json.Result?.Status || json.Items?.[0]?.Status || "Unknown"
  const assetUri = json.Result?.AssetUri || json.Items?.[0]?.AssetUri || `asset://${assetId}`

  return { id: assetId, status, assetUri }
}

/**
 * Frees a slot in the account's 50-image Asset Library.
 *
 * The provider's own record is what counts against the quota, so removing our
 * row without this would only hide the problem.
 */
export async function deleteBytePlusAsset(assetId: string) {
  const { ak, sk } = assetSigningKeys()
  if (!ak || !sk) throw new BytePlusProviderError("ARK_ACCESS_KEY and ARK_SECRET_KEY are required to delete an asset.")

  const query = { Action: "DeleteAsset", Version: "2024-01-01" }
  const body = JSON.stringify({ Id: assetId })
  const headers = signBytePlusRequest("POST", query, body, ak, sk)

  const res = await fetch(`https://${headers.Host}/?Action=DeleteAsset&Version=2024-01-01`, { method: "POST", headers, body })
  const json = (await res.json().catch(() => ({}))) as { ResponseMetadata?: { Error?: { Message?: string } } }
  if (!res.ok || json.ResponseMetadata?.Error) {
    throw new BytePlusProviderError(`DeleteAsset failed: ${json.ResponseMetadata?.Error?.Message || res.statusText}`)
  }
  return { id: assetId, deleted: true }
}
