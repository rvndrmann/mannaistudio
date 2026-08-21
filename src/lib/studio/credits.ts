import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient as createBrowserClient } from "@/lib/supabase/client"

export const CREDIT_EXCHANGE_RATE = {
  creditsPerDollar: 100, // 1,000 Credits = $10 USD ($0.01 / credit)
  pricePerThousand: 10,
}

/**
 * The 2.2x provider-cost rate card.
 *
 * Every figure is the published rate for one unit of a specific variant:
 * `credits = ceil(provider API cost in INR x 2.2)`, at 1 credit = ₹1. Pricing is
 * by variant rather than by a generic multiplier because the providers charge
 * that way — Seedance 2.0 at 4K costs eleven times its 480p rate, and a flat
 * base with a resolution multiplier cannot express that without undercharging
 * one end and overcharging the other.
 *
 * Video is quoted per second everywhere, so a clip is billed for the runtime it
 * actually renders. Rates are held unrounded and the total is rounded up once,
 * which is what keeps a fractional per-second rate from being rounded twice.
 */
export type CreditQuality = "Low" | "Medium" | "High" | "Ultra"
export type CreditRateUnit = "per image" | "per second"

export type ModelCreditRate = {
  unit: CreditRateUnit
  description: string
  /** Credits per unit when no variant rate applies. */
  base: number
  /** Rates keyed by the resolution values the workspace stores. */
  byResolution?: Record<string, number>
  /** Rates keyed by image quality, for models billed by quality tier. */
  byQuality?: Partial<Record<CreditQuality, number>>
  /**
   * Set when the rate card does not quote this model and the figure is carried
   * from the closest one it does quote. These need a real provider quote.
   */
  estimated?: boolean
}

// Seedance 2.0's published curve, used to extend a model the card quotes at
// only one or two resolutions. Extending by this ratio keeps a variant priced
// in proportion to what the provider actually charges for the extra pixels,
// rather than leaving it at its 720p rate and billing 4K at a quarter of cost.
const seedanceResolutionCurve = { "480p": 15, "720p": 32, "1080p": 78, "4K": 165 }

function extendSeedanceRates(known: Record<string, number>): Record<string, number> {
  const anchor = Object.keys(known)[0] as keyof typeof seedanceResolutionCurve
  const scale = known[anchor] / seedanceResolutionCurve[anchor]
  const rates: Record<string, number> = { ...known }
  for (const [resolution, reference] of Object.entries(seedanceResolutionCurve)) {
    if (rates[resolution] === undefined) rates[resolution] = reference * scale
  }
  return rates
}

