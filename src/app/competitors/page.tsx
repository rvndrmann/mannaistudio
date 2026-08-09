"use client"

import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"
import { CompetitorIntelligence } from "@/components/studio/marketing/CompetitorIntelligence"
import { MarketingHeader } from "@/components/MarketingHeader"

export default function CompetitorsPage() {
  return (
    <div className="min-h-screen bg-[#0d0e0d] text-white">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 pt-28 pb-16">
        <MarketingHeader />
        <CompetitorIntelligence />
      </main>
      <Footer />
    </div>
  )
}
