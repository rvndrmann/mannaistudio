import type { Metadata } from "next"

/**
 * How the site introduces itself to search engines and link previews.
 *
 * The business is the done-for-you agency now, so that is what the defaults
 * say: a page that sets nothing of its own (and the site name Google shows next
 * to every result) should describe the agency, not the AI Director agent the
 * site used to lead with. Kept in one place so the homepage, /hire-us and the
 * root defaults cannot drift into three different pitches.
 */

export const SITE_URL = "https://www.aidirectorhub.com"
export const SITE_NAME = "AI Director Hub"

export const AGENCY_TITLE = "AI Director Hub | Done-for-You AI Video Ads for Brands"
export const AGENCY_DESCRIPTION =
  "Done-for-you AI video ads for brands. Send a brief and our team produces UGC ads, product videos, direct-response creatives and cinematic campaigns — with storyboard sign-off, revisions and final files."

export const AGENCY_KEYWORDS = [
  "done-for-you AI video ads",
  "AI ad agency",
  "AI UGC ads",
  "AI product videos",
  "direct-response video ads",
  "AI video production agency",
  "performance ad creatives",
]

/**
 * Open Graph and Twitter for one page.
 *
 * Next merges metadata shallowly, so a page that sets `openGraph` at all loses
 * the root's site name and image unless it carries them itself.
 */
export function socialMetadata({ title, description, path }: { title: string; description: string; path: string }): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: path,
      title,
      description,
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  }
}

/** The done-for-you homepage and /hire-us. */
export function agencyMetadata(path: string): Metadata {
  return {
    title: AGENCY_TITLE,
    description: AGENCY_DESCRIPTION,
    keywords: AGENCY_KEYWORDS,
    alternates: { canonical: path },
    ...socialMetadata({ title: AGENCY_TITLE, description: AGENCY_DESCRIPTION, path }),
  }
}
