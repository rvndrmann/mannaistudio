/**
 * Managed production — the catalogue, the pricing, and the vocabulary.
 *
 * Shared by the marketing page, the brief, the checkout route, the client
 * dashboard and the admin queue, so that what a service is called, what a
 * package costs, and what a status means are stated once. The checkout route
 * prices an order from `packageFor()` and never from the request body, the same
 * rule the season pass follows: a browser holding a stale price button gets an
 * order at today's price rather than yesterday's.
 *
 * Prices are in rupees because Razorpay settles in rupees; `formatUsdWithInr`
 * in currency.ts is what puts a dollar figure in front of them.
 */

export const MANAGED_SERVICE_KEYS = ["ugc", "direct_response", "cinematic", "micro_drama"] as const
export type ManagedServiceKey = (typeof MANAGED_SERVICE_KEYS)[number]

export type ManagedPackage = {
  key: string
  name: string
  /** "3 × 30-second videos" — the line that goes on the order summary. */
  summary: string
  videoCount: number
  durationSeconds: number
  revisions: number
  priceInr: number
  includes: string[]
  /** The one package pre-selected when a service is opened. */
  popular?: boolean
}

export type ManagedService = {
  key: ManagedServiceKey
  name: string
  tagline: string
  description: string
  /** The button on the service card. */
  cta: string
  deliverables: string[]
  /** Creative-direction options, which differ per service (brief step 5). */
  styles: string[]
  packages: ManagedPackage[]
  /**
   * Micro-drama is sold as a conversation, not a package: the episode count,
   * the cast and the integration all have to be agreed before anyone can quote
   * it honestly. It takes the same brief and opens the same project, with no
   * checkout in the middle.
   */
  quoteOnly?: boolean
}

