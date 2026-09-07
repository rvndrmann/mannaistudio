"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { fetchSiteFeatures } from "@/lib/studio/feature-flags"

/**
 * Whether to show the bring-your-own-keys entry points.
 *
 * Starts false and turns on once the flag is read, so a paused feature never
 * flashes into the header before disappearing. The server routes are what
 * actually enforce the pause; this only decides what is offered.
 */
export function useByokEnabled(): boolean {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    let live = true
    fetchSiteFeatures(createClient())
      .then((features) => { if (live) setEnabled(features.byok) })
      .catch(() => {})
    return () => { live = false }
  }, [])

  return enabled
}
