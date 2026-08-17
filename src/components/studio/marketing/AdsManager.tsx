"use client"

import { useState } from "react"
import { DollarSign, Target, TrendingUp, ShieldCheck, Sparkles, Layers, Sliders, Play, Pause, AlertTriangle, Plus, ExternalLink } from "lucide-react"
import { ComingSoonBadge, DemoDataBadge, FeatureUnavailableModal } from "./ComingSoonModal"
import { validateActionAgainstGuardrails, defaultGuardrails } from "@/lib/studio/marketing-abstraction"

export interface AdCampaign {
  id: string
  name: string
  platform: "meta" | "linkedin" | "x"
  objective: string
  status: "draft" | "active" | "paused" | "completed" | "error"
  dailyBudget: number
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpc: number
  leads: number
  cpl: number
  conversions: number
  roas: number
}

const mockCampaigns: AdCampaign[] = [
  {
    id: "camp-1",
    name: "AI Studio Founder Lead Generation",
    platform: "meta",
    objective: "Lead Generation",
    status: "active",
    dailyBudget: 50.0,
    spend: 420.50,
    impressions: 48200,
    clicks: 1420,
    ctr: 2.94,
    cpc: 0.30,
    leads: 64,
    cpl: 6.57,
    conversions: 22,
    roas: 3.4,
  },
  {
    id: "camp-[#2]",
    name: "B2B Executive Video Retargeting",
    platform: "linkedin",
    objective: "Conversions",
    status: "paused",
    dailyBudget: 100.0,
    spend: 850.00,
    impressions: 18400,
    clicks: 420,
    ctr: 2.28,
    cpc: 2.02,
    leads: 18,
    cpl: 47.22,
    conversions: 8,
    roas: 2.1,
  },
]

