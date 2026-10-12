"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { mcpOpenFor } from "@/lib/studio/mcp/access"

/**
 * Whether to show the MCP entry point to the signed-in account.
 *
 * Starts false and turns on once the answer is known, so a paused feature never
 * flashes into the header before disappearing. Admins see it while it is paused
 * for everyone else. The server is what enforces the pause; this only decides
 * what is offered.
 */
export function useMcpVisible(): boolean {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let live = true
    const supabase = createClient()
    supabase.auth.getUser()
      .then(({ data: { user } }) => (user ? mcpOpenFor(supabase, user.id) : false))
      .then((open) => { if (live) setVisible(open) })
      .catch(() => {})
    return () => { live = false }
  }, [])

  return visible
}
