/**
 * Managed production — the vocabulary that is not for sale.
 *
 * Statuses, the options a brief offers, and where a client's files live. The
 * catalogue itself — services, packages, prices — used to be here too, but it
 * is editable from the admin panel now and lives in the database; see
 * `managed-offers.ts` for the shapes and `managed/catalogue.ts` for the read.
 *
 * The rule that moved with it: a price is resolved by the server from the
 * catalogue and never taken from the request body, so a browser holding a stale
 * price button gets an order at today's price rather than yesterday's.
 */

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
