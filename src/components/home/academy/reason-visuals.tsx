import type { ReactNode } from "react"
import { ArrowRight, Camera, Check, KeyRound, Lightbulb, MessageCircle, Users } from "lucide-react"

/**
 * One visual per reason.
 *
 * These are diagrams of the idea, drawn in markup — not screenshots, and not
 * dressed up to look like them. Nothing here is a result or a number anyone
 * achieved; anything of that kind on the homepage comes from /admin/proof.
 */

function Panel({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="img" aria-label={label} className="rounded-2xl border border-white/10 bg-black/40 p-5 sm:p-6">
      {children}
    </div>
  )
}

const chain = (steps: string[]) => (
  <div className="flex flex-wrap items-center gap-2">
    {steps.map((step, position) => (
      <span key={step} className="flex items-center gap-2">
        <span className="rounded-lg border border-white/10 bg-white/[.04] px-3 py-2 text-sm font-medium text-white/85">{step}</span>
        {position < steps.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-primary" />}
      </span>
    ))}
  </div>
)

export const reasonVisuals = {
  shots: (
    <Panel label="A shot described as decisions: framing, camera move, lighting and lens">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-primary"><Camera className="h-4 w-4" /> A shot, as decisions</p>
      <dl className="mt-4 divide-y divide-white/10 text-sm">
        {[["Framing", "Medium close-up, eye level"], ["Camera", "Slow dolly-in"], ["Light", "Soft window key, warm practicals"], ["Lens", "50mm, shallow depth of field"]].map(([term, value]) => (
          <div key={term} className="flex justify-between gap-4 py-2.5"><dt className="text-white/60">{term}</dt><dd className="text-right font-medium text-white/85">{value}</dd></div>
        ))}
      </dl>
    </Panel>
  ),
  faces: (
    <Panel label="One character reference carried across three scenes">
      <div className="grid grid-cols-3 gap-3">
        {["Scene 1 · Street", "Scene 2 · Studio", "Scene 3 · Night"].map((scene) => (
          <div key={scene} className="rounded-xl border border-white/10 bg-white/[.04] p-3 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border-2 border-primary/70 bg-primary/10 text-sm font-semibold text-primary">A</span>
            <p className="mt-3 text-[11px] leading-tight text-white/60">{scene}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 flex items-center gap-2 text-xs text-white/55"><Check className="h-3.5 w-3.5 text-primary" /> Same character reference in every shot</p>
    </Panel>
  ),
  director: (
    <Panel label="The AI Director's plan, from idea to generation, waiting for approval">
      {chain(["Idea", "Script", "Characters", "Storyboard", "Generation"])}
      <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/[.06] px-4 py-3">
        <p className="text-sm text-white/75">Plan ready for your review</p>
        <span className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-black">Approve</span>
      </div>
    </Panel>
  ),
  models: (
    <Panel label="Four model providers connected to one studio">
      <div className="grid grid-cols-2 gap-3">
        {["OpenAI", "Google Gemini", "fal.ai", "BytePlus (Seedance)"].map((provider) => (
          <span key={provider} className="rounded-xl border border-white/10 bg-white/[.04] px-3 py-3 text-center text-sm font-medium text-white/85">{provider}</span>
        ))}
      </div>
      <p className="mt-4 rounded-xl border border-primary/30 bg-primary/[.06] px-4 py-3 text-center text-sm font-semibold text-primary">One Creator Studio</p>
    </Panel>
  ),
  keys: (
    <Panel label="Generation is billed by your provider, with no markup added">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-primary"><KeyRound className="h-4 w-4" /> Who bills what</p>
      <dl className="mt-4 divide-y divide-white/10 text-sm">
        <div className="flex justify-between gap-4 py-2.5"><dt className="text-white/60">Generation</dt><dd className="text-right font-medium text-white/85">Your provider, at their price</dd></div>
        <div className="flex justify-between gap-4 py-2.5"><dt className="text-white/60">Our markup on generation</dt><dd className="font-semibold text-primary">₹0</dd></div>
        <div className="flex justify-between gap-4 py-2.5"><dt className="text-white/60">AI Director Hub Pro</dt><dd className="font-medium text-white/85">₹799/month</dd></div>
      </dl>
    </Panel>
  ),
  workflow: (
    <Panel label="The full workflow: idea, script, shots, edit and sound design">
      <ol className="space-y-2.5">
        {["Idea", "Script", "Shots", "Edit", "Cinematic sound design"].map((step, position) => (
          <li key={step} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.04] px-4 py-2.5 text-sm font-medium text-white/85">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{position + 1}</span>{step}
          </li>
        ))}
      </ol>
    </Panel>
  ),
  founder: (
    <Panel label="Founder: Ravinder">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-primary"><Lightbulb className="h-4 w-4" /> The founder</p>
      <p className="mt-4 text-2xl font-semibold">Ravinder</p>
      <p className="mt-1 text-sm text-white/55">Founder, AI Director Hub</p>
      <p className="mt-4 text-sm leading-relaxed text-white/70">2 years producing AI video for brands in India and the US.</p>
    </Panel>
  ),
  community: (
    <Panel label="A community of Pro members">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-primary"><Users className="h-4 w-4" /> Pro community</p>
      <ul className="mt-4 space-y-2.5 text-sm text-white/75">
        {["Share work in progress", "Compare workflows", "Get unstuck faster"].map((line) => (
          <li key={line} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.04] px-4 py-2.5"><MessageCircle className="h-4 w-4 shrink-0 text-primary" />{line}</li>
        ))}
      </ul>
    </Panel>
  ),
} as const
