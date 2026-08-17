"use client"

import { useState } from "react"
import { Search, Plus, Filter, Sparkles, Layers, Eye, ShieldAlert, ArrowRight, Wand2, X, ExternalLink, Play, Film, CheckCircle2 } from "lucide-react"
import { ComingSoonBadge, DemoDataBadge, FeatureUnavailableModal } from "./ComingSoonModal"

export interface Competitor {
  id: string
  name: string
  website?: string
  industry: string
  creativesAnalyzed: number
  activeAds: number
  topHook: string
  topOffer: string
  topCta: string
  format: string
}

export interface CompetitorCreative {
  id: string
  competitorName: string
  platform: "instagram" | "facebook" | "x" | "linkedin"
  title: string
  type: "video" | "image"
  isPaid: boolean
  thumbnail: string
  duration: string
  hook: string
  structure: { time: string; text: string }[]
  visualStyle: string
  marketingAngle: string
  script: string
  ocrText: string
  cta: string
  offer: string
  score: number
}

const mockCompetitors: Competitor[] = [
  {
    id: "comp-1",
    name: "VideoScale AI",
    website: "https://videoscale.ai",
    industry: "AI Video Production SaaS",
    creativesAnalyzed: 48,
    activeAds: 14,
    topHook: "Financial-loss warning ('Stop paying $2k/mo...')",
    topOffer: "50% off First Month",
    topCta: "Start Free Trial",
    format: "UGC Presenter",
  },
  {
    id: "comp-2",
    name: "AdGenius Studio",
    website: "https://adgenius.io",
    industry: "Ad Creative Platform",
    creativesAnalyzed: 89,
    activeAds: 26,
    topHook: "Before vs After split screen",
    topOffer: "7-Day Free Trial",
    topCta: "Generate Now",
    format: "Talking Head + Screen Demo",
  },
]

const mockCreatives: CompetitorCreative[] = [
  {
    id: "creative-1",
    competitorName: "VideoScale AI",
    platform: "instagram",
    title: "Agency Cost Comparison Video",
    type: "video",
    isPaid: true,
    thumbnail: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600",
    duration: "24s",
    hook: "Stop paying $2,000 every month for video editors who take 2 weeks to finish 1 video.",
    structure: [
      { time: "0-3 sec", text: "Financial Loss Hook ('Stop paying $2k/mo...')" },
      { time: "3-8 sec", text: "Agitate Problem (Slow turnarounds, expensive hires)" },
      { time: "8-15 sec", text: "Product Demonstration (4K AI Presenter rendering in 60s)" },
      { time: "15-21 sec", text: "Social Proof (Over 1,200 creators active)" },
      { time: "21-24 sec", text: "Offer + CTA ('Claim 50% Off Today')" },
    ],
    visualStyle: "UGC Presenter with On-Screen B-Roll",
    marketingAngle: "Pain Point & Price Disruption",
    script: "Stop paying $2,000 every month for video editors. With AI Director Hub, generate 4K presenter videos in seconds. Click below to start your trial today.",
    ocrText: "2 WEEKS vs 60 SECONDS • SAVE $2,000/MO",
    cta: "Start Free Trial",
    offer: "50% Off First Month",
    score: 94,
  },
]

