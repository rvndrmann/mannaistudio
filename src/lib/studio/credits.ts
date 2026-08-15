import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient as createBrowserClient } from "@/lib/supabase/client"

export const CREDIT_EXCHANGE_RATE = {
  creditsPerDollar: 100, // 1,000 Credits = $10 USD ($0.01 / credit)
  pricePerThousand: 10,
}

// 2x API Cost Pricing Model
export const MODEL_CREDIT_COSTS: Record<string, { cost: number; unit: string; description: string }> = {
  // Image Models
  "dola-seedream-5-0-pro-260628": { cost: 3, unit: "per image", description: "Seedream 5.0 Pro" },
  "doubao-image-v2-3001": { cost: 2, unit: "per image", description: "Doubao Image" },
  "gpt-image-2": { cost: 8, unit: "per image", description: "GPT Image 2" },
  "gpt-image-1.5": { cost: 8, unit: "per image", description: "GPT Image 1.5" },
  "google-nano-banana-2": { cost: 2, unit: "per image", description: "Nano Banana 2" },
  "fal-flux-3": { cost: 5, unit: "per image", description: "Flux 3" },
  "fal-flux-dev": { cost: 5, unit: "per image", description: "Flux Dev" },
  "fal-flux-realism": { cost: 5, unit: "per image", description: "Flux Realism" },

  // Video Models (~4-5s standard output)
  // Priced by the second: a 2.5 clip costs the same per second whatever its
  // length, so a flat per-video figure under-charged every long shot.
  "dreamina-seedance-2-5-260628": { cost: 50, unit: "per second", description: "Seedance 2.5 (BytePlus)" },
  "fal-seedance-2-5": { cost: 50, unit: "per second", description: "Seedance 2.5 (fal.ai)" },
  "dreamina-seedance-2-0-260128": { cost: 14, unit: "per video", description: "Seedance 2.0 (BytePlus)" },
  "fal-seedance-2-0": { cost: 14, unit: "per video", description: "Seedance 2.0 (fal.ai)" },
  "dreamina-seedance-2-0-fast-260128": { cost: 10, unit: "per video", description: "Seedance 2.0 Fast (BytePlus)" },
  "fal-seedance-2-0-fast": { cost: 10, unit: "per video", description: "Seedance 2.0 Fast (fal.ai)" },
  "dreamina-seedance-2-0-mini-260615": { cost: 6, unit: "per video", description: "Seedance 2.0 Mini (BytePlus)" },
  "fal-seedance-2-0-mini": { cost: 6, unit: "per video", description: "Seedance 2.0 Mini (fal.ai)" },
  "google-veo-3-1": { cost: 20, unit: "per video", description: "Veo 3.1" },
  "google-gemini-2-5-pro": { cost: 16, unit: "per video", description: "Gemini 2.5 Pro" },
  "google-omni-flash": { cost: 12, unit: "per video", description: "Omni Flash" },
  "fal-kling-3": { cost: 16, unit: "per video", description: "Kling 3" },
  "fal-kling-o3": { cost: 16, unit: "per video", description: "Kling O3" },
  "fal-kling-1-6-pro": { cost: 16, unit: "per video", description: "Kling 1.6 Pro" },
  "fal-minimax-h3": { cost: 16, unit: "per video", description: "MiniMax H3" },
  "fal-minimax-video-01": { cost: 16, unit: "per video", description: "MiniMax Video-01" },
}

export function calculateCreditCost(
  modelId: string,
  type: "image" | "video",
  durationSeconds = 5,
  options?: {
    quality?: "Low" | "Medium" | "High" | "Ultra"
    aspectRatio?: string
    resolution?: string
  },
): number {
  const modelConfig = MODEL_CREDIT_COSTS[modelId]
  let baseCost = modelConfig ? modelConfig.cost : (type === "video" ? 10 : 3)

  // A per-second model bills its rate for every second of the clip. A per-video
  // model quotes a five-second clip and scales beyond that.
  const perSecond = modelConfig?.unit === "per second"
  if (type === "video" && perSecond) {
    baseCost = Math.ceil(baseCost * Math.max(1, durationSeconds))
  } else if (type === "video" && durationSeconds > 5) {
    baseCost = Math.ceil(baseCost * (durationSeconds / 5))
  }

  // Quality scaling
  const quality = options?.quality || "Medium"
  let qualityMultiplier = 1.0
  if (quality === "Low") qualityMultiplier = 0.6
  else if (quality === "Medium") qualityMultiplier = 1.0
  else if (quality === "High") qualityMultiplier = 2.4 // e.g. 7 -> 17 credits
  else if (quality === "Ultra") qualityMultiplier = 3.2

  // Resolution scaling
  const resolution = options?.resolution || "720p"
  let resolutionMultiplier = 1.0
  if (resolution === "480p") resolutionMultiplier = 0.85
  else if (resolution === "1080p") resolutionMultiplier = 1.4
  else if (resolution === "4K") resolutionMultiplier = 2.5

  const totalCost = Math.round(baseCost * qualityMultiplier * resolutionMultiplier)
  return Math.max(1, totalCost)
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

export async function addUserCredits(
  userId: string,
  amount: number,
  type = "purchase",
  description = "Credit Top Up",
  client?: SupabaseClient,
): Promise<number> {
  const supabase = client ?? createBrowserClient()
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
