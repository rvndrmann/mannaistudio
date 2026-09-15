import { createClient } from "@/lib/supabase/server"
import { fetchHomeVariant, isHomeVariant } from "@/lib/home-variant"
import StudioHome from "@/components/home/StudioHome"
import OriginalsHome from "@/components/home/OriginalsHome"
import HireHome from "@/components/home/HireHome"

// The variant is read per request so flipping the switch in Admin takes effect
// on the next page load. Every homepage is a client component that fetches its
// own content, so serving this dynamically costs a shell render and no more.
export const dynamic = "force-dynamic"

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

  if (variant === "originals") return <OriginalsHome />
  if (variant === "hire") return <HireHome />
  return <StudioHome />
}
