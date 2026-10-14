"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Clock, ExternalLink, MessageSquareWarning, PenLine, RefreshCcw } from "lucide-react";

/**
 * The client's storyboard verdicts, on the storyboard they are about.
 *
 * Only a production opened for a managed order has a client; on any other
 * project this renders nothing. The full words are also filed in each shot's
 * revision thread — this panel is the overview a producer reads before
 * deciding what to regenerate, with a way into the shot for each note.
 */

export type ClientReviewItem = {
  id: string;
  project_id: string;
  round: number;
  position: number;
  source_kind: "keyframe" | "clip" | "asset";
  studio_shot_id: string | null;
  studio_entity_id: string | null;
  title: string;
  caption: string;
  media_type: "image" | "video";
  status: "pending" | "approved" | "changes_requested";
  feedback: string;
  responded_at: string | null;
  created_at: string;
  url: string;
};

type Order = { id: string; name: string };

export type ShotClientStatus = "pending" | "approved" | "changes_requested";

export function useClientStoryboardReview(projectId: string) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<ClientReviewItem[]>([]);

  const reload = useCallback(async () => {
    try {
      const response = await fetch(`/api/studio/projects/${projectId}/client-review`, { cache: "no-store" });
      if (!response.ok) return;
      const json = await response.json();
      setOrders(json.orders || []);
      setItems(json.items || []);
    } catch {
      // A storyboard without its review overlay is still a storyboard.
    }
  }, [projectId]);

  useEffect(() => {
    // Off the effect's own tick, so the first load never sets state while the
    // storyboard is still committing.
    const first = window.setTimeout(() => { void reload(); }, 0);
    // The client answers on their own schedule; a minute is soon enough to
    // notice without a realtime channel for one panel.
    const interval = window.setInterval(() => { void reload(); }, 60_000);
    return () => { window.clearTimeout(first); window.clearInterval(interval); };
  }, [reload]);

  // The client's current word on each shot: its newest round, and of that,
  // the most demanding answer — a clip sent back outranks an approved still.
  const byShot = useMemo(() => {
    const rank: Record<ShotClientStatus, number> = { changes_requested: 3, pending: 2, approved: 1 };
    const latestRound = new Map<string, number>();
    for (const item of items) {
      if (!item.studio_shot_id) continue;
      latestRound.set(item.studio_shot_id, Math.max(latestRound.get(item.studio_shot_id) ?? 0, item.round));
    }
    const result = new Map<string, { status: ShotClientStatus; round: number; feedback: string[] }>();
    for (const item of items) {
      const shotId = item.studio_shot_id;
      if (!shotId || item.round !== latestRound.get(shotId)) continue;
      const current = result.get(shotId);
      const feedback = item.feedback ? [...(current?.feedback || []), item.feedback] : current?.feedback || [];
      const status = !current || rank[item.status] > rank[current.status] ? item.status : current.status;
      result.set(shotId, { status, round: item.round, feedback });
    }
    return result;
  }, [items]);

  return { orders, items, byShot, reload };
}

/** A compact marker for a storyboard row. */
export function ShotClientBadge({ status, round, feedback }: { status: ShotClientStatus; round: number; feedback: string[] }) {
  const tone = status === "approved"
    ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
    : status === "changes_requested"
      ? "border-amber-300/50 bg-amber-400/15 text-amber-200"
      : "border-sky-400/40 bg-sky-500/10 text-sky-300";
  const Icon = status === "approved" ? Check : status === "changes_requested" ? PenLine : Clock;
  const label = status === "approved" ? "Client approved" : status === "changes_requested" ? "Client wants changes" : "With client";
  return (
    <span
      title={`${label} (round ${round})${feedback.length ? `\n\n${feedback.join("\n\n")}` : ""}`}
      aria-label={label}
      className={`grid h-6 w-6 place-items-center rounded-md border ${tone}`}
    >
      <Icon className="h-3 w-3" />
    </span>
  );
}