export const MANAGED_SERVICES: ManagedService[] = [
  {
    key: "ugc",
    name: "UGC Ads",
    tagline: "Creator-style ads that look native to the feed",
    description:
      "Testimonial, problem/solution and social-native ads made to look like a real person filmed them — not like an ad.",
    cta: "Start UGC Project",
    deliverables: ["15-second UGC ad", "30-second UGC ad", "60-second UGC ad", "Multiple hooks and variations"],
    styles: [
      "Creator testimonial",
      "Problem → Solution",
      "Product demo",
      "Founder-style",
      "Storytime",
      "Review",
      "Before / after",
      "TikTok / Reels native",
      "AI avatar creator",
      "Custom",
    ],
    packages: [
      {
        key: "ugc_starter",
        name: "UGC Starter",
        summary: "1 × 30-second video",
        videoCount: 1,
        durationSeconds: 30,
        revisions: 2,
        priceInr: 7_999,
        includes: ["Script + creative direction", "AI production and editing", "2 revisions", "One aspect ratio"],
      },
      {
        key: "ugc_pack",
        name: "UGC Ad Pack",
        summary: "3 × 30-second videos",
        videoCount: 3,
        durationSeconds: 30,
        revisions: 2,
        priceInr: 19_999,
        includes: ["3 distinct hooks", "Script + creative direction", "AI production and editing", "2 revisions per video"],
        popular: true,
      },
      {
        key: "ugc_testing",
        name: "UGC Testing Set",
        summary: "6 × 30-second videos",
        videoCount: 6,
        durationSeconds: 30,
        revisions: 2,
        priceInr: 34_999,
        includes: ["6 hooks built to be tested against each other", "Script + creative direction", "2 revisions per video"],
      },
    ],
  },
  {
    key: "direct_response",
    name: "Direct Response Ads",
    tagline: "Performance ads built around hook, problem, proof and offer",
    description:
      "Written to sell: a hook that stops the scroll, the problem stated plainly, the benefit, the proof, the offer, the call to action.",
    cta: "Create Video Ads",
    deliverables: ["Hook-led performance ads", "Offer and CTA variations", "Platform-native cuts"],
    styles: [
      "Aggressive performance ad",
      "Educational",
      "Emotional",
      "Comparison",
      "Product demonstration",
      "Offer-led",
      "Social proof",
      "Cinematic performance ad",
    ],
    packages: [
      {
        key: "dr_single",
        name: "Single Ad",
        summary: "1 × 30-second direct response ad",
        videoCount: 1,
        durationSeconds: 30,
        revisions: 2,
        priceInr: 11_999,
        includes: ["Direct response script", "AI production and editing", "2 revisions"],
      },
      {
        key: "dr_campaign",
        name: "Campaign Pack",
        summary: "3 × 30-second ads with different angles",
        videoCount: 3,
        durationSeconds: 30,
        revisions: 2,
        priceInr: 27_999,
        includes: ["3 angles: problem, proof, offer", "Direct response scripts", "2 revisions per video"],
        popular: true,
      },
      {
        key: "dr_scale",
        name: "Scale Pack",
        summary: "5 × 45-second ads",
        videoCount: 5,
        durationSeconds: 45,
        revisions: 2,
        priceInr: 49_999,
        includes: ["5 ads built for continuous testing", "Direct response scripts", "2 revisions per video"],
      },
    ],
  },
  {
    key: "cinematic",
    name: "Cinematic Product Ads",
    tagline: "Commercials and brand films with real production value",
    description:
      "Higher-craft product commercials — lighting, camera movement, grade and sound designed rather than assembled.",
    cta: "Create Cinematic Ad",
    deliverables: ["30-second product commercial", "60-second brand film", "Hero product sequences"],
    styles: [
      "Product hero film",
      "Brand film",
      "Lifestyle narrative",
      "Macro / texture led",
      "Launch teaser",
      "Luxury / editorial",
      "Custom",
    ],
    packages: [
      {
        key: "cine_spot",
        name: "Cinematic Spot",
        summary: "1 × 30-second cinematic ad",
        videoCount: 1,
        durationSeconds: 30,
        revisions: 2,
        priceInr: 24_999,
        includes: ["Creative direction and shot design", "Cinematic AI production", "Sound design", "2 revisions"],
        popular: true,
      },
      {
        key: "cine_film",
        name: "Brand Film",
        summary: "1 × 60-second brand film",
        videoCount: 1,
        durationSeconds: 60,
        revisions: 2,
        priceInr: 44_999,
        includes: ["Concept and script", "Cinematic AI production", "Sound design and grade", "2 revisions"],
      },
      {
        key: "cine_launch",
        name: "Launch Set",
        summary: "1 × 60-second film + 2 × 15-second cutdowns",
        videoCount: 3,
        durationSeconds: 60,
        revisions: 2,
        priceInr: 64_999,
        includes: ["Hero film plus two social cutdowns", "Concept and script", "Sound design and grade", "2 revisions each"],
      },
    ],
  },
  {
    key: "micro_drama",
    name: "Branded Micro-Drama",
    tagline: "Serialised story where the product lives inside the plot",
    description:
      "Episodic story-led content built the way our Originals are, with your product integrated into the drama rather than announced after it.",
    cta: "Request Proposal",
    quoteOnly: true,
    deliverables: ["Serialised episodes", "Recurring cast and world", "Product integrated into the story"],
    styles: [
      "Romance / relationship drama",
      "Revenge / redemption",
      "Workplace drama",
      "Thriller",
      "Comedy",
      "Slice of life",
      "Custom",
    ],
    packages: [],
  },
]

export const MANAGED_ASPECT_RATIOS = [
  { value: "9:16", label: "9:16 vertical", hint: "Reels, TikTok, Shorts" },
  { value: "1:1", label: "1:1 square", hint: "Feed" },
  { value: "16:9", label: "16:9 landscape", hint: "YouTube, website" },
] as const

export const MANAGED_PLATFORMS = [
  "Instagram", "Facebook", "TikTok", "YouTube", "LinkedIn", "Website", "Other",
] as const

export const MANAGED_GOALS = [
  "Generate sales", "Get leads", "Product awareness", "Product launch",
  "Retargeting", "Organic social content", "App installs", "Other",
] as const

export const MANAGED_CTAS = [
  "Buy Now", "Shop Now", "Learn More", "Book a Call", "Download App", "Get Quote",
] as const