export const MODEL_CREDIT_RATES: Record<string, ModelCreditRate> = {
  // ---- Image models: credits per image ----
  // GPT Image bills by quality tier, and the spread is wide enough that a
  // single figure would be wrong at both ends: Low is 2 credits, High is 45.
  "gpt-image-2": { unit: "per image", base: 12, description: "GPT Image 2", byQuality: { Low: 2, Medium: 12, High: 45, Ultra: 45 } },
  "gpt-image-1.5": { unit: "per image", base: 12, description: "GPT Image 1.5", estimated: true, byQuality: { Low: 2, Medium: 12, High: 45, Ultra: 45 } },
  "dola-seedream-5-0-pro-260628": { unit: "per image", base: 10, description: "Seedream 5.0 Pro" },
  // The card prices Nano Banana at 1K/2K/4K. The workspace stores video-style
  // resolutions, so 480p and 720p buy the 1K rate and 1080p buys 2K.
  "google-nano-banana-2": {
    unit: "per image",
    base: 15,
    description: "Nano Banana 2",
    byResolution: { "480p": 15, "720p": 15, "1080p": 22, "4K": 32 },
  },
  "google-nano-banana-2-pro": {
    unit: "per image",
    base: 29,
    description: "Nano Banana Pro",
    byResolution: { "480p": 29, "720p": 29, "1080p": 29, "4K": 51 },
  },
  "fal-flux-3": { unit: "per image", base: 7, description: "Flux 3 (FLUX.2 Pro rate)", estimated: true },
  "fal-flux-dev": { unit: "per image", base: 9, description: "Flux Dev (FLUX1.1 Pro rate)", estimated: true },
  "fal-flux-realism": { unit: "per image", base: 9, description: "Flux Realism (FLUX1.1 Pro rate)", estimated: true },

  // ---- Video models: credits per second ----
  // Seedance 2.5's card gives one starting rate, to be recalculated when the
  // provider splits it by resolution.
  "dreamina-seedance-2-5-260628": { unit: "per second", base: 87, description: "Seedance 2.5 (BytePlus)" },
  "fal-seedance-2-5": { unit: "per second", base: 87, description: "Seedance 2.5 (fal.ai)" },
  "dreamina-seedance-2-0-260128": { unit: "per second", base: 32, description: "Seedance 2.0 (BytePlus)", byResolution: { ...seedanceResolutionCurve } },
  "fal-seedance-2-0": { unit: "per second", base: 32, description: "Seedance 2.0 (fal.ai)", byResolution: { ...seedanceResolutionCurve } },
  "dreamina-seedance-2-0-fast-260128": { unit: "per second", base: 26, description: "Seedance 2.0 Fast (BytePlus)", byResolution: extendSeedanceRates({ "720p": 26, "480p": 13 }) },
  "fal-seedance-2-0-fast": { unit: "per second", base: 26, description: "Seedance 2.0 Fast (fal.ai)", byResolution: extendSeedanceRates({ "720p": 26, "480p": 13 }) },
  "dreamina-seedance-2-0-mini-260615": { unit: "per second", base: 9, description: "Seedance 2.0 Mini (BytePlus)", byResolution: extendSeedanceRates({ "480p": 9 }) },
  "fal-seedance-2-0-mini": { unit: "per second", base: 9, description: "Seedance 2.0 Mini (fal.ai)", byResolution: extendSeedanceRates({ "480p": 9 }) },
  // Veo 3.1 runs against veo-3.1-generate-preview, the standard tier, priced at
  // 674 credits for 8 seconds at 720p and 1080p alike.
  "google-veo-3-1": { unit: "per second", base: 674 / 8, description: "Veo 3.1 Standard" },
  "google-omni-flash": { unit: "per second", base: 169 / 8, description: "Omni Flash" },
  "google-gemini-2-5-pro": { unit: "per second", base: 169 / 8, description: "Gemini 2.5 Pro (Omni Flash rate)", estimated: true },
  "fal-minimax-h3": {
    unit: "per second",
    base: 135 / 8,
    description: "MiniMax H3",
    // The card quotes 768p and 2K; 480p through 1080p take the 768p rate and 4K takes 2K's.
    byResolution: { "480p": 135 / 8, "720p": 135 / 8, "1080p": 135 / 8, "4K": 220 / 8 },
  },
  "fal-minimax-video-01": { unit: "per second", base: 135 / 8, description: "MiniMax Video-01 (MiniMax H3 rate)", estimated: true },
  "fal-kling-3": { unit: "per second", base: 135 / 8, description: "Kling 3.0 (MiniMax H3 rate)", estimated: true },
  "fal-kling-o3": { unit: "per second", base: 135 / 8, description: "Kling O3 (MiniMax H3 rate)", estimated: true },
  "fal-kling-1-6-pro": { unit: "per second", base: 135 / 8, description: "Kling 1.6 Pro (MiniMax H3 rate)", estimated: true },
}

// A model with no card entry is priced at the cheapest quoted tier of its kind,
// so an unpriced model can never bill more than something the card covers.
const fallbackRates: Record<"image" | "video", ModelCreditRate> = {
  image: { unit: "per image", base: 7, description: "Unlisted image model", estimated: true },
  video: { unit: "per second", base: 135 / 8, description: "Unlisted video model", estimated: true },
}

