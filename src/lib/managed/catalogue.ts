import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { buildCatalogue, type OfferService } from "@/lib/managed-offers"

/**
 * The catalogue, read server-side.
 *
 * Checkout prices an order from what this returns, so it deliberately does not
 * take a hint from the caller about what anything costs. Which rows come back
 * is decided by RLS: anonymous and signed-in callers see published gigs, an
 * admin also sees their drafts.
 */
export async function loadCatalogue(supabase: SupabaseClient): Promise<OfferService[]> {
  const [{ data: services, error: servicesError }, { data: packages, error: packagesError }] = await Promise.all([
    supabase.from("managed_offer_services").select("*").order("position"),
    supabase.from("managed_offer_packages").select("*").order("position"),
  ])
  if (servicesError) throw servicesError
  if (packagesError) throw packagesError
  return buildCatalogue(services ?? [], packages ?? [])
}
