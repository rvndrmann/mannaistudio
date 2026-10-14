import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { fetchHomeVariant, isHomeVariant } from "@/lib/home-variant"
import AcademyHome, { academyMetadata } from "@/components/home/AcademyHome"
import { agencyMetadata } from "@/lib/site-metadata"

// The variant is read per request so flipping the switch in Admin takes effect
// on the next page load. The academy homepage renders its content on the
// server; the others are client components that fetch their own.
export const dynamic = "force-dynamic"

/**
 * The title and description follow whichever homepage is live.
 *
 * A page selling performance ads that introduces itself to Google as an AI
 * Director agent is answering a question nobody asked — and the variant is the
 * whole point of the switch, so the metadata has to move with it.
 */
export async function generateMetadata(): Promise<Metadata> {
  const variant = await fetchHomeVariant(await createClient())
  if (variant === "hire") return agencyMetadata("/")
  if (variant === "creative-agent") {
    return {
      title: "AI Director Hub | Tell us what you want to create",
      description: "Tell the Creative Agent what you want to make, share your references, and place a production order with our creative team.",
    }
  }
  if (variant === "academy") {
    return {
      ...academyMetadata,
    }
  }
  if (variant === "originals") {
    return {
      title: "AI Director Hub Originals — AI short drama series",
      description: "Watch original AI-made short drama series. New episodes weekly.",
    }
  }
  return {}
}

export default async function Home({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()
  // `?home=hire` renders that homepage for this one request. A preview, not a
  // switch: nothing is written, everyone else still gets whatever is live, and
  // it costs nothing to expose because every variant is a public page reachable
  // at its own URL anyway. Reading a homepage end to end before making it the
  // front door is otherwise only possible by making it the front door.
  const requested = (await searchParams).home
  const variant = isHomeVariant(requested) ? requested : await fetchHomeVariant(supabase)

  if (variant === "academy") return <AcademyHome />

  // The other homepages are imported only when they are the one being served.
  // Imported at the top of the file, every visitor to the academy page was sent
  // the scripts for all four of them — an animation library included — to
  // render a page that uses none of it.
  if (variant === "originals") {
    const { default: OriginalsHome } = await import("@/components/home/OriginalsHome")
    return <OriginalsHome />
  }
  if (variant === "hire") {
    const [{ default: HireHome }, { loadHireProof }] = await Promise.all([
      import("@/components/home/HireHome"),
      import("@/lib/hire-proof"),
    ])
    const { bookCallUrl, sales, reviews } = await loadHireProof()
    return <HireHome bookCallUrl={bookCallUrl} sales={sales} reviews={reviews} />
  }
  if (variant === "creative-agent") {
    const { default: CreativeAgentHome } = await import("@/components/home/CreativeAgentHome")
    return <CreativeAgentHome />
  }
  const { default: StudioHome } = await import("@/components/home/StudioHome")
  return <StudioHome />
}
