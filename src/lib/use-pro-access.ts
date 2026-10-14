"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { isPaidAccessPeriod } from "@/lib/all-access-plan"

/**
 * Whether the signed-in user has a paid AI Director Hub Pro period running.
 *
 * Pro is what unlocks Creator Studio with their own provider keys, so the nav
 * offers the studio on this. It is a display hint only: the generation routes
 * check the same row on the server (`getByokSubscriptionPolicy`) before
 * anything is spent. Read straight from the user's own row — row security
 * allows it — rather than /api/razorpay/all-access, which calls Razorpay to
 * reconcile and is too heavy to run on every page's header.
 */
export function useProAccess(userId: string | null | undefined): boolean {
  // Keyed by the user it was read for, so a sign-out or account switch reads
  // as "no" at once instead of showing the last account's answer.
  const [result, setResult] = useState<{ userId: string; active: boolean } | null>(null)

  useEffect(() => {
    if (!userId) return
    let live = true
    createClient()
      .from("all_access_subscriptions")
      .select("paid_until")
      .eq("profile_id", userId)
      .not("paid_until", "is", null)
      .then(({ data }) => {
        if (live) setResult({ userId, active: (data ?? []).some((row) => isPaidAccessPeriod(row)) })
      })
    return () => { live = false }
  }, [userId])

  return Boolean(userId) && result?.userId === userId && result?.active === true
}
