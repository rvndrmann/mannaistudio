"use client"

import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"
import { AdsManager } from "@/components/studio/marketing/AdsManager"

export default function AdsPage() {
  return (
    <div className="min-h-screen bg-[#0d0e0d] text-white">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 pt-28 pb-16">
        <AdsManager />
      </main>
      <Footer />
    </div>
  )
}
