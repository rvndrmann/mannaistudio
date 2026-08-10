"use client"

import Link from "next/link"
import { ArrowLeft, Users, Zap } from "lucide-react"
import TeamTab from "@/components/credits/TeamTab"

export default function StudioTeamPage() {
  return (
    <div className="min-h-screen bg-[#070807] text-white">
      <header className="sticky top-0 z-10 border-b border-white/[0.06] bg-[#070807]/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/studio" className="flex items-center gap-2 text-sm text-zinc-400 transition hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Back to Studio
          </Link>
          <Link
            href="/studio/credits"
            className="flex items-center gap-2 rounded-full border border-[#b9f42e]/30 bg-[#b9f42e]/10 px-3 py-1.5 text-xs font-bold text-[#b9f42e] transition hover:bg-[#b9f42e]/20"
          >
            <Zap className="h-3.5 w-3.5 fill-[#b9f42e]" />
            Credits
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-[#b9f42e]/30 bg-[#b9f42e]/10 text-[#b9f42e]">
            <Users className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-black text-white">Your Team</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Add members by email, set what they can do, and share credits from a team pool.
          </p>
        </div>

        <TeamTab />
      </main>
    </div>
  )
}