const KIND_LABEL: Record<ClientReviewItem["source_kind"], string> = { keyframe: "Image", clip: "Clip", asset: "Asset" };

export function ClientStoryboardFeedback({
  orders, items, reload, onOpenShot,
}: {
  orders: Order[];
  items: ClientReviewItem[];
  reload: () => void;
  onOpenShot: (shotId: string, track: "image" | "video") => void;
}) {
  const [open, setOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);

  if (!orders.length || !items.length) return null;

  const latestRound = Math.max(...items.map((item) => item.round));
  const changes = items.filter((item) => item.status === "changes_requested");
  const pending = items.filter((item) => item.status === "pending");
  const approved = items.filter((item) => item.status === "approved");
  const listed = showAll ? items : changes;

  return (
    <div className="rounded-xl border border-sky-400/20 bg-sky-500/[0.04] p-3 lg:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="flex items-center gap-2 text-left text-xs font-bold text-sky-200"
        >
          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
          Client storyboard review
          <span className="font-normal text-zinc-400">· {orders[0].name} · round {latestRound}</span>
        </button>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {changes.length > 0 && <span className="rounded-full bg-amber-400/15 px-2 py-0.5 font-bold text-amber-200">{changes.length} changes</span>}
          {pending.length > 0 && <span className="rounded-full bg-sky-500/15 px-2 py-0.5 font-bold text-sky-300">{pending.length} waiting on client</span>}
          {approved.length > 0 && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-300">{approved.length} approved</span>}
          <button type="button" onClick={reload} aria-label="Refresh client review" className="grid h-6 w-6 place-items-center rounded-md text-zinc-400 hover:bg-white/5 hover:text-white">
            <RefreshCcw className="h-3 w-3" />
          </button>
          <a
            href={`/hire-us/projects/${orders[0].id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-zinc-400 hover:bg-white/5 hover:text-white"
          >
            Order <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {open && (
        <div className="mt-3">
          {listed.length === 0 ? (
            <p className="text-[11px] text-zinc-400">
              {pending.length ? "Nothing sent back yet — the client hasn't answered every frame." : "No changes requested."}
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {listed.map((item) => (
                <div key={item.id} className="flex gap-2.5 rounded-lg border border-white/10 bg-[#141615] p-2">
                  <div className="h-20 w-16 shrink-0 overflow-hidden rounded bg-black">
                    {item.url && (item.media_type === "video"
                      ? <video src={`${item.url}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                      // eslint-disable-next-line @next/next/no-img-element
                      : <img src={item.url} alt="" className="h-full w-full object-cover" />)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-bold text-zinc-200">{item.title || `Frame ${item.position}`}</p>
                    <p className="text-[10px] text-zinc-500">
                      {KIND_LABEL[item.source_kind]} · Round {item.round} ·{" "}
                      <span className={item.status === "approved" ? "text-emerald-300" : item.status === "changes_requested" ? "text-amber-200" : "text-sky-300"}>
                        {item.status === "approved" ? "Approved" : item.status === "changes_requested" ? "Changes" : "Waiting"}
                      </span>
                    </p>
                    {item.feedback && (
                      <p className="mt-1 flex gap-1 text-[11px] leading-snug text-zinc-300">
                        <MessageSquareWarning className="mt-0.5 h-3 w-3 shrink-0 text-amber-300/80" />
                        <span className="line-clamp-3 whitespace-pre-wrap">{item.feedback}</span>
                      </p>
                    )}
                    {item.studio_shot_id && (
                      <button
                        type="button"
                        onClick={() => onOpenShot(item.studio_shot_id as string, item.source_kind === "clip" ? "video" : "image")}
                        className="mt-1 text-[10px] font-bold text-primary hover:underline"
                      >
                        Open shot →
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setShowAll((current) => !current)} className="mt-2 text-[11px] font-bold text-zinc-400 hover:text-white">
            {showAll ? "Show only changes" : `Show all ${items.length} frames sent`}
          </button>
        </div>
      )}
    </div>
  );
}
