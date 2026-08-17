"use client"

import { useState } from "react"
import { CheckCircle2, Instagram, Facebook, Twitter, Linkedin, ExternalLink, Sparkles } from "lucide-react"
import { ComingSoonBadge, FeatureUnavailableModal } from "./ComingSoonModal"

export interface PlatformConfig {
  id: "instagram" | "facebook" | "x" | "linkedin"
  name: string
  accountType: string
  icon: typeof Instagram
  features: string[]
  color: string
}

export const platforms: PlatformConfig[] = [
  {
    id: "instagram",
    name: "Instagram",
    accountType: "Professional / Business Account",
    icon: Instagram,
    color: "from-purple-500 via-pink-500 to-yellow-500",
    features: [
      "Publish images",
      "Publish videos",
      "Publish Reels",
      "Schedule posts",
      "Read organic analytics",
      "Let AI optimize content & captions",
    ],
  },
  {
    id: "facebook",
    name: "Facebook",
    accountType: "Page / Business Suite",
    icon: Facebook,
    color: "from-blue-600 to-blue-400",
    features: [
      "Publish posts & photos",
      "Publish videos & Reels",
      "Schedule feed content",
      "Read page insights",
      "Read audience engagement",
      "AI auto-responder & scheduler",
    ],
  },
  {
    id: "x",
    name: "X (Twitter)",
    accountType: "Professional / Creator Account",
    icon: Twitter,
    color: "from-zinc-100 to-zinc-400",
    features: [
      "Publish single posts & threads",
      "Publish video clips",
      "Schedule tweets",
      "Read impressions & retweets",
      "AI trend tracking",
    ],
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    accountType: "Company Page / Member Profile",
    icon: Linkedin,
    color: "from-blue-700 to-cyan-500",
    features: [
      "Publish articles & posts",
      "Publish video posts",
      "Schedule corporate posts",
      "Read post metrics",
      "AI B2B lead optimization",
    ],
  },
]

export function SocialConnectionCard({ platform }: { platform: PlatformConfig }) {
  const [modalOpen, setModalOpen] = useState(false)
  const Icon = platform.icon

  return (
    <>
      <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#161817] p-6 shadow-xl hover:border-white/20 transition">
        <div>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br ${platform.color} text-white shadow-lg`}>
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{platform.name}</h3>
                <p className="text-xs font-medium text-zinc-400">{platform.accountType}</p>
              </div>
            </div>
            <ComingSoonBadge />
          </div>

          <div className="mt-5 rounded-xl border border-white/5 bg-black/40 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400 font-semibold">Status:</span>
              <span className="flex items-center gap-1.5 font-bold text-zinc-400">
                <span className="h-2 w-2 rounded-full bg-zinc-500" />
                Not Connected
              </span>
            </div>
          </div>

          <div className="mt-5">
            <p className="t-caption text-zinc-500">Supported AI Features</p>
            <ul className="mt-2.5 space-y-2">
              {platform.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-xs font-medium text-zinc-300">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#b9f42e]" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-6 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-3 text-sm font-bold text-white hover:bg-white/20 transition"
          >
            <ExternalLink className="h-4 w-4 text-[#b9f42e]" />
            Connect {platform.name}
          </button>
        </div>
      </div>

      <FeatureUnavailableModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        featureName={`Connect ${platform.name}`}
        platform={platform.name}
      />
    </>
  )
}

export function SocialAccountsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold tracking-[.18em] text-[#b9f42e]">Social Media Agent</p>
          <h1 className="mt-1 text-3xl font-semibold text-white">Social Accounts</h1>
        </div>
      </div>
      <p className="max-w-2xl text-sm text-zinc-400">
        Connect your brand's social media accounts to enable AI content calendar scheduling, direct multi-platform publishing, and organic analytics tracking.
      </p>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
        {platforms.map((platform) => (
          <SocialConnectionCard key={platform.id} platform={platform} />
        ))}
      </div>
    </div>
  )
}
