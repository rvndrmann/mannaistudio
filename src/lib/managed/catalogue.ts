import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { buildCatalogue, withAvailability, type AvailabilityRow, type OfferService } from "@/lib/managed-offers"

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

/**
 * The catalogue with live slot and queue counts on every limited package.
 *
 * The counts are for showing, never for deciding: checkout counts again inside
 * `create_managed_project` with the package row locked. So a failed read here
 * shows the catalogue without counts rather than no catalogue at all — the
 * worst case is a buyer told at checkout that the slots just filled.
 */
export async function loadCatalogueWithAvailability(supabase: SupabaseClient): Promise<OfferService[]> {
  const [catalogue, availability] = await Promise.all([
    loadCatalogue(supabase),
    supabase.rpc("managed_offer_availability"),
  ])
  if (availability.error) {
    console.warn("Could not read package availability:", availability.error.message)
    return catalogue
  }
  return withAvailability(catalogue, (availability.data ?? []) as AvailabilityRow[])
}
