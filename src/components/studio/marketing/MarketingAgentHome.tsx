"use client"

import { useState } from "react"
import { Bot, Sparkles, TrendingUp, Calendar, Target, Layers, ArrowRight, ShieldCheck, Activity, Clock, CheckCircle2 } from "lucide-react"
import { DemoDataBadge, ComingSoonBadge, FeatureUnavailableModal } from "./ComingSoonModal"

export interface AgentActivity {
  id: string
  actor: "ai_agent" | "user" | "system"
  action: string
  platform?: string
  object: string
  timestamp: string
  result: string
  approvalSource: string
}

const mockAuditLogs: AgentActivity[] = [
  { id: "act-1", actor: "ai_agent", action: "Generated Reel #27 script & visual storyboard", platform: "Instagram", object: "Reel #27", timestamp: "10 mins ago", result: "Draft Created", approvalSource: "AI Agent" },
  { id: "act-2", actor: "user", action: "Approved Reel #27 for scheduling", platform: "Instagram", object: "Reel #27", timestamp: "8 mins ago", result: "Approved", approvalSource: "User Manual" },
  { id: "act-3", actor: "ai_agent", action: "Scheduled Reel #27 for tomorrow at 6:00 PM", platform: "Instagram", object: "Reel #27", timestamp: "5 mins ago", result: "Scheduled", approvalSource: "Copilot Guardrails" },
  { id: "act-4", actor: "system", action: "Instagram publishing unavailable - API not connected", platform: "Instagram", object: "Publish API", timestamp: "5 mins ago", result: "Coming Soon Blocked", approvalSource: "System Rules" },
  { id: "act-[#5]", actor: "ai_agent", action: "Recommended Ad Creative #18 for Meta campaign", platform: "Meta Ads", object: "Campaign #1", timestamp: "1 hour ago", result: "Recommendation Queued", approvalSource: "Performance Agent" },
]

export function MarketingAgentHome({ onNavigateTab }: { onNavigateTab?: (tab: string) => void }) {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-3xl border border-[#b9f42e]/30 bg-gradient-to-r from-[#b9f42e]/10 via-[#161817] to-[#161817] p-8 shadow-2xl space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#b9f42e] text-black shadow-lg">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#b9f42e]">AI Marketing Director Agent</span>
                <DemoDataBadge />
              </div>
              <h1 className="text-2xl font-black text-white">Autonomous Marketing Operations</h1>
            </div>
          </div>

          <button
            type="button"
            onClick={() => { if (onNavigateTab) onNavigateTab("analytics") }}
            className="flex items-center gap-2 rounded-xl bg-[#b9f42e] px-5 py-2.5 text-sm font-bold text-black hover:bg-[#a6de26] transition-all shadow-lg"
          >
            <Sparkles className="h-4 w-4" /> Review Recommendations
          </button>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/40 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">AI Agent Directive</p>
          <p className="mt-1 text-sm font-semibold text-zinc-200">
            "This week's best-performing content used direct financial-loss hooks. I recommend producing three more presenter-led videos using similar hook structures."
          </p>
        </div>
      </div>

      {/* 4 Summary Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-[#161817] p-5 shadow-xl space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-400">
            <span>CONTENT</span>
            <Calendar className="h-4 w-4 text-[#b9f42e]" />
          </div>
          <p className="text-2xl font-black text-white">12 Posts</p>
          <div className="flex justify-between text-xs text-zinc-400 pt-1 border-t border-white/5">
            <span>Scheduled: <strong className="text-white">4</strong></span>
            <span>Approval: <strong className="text-white">2</strong></span>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#161817] p-5 shadow-xl space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-400">
            <span>PERFORMANCE</span>
            <TrendingUp className="h-4 w-4 text-[#b9f42e]" />
          </div>
          <p className="text-2xl font-black text-white">142.5K Reach</p>
          <div className="flex justify-between text-xs text-zinc-400 pt-1 border-t border-white/5">
            <span>Views: <strong className="text-white">98.2K</strong></span>
            <span>Leads: <strong className="text-[#b9f42e]">384</strong></span>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#161817] p-5 shadow-xl space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-400">
            <span>ADS MANAGER</span>
            <Target className="h-4 w-4 text-[#b9f42e]" />
          </div>
          <p className="text-2xl font-black text-white">$1.27K Spend</p>
          <div className="flex justify-between text-xs text-zinc-400 pt-1 border-t border-white/5">
            <span>Leads: <strong className="text-white">82</strong></span>
            <span>ROAS: <strong className="text-[#b9f42e]">3.1x</strong></span>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#161817] p-5 shadow-xl space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-400">
            <span>COMPETITORS</span>
            <Layers className="h-4 w-4 text-[#b9f42e]" />
          </div>
          <p className="text-2xl font-black text-white">137 Analyzed</p>
          <div className="flex justify-between text-xs text-zinc-400 pt-1 border-t border-white/5">
            <span>Tracked: <strong className="text-white">4</strong></span>
            <span>Patterns: <strong className="text-[#b9f42e]">12</strong></span>
          </div>
        </div>
      </div>

      {/* Agent Activity Feed (Audit Log) */}
      <div className="rounded-2xl border border-white/10 bg-[#161817] p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-[#b9f42e]" />
            <h2 className="text-lg font-bold text-white">Agent Audit Activity Feed</h2>
          </div>
          <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Real-Time Audit Trail</span>
        </div>

        <div className="space-y-3">
          {mockAuditLogs.map((log) => (
            <div key={log.id} className="flex flex-col gap-2 rounded-xl border border-white/5 bg-black/40 p-3.5 text-xs sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className={`rounded-md px-2 py-0.5 font-bold uppercase text-[10px] ${log.actor === "ai_agent" ? "bg-[#b9f42e]/20 text-[#b9f42e]" : log.actor === "user" ? "bg-blue-500/20 text-blue-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                  {log.actor.replace("_", " ")}
                </span>
                <span className="font-semibold text-zinc-200">{log.action}</span>
              </div>
              <div className="flex items-center gap-4 text-zinc-400">
                <span>{log.result}</span>
                <span className="text-zinc-600">•</span>
                <span>{log.timestamp}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
