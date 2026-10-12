import type { Metadata } from "next"
import AcademyHome, { academyMetadata } from "@/components/home/AcademyHome"

/**
 * The Pro landing page at a fixed address, for ad campaigns.
 *
 * `/` serves whichever homepage the admin has switched on; an ad has to keep
 * landing on this one whatever that switch says. Canonical to `/` so the two
 * are not indexed as duplicates of each other.
 */
export const metadata: Metadata = { ...academyMetadata, alternates: { canonical: "/" } }

export default function StartPage() {
  return <AcademyHome />
}
