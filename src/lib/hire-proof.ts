import { unstable_cache } from "next/cache"
import {
  createPublicClient,
  fetchProofPageSettings,
  fetchPublishedProof,
  proofCategoryLabel,
  proofPoster,
  toWallItem,
} from "@/lib/proof"

/**
 * What the done-for-you pages show as evidence — client sales, reviews and
 * produced work, as published in /admin/proof — plus the "Book a call" link.
 *
 * Read on the server so a visitor sees the reviews in the first paint, and
 * held for a minute, like the academy homepage: that is how long a change in
 * /admin/proof can take to appear on `/` and `/hire-us`.
 */
export const loadHireProof = unstable_cache(
  async () => {
    const supabase = createPublicClient()
    const [proof, settings] = await Promise.all([
      fetchPublishedProof(supabase, { limit: 100 }),
      fetchProofPageSettings(supabase),
    ])
    return {
      bookCallUrl: settings.bookCallUrl,
      sales: proof.filter((item) => item.type === "sale_proof").map(toWallItem),
      reviews: proof.filter((item) => item.type === "student_review").map(toWallItem),
      work: proof
        .filter((item) => item.type === "portfolio" && item.video && proofPoster(item))
        .map((item) => ({ id: item.id, title: item.title, label: proofCategoryLabel(item.category), video: item.video, poster: proofPoster(item) })),
    }
  },
  ["hire-proof"],
  { revalidate: 60 },
)
