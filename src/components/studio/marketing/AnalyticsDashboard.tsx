"use client"

import { useState } from "react"
import { TrendingUp, Users, Eye, Play, MousePointer, Target, Award, Sparkles, Filter, Calendar, ArrowUpRight, Wand2 } from "lucide-react"
import { DemoDataBadge, ComingSoonBadge, FeatureUnavailableModal } from "./ComingSoonModal"

export function AnalyticsDashboard({ onGenerateVariations }: { onGenerateVariations?: () => void }) {
  const [platformFilter, setPlatformFilter] = useState("all")
  const [timeFilter, setTimeFilter] = useState("30d")
  const [modalOpen, setModalOpen] = useState(false)

  const kpis = [
    { label: "Total Reach", value: "142,500", change: "+18.4%", icon: Eye },
    { label: "Impressions", value: "280,400", change: "+24.2%", icon: TrendingUp },
    { label: "Video Views", value: "98,200", change: "+32.1%", icon: Play },
    { label: "Engagement Rate", value: "14.2%", change: "+2.8%", icon: Award },
    { label: "Followers", value: "+3,450", change: "+12.5%", icon: Users },
    { label: "Clicks", value: "4,820", change: "+8.9%", icon: MousePointer },
    { label: "Leads", value: "384", change: "+15.2%", icon: Target },
    { label: "Conversions", value: "86", change: "+21.0%", icon: ArrowUpRight },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold tracking-[.18em] text-[#b9f42e]">Organic Marketing Intelligence</p>
            <DemoDataBadge />
          </div>
          <h1 className="mt-1 text-3xl font-semibold text-white">Marketing Analytics</h1>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl border border-white/10 bg-[#161817] p-1 text-xs">
            {["7d", "30d", "90d"].map((t) => (
              <button
                key={t}
                onClick={() => setTimeFilter(t)}
                className={`rounded-lg px-3 py-1.5 font-bold  transition ${timeFilter === t ? "bg-[#b9f42e] text-black" : "text-zinc-400 hover:text-white"}`}
              >
                {t}
              </button>
            ))}
          </div>

          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="rounded-xl border border-white/10 bg-[#161817] px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#b9f42e]"
          >
            <option value="all">All Platforms</option>
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
            <option value="x">X (Twitter)</option>
            <option value="linkedin">LinkedIn</option>
          </select>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon
          return (
            <div key={kpi.label} className="rounded-2xl border border-white/10 bg-[#161817] p-5 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400">{kpi.label}</span>
                <span className="rounded-lg bg-white/5 p-2 text-[#b9f42e]"><Icon className="h-4 w-4" /></span>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-2xl font-semibold text-white">{kpi.value}</span>
                <span className="text-xs font-bold text-[#b9f42e]">{kpi.change}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* AI Performance Agent Section */}
      <div className="rounded-2xl border border-[#b9f42e]/30 bg-gradient-to-br from-[#b9f42e]/10 to-transparent p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#b9f42e]" />
            <h2 className="text-lg font-bold text-white">AI Performance Agent</h2>
          </div>
          <DemoDataBadge />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/40 p-4">
            <p className="t-caption text-zinc-500">Performance Insight</p>
            <p className="mt-1 text-sm font-semibold text-zinc-200">
              "Presenter-led video demonstrations generated <span className="text-[#b9f42e] font-bold">3.2x more engagement</span> and 4.1x more leads than static slideshow posts."
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/40 p-4">
            <p className="t-caption text-zinc-500">Agent Recommendation</p>
            <p className="mt-1 text-sm font-semibold text-zinc-200">
              "Create three additional presenter-led AI video variations emphasizing the key problem-solving hook."
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onGenerateVariations}
            className="flex items-center gap-2 rounded-xl bg-[#b9f42e] px-5 py-2.5 text-sm font-bold text-black hover:bg-[#a6de26] transition shadow-lg"
          >
            <Wand2 className="h-4 w-4" />
            Generate Variations in Studio
          </button>
        </div>
      </div>

      {/* AI Performance Analysis (Coming Soon Placeholder) */}
      <div className="rounded-2xl border border-white/10 bg-[#161817] p-6 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">Live AI Performance Analysis</h3>
          <ComingSoonBadge />
        </div>
        <p className="text-sm text-zinc-400">
          "AI analysis will appear here once your social accounts are connected and live performance data becomes available."
        </p>
      </div>
    </div>
  )
}
