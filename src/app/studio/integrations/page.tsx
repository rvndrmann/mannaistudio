import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { IntegrationsPanel } from "@/components/studio/IntegrationsPanel";

export const metadata = { title: "Integrations · AI Director Hub" };

export default function IntegrationsPage() {
  return (
    <>
      {/* Same header as Credits and Team: this page is reached from either, and
          a settings page with no way back leaves the browser button as the only
          exit. */}
      <header className="border-b border-white/[0.06] bg-[#0a0a0a] px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link
            href="/studio"
            className="flex items-center gap-2 rounded-lg p-2 text-xs font-semibold text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Studio</span>
          </Link>
          <Link
            href="/studio/credits"
            className="rounded-lg p-2 text-xs font-semibold text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
          >
            Studio credits
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 py-10">
        <h1 className="t-display text-zinc-100">Integrations</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Connect your own model-provider keys, or keep using studio credits.
        </p>
        <div className="mt-8">
          <IntegrationsPanel />
        </div>
      </main>
    </>
  );
}
