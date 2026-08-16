import type { SupabaseClient } from "@supabase/supabase-js"
import { sendCapiEvent } from "@/lib/meta-capi"

// FirstGeneration / SecondGeneration — the two events that say whether an ad is
// buying real users or tourists.
//
// These are reported from the server, never the browser. The client cannot be
// trusted to report a generation exactly once: it re-renders, it retries, it
// polls a job that is already finished. More importantly, a credit deduction is
// not proof of anything — every generation route refunds on failure — so this
// is called only once the generated file is stored and its job is marked
// completed. Firing on the deduction would count failures as activation.

/**
 * Records one successful generation for `userId` and reports the milestone
 * events when the lifetime count lands on exactly 1 or exactly 2.
 *
 * Never throws. A generation that succeeded must still be reported as a success
 * to the user even if the counter or Meta is unreachable.
 */
export async function trackGenerationActivation(input: {
  supabase: SupabaseClient
  userId: string
  email?: string | null
  /** Page the generation happened on, for reporting. */
  sourceUrl?: string
}): Promise<void> {
  try {
    // Atomic: the database increments and returns in one statement, so two
    // generations completing together get 1 and 2, never 1 and 1.
    const { data, error } = await input.supabase.rpc("record_successful_generation", {
      p_profile_id: input.userId,
    })
    if (error) {
      console.error("[activation] could not record generation", error.message)
      return
    }

    const count = typeof data === "number" ? data : Number(data)
    if (!Number.isFinite(count)) return

    const eventName = count === 1 ? "FirstGeneration" : count === 2 ? "SecondGeneration" : null
    if (!eventName) return

    await sendCapiEvent({
      eventName,
      // Derived from the profile, not from this request: the counter already
      // guarantees one caller reaches each milestone, and a stable ID means a
      // retried or double-invoked route deduplicates at Meta rather than
      // counting the same activation twice.
      eventId: `${eventName === "FirstGeneration" ? "firstgen" : "secondgen"}-${input.userId}`,
      email: input.email || undefined,
      externalId: input.userId,
      sourceUrl: input.sourceUrl || "https://www.aidirectorhub.com/studio",
      customData: { content_name: eventName, generation_count: count },
    })
  } catch (error) {
    console.error("[activation] failed", error)
  }
}
