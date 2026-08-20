"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, History, ImageIcon, KeyRound, Video, Wand2 } from "lucide-react";
import CreditBadge from "@/components/CreditBadge";
import { BillingModeToggle } from "@/components/studio/BillingModeToggle";

/**
 * The frame around the three standalone pages.
 *
 * Deliberately not the production workspace's chrome. That header carries a
 * project, an episode and a shot, and none of those exist here — showing it
 * would suggest the picture you are about to make lands somewhere in a
 * storyboard, which is the one thing this surface does not do.
 *
 * The credit badge and the billing switch do carry over, because they are about
 * the account rather than the production, and what a generation costs is the
 * question people have on a page whose only button spends money.
 */

const tabs = [
  { href: "/studio/create/image", label: "Image", icon: ImageIcon },
  { href: "/studio/create/video", label: "Video", icon: Video },
  { href: "/studio/create/history", label: "History", icon: History },
];

export function CreateChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <main className="min-h-screen bg-[#070807] text-[#f5f2e5]">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#090a09]/95 backdrop-blur">
        <div className="flex h-16 items-center justify-between gap-3 px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Link
              href="/studio"
              className="flex shrink-0 items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-white/20 hover:text-white"
              title="Back to the studio"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Studio</span>
            </Link>
            <span className="hidden h-6 border-r border-white/10 sm:block" />
            <div className="flex min-w-0 items-center gap-2 truncate text-base font-semibold sm:gap-3 sm:text-lg">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#b9f42e] text-black">
                <Wand2 className="h-5 w-5" />
              </span>
              <span className="truncate">
                Quick <span className="text-[#b9f42e]">Create</span>
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <CreditBadge />
            <BillingModeToggle />
            <Link
              href="/studio/integrations"
              title="Use your own provider API keys instead of studio credits"
              className="hidden items-center gap-1.5 rounded-md border border-white/10 px-3 py-2 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white md:flex"
            >
              <KeyRound className="h-4 w-4" />
              API keys
            </Link>
          </div>
        </div>
        <nav className="flex items-center gap-1 px-3 pb-2 sm:px-5">
          {tabs.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                  active
                    ? "bg-[#b9f42e]/12 text-[#b9f42e]"
                    : "text-zinc-500 hover:bg-white/5 hover:text-white"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </header>
      {children}
    </main>
  );
}