export function creditRateFor(modelId: string, type: "image" | "video"): ModelCreditRate {
  return MODEL_CREDIT_RATES[modelId] || fallbackRates[type]
}

/** The per-unit rate for one variant, before it is multiplied by runtime. */
export function creditUnitRate(
  modelId: string,
  type: "image" | "video",
  options?: { quality?: CreditQuality; resolution?: string },
): number {
  const rate = creditRateFor(modelId, type)
  const byQuality = options?.quality ? rate.byQuality?.[options.quality] : undefined
  if (byQuality !== undefined) return byQuality
  const byResolution = options?.resolution ? rate.byResolution?.[options.resolution] : undefined
  if (byResolution !== undefined) return byResolution
  return rate.base
}

export function calculateCreditCost(
  modelId: string,
  type: "image" | "video",
  durationSeconds = 5,
  options?: {
    quality?: CreditQuality
    aspectRatio?: string
    resolution?: string
  },
): number {
  const rate = creditRateFor(modelId, type)
  const unitRate = creditUnitRate(modelId, type, { quality: options?.quality, resolution: options?.resolution })
  // Rounding up once, at the end, is what the rate card's formula specifies:
  // rounding the per-second rate first would overcharge every long clip.
  const units = rate.unit === "per second" ? Math.max(1, durationSeconds) : 1
  return Math.max(1, Math.ceil(unitRate * units))
}

export async function getUserCredits(userId: string, client?: SupabaseClient): Promise<number> {
  const supabase = client ?? createBrowserClient()
  const { data, error } = await supabase.rpc("get_user_credits", { p_user_id: userId })
  if (error) {
    console.warn("Could not fetch user credits balance:", error.message)
    return 100
  }
  return typeof data === "number" ? data : 100
}

export async function deductUserCredits(
  userId: string,
  amount: number,
  modelId: string,
  description = "AI Generation",
  client?: SupabaseClient,
): Promise<{ success: boolean; newBalance: number; errorMessage: string | null }> {
  const supabase = client ?? createBrowserClient()
  const { data, error } = await supabase.rpc("deduct_user_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_model: modelId,
    p_description: description,
  })

  if (error) {
    return { success: false, newBalance: 0, errorMessage: error.message }
  }

  const result = Array.isArray(data) ? data[0] : data
  return {
    success: Boolean(result?.success),
    newBalance: Number(result?.new_balance ?? 0),
    errorMessage: result?.error_message || null,
  }
}

/**
 * Grant credits outright.
 *
 * `add_user_credits` is service-role only — granting credit is something the
 * server does after it has verified a payment, never something a session asks
 * for. The client is required rather than defaulted for that reason: a browser
 * client here would fail at the database, which is a confusing way to find out.
 *
 * For a Razorpay top-up, prefer `grant_purchased_credits`, which is idempotent
 * on the payment id and cannot double-credit a replayed submission.
 */
export async function addUserCredits(
  userId: string,
  amount: number,
  type = "purchase",
  description = "Credit Top Up",
  client: SupabaseClient,
): Promise<number> {
  const supabase = client
  const { data, error } = await supabase.rpc("add_user_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_type: type,
    p_description: description,
  })

  if (error) {
    throw new Error(`Failed to add credits: ${error.message}`)
  }

  return Number(data ?? 0)
}

export async function refundGenerationCredits(
  userId: string,
  amount: number,
  refundKey: string,
  description = "Failed generation refund",
  jobId?: string | null,
  client?: SupabaseClient,
): Promise<{ refunded: boolean; newBalance: number }> {
  const supabase = client ?? createBrowserClient()
  const { data, error } = await supabase.rpc("refund_generation_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_refund_key: refundKey,
    p_description: description,
    p_job_id: jobId || null,
  })
  if (error) throw new Error(`Failed to refund credits: ${error.message}`)
  const result = Array.isArray(data) ? data[0] : data
  return { refunded: Boolean(result?.refunded), newBalance: Number(result?.new_balance ?? 0) }
}
