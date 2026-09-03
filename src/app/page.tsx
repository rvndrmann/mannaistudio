import { createClient } from "@/lib/supabase/server"
import { fetchHomeVariant } from "@/lib/home-variant"
import StudioHome from "@/components/home/StudioHome"
import OriginalsHome from "@/components/home/OriginalsHome"

// The variant is read per request so flipping the switch in Admin takes effect
// on the next page load. Both homepages are client components that fetch their
// own content, so serving this dynamically costs a shell render and no more.
export const dynamic = "force-dynamic"

export default async function Home() {
  const supabase = await createClient()
  const variant = await fetchHomeVariant(supabase)

  return variant === "originals" ? <OriginalsHome /> : <StudioHome />
}
