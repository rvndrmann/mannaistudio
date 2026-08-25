"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Sparkles, Video, Volume2, VolumeX, Wand2 } from "lucide-react";
import { CreateChrome } from "@/components/studio/create/CreateChrome";
import { ReferenceStrip } from "@/components/studio/create/ReferenceStrip";
import { SignedMedia } from "@/components/studio/create/SignedMedia";
import { useQuickHistory } from "@/components/studio/create/use-quick-history";
import { useCreditBalance } from "@/components/studio/create/use-credit-balance";
import { PillGroup, RecentStrip } from "@/components/studio/create/GeneratorControls";
import { AttemptBlock, type Attempt } from "@/components/studio/create/AttemptBlock";
import { useAuth } from "@/components/auth/auth-provider";
import {
  videoDurationOptions,
  videoGenerationModels,
  videoModelMaxDuration,
  type VideoGenerationModelId,
} from "@/lib/studio/generation-models";
import { calculateCreditCost } from "@/lib/studio/credits";
import { blockedByCredits, resolveGenerationSource } from "@/lib/byok/generation-source";
import { useConnectedProviders } from "@/lib/byok/use-connected-providers";
import { notifyCreditBalanceChanged } from "@/lib/credit-balance-events";
import { downloadSignedMedia } from "@/lib/studio/signed-media";
import type { QuickHistoryItem } from "@/lib/studio/quick-media";

const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"] as const;
const RESOLUTIONS = ["480p", "720p", "1080p", "4K"] as const;

// Rendering takes minutes, so the poll is paced for a wait measured that way
// rather than in seconds — a tighter loop only burns requests.
const POLL_INTERVAL_MS = 5_000;
// A clip still unfinished after this has almost certainly been abandoned by the
// provider. The job stays on the server either way; only the page stops asking.
const POLL_TIMEOUT_MS = 20 * 60 * 1000;

