"use client"

import { useState } from "react"
import { Bot, Sparkles, Sliders, CheckCircle2, ShieldCheck, Zap, Lock } from "lucide-react"
import { ComingSoonBadge, FeatureUnavailableModal } from "./ComingSoonModal"

export function AutopilotPanel() {
  const [mode, setMode] = useState<"manual" | "copilot" | "autopilot">("copilot")
  const [frequency, setFrequency] = useState("4 videos per week")
  const [objective, setObjective] = useState("Brand Awareness & Lead Generation")
  const [audience, setAudience] = useState("Content Creators & SaaS Founders")
  const [approvalRequired, setApprovalRequired] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold tracking-[.18em] text-[#b9f42e]">Autonomous Marketing Agent</p>
        <h1 className="mt-1 text-3xl font-semibold text-white">AI Content Autopilot</h1>
        <p className="mt-1 text-sm text-zinc-400">Configure how autonomously your AI marketing agent generates, plans, and schedules video content.</p>
      </div>

      {/* Mode Selection */}
      <div className="grid gap-4 md:grid-cols-3">
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`flex flex-col justify-between rounded-2xl border p-6 text-left transition ${mode === "manual" ? "border-[#b9f42e] bg-[#b9f42e]/10" : "border-white/10 bg-[#161817] hover:border-white/20"}`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="rounded-lg bg-white/10 p-2 text-white"><Sliders className="h-5 w-5" /></span>
              <span className="text-xs font-bold text-zinc-400">Level 1</span>
            </div>
            <h3 className="mt-4 text-lg font-bold text-white">MANUAL</h3>
            <p className="mt-1 text-xs text-zinc-400">AI generates videos and graphics, but you review, schedule, and publish every post manually.</p>
          </div>
          <div className="mt-6 flex items-center gap-1 text-xs font-bold text-[#b9f42e]">
            {mode === "manual" && <CheckCircle2 className="h-4 w-4" />} Active Mode
          </div>
        </button>

        <button
          type="button"
          onClick={() => setMode("copilot")}
          className={`flex flex-col justify-between rounded-2xl border p-6 text-left transition ${mode === "copilot" ? "border-[#b9f42e] bg-[#b9f42e]/10" : "border-white/10 bg-[#161817] hover:border-white/20"}`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="rounded-lg bg-[#b9f42e]/20 p-2 text-[#b9f42e]"><Bot className="h-5 w-5" /></span>
              <span className="text-xs font-bold text-[#b9f42e]">RECOMMENDED</span>
            </div>
            <h3 className="mt-4 text-lg font-bold text-white">COPILOT</h3>
            <p className="mt-1 text-xs text-zinc-400">AI generates content, proposes an optimal posting schedule, and awaits your 1-click approval.</p>
          </div>
          <div className="mt-6 flex items-center gap-1 text-xs font-bold text-[#b9f42e]">
            {mode === "copilot" && <CheckCircle2 className="h-4 w-4" />} Active Mode
          </div>
        </button>

        <button
          type="button"
          onClick={() => { setMode("autopilot"); setModalOpen(true); }}
          className={`relative flex flex-col justify-between rounded-2xl border p-6 text-left transition ${mode === "autopilot" ? "border-yellow-500 bg-yellow-500/10" : "border-white/10 bg-[#161817] hover:border-white/20"}`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="rounded-lg bg-yellow-500/20 p-2 text-yellow-400"><Zap className="h-5 w-5" /></span>
              <ComingSoonBadge />
            </div>
            <h3 className="mt-4 text-lg font-bold text-white">AUTOPILOT</h3>
            <p className="mt-1 text-xs text-zinc-400">AI automatically plans, generates, schedules, and publishes videos based on real-time performance analytics.</p>
          </div>
          <div className="mt-6 flex items-center gap-1 text-xs font-bold text-yellow-400">
            Requires Social API Connections
          </div>
        </button>
      </div>

      {/* Configuration Form */}
      <div className="rounded-2xl border border-white/10 bg-[#161817] p-6 shadow-2xl space-y-6">
        <h2 className="text-xl font-bold text-white">Agent Strategy & Guardrails</h2>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="t-caption text-zinc-400">Posting Frequency</label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm font-semibold text-white outline-none focus:border-[#b9f42e]"
            >
              <option value="2 videos per week">2 videos per week</option>
              <option value="4 videos per week">4 videos per week (Recommended)</option>
              <option value="1 video daily">1 video daily</option>
              <option value="2 videos daily">2 videos daily</option>
            </select>
          </div>

          <div>
            <label className="t-caption text-zinc-400">Business Objective</label>
            <input
              type="text"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white outline-none focus:border-[#b9f42e]"
            />
          </div>

          <div>
            <label className="t-caption text-zinc-400">Target Audience</label>
            <input
              type="text"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white outline-none focus:border-[#b9f42e]"
            />
          </div>

          <div>
            <label className="t-caption text-zinc-400">Approval Requirement</label>
            <div className="mt-2 flex items-center justify-between rounded-xl border border-white/10 bg-black/40 p-3">
              <span className="text-sm font-semibold text-zinc-300">Require manual approval before publishing</span>
              <input
                type="checkbox"
                checked={approvalRequired}
                onChange={(e) => setApprovalRequired(e.target.checked)}
                className="h-5 w-5 rounded border-white/10 bg-black text-[#b9f42e] focus:ring-0"
              />
            </div>
          </div>
        </div>
      </div>

      <FeatureUnavailableModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        featureName="AI Full Autopilot Publishing"
        description="Full Autopilot allows your AI agent to auto-publish content without manual approval. This mode will activate when social media APIs are connected."
      />
    </div>
  )
}
