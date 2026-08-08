import { createBytePlusAsset } from "@/lib/studio/byteplus"

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

/**
 * Registered Private Virtual Portrait / Virtual Avatar asset handler.
 */
export async function registerVirtualPortrait(input: { imageUrl: string; name?: string; groupId?: string }) {
  const result = await createBytePlusAsset({ imageUrl: input.imageUrl, name: input.name, groupId: input.groupId })
  return { assetId: result.assetId, assetUri: `asset://${result.assetId}`, status: "active" as const }
}