export function serviceFor(key: string): ManagedService | null {
  return MANAGED_SERVICES.find((service) => service.key === key) ?? null
}

/**
 * The one place a package is resolved.
 *
 * Returns null rather than a default for an unknown key, so a checkout request
 * naming a package that does not exist is refused instead of quietly priced as
 * the cheapest one.
 */
export function packageFor(serviceKey: string, packageKey: string): ManagedPackage | null {
  const service = serviceFor(serviceKey)
  if (!service) return null
  return service.packages.find((option) => option.key === packageKey) ?? null
}

export function defaultPackageFor(serviceKey: string): ManagedPackage | null {
  const service = serviceFor(serviceKey)
  if (!service?.packages.length) return null
  return service.packages.find((option) => option.popular) ?? service.packages[0]
}

export function serviceName(key: string): string {
  return serviceFor(key)?.name ?? "Managed production"
}

/* -------------------------------------------------------------------------- */
/* The pipeline                                                                */
/* -------------------------------------------------------------------------- */

export const MANAGED_STATUSES = [
  "brief_received", "creative_research", "script_in_progress", "script_review",
  "production", "first_cut", "revision_requested", "finalizing", "completed",
] as const

export type ManagedStatus = (typeof MANAGED_STATUSES)[number] | "cancelled"

export const MANAGED_STATUS_LABELS: Record<string, string> = {
  brief_received: "Brief Received",
  creative_research: "Creative Research",
  script_in_progress: "Script In Progress",
  script_review: "Script Ready for Review",
  production: "Production",
  first_cut: "First Cut Ready",
  revision_requested: "Revision Requested",
  finalizing: "Finalizing",
  completed: "Completed",
  cancelled: "Cancelled",
}

/**
 * What the client is told is happening, per stage.
 *
 * A timeline that only names stages makes someone guess whether "Creative
 * Research" means anyone has started. These say who has the ball.
 */
export const MANAGED_STATUS_BLURBS: Record<string, string> = {
  brief_received: "We have your brief and the team is picking it up.",
  creative_research: "We are researching your market, audience and the ads already working in it.",
  script_in_progress: "Writing the script and creative direction.",
  script_review: "Your script is ready — tell us in the chat if anything should change.",
  production: "In production: scenes, shots and footage are being generated.",
  first_cut: "Your first cut is ready to review.",
  revision_requested: "Revision received. Our team is updating your video.",
  finalizing: "Final grade, sound and exports.",
  completed: "Delivered. Your final files are ready to download.",
  cancelled: "This project was cancelled.",
}

/** Where the pipeline has got to, for the progress bar. -1 when cancelled. */
export function statusIndex(status: string): number {
  return (MANAGED_STATUSES as readonly string[]).indexOf(status)
}

export const DELIVERABLE_STATUS_LABELS: Record<string, string> = {
  in_production: "In Production",
  ready_for_review: "Ready for Review",
  revision_requested: "Revision Requested",
  approved: "Approved",
}

/** Deliverables that are the client's move, which is what drives the badge. */
export function needsClientAction(deliverableStatus: string): boolean {
  return deliverableStatus === "ready_for_review"
}

/* -------------------------------------------------------------------------- */
/* Storage                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Where a client-visible file lives.
 *
 * `managed/{projectId}/uploads/` is written by the client; `.../deliverables/`
 * is written by the publish route under the service key. Everything the studio
 * generates stays at `{ownerId}/{studioProjectId}/...` and is never referenced
 * from a managed row — publishing copies the bytes into this prefix instead, so
 * an internal take has no path a client could be handed.
 */
export const MANAGED_MEDIA_BUCKET = "creator-studio-media"

export function managedUploadPrefix(projectId: string): string {
  return `managed/${projectId}/uploads`
}

export function managedDeliverablePrefix(projectId: string): string {
  return `managed/${projectId}/deliverables`
}

export function isManagedClientPath(projectId: string, path: string): boolean {
  return typeof path === "string" && path.startsWith(`managed/${projectId}/`) && !path.includes("..")
}

/** "01:07" for a revision comment, and for the timeline scrubber's readout. */
export function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00"
  const whole = Math.floor(seconds)
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`
}
