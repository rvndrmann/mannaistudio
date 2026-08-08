"use client"

import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"
import { AnalyticsDashboard } from "@/components/studio/marketing/AnalyticsDashboard"

export default function AnalyticsPage() {
  return (
    <div className="min-h-screen bg-[#0d0e0d] text-white">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 pt-28 pb-16">
        <AnalyticsDashboard />
      </main>
      <Footer />
    </div>
  )
}
