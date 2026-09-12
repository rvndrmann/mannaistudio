"use client"

import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import Navbar from "@/components/Navbar"
import BriefFlow from "@/components/managed/BriefFlow"

/**
 * The brief.
 *
 * A Suspense boundary because the flow reads `?service=` and `?repeat=` from
 * the URL, and useSearchParams opts the tree into client rendering — without
 * one the whole route would be forced dynamic at build.
 */
export default function BriefPage() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <Suspense
        fallback={
          <div className="flex min-h-[60vh] items-center justify-center pt-32">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        }
      >
        <BriefFlow />
      </Suspense>
    </main>
  )
}
