import type { Metadata } from "next"
import { agencyMetadata } from "@/lib/site-metadata"

/**
 * /hire-us is the agency's own page, and it is a client component, so its
 * title and description live here. Nested pages (the brief, a client's
 * projects) inherit them unless they set their own.
 */
export const metadata: Metadata = agencyMetadata("/hire-us")

export default function HireUsLayout({ children }: { children: React.ReactNode }) {
  return children
}
