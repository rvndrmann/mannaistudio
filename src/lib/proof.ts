import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js"
import { embedThumbnailUrl, isEmbeddedVideo } from "@/lib/video-embed"

/**
 * Proof: the three kinds of evidence the homepage is allowed to show.
 *
 * Everything a visitor reads as "this works" — a piece of client work, a
 * student's review, a sale — is a row an admin published in /admin/proof. There
 * is no fallback copy and no sample data: a section with nothing published
 * behind it is not rendered at all, because a placeholder testimonial is a
 * fabricated one.
 *
 * The rows live in `showcase_items`, the table that has always fed the
 * homepage's work reel. Four of the names here differ from its columns
 * (poster/thumbnail, video/video_url, featured/is_featured, sortOrder/position);
 * `toProofItem` is the one place that knows that.
 */

export const proofTypes = [
  { key: "portfolio", label: "Portfolio" },
  { key: "student_review", label: "Student review" },
  { key: "sale_proof", label: "Client sale" },
] as const

export type ProofType = (typeof proofTypes)[number]["key"]

export const proofCategories = [
  { key: "ugc", label: "UGC Ad" },
  { key: "product", label: "Product Ad" },
  { key: "fashion", label: "Fashion" },
  { key: "beauty", label: "Beauty" },
  { key: "film", label: "Film" },
  { key: "other", label: "Other" },
] as const

export const proofCurrencies = ["INR", "USD"] as const
export type ProofCurrency = (typeof proofCurrencies)[number]

export const MAX_PROOF_SCREENSHOTS = 6

export type ProofScreenshot = { url: string; thumb: string }

export type ProofItem = {
  id: string
  type: ProofType
  title: string
  category: string
  personName: string
  personRole: string
  avatarImage: string
  quote: string
  screenshots: ProofScreenshot[]
  video: string
  posterImage: string
  amount: number | null
  currency: ProofCurrency | null
  date: string | null
  consentConfirmed: boolean
  featured: boolean
  published: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export function isProofType(value: unknown): value is ProofType {
  return proofTypes.some((type) => type.key === value)
}

/** Rows saved under the old showcase categories still get a sensible label. */
export function proofCategoryLabel(key: string): string {
  const known = proofCategories.find((category) => category.key === key)
  if (known) return known.label
  if (key === "ai_ugc" || key === "direct_response") return "UGC Ad"
  if (key === "product_video" || key === "dtc" || key === "ai_commercial") return "Product Ad"
  if (key === "ai_film" || key === "cinematic" || key === "microdrama") return "Film"
  return "Other"
}

function text(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function toScreenshots(value: unknown): ProofScreenshot[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (typeof entry === "string") return { url: entry, thumb: entry }
      const url = text((entry as { url?: unknown })?.url)
      return { url, thumb: text((entry as { thumb?: unknown })?.thumb) || url }
    })
    .filter((shot) => shot.url)
    .slice(0, MAX_PROOF_SCREENSHOTS)
}

export function toProofItem(row: Record<string, unknown>): ProofItem {
  const amount = row.amount === null || row.amount === undefined || row.amount === "" ? null : Number(row.amount)
  return {
    id: String(row.id || ""),
    type: isProofType(row.type) ? row.type : "portfolio",
    title: text(row.title),
    category: text(row.category) || "other",
    personName: text(row.person_name),
    personRole: text(row.person_role),
    avatarImage: text(row.avatar_image),
    quote: text(row.quote),
    screenshots: toScreenshots(row.screenshots),
    video: text(row.video_url),
    posterImage: text(row.thumbnail),
    amount: amount !== null && Number.isFinite(amount) ? amount : null,
    currency: row.currency === "INR" || row.currency === "USD" ? row.currency : null,
    date: text(row.proof_date) || null,
    consentConfirmed: row.consent_confirmed === true,
    featured: row.is_featured === true,
    published: row.published === true,
    sortOrder: typeof row.position === "number" ? row.position : 0,
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  }
}

/** The inverse of `toProofItem`, for the columns an admin may write. */
export function toProofRow(item: Omit<ProofItem, "id" | "createdAt" | "updatedAt">) {
  return {
    type: item.type,
    title: item.title.trim(),
    category: item.category || "other",
    person_name: item.personName.trim(),
    person_role: item.personRole.trim(),
    avatar_image: item.avatarImage,
    quote: item.quote.trim(),
    screenshots: item.screenshots.slice(0, MAX_PROOF_SCREENSHOTS),
    video_url: item.video.trim(),
    thumbnail: item.posterImage,
    amount: item.amount,
    currency: item.amount === null ? null : item.currency || "INR",
    proof_date: item.date || null,
    consent_confirmed: item.consentConfirmed,
    is_featured: item.featured,
    published: item.published,
    position: item.sortOrder,
  }
}

