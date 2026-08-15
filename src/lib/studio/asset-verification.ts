/**
 * The vocabulary of BytePlus asset verification.
 *
 * Seedance rejects an input image it believes may show a real person unless
 * that image is registered in the account's Asset Library, and an entity or
 * shot records the outcome in three fields that have to agree: what the picture
 * came from, what class of asset it is at the provider, and whether it cleared
 * the check. They were written as bare string literals in six places, so a
 * single typo — "verifed", "untrusted_external" where "external_untrusted" was
 * meant — silently produced a character that reads as unverified forever, with
 * nothing failing at build time to say so.
 *
 * These are the only spellings. Deliberately free of imports so a client
 * component can use them without pulling the provider client into the bundle.
 */

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

export type AssetVerification = {
  source_type: CharacterSourceType
  byteplus_asset_class: BytePlusAssetClass
  verification_status: CharacterVerificationStatus
}

/** An image registered with the Asset Library: cleared for Seedance. */
export const VERIFIED_ASSET: AssetVerification = {
  source_type: "byteplus_virtual_portrait",
  byteplus_asset_class: "private_virtual_portrait",
  verification_status: "verified",
}

/** An image the provider has never seen, which its real-person check may reject. */
export const UNVERIFIED_ASSET: AssetVerification = {
  source_type: "external_untrusted",
  byteplus_asset_class: "untrusted_external",
  verification_status: "unverified",
}

/** The verification an entity carries, decided by whether it holds an asset id. */
export function assetVerificationFor(assetId: string | null | undefined): AssetVerification {
  return assetId ? VERIFIED_ASSET : UNVERIFIED_ASSET
}