export function CompetitorIntelligence({ onSendToStudio }: { onSendToStudio?: (insight: Record<string, unknown>) => void }) {
  const [activeTab, setActiveTab] = useState<"dashboard" | "library" | "patterns">("dashboard")
  const [selectedCreative, setSelectedCreative] = useState<CompetitorCreative | null>(null)
  const [addCompetitorOpen, setAddCompetitorOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold tracking-[.18em] text-[#b9f42e]">Competitive Market Radar</p>
            <ComingSoonBadge />
            <DemoDataBadge />
          </div>
          <h1 className="mt-1 text-3xl font-semibold text-white">Competitor Intelligence</h1>
        </div>

        <button
          type="button"
          onClick={() => setAddCompetitorOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-[#b9f42e] px-4 py-2.5 text-sm font-bold text-black hover:bg-[#a6de26] transition shadow-lg"
        >
          <Plus className="h-4 w-4" /> Add Competitor
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 gap-2">
        {[
          ["dashboard", "Competitors Overview"],
          ["library", "Creative Intelligence Library"],
          ["patterns", "Pattern Analysis & Insights"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as any)}
            className={`border-b-2 px-4 py-3 text-sm font-bold transition ${activeTab === id ? "border-[#b9f42e] text-[#b9f42e]" : "border-transparent text-zinc-400 hover:text-white"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab 1: Dashboard */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {mockCompetitors.map((comp) => (
              <div key={comp.id} className="rounded-2xl border border-white/10 bg-[#161817] p-6 shadow-xl space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-white">{comp.name}</h3>
                    <p className="text-xs font-semibold text-zinc-400">{comp.industry}</p>
                  </div>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-[#b9f42e]">{comp.activeAds} Active Ads</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs border-y border-white/5 py-3">
                  <div><span className="text-zinc-500 font-bold block">Top Hook Pattern:</span><span className="text-zinc-200 font-medium">{comp.topHook}</span></div>
                  <div><span className="text-zinc-500 font-bold block">Top Format:</span><span className="text-zinc-200 font-medium">{comp.format}</span></div>
                  <div><span className="text-zinc-500 font-bold block">Top Offer:</span><span className="text-zinc-200 font-medium">{comp.topOffer}</span></div>
                  <div><span className="text-zinc-500 font-bold block">Top CTA:</span><span className="text-zinc-200 font-medium">{comp.topCta}</span></div>
                </div>

                <div className="flex justify-end gap-2">
                  <button onClick={() => setActiveTab("library")} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-white/10">View Creatives ({comp.creativesAnalyzed})</button>
                  <button onClick={() => setModalOpen(true)} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20">Analyze Ads</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Creative Intelligence Library */}
      {activeTab === "library" && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {mockCreatives.map((creative) => (
            <div key={creative.id} className="rounded-2xl border border-white/10 bg-[#161817] overflow-hidden shadow-xl hover:border-white/20 transition">
              <div className="relative aspect-video w-full bg-black/60">
                <img src={creative.thumbnail} alt={creative.title} className="h-full w-full object-cover" />
                <span className="absolute top-2 left-2 rounded-md bg-black/80 px-2 py-0.5 text-[10px] font-bold text-[#b9f42e]">{creative.platform}</span>
                <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-2 py-0.5 text-[10px] font-bold text-white">{creative.duration}</span>
              </div>

              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-400">{creative.competitorName}</span>
                  <span className="rounded-full bg-[#b9f42e]/10 px-2.5 py-0.5 text-xs font-bold text-[#b9f42e]">Score: {creative.score}/100</span>
                </div>
                <h4 className="text-base font-bold text-white">{creative.title}</h4>
                <p className="text-xs text-zinc-400 line-clamp-2">"{creative.hook}"</p>

                <div className="pt-2 flex justify-between items-center border-t border-white/5">
                  <span className="text-xs font-bold text-zinc-500">{creative.visualStyle}</span>
                  <button
                    onClick={() => setSelectedCreative(creative)}
                    className="rounded-lg bg-[#b9f42e] px-3 py-1.5 text-xs font-bold text-black hover:bg-[#a6de26]"
                  >
                    Inspect Breakdown
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 3: Pattern Analysis & Send to AI Director */}
      {activeTab === "patterns" && (
        <div className="rounded-2xl border border-white/10 bg-[#161817] p-6 shadow-2xl space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Aggregated Competitor Patterns (137 Creatives Analyzed)</h2>
            <DemoDataBadge />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-black/40 p-4">
              <span className="t-caption text-zinc-500">Most Common Hook Pattern</span>
              <p className="mt-1 text-base font-bold text-white">Financial-Loss Warning Hook</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/40 p-4">
              <span className="t-caption text-zinc-500">Most Common Video Length</span>
              <p className="mt-1 text-base font-bold text-white">20 - 30 Seconds</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/40 p-4">
              <span className="t-caption text-zinc-500">Top Performing Format</span>
              <p className="mt-1 text-base font-bold text-white">UGC Presenter + B-Roll</p>
            </div>
          </div>

          <div className="rounded-xl border border-[#b9f42e]/30 bg-[#b9f42e]/5 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-[#b9f42e]" />
              <h3 className="text-sm font-bold text-white">Productive Action: Send Abstracted Pattern to AI Director</h3>
            </div>
            <p className="text-xs text-zinc-300">
              Pass this competitor pattern into your existing AI Director Studio workflow to generate 100% original script & video concepts without copying trademarked text.
            </p>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  if (onSendToStudio) {
                    onSendToStudio({
                      hook_pattern: "Financial-loss warning hook",
                      creative_format: "UGC Presenter with On-Screen B-Roll",
                      video_length: 24,
                      marketing_angle: "Pain Point & Price Disruption",
                      offer_pattern: "Free Trial / Instant Access",
                      cta_pattern: "Start Free Trial",
                      visual_style: "Studio Presenter",
                    })
                  }
                }}
                className="flex items-center gap-2 rounded-xl bg-[#b9f42e] px-5 py-2.5 text-sm font-bold text-black hover:bg-[#a6de26] transition shadow-lg"
              >
                <Wand2 className="h-4 w-4" /> Send Pattern to AI Director Studio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Competitor Modal */}
      {addCompetitorOpen && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#161817] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-lg font-bold text-white">Add Competitor to Intelligence Radar</h3>
              <button onClick={() => setAddCompetitorOpen(false)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-zinc-400">Competitor Brand Name</label>
                <input type="text" placeholder="e.g. VideoScale AI" className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white outline-none focus:border-[#b9f42e]" />
              </div>
              <div>
                <label className="font-bold text-zinc-400">Website URL</label>
                <input type="text" placeholder="https://..." className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white outline-none focus:border-[#b9f42e]" />
              </div>
              <div>
                <label className="font-bold text-zinc-400">Meta Ad Library URL (Compliant Public Data)</label>
                <input type="text" placeholder="https://facebook.com/ads/library/..." className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white outline-none focus:border-[#b9f42e]" />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
              <button onClick={() => setAddCompetitorOpen(false)} className="rounded-xl px-4 py-2 text-xs font-bold text-zinc-400 hover:bg-white/5">Cancel</button>
              <button onClick={() => { setAddCompetitorOpen(false); setModalOpen(true); }} className="rounded-xl bg-[#b9f42e] px-4 py-2 text-xs font-bold text-black hover:bg-[#a6de26]">Save & Monitor</button>
            </div>
          </div>
        </div>
      )}

      {/* Creative Detail Modal */}
      {selectedCreative && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-[#161817] p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <span className="text-xs font-bold text-[#b9f42e]">{selectedCreative.competitorName}</span>
                <h3 className="text-xl font-bold text-white">{selectedCreative.title}</h3>
              </div>
              <button onClick={() => setSelectedCreative(null)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="aspect-video overflow-hidden rounded-xl bg-black/60 border border-white/10">
                <img src={selectedCreative.thumbnail} alt={selectedCreative.title} className="h-full w-full object-cover" />
              </div>

              <div className="space-y-3 text-xs">
                <div><span className="text-zinc-500 font-bold block">Opening Hook (0-3s):</span><p className="text-zinc-200 font-semibold italic">"{selectedCreative.hook}"</p></div>
                <div><span className="text-zinc-500 font-bold block">Visual Style:</span><p className="text-zinc-200 font-semibold">{selectedCreative.visualStyle}</p></div>
                <div><span className="text-zinc-500 font-bold block">Marketing Angle:</span><p className="text-zinc-200 font-semibold">{selectedCreative.marketingAngle}</p></div>
                <div><span className="text-zinc-500 font-bold block">On-Screen OCR Text:</span><p className="text-zinc-200 font-semibold">{selectedCreative.ocrText}</p></div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-bold text-white mb-2">Video Structure Breakdown</h4>
              <div className="space-y-2">
                {selectedCreative.structure.map((s) => (
                  <div key={s.time} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/40 p-3 text-xs">
                    <span className="font-bold text-[#b9f42e] w-20">{s.time}</span>
                    <span className="font-semibold text-zinc-200 flex-1">{s.text}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-white/10">
              <button
                onClick={() => {
                  const insight = {
                    hook_pattern: selectedCreative.hook,
                    creative_format: selectedCreative.visualStyle,
                    marketing_angle: selectedCreative.marketingAngle,
                    cta_pattern: selectedCreative.cta,
                    offer_pattern: selectedCreative.offer,
                  }
                  setSelectedCreative(null)
                  if (onSendToStudio) onSendToStudio(insight)
                }}
                className="flex items-center gap-2 rounded-xl bg-[#b9f42e] px-5 py-2.5 text-sm font-bold text-black hover:bg-[#a6de26]"
              >
                <Wand2 className="h-4 w-4" /> Generate Original Concept in AI Director
              </button>
            </div>
          </div>
        </div>
      )}

      <FeatureUnavailableModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        featureName="Automated Competitor Ad Library Scraping"
        description="Competitor intelligence requires approved Meta Ad Library API configuration before automated creative analysis can run."
      />
    </div>
  )
}
