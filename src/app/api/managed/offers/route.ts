import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { loadCatalogueWithAvailability } from "@/lib/managed/catalogue"
import { describeError } from "@/lib/studio/errors"

export const dynamic = "force-dynamic"

/**
 * What is for sale.
 *
 * Public, because /hire-us is a shop window — a stranger has to see the
 * catalogue before being asked who they are. RLS decides what comes back:
 * published gigs for everyone, plus their own drafts for an admin, so the admin
 * preview and the live page are the same query rather than two that can drift.
 *
 * Limited packages carry their live slot and queue counts, so the page can say
 * "2 slots left" or "join the queue" before anyone writes a brief.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    return NextResponse.json({ services: await loadCatalogueWithAvailability(supabase) })
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Could not load the catalogue") }, { status: 500 })
  }
}
