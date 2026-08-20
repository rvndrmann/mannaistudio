"use client";

import { AlertCircle, Download, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { downloadSignedMedia } from "@/lib/studio/signed-media";
import { SignedMedia } from "./SignedMedia";

/**
 * One generation, from asked-for to done, in the place the result will appear.
 *
 * The whole lifecycle belongs in this one block. It used to be split: a spinner
 * in the canvas, and the failure reported in a red box in the settings panel —
 * which is a scrolling column, so on anything but a tall window the message was
 * below the fold. Pressing Generate and seeing the empty state come back with
 * no explanation reads as a button that does nothing, which is the worst
 * possible reading of a button that just spent credits.
 *
 * So a block is created the moment Generate is pressed and stays put: it spins,
 * then becomes the picture, or becomes the error. Nothing about a generation is
 * ever reported anywhere the eye is not already looking.
 */

export type Attempt = {
  id: string;
  status: "generating" | "completed" | "failed";
  prompt: string;
  resultPath: string | null;
  error: string | null;
};

export function AttemptBlock({
  attempt,
  kind,
  statusText,
  onRetry,
  onReusePrompt,
  large,
}: {
  attempt: Attempt;
  kind: "image" | "video";
  /** Progress detail for a provider that reports it, e.g. "Queued…". */
  statusText?: string | null;
  onRetry?: () => void;
  onReusePrompt?: (prompt: string) => void;
  large?: boolean;
}) {
  const frame = large
    ? "w-full max-w-3xl"
    : "w-full";

  if (attempt.status === "generating") {
    return (
      <div className={`${frame} flex aspect-square flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-[#101110] p-6 text-center`}>
        <Loader2 className="h-7 w-7 animate-spin text-[#b9f42e]" />
        <p className="text-sm text-zinc-400">{statusText || "Rendering…"}</p>
        <p className="line-clamp-2 max-w-xs text-xs text-zinc-600">{attempt.prompt}</p>
        {kind === "video" && (
          <p className="max-w-xs text-[11px] text-zinc-600">
            This takes a few minutes. Leaving the page will not cancel it — the clip appears in History when it lands.
          </p>
        )}
      </div>
    );
  }

  if (attempt.status === "failed") {
    return (
      <div className={`${frame} flex aspect-square flex-col items-center justify-center gap-3 rounded-2xl border border-red-400/30 bg-red-500/[0.07] p-6 text-center`}>
        <AlertCircle className="h-7 w-7 text-red-300" />
        <p className="text-sm font-semibold text-red-200">This one did not render</p>
        {/* The provider's own words, not a house message. "Something went
            wrong" is unactionable; "insufficient credits" or "reference image
            rejected" tells the user what to change. */}
        <p className="max-w-sm text-xs leading-relaxed text-red-200/80">{attempt.error || "The provider gave no reason."}</p>
        <p className="mt-1 text-[11px] text-zinc-500">
          Nothing was kept. Any credits taken for it have been returned.
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Try again
          </button>
        )}
      </div>
    );
  }

  return (
    <figure className={`${frame} flex flex-col items-center gap-3`}>
      <SignedMedia
        path={attempt.resultPath}
        kind={kind}
        controls={kind === "video"}
        className={`w-full rounded-2xl border border-white/10 ${large ? "max-h-[58vh] object-contain" : "aspect-square object-cover"}`}
      />
      <figcaption className="flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-500">
        <button
          type="button"
          onClick={() => attempt.resultPath && void downloadSignedMedia(attempt.resultPath)}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 transition hover:bg-white/10 hover:text-white"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </button>
        {onReusePrompt && (
          <button
            type="button"
            onClick={() => onReusePrompt(attempt.prompt)}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 transition hover:bg-white/10 hover:text-white"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Reuse prompt
          </button>
        )}
      </figcaption>
    </figure>
  );
}
