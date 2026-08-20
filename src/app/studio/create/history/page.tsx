"use client";

import { useState } from "react";
import { AlertCircle, Download, History, Loader2, Sparkles, Trash2, X } from "lucide-react";
import Link from "next/link";
import { CreateChrome } from "@/components/studio/create/CreateChrome";
import { SignedMedia } from "@/components/studio/create/SignedMedia";
import { useQuickHistory } from "@/components/studio/create/use-quick-history";
import { downloadSignedMedia } from "@/lib/studio/signed-media";
import { getModelLabel } from "@/lib/studio/generation-models";
import type { QuickHistoryItem } from "@/lib/studio/quick-media";

const FILTERS = [
  { id: "all", label: "Everything" },
  { id: "image", label: "Images" },
  { id: "video", label: "Video" },
] as const;

/**
 * Everything made outside a production.
 *
 * Failures are shown alongside the successes rather than hidden. A generation
 * that failed and was refunded is the row someone goes looking for when the
 * balance moved and no picture appeared, and a history that quietly omits it
 * reads as a charge with nothing to show for it.
 */
export default function QuickHistoryPage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const history = useQuickHistory({ type: filter, limit: 24 });
  const [open, setOpen] = useState<QuickHistoryItem | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const remove = async (item: QuickHistoryItem) => {
    if (!confirm("Delete this generation? The file is removed too and cannot be recovered.")) return;
    setRemoving(item.id);
    try {
      await history.remove(item.id);
      if (open?.id === item.id) setOpen(null);
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "Could not delete this generation.");
    } finally {
      setRemoving(null);
    }
  };

  return (
    <CreateChrome>
      <div className="mx-auto max-w-[1500px] px-5 py-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Your generations</h1>
          <div className="flex gap-1.5">
            {FILTERS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setFilter(entry.id)}
                className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                  filter === entry.id
                    ? "bg-[#b9f42e] text-black"
                    : "border border-white/10 text-zinc-400 hover:border-white/25 hover:text-white"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>

        {history.error && (
          <p className="mb-4 flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {history.error}
          </p>
        )}

        {history.loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[#b9f42e]" />
          </div>
        ) : !history.items.length ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 py-20 text-center text-zinc-600">
            <History className="h-10 w-10" />
            <p className="max-w-sm text-sm">Nothing here yet. Anything you make on the Image or Video tab lands here.</p>
            <Link
              href="/studio/create/image"
              className="mt-1 rounded-lg bg-[#b9f42e] px-4 py-2 text-xs font-bold text-black transition hover:bg-[#a5de25]"
            >
              Make something
            </Link>
          </div>
        ) : (
          <>
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}
            >
              {history.items.map((item) => (
                <article
                  key={item.id}
                  className="group overflow-hidden rounded-2xl border border-white/10 bg-[#131413] transition hover:border-[#b9f42e]/45"
                >
                  <button
                    type="button"
                    onClick={() => item.resultPath && setOpen(item)}
                    disabled={!item.resultPath}
                    className="relative block aspect-square w-full overflow-hidden disabled:cursor-default"
                  >
                    {item.resultPath ? (
                      <SignedMedia path={item.resultPath} kind={item.type} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center text-xs text-zinc-600">
                        <AlertCircle className="h-6 w-6" />
                        {item.status === "processing" ? "Still rendering…" : item.error || "No output"}
                      </span>
                    )}
                    <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#d9ff84] backdrop-blur">
                      {item.type}
                    </span>
                  </button>
                  <div className="p-3">
                    <p className="line-clamp-2 text-xs leading-snug text-zinc-300" title={item.prompt}>
                      {item.prompt}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-zinc-600">
                      <span className="truncate" title={getModelLabel(item.model)}>{getModelLabel(item.model)}</span>
                      <span className="shrink-0">
                        {item.billingMode === "byok" ? "Your key" : `⚡ ${item.creditsCharged}`}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-1.5">
                      {item.resultPath && (
                        <button
                          type="button"
                          onClick={() => void downloadSignedMedia(item.resultPath!)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 py-1.5 text-[11px] text-zinc-400 transition hover:bg-white/10 hover:text-white"
                        >
                          <Download className="h-3 w-3" />
                          Save
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={removing === item.id}
                        onClick={() => void remove(item)}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/10 text-zinc-500 transition hover:border-red-400/50 hover:text-red-300 disabled:opacity-40"
                        title="Delete"
                      >
                        {removing === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {history.hasMore && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => void history.loadMore()}
                  disabled={history.loadingMore}
                  className="flex items-center gap-2 rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                >
                  {history.loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {open?.resultPath && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-5 backdrop-blur-sm"
          onClick={() => setOpen(null)}
        >
          <div className="max-h-full w-full max-w-4xl overflow-y-auto" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-4">
              <p className="text-sm text-zinc-300">{open.prompt}</p>
              <button
                type="button"
                onClick={() => setOpen(null)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-zinc-300 transition hover:bg-white/20 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SignedMedia
              path={open.resultPath}
              kind={open.type}
              controls
              autoPlay={open.type === "video"}
              className="max-h-[72vh] w-full rounded-2xl border border-white/10 object-contain"
            />
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
              <span>{getModelLabel(open.model)}</span>
              <span>·</span>
              <span>{new Date(open.createdAt).toLocaleString()}</span>
              <span>·</span>
              <span>{open.billingMode === "byok" ? "Ran on your own key" : `${open.creditsCharged} credits`}</span>
              <button
                type="button"
                onClick={() => void downloadSignedMedia(open.resultPath!)}
                className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 transition hover:bg-white/10 hover:text-white"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </button>
              <Link
                href={open.type === "video" ? "/studio/create/video" : "/studio/create/image"}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 transition hover:bg-white/10 hover:text-white"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Make another
              </Link>
            </div>
          </div>
        </div>
      )}
    </CreateChrome>
  );
}
