import { Bot, Clapperboard, GraduationCap, Image as ImageIcon, KeyRound, Video } from "lucide-react"
import { PRO_PRICE_USD_LABEL } from "@/lib/display-currency"
import { ProCta } from "@/components/home/academy/cta"

const features = [
  { icon: Bot, label: "AI Director agent that plans and runs the shoot" },
  { icon: Clapperboard, label: "Script, storyboard and shot list in one place" },
  { icon: ImageIcon, label: "Consistent characters and AI image creation" },
  { icon: Video, label: "AI video generation and a timeline editor" },
  { icon: GraduationCap, label: "Every paid course included, plus new releases" },
  { icon: KeyRound, label: "Runs on your own OpenAI, Gemini, fal.ai or BytePlus keys" },
]

/**
 * What Creator Studio is, on the course pages, with the one way to buy it.
 *
 * Studio is not sold on its own here: it is AI Director Hub Pro, which also
 * carries every paid course, so the button is the same ProCta as everywhere else.
 */
export default function CreatorStudioOffer({ placement }: { placement: string }) {
  return (
    <section aria-labelledby="creator-studio-offer" className="rounded-2xl border border-primary/30 bg-primary/[.05] p-6 sm:p-8">
      <p className="text-xs font-semibold tracking-[.22em] text-primary">CREATOR STUDIO</p>
      <h2 id="creator-studio-offer" className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Make the films you learn to make</h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/60 sm:text-base">
        Creator Studio is where you direct AI films end to end: an AI Director agent writes the script, keeps characters consistent, builds the storyboard and generates the images and video. It comes with AI Director Hub Pro, together with every paid course.
      </p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {features.map((feature) => (
          <li key={feature.label} className="flex items-start gap-3 text-sm text-white/75">
            <feature.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            {feature.label}
          </li>
        ))}
      </ul>
      <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
        <ProCta placement={placement}>{`Get Creator Studio + all courses · ${PRO_PRICE_USD_LABEL}/month`}</ProCta>
        <p className="text-xs text-white/45">Your model provider bills generation to your own API account.</p>
      </div>
    </section>
  )
}
