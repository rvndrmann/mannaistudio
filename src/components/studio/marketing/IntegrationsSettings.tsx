"use client"

import { useState } from "react"
import { ShieldCheck, CheckCircle2, AlertCircle, Lock, ExternalLink } from "lucide-react"
import { ComingSoonBadge, FeatureUnavailableModal } from "./ComingSoonModal"

export interface IntegrationStatus {
  id: string
  category: "social" | "ads" | "ai" | "competitor"
  name: string
  description: string
  status: "not_configured" | "configured" | "connected" | "permission_required" | "error"
}

const mockIntegrations: IntegrationStatus[] = [
  { id: "int-1", category: "social", name: "Meta / Instagram Publishing", description: "Publish Reels, posts & stories via Meta Graph API", status: "not_configured" },
  { id: "int-2", category: "social", name: "LinkedIn Page Publishing", description: "Publish B2B videos & articles via LinkedIn REST API", status: "not_configured" },
  { id: "int-3", category: "social", name: "X (Twitter) Publishing", description: "Publish videos & posts via X API v2", status: "not_configured" },
  { id: "int-4", category: "ads", name: "Meta Ads Manager", description: "Automated Facebook & Instagram Ad campaigns", status: "not_configured" },
  { id: "int-5", category: "ads", name: "LinkedIn Ads Manager", description: "B2B Sponsor Content & Lead Gen Ads", status: "not_configured" },
  { id: "int-[#6]", category: "ads", name: "X Ads Manager", description: "Promoted Video & Traffic Ads", status: "not_configured" },
  { id: "int-[#7]", category: "ai", name: "OpenAI GPT-5.6 / Gemini 2.5", description: "LLM strategy & copy generation engine", status: "configured" },
  { id: "int-[#8]", category: "ai", name: "fal.ai / BytePlus / Google AI Studio", description: "AI Video & Image Rendering Providers", status: "connected" },
  { id: "int-[#9]", category: "competitor", name: "Meta Ad Library Source", description: "Compliant public competitor ad creative data source", status: "permission_required" },
]

export function IntegrationsSettings() {
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedInt, setSelectedInt] = useState<string>("")

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold tracking-[.18em] text-[#b9f42e]">System Integrations & API Credentials</p>
        <h1 className="mt-1 text-3xl font-semibold text-white">Integrations & API Settings</h1>
        <p className="mt-1 text-sm text-zinc-400">Configure third-party API credentials, OAuth tokens, and permissions for social media publishing and advertising.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {[
          { key: "social", title: "SOCIAL PUBLISHING APIs" },
          { key: "ads", title: "ADVERTISING APIs" },
          { key: "ai", title: "AI ANALYSIS & GENERATION APIs" },
          { key: "competitor", title: "COMPETITOR DATA SOURCES" },
        ].map((sec) => (
          <div key={sec.key} className="rounded-2xl border border-white/10 bg-[#161817] p-6 shadow-xl space-y-4">
            <h2 className="text-sm font-bold text-[#b9f42e]">{sec.title}</h2>

            <div className="space-y-3">
              {mockIntegrations.filter((i) => i.category === sec.key).map((int) => (
                <div key={int.id} className="flex flex-col gap-2 rounded-xl border border-white/5 bg-black/40 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white">{int.name}</h3>
                    <p className="text-xs text-zinc-400">{int.description}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={`rounded-md px-2.5 py-1 text-[10px] font-bold  ${int.status === "connected" ? "bg-green-500/20 text-green-400" : int.status === "configured" ? "bg-blue-500/20 text-blue-400" : int.status === "permission_required" ? "bg-yellow-500/20 text-yellow-400" : "bg-zinc-500/20 text-zinc-400"}`}>
                      {int.status.replace("_", " ")}
                    </span>

                    {int.status !== "connected" && (
                      <button
                        type="button"
                        onClick={() => { setSelectedInt(int.name); setModalOpen(true); }}
                        className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20"
                      >
                        Configure
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <FeatureUnavailableModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        featureName={selectedInt || "API Configuration"}
        description="API credential management is ready in the AI Director Hub interface. Secure server-side secret storage configuration is required."
      />
    </div>
  )
}
