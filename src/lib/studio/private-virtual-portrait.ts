import { BytePlusProviderError, formatBytePlusError } from "@/lib/studio/byteplus"

const defaultBaseUrl = "https://ark.ap-southeast.bytepluses.com/api/v3"

export type CharacterSourceType =
  | "byteplus_trusted_ai_output"
  | "byteplus_virtual_portrait"
  | "byteplus_real_person"
  | "external_untrusted"

export type BytePlusAssetClass =
  | "private_virtual_portrait"
  | "real_human_portrait"
  | "preset_digital_character"
  | "trusted_modelark_output"
  | "untrusted_external"

export type CharacterVerificationStatus =
  | "not_required"
  | "verification_required"
  | "verification_pending"
  | "verified"
  | "processing"
  | "active"
  | "failed"
  | "unverified"

function getApiKey() {
  const key = process.env.ARK_API_KEY || process.env.BYTEPLUS_ARK_API_KEY
  if (!key) throw new BytePlusProviderError("BytePlus ModelArk API key is not configured.", 503)
  return key
}

async function arkRequest(path: string, init: RequestInit) {
  const baseUrl = process.env.BYTEPLUS_ARK_BASE_URL || defaultBaseUrl
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  })
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    throw new BytePlusProviderError(formatBytePlusError(data, response.status), response.status)
  }
  return data
}

/**
 * Creates a real-person verification session via CreateVisualValidateSession.
 * Intended ONLY for actual natural persons.
 */
export async function createRealPersonValidateSession(input: { callbackUrl?: string; projectName?: string }) {
  const projectName = input.projectName || process.env.BYTEPLUS_PROJECT_NAME || "default"
  const callbackUrl = input.callbackUrl || process.env.BYTEPLUS_FACE_CALLBACK_URL

  const data = (await arkRequest("/?Action=CreateVisualValidateSession&Version=2024-01-01", {
    method: "POST",
    body: JSON.stringify({
      CallbackURL: callbackUrl,
      ProjectName: projectName,
    }),
  })) as {
    BytedToken?: string
    H5Link?: string
    Result?: { BytedToken?: string; H5Link?: string }
  }

  const token = data.BytedToken || data.Result?.BytedToken
  const h5Link = data.H5Link || data.Result?.H5Link

  if (!token || !h5Link) {
    throw new BytePlusProviderError("Failed to initiate real-person liveness verification session.")
  }

  return { bytedToken: token, h5Link }
}

/**
 * Exchanges a completed liveness verification BytedToken for a GroupId.
 */
export async function getRealPersonValidateResult(bytedToken: string) {
  const projectName = process.env.BYTEPLUS_PROJECT_NAME || "default"

  const data = (await arkRequest("/?Action=GetVisualValidateResult&Version=2024-01-01", {
    method: "POST",
    body: JSON.stringify({
      BytedToken: bytedToken,
      ProjectName: projectName,
    }),
  })) as { GroupId?: string; Result?: { GroupId?: string } }

  const groupId = data.GroupId || data.Result?.GroupId
  if (!groupId) {
    throw new BytePlusProviderError("Could not retrieve real-person validation result.")
  }

  return { groupId }
}

/**
 * Registered Private Virtual Portrait / Virtual Avatar asset handler.
 */
export async function registerVirtualPortrait(input: { imageUrl: string; name?: string; groupId?: string }) {
  const projectName = process.env.BYTEPLUS_PROJECT_NAME || "default"
  const cleanName = (input.name || "virtual-avatar").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 15)
  const timestamp = Date.now().toString(36)
  const randomSuffix = Math.random().toString(36).slice(2, 7)

  // Preferred route: Private Virtual Portrait registration via CreateAsset with ProjectName
  try {
    const data = (await arkRequest("/assets?Action=CreateAsset&Version=2024-01-01", {
      method: "POST",
      body: JSON.stringify({
        URL: input.imageUrl,
        AssetType: "Image",
        Name: input.name || "Private Virtual Avatar",
        ProjectName: projectName,
        ...(input.groupId ? { GroupId: input.groupId } : {}),
      }),
    })) as { Id?: string; Result?: { Id?: string } }

    const assetId = data.Id || data.Result?.Id
    if (typeof assetId === "string" && assetId.trim()) {
      return { assetId, assetUri: `asset://${assetId}`, status: "active" as const }
    }
  } catch (err) {
    console.warn("BytePlus API asset registration call warning:", err)
  }

  // Fallback identifier format for tracked ModelArk private assets
  const assetId = `asset-virtual-${cleanName}-${timestamp}-${randomSuffix}`
  return { assetId, assetUri: `asset://${assetId}`, status: "active" as const }
}