export default function QuickVideoPage() {
  const { user, signInWithGoogle } = useAuth();
  const connectedProviders = useConnectedProviders();
  const history = useQuickHistory({ type: "video", limit: 24 });

  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<VideoGenerationModelId>(videoGenerationModels[0].id);
  const [aspectRatio, setAspectRatio] = useState<(typeof ASPECT_RATIOS)[number]>("16:9");
  const [resolution, setResolution] = useState<(typeof RESOLUTIONS)[number]>("720p");
  const [durationSeconds, setDurationSeconds] = useState(5);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [startFrame, setStartFrame] = useState<string[]>([]);
  const [endFrame, setEndFrame] = useState<string[]>([]);
  const [referenceVideos, setReferenceVideos] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  // The clip's whole lifecycle, shown in the canvas where the result will be.
  // Reporting a failure in the settings column meant it landed below the fold
  // on most windows, so a clip that failed after four minutes looked exactly
  // like a button that had done nothing.
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [focused, setFocused] = useState<QuickHistoryItem | null>(null);
  // Cleared on unmount so a poll cannot go on setting state on a dead page.
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
  }, []);

  const creditBalance = useCreditBalance(Boolean(user));

  const durations = useMemo(() => videoDurationOptions(model), [model]);

  // A model swap can strand a duration the new model will not render. Left
  // alone the request is priced for a length the provider silently truncates,
  // so the user pays for seconds they never receive.
  useEffect(() => {
    const max = videoModelMaxDuration(model);
    setDurationSeconds((current) => (current > max ? max : current));
  }, [model]);

  const platformCredits = useMemo(
    () => calculateCreditCost(model, "video", durationSeconds, { resolution, aspectRatio }),
    [model, durationSeconds, resolution, aspectRatio],
  );
  const source = resolveGenerationSource({ model, connectedProviders, platformCredits });
  const outOfCredits = blockedByCredits(source, creditBalance);

  const generating = attempt?.status === "generating";

  const settle = useCallback((patch: Partial<Attempt>) => {
    setAttempt((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const pollUntilDone = useCallback(async (jobId: string, startedAt: number) => {
    try {
      const response = await fetch(`/api/studio/generate/video?jobId=${encodeURIComponent(jobId)}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Could not check the video (${response.status})`);

      if (body.status === "completed" && body.result_path) {
        setStatus(null);
        settle({ status: "completed", resultPath: body.result_path });
        notifyCreditBalanceChanged();
        await history.load();
        return;
      }
      if (body.status === "failed" || body.status === "cancelled") {
        setStatus(null);
        settle({ status: "failed", error: body.error || "The provider did not render this clip." });
        notifyCreditBalanceChanged();
        await history.load();
        return;
      }
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        setStatus(null);
        // Not a failure: the job is still the server's and may yet finish. The
        // page has simply stopped asking, and says where to look instead.
        settle({
          status: "failed",
          error: "This is taking longer than expected, so the page has stopped waiting. The clip will appear under History if the provider finishes it.",
        });
        return;
      }
      setStatus(body.providerStatus === "queued" ? "Queued at the provider…" : "Rendering…");
      pollTimer.current = setTimeout(() => { void pollUntilDone(jobId, startedAt); }, POLL_INTERVAL_MS);
    } catch (cause) {
      setStatus(null);
      settle({ status: "failed", error: cause instanceof Error ? cause.message : "Could not check the video." });
    }
  }, [history, settle]);

  const generate = async () => {
    if (!user) {
      signInWithGoogle();
      return;
    }
    const text = prompt.trim();
    if (!text || generating) return;

    setFocused(null);
    setAttempt({ id: `attempt-${Date.now()}`, status: "generating", prompt: text, resultPath: null, error: null });
    setStatus("Submitting…");
    try {
      const response = await fetch("/api/studio/generate/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          model,
          startFrame: startFrame[0] || null,
          endFrame: endFrame[0] || null,
          referenceVideos,
          aspectRatio,
          resolution,
          audioEnabled,
          durationSeconds,
        }),
      });
      const body = await response.json().catch(() => ({}));
      notifyCreditBalanceChanged();
      if (!response.ok) throw new Error(body.error || `Video generation failed (${response.status})`);
      setStatus("Queued at the provider…");
      await history.load();
      void pollUntilDone(body.jobId, Date.now());
    } catch (cause) {
      setStatus(null);
      settle({ status: "failed", error: cause instanceof Error ? cause.message : "Video generation failed" });
    }
  };

  const latest = focused || history.items.find((item) => item.status === "completed" && item.resultPath) || null;

  return (
    <CreateChrome>
      <div className="flex flex-col lg:h-[calc(100vh-6.5rem)] lg:flex-row">
        <aside className="w-full shrink-0 space-y-5 overflow-y-auto border-b border-white/10 bg-[#0b0c0b] p-5 lg:w-[380px] lg:border-b-0 lg:border-r">
          {!user && (
            <div className="rounded-xl border border-[#b9f42e]/30 bg-[#b9f42e]/[0.05] p-4 text-center">
              <p className="text-sm text-zinc-300">Sign in to generate video.</p>
              <button
                onClick={() => signInWithGoogle()}
                className="mt-3 w-full rounded-lg bg-[#b9f42e] px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[#a5de25]"
              >
                Sign in with Google
              </button>
            </div>
          )}

          <ReferenceStrip
            label="First frame"
            hint="Optional. The image the clip opens on."
            kind="image"
            paths={startFrame}
            onChange={setStartFrame}
            max={1}
          />
          <ReferenceStrip
            label="Last frame"
            hint="Optional. Give both and the model animates between them."
            kind="image"
            paths={endFrame}
            onChange={setEndFrame}
            max={1}
          />
          <ReferenceStrip
            label="Reference clips"
            hint="Optional. Motion and look to carry over. Seedance only."
            kind="video"
            paths={referenceVideos}
            onChange={setReferenceVideos}
            max={2}
          />

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-400" htmlFor="quick-video-prompt">
              Prompt
            </label>
            <textarea
              id="quick-video-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={7}
              placeholder="Describe the shot — what moves, how the camera moves, the light."
              className="w-full resize-y rounded-xl border border-white/10 bg-[#131413] p-3 text-sm text-white placeholder:text-zinc-600 focus:border-[#b9f42e]/60 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-400" htmlFor="quick-video-model">
              Model
            </label>
            <select
              id="quick-video-model"
              value={model}
              onChange={(event) => setModel(event.target.value as VideoGenerationModelId)}
              className="w-full rounded-xl border border-white/10 bg-[#131413] px-3 py-2.5 text-sm text-white focus:border-[#b9f42e]/60 focus:outline-none"
            >
              {videoGenerationModels.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.label}</option>
              ))}
            </select>
          </div>

          <PillGroup label="Aspect ratio" options={ASPECT_RATIOS} value={aspectRatio} onChange={setAspectRatio} />
          <PillGroup label="Resolution" options={RESOLUTIONS} value={resolution} onChange={setResolution} />
          <PillGroup
            label="Duration"
            options={durations}
            value={durationSeconds}
            onChange={setDurationSeconds}
            render={(seconds) => `${seconds}s`}
          />

          <button
            type="button"
            onClick={() => setAudioEnabled((current) => !current)}
            className="flex w-full items-center justify-between rounded-xl border border-white/10 px-3 py-2.5 text-sm text-zinc-300 transition hover:bg-white/5"
          >
            <span className="flex items-center gap-2">
              {audioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              Audio
            </span>
            <span className={`text-xs font-semibold ${audioEnabled ? "text-[#b9f42e]" : "text-zinc-500"}`}>
              {audioEnabled ? "On" : "Off"}
            </span>
          </button>

          <div className="sticky bottom-0 -mx-5 border-t border-white/10 bg-[#0b0c0b] px-5 pb-1 pt-4">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-zinc-500">{source.ownKey ? "Billed by your provider" : "Cost"}</span>
              <span
                className={source.ownKey ? "font-semibold text-[#b9f42e]" : "font-semibold text-zinc-300"}
                title={source.ownKey
                  ? `Runs on your own ${source.provider} key. Billed by them, no studio credits.`
                  : `${platformCredits} credits for ${durationSeconds} seconds at ${resolution}.`}
              >
                {source.ownKey ? "Your key" : `⚡ ${source.credits}`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void generate()}
              disabled={generating || !prompt.trim() || outOfCredits}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#b9f42e] px-4 py-3 text-sm font-bold text-black transition hover:bg-[#a5de25] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {generating ? status || "Generating…" : outOfCredits ? "Not enough credits" : "Generate"}
            </button>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-[45vh] flex-1 items-center justify-center overflow-auto p-6">
            {attempt ? (
              <AttemptBlock
                attempt={attempt}
                kind="video"
                statusText={status}
                large
                onRetry={() => void generate()}
                onReusePrompt={setPrompt}
              />
            ) : latest?.resultPath ? (
              <figure className="flex max-h-full flex-col items-center gap-3">
                <SignedMedia
                  path={latest.resultPath}
                  kind="video"
                  controls
                  className="max-h-[62vh] w-auto max-w-full rounded-2xl border border-white/10"
                />
                <figcaption className="flex items-center gap-3 text-xs text-zinc-500">
                  <button
                    type="button"
                    onClick={() => latest.resultPath && void downloadSignedMedia(latest.resultPath)}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 transition hover:bg-white/10 hover:text-white"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrompt(latest.prompt)}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 transition hover:bg-white/10 hover:text-white"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Reuse prompt
                  </button>
                </figcaption>
              </figure>
            ) : (
              <div className="flex flex-col items-center gap-3 px-6 text-center text-zinc-600">
                <Video className="h-12 w-12" />
                <p className="max-w-sm text-sm">
                  Describe a shot and press Generate. No project, no storyboard — just a clip.
                </p>
              </div>
            )}
          </div>

          <RecentStrip
            history={history}
            kind="video"
            onFocus={(item) => { setAttempt(null); setFocused(item); }}
            focusedId={latest?.id || null}
          />
        </section>
      </div>
    </CreateChrome>
  );
}