/**
 * Why a row may not be published, or null if it may.
 *
 * The database holds the same two rules as a check constraint; this exists so
 * the admin is told which one in a sentence rather than by a constraint name.
 */
export function publishBlocker(item: Pick<ProofItem, "consentConfirmed" | "video" | "posterImage">): string | null {
  if (!item.consentConfirmed) return "Confirm this person agreed to be shown publicly before publishing."
  if (item.video.trim() && !item.posterImage) return "A video needs a poster image before it can be published."
  return null
}

/** The still shown before anything plays. Never empty for a published video. */
export function proofPoster(item: Pick<ProofItem, "posterImage" | "video" | "screenshots">): string {
  return item.posterImage || embedThumbnailUrl(item.video) || item.screenshots[0]?.thumb || ""
}

/** An uploaded file that a `<video>` element can play, as opposed to an embed. */
export function isPlayableFile(item: Pick<ProofItem, "video">): boolean {
  return Boolean(item.video) && !isEmbeddedVideo(item.video)
}

export function formatProofAmount(amount: number | null, currency: ProofCurrency | null): string {
  if (amount === null) return ""
  return currency === "USD"
    ? `$${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
}

/* -------------------------------------------------------------------------- */
/* Page settings                                                               */
/* -------------------------------------------------------------------------- */

export type ProofPageSettings = {
  /** Reason 5 and the FAQ. Empty hides the line in both. */
  costExample: string
  /** The API key setup guide. Empty hides the link. */
  apiGuideUrl: string
  showCommunityReason: boolean
  showAnnualPlan: boolean
  annualPrice: number | null
  /** A screenshot or screen recording of Creator Studio, for the Agent block. */
  studioDemoUrl: string
  studioDemoPoster: string
}

export const defaultProofPageSettings: ProofPageSettings = {
  costExample: "",
  apiGuideUrl: "",
  showCommunityReason: false,
  showAnnualPlan: false,
  annualPrice: null,
  studioDemoUrl: "",
  studioDemoPoster: "",
}

export function toProofPageSettings(value: unknown): ProofPageSettings {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>
  const price = Number(raw.annual_price)
  return {
    costExample: text(raw.cost_example).trim(),
    apiGuideUrl: /^https?:\/\//i.test(text(raw.api_guide_url)) || text(raw.api_guide_url).startsWith("/") ? text(raw.api_guide_url).trim() : "",
    showCommunityReason: raw.show_community_reason === true,
    showAnnualPlan: raw.show_annual_plan === true,
    annualPrice: raw.annual_price !== null && raw.annual_price !== undefined && Number.isFinite(price) && price > 0 ? price : null,
    studioDemoUrl: text(raw.studio_demo_url).trim(),
    studioDemoPoster: text(raw.studio_demo_poster).trim(),
  }
}

export function toProofPageSettingsRow(settings: ProofPageSettings) {
  return {
    cost_example: settings.costExample,
    api_guide_url: settings.apiGuideUrl,
    show_community_reason: settings.showCommunityReason,
    show_annual_plan: settings.showAnnualPlan,
    annual_price: settings.annualPrice === null ? "" : String(settings.annualPrice),
    studio_demo_url: settings.studioDemoUrl,
    studio_demo_poster: settings.studioDemoPoster,
  }
}

/* -------------------------------------------------------------------------- */
/* Public reads                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A client with no session.
 *
 * Public proof is read as a stranger on purpose. An admin's own session can see
 * drafts — row security allows it, the manager needs it — and a homepage
 * rendered through that session would show the admin a page their visitors do
 * not get.
 */
export function createPublicClient(): SupabaseClient {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function fetchPublishedProof(
  supabase: SupabaseClient,
  options: { type?: ProofType; featured?: boolean; limit?: number } = {},
): Promise<ProofItem[]> {
  let query = supabase
    .from("showcase_items")
    .select("*")
    // Stated as well as enforced by row security, so the answer is the same
    // whoever's client this happens to be.
    .eq("published", true)
    .is("deleted_at", null)
    .order("position", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(options.limit ?? 60, 1), 100))
  if (options.type) query = query.eq("type", options.type)
  if (options.featured !== undefined) query = query.eq("is_featured", options.featured)

  const { data, error } = await query
  if (error || !data) return []
  // The guard is in the database too; this is for a row that predates it.
  return data.map(toProofItem).filter((item) => item.consentConfirmed)
}

export async function fetchProofPageSettings(supabase: SupabaseClient): Promise<ProofPageSettings> {
  try {
    const { data } = await supabase.from("site_settings").select("value").eq("key", "proof_page").maybeSingle()
    return toProofPageSettings(data?.value)
  } catch {
    return defaultProofPageSettings
  }
}