export function AdsManager() {
  const [activeTab, setActiveTab] = useState<"overview" | "campaigns" | "creatives" | "audiences" | "ai_agent" | "guardrails" | "accounts">("overview")
  const [automationMode, setAutomationMode] = useState<"copilot" | "assisted" | "full">("copilot")
  const [maxBudget, setMaxBudget] = useState(100)
  const [maxCpl, setMaxCpl] = useState(30)
  const [minRoas, setMinRoas] = useState(2.0)
  const [modalOpen, setModalOpen] = useState(false)
  const [promptText, setPromptText] = useState("Get more leads for my real-estate business. Budget $50 per day.")

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold tracking-[.18em] text-[#b9f42e]">AI Paid Acquisition</p>
            <DemoDataBadge />
          </div>
          <h1 className="mt-1 text-3xl font-semibold text-white">Ads Manager</h1>
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-[#b9f42e] px-4 py-2.5 text-sm font-bold text-black hover:bg-[#a6de26] transition shadow-lg"
        >
          <Plus className="h-4 w-4" /> Create Ad Campaign
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap border-b border-white/10 gap-2">
        {[
          ["overview", "Overview"],
          ["campaigns", "Campaigns"],
          ["ai_agent", "AI Ads Agent"],
          ["guardrails", "Safety & Guardrails"],
          ["accounts", "Connected Ad Accounts"],
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

      {/* Tab: Overview / Campaigns */}
      {(activeTab === "overview" || activeTab === "campaigns") && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-[#161817] p-5 shadow-xl">
              <span className="text-xs font-semibold text-zinc-400">Total Ad Spend</span>
              <p className="mt-2 text-2xl font-semibold text-white">$1,270.50</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#161817] p-5 shadow-xl">
              <span className="text-xs font-semibold text-zinc-400">Total Leads Generated</span>
              <p className="mt-2 text-2xl font-semibold text-[#b9f42e]">82 Leads</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#161817] p-5 shadow-xl">
              <span className="text-xs font-semibold text-zinc-400">Average Cost Per Lead (CPL)</span>
              <p className="mt-2 text-2xl font-semibold text-white">$15.49</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#161817] p-5 shadow-xl">
              <span className="text-xs font-semibold text-zinc-400">Blended ROAS</span>
              <p className="mt-2 text-2xl font-semibold text-white">3.1x</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#161817] p-6 shadow-2xl">
            <h2 className="mb-4 text-lg font-bold text-white">Ad Campaigns</h2>
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="border-b border-white/10 t-caption text-zinc-500">
                <tr>
                  <th className="py-3 px-4">Campaign</th>
                  <th className="py-3 px-4">Platform</th>
                  <th className="py-3 px-4">Objective</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Daily Budget</th>
                  <th className="py-3 px-4">Spend</th>
                  <th className="py-3 px-4">Leads</th>
                  <th className="py-3 px-4">CPL</th>
                  <th className="py-3 px-4">ROAS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {mockCampaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-white/5 transition">
                    <td className="py-3.5 px-4 font-bold text-white">{c.name}</td>
                    <td className="py-3.5 px-4 capitalize font-semibold">{c.platform === "meta" ? "Meta (FB + IG)" : c.platform}</td>
                    <td className="py-3.5 px-4 text-xs font-medium text-zinc-400">{c.objective}</td>
                    <td className="py-3.5 px-4">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-bold capitalize ${c.status === "active" ? "bg-green-500/20 text-green-400" : "bg-zinc-500/20 text-zinc-400"}`}>{c.status}</span>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-white">${c.dailyBudget}/day</td>
                    <td className="py-3.5 px-4">${c.spend}</td>
                    <td className="py-3.5 px-4 font-bold text-[#b9f42e]">{c.leads}</td>
                    <td className="py-3.5 px-4 font-semibold">${c.cpl}</td>
                    <td className="py-3.5 px-4 font-bold text-white">{c.roas}x</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: AI Ads Agent */}
      {activeTab === "ai_agent" && (
        <div className="rounded-2xl border border-white/10 bg-[#161817] p-6 shadow-2xl space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#b9f42e]" />
              <h2 className="text-xl font-bold text-white">AI Ads Strategy Agent</h2>
            </div>
            <ComingSoonBadge />
          </div>

          <div className="space-y-3">
            <label className="t-caption text-zinc-400">Tell your AI Ads Agent your goal:</label>
            <textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              className="h-28 w-full resize-none rounded-xl border border-white/10 bg-black/40 p-4 text-sm text-white outline-none focus:border-[#b9f42e]"
            />
          </div>

          <div className="rounded-xl border border-[#b9f42e]/30 bg-[#b9f42e]/5 p-5 space-y-3">
            <h3 className="text-sm font-bold text-[#b9f42e]">AI Proposed Campaign Strategy</h3>
            <div className="grid gap-3 text-xs sm:grid-cols-3">
              <div><span className="text-zinc-500 font-bold block">Objective:</span><span className="text-white font-semibold">Lead Generation</span></div>
              <div><span className="text-zinc-500 font-bold block">Platform:</span><span className="text-white font-semibold">Meta (Facebook + Instagram)</span></div>
              <div><span className="text-zinc-500 font-bold block">Daily Budget:</span><span className="text-white font-semibold">$50.00 / day</span></div>
            </div>
            <div className="pt-2">
              <span className="text-zinc-500 font-bold block text-xs">Recommended Creative:</span>
              <p className="text-xs font-medium text-zinc-300">Property Presenter AI Video #18 (Highest projected conversion rate based on competitor hooks)</p>
            </div>

            <div className="pt-3 border-t border-white/10 flex justify-end">
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="rounded-xl bg-white/10 px-5 py-2.5 text-sm font-bold text-zinc-400 cursor-not-allowed"
                disabled
              >
                Create Campaign (Coming Soon - Meta Marketing API Required)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Safety & Guardrails */}
      {activeTab === "guardrails" && (
        <div className="rounded-2xl border border-white/10 bg-[#161817] p-6 shadow-2xl space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white">AI Ad Automation & Deterministic Guardrails</h2>
            <p className="mt-1 text-xs text-zinc-400">Set hard monetary and operational boundaries. Your AI agent will NEVER be permitted to exceed these limits.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <button
              onClick={() => setAutomationMode("copilot")}
              className={`rounded-2xl border p-5 text-left transition ${automationMode === "copilot" ? "border-[#b9f42e] bg-[#b9f42e]/10" : "border-white/10 bg-black/40"}`}
            >
              <h4 className="font-bold text-white">COPILOT</h4>
              <p className="mt-1 text-xs text-zinc-400">AI only makes recommendations. User manually approves every action.</p>
            </button>
            <button
              onClick={() => setAutomationMode("assisted")}
              className={`rounded-2xl border p-5 text-left transition ${automationMode === "assisted" ? "border-[#b9f42e] bg-[#b9f42e]/10" : "border-white/10 bg-black/40"}`}
            >
              <h4 className="font-bold text-white">ASSISTED AUTOPILOT</h4>
              <p className="mt-1 text-xs text-zinc-400">AI may perform pre-approved actions within strict limits (e.g. pause high CPL ads).</p>
            </button>
            <button
              onClick={() => setAutomationMode("full")}
              className={`rounded-2xl border p-5 text-left transition ${automationMode === "full" ? "border-yellow-500 bg-yellow-500/10" : "border-white/10 bg-black/40"}`}
            >
              <h4 className="font-bold text-white">FULL AUTOPILOT</h4>
              <p className="mt-1 text-xs text-zinc-400">AI manages campaigns within strict guardrails. Hard backend rules enforce limits.</p>
            </button>
          </div>

          <div className="grid gap-6 md:grid-cols-3 pt-4 border-t border-white/10">
            <div>
              <label className="t-caption text-zinc-400">Max Daily Budget ($)</label>
              <input
                type="number"
                value={maxBudget}
                onChange={(e) => setMaxBudget(Number(e.target.value))}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white outline-none focus:border-[#b9f42e]"
              />
            </div>
            <div>
              <label className="t-caption text-zinc-400">Max Acceptable CPL ($)</label>
              <input
                type="number"
                value={maxCpl}
                onChange={(e) => setMaxCpl(Number(e.target.value))}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white outline-none focus:border-[#b9f42e]"
              />
            </div>
            <div>
              <label className="t-caption text-zinc-400">Min Acceptable ROAS</label>
              <input
                type="number"
                step="0.1"
                value={minRoas}
                onChange={(e) => setMinRoas(Number(e.target.value))}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white outline-none focus:border-[#b9f42e]"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab: Accounts */}
      {activeTab === "accounts" && (
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { name: "Meta Ads", desc: "Facebook + Instagram Advertising", color: "from-blue-600 to-blue-400" },
            { name: "LinkedIn Ads", desc: "B2B Corporate Campaign Manager", color: "from-blue-700 to-cyan-500" },
            { name: "X Ads", desc: "X Promoted Campaigns", color: "from-zinc-100 to-zinc-400" },
          ].map((acc) => (
            <div key={acc.name} className="rounded-2xl border border-white/10 bg-[#161817] p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">{acc.name}</h3>
                <ComingSoonBadge />
              </div>
              <p className="text-xs text-zinc-400">{acc.desc}</p>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-3 text-sm font-bold text-white hover:bg-white/20"
              >
                <ExternalLink className="h-4 w-4 text-[#b9f42e]" />
                Connect Ad Account
              </button>
            </div>
          ))}
        </div>
      )}

      <FeatureUnavailableModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        featureName="Ad Campaign Management"
        description="Advertising campaign creation and automated spending require connecting your Meta Ads, LinkedIn Ads, or X Ads Marketing API credentials."
      />
    </div>
  )
}
