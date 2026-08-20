"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { SignedMedia } from "./SignedMedia";
import type { useQuickHistory } from "./use-quick-history";
import type { QuickHistoryItem } from "@/lib/studio/quick-media";

/**
 * The controls both standalone generators share.
 *
 * They live here rather than in one of the two pages because a page module is
 * the route, not a component library — importing the video page's helpers from
 * the image page would make each route load the other.
 */

export function PillGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
  render,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  render?: (option: T) => string;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={String(option)}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              option === value
                ? "bg-[#b9f42e] text-black"
                : "border border-white/10 text-zinc-400 hover:border-white/25 hover:text-white"
            }`}
          >
            {render ? render(option) : String(option)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** This account's recent standalone work, newest first, in one scrolling row. */
export function RecentStrip({
  history,
  kind,
  onFocus,
  focusedId,
}: {
  history: ReturnType<typeof useQuickHistory>;
  kind: "image" | "video";
  onFocus: (item: QuickHistoryItem) => void;
  focusedId: string | null;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  const finished = history.items.filter((item) => item.resultPath);

  if (history.loading) {
    return (
      <div className="flex h-28 shrink-0 items-center justify-center border-t border-white/10 bg-[#0b0c0b] text-zinc-600">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }
  if (!finished.length) return null;

  return (
    <div className="shrink-0 border-t border-white/10 bg-[#0b0c0b] p-3">
      <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Recent</p>
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {finished.map((item) => (
          <div key={item.id} className="group relative shrink-0">
            <button
              type="button"
              onClick={() => onFocus(item)}
              title={item.prompt}
              className={`block h-20 w-20 overflow-hidden rounded-lg border transition ${
                item.id === focusedId ? "border-[#b9f42e]" : "border-white/10 hover:border-white/30"
              }`}
            >
              <SignedMedia path={item.resultPath} kind={kind} className="h-full w-full object-cover" />
            </button>
            <button
              type="button"
              disabled={removing === item.id}
              onClick={async () => {
                setRemoving(item.id);
                try { await history.remove(item.id); } finally { setRemoving(null); }
              }}
              className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/75 text-zinc-300 opacity-0 transition group-hover:opacity-100 hover:bg-red-500 hover:text-white"
              title="Delete"
            >
              {removing === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
