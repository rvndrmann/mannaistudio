"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Download, ImageIcon, Loader2, Sparkles, Wand2 } from "lucide-react";
import { CreateChrome } from "@/components/studio/create/CreateChrome";
import { ReferenceStrip } from "@/components/studio/create/ReferenceStrip";
import { SignedMedia } from "@/components/studio/create/SignedMedia";
import { useQuickHistory } from "@/components/studio/create/use-quick-history";
import { useCreditBalance } from "@/components/studio/create/use-credit-balance";
import { PillGroup, RecentStrip } from "@/components/studio/create/GeneratorControls";
import { useAuth } from "@/components/auth/auth-provider";
import { imageGenerationModels, type ImageGenerationModelId } from "@/lib/studio/generation-models";
import { calculateCreditCost } from "@/lib/studio/credits";
import { blockedByCredits, resolveGenerationSource } from "@/lib/byok/generation-source";
import { useConnectedProviders } from "@/lib/byok/use-connected-providers";
import { notifyCreditBalanceChanged } from "@/lib/credit-balance-events";
import { downloadSignedMedia } from "@/lib/studio/signed-media";
import type { QuickHistoryItem } from "@/lib/studio/quick-media";

const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"] as const;
const QUALITIES = ["Low", "Medium", "High", "Ultra"] as const;
const BATCH_SIZES = [1, 2, 3, 4] as const;

type Pending = { id: string; prompt: string };

export default function QuickImagePage() {
  const { user, signInWithGoogle } = useAuth();
  const connectedProviders = useConnectedProviders();
  const history = useQuickHistory({ type: "image", limit: 24 });

  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<ImageGenerationModelId>(imageGenerationModels[0].id);
  const [aspectRatio, setAspectRatio] = useState<(typeof ASPECT_RATIOS)[number]>("1:1");
  const [quality, setQuality] = useState<(typeof QUALITIES)[number]>("Medium");
  const [batch, setBatch] = useState<(typeof BATCH_SIZES)[number]>(1);
  const [references, setReferences] = useState<string[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<QuickHistoryItem | null>(null);

  const creditBalance = useCreditBalance(Boolean(user));

  // Priced per image, then multiplied by the batch — the batch is sent as that
  // many separate requests, each charged in its own right.
  const perImage = useMemo(
    () => calculateCreditCost(model, "image", 5, { quality, aspectRatio }),
    [model, quality, aspectRatio],
  );
  const source = resolveGenerationSource({ model, connectedProviders, platformCredits: perImage });
  const totalCredits = source.credits * batch;
  // Priced against the whole batch, not one image: four renders at 12 credits
  // need 48, and checking one at a time would offer a Generate button that
  // fails partway through with three images made and the fourth refused.
  const outOfCredits = blockedByCredits({ ...source, credits: totalCredits }, creditBalance);

  const generate = async () => {
    if (!user) {
      signInWithGoogle();
      return;
    }
    if (!prompt.trim() || pending.length) return;
    setError(null);

    const batchPending: Pending[] = Array.from({ length: batch }, (_, index) => ({
      id: `pending-${Date.now()}-${index}`,
      prompt: prompt.trim(),
    }));
    setPending(batchPending);

    // Fired as independent requests rather than one batched call: each is its
    // own job, its own charge and its own refund, so one provider failure
    // cannot take the other three down or leave a partial charge to unpick.
    const results = await Promise.allSettled(batchPending.map(async () => {
      const response = await fetch("/api/studio/generate/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), model, referenceImages: references, aspectRatio, quality }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Image generation failed");
      return body as { jobId: string; path: string; creditsCharged: number; billingMode: string; creditBalance: number | null };
    }));

    setPending([]);
    notifyCreditBalanceChanged();

    const failures: string[] = [];
    for (const result of results) {
      if (result.status === "rejected") {
        failures.push(result.reason instanceof Error ? result.reason.message : "Image generation failed");
        continue;
      }
      const item: QuickHistoryItem = {
        id: result.value.jobId,
        type: "image",
        status: "completed",
        prompt: prompt.trim(),
        model,
        provider: source.provider,
        resultPath: result.value.path,
        error: null,
        creditsCharged: result.value.creditsCharged || 0,
        billingMode: result.value.billingMode || "credits",
        settings: { aspectRatio, quality },
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      history.prepend(item);
      setFocused(item);
    }
    // One line however many failed: four copies of the same provider error is
    // noise, not information.
    if (failures.length) {
      setError(failures.length === results.length
        ? failures[0]
        : `${failures.length} of ${results.length} did not render: ${failures[0]}`);
    }
  };

  const latest = focused || history.items.find((item) => item.status === "completed" && item.resultPath) || null;

  return (
    <CreateChrome>
      <div className="flex flex-col lg:h-[calc(100vh-6.5rem)] lg:flex-row">
        <aside className="w-full shrink-0 space-y-5 overflow-y-auto border-b border-white/10 bg-[#0b0c0b] p-5 lg:w-[380px] lg:border-b-0 lg:border-r">
          {!user && (
            <div className="rounded-xl border border-[#b9f42e]/30 bg-[#b9f42e]/[0.05] p-4 text-center">
              <p className="text-sm text-zinc-300">Sign in to generate images.</p>
              <button
                onClick={signInWithGoogle}
                className="mt-3 w-full rounded-lg bg-[#b9f42e] px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[#a5de25]"
              >
                Sign in with Google
              </button>
            </div>
          )}

          <ReferenceStrip
            label="References"
            hint="Optional. Images the model should draw from — a subject, a place, a style."
            kind="image"
            paths={references}
            onChange={setReferences}
            max={8}
          />

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-400" htmlFor="quick-image-prompt">
              Prompt
            </label>
            <textarea
              id="quick-image-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={7}
              placeholder="Describe the image — the subject, the light, the lens, the mood."
              className="w-full resize-y rounded-xl border border-white/10 bg-[#131413] p-3 text-sm text-white placeholder:text-zinc-600 focus:border-[#b9f42e]/60 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-400" htmlFor="quick-image-model">
              Model
            </label>
            <select
              id="quick-image-model"
              value={model}
              onChange={(event) => setModel(event.target.value as ImageGenerationModelId)}
              className="w-full rounded-xl border border-white/10 bg-[#131413] px-3 py-2.5 text-sm text-white focus:border-[#b9f42e]/60 focus:outline-none"
            >
              {imageGenerationModels.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.label}</option>
              ))}
            </select>
          </div>

          <PillGroup
            label="Aspect ratio"
            options={ASPECT_RATIOS}
            value={aspectRatio}
            onChange={setAspectRatio}
          />
          <PillGroup label="Quality" options={QUALITIES} value={quality} onChange={setQuality} />
          <PillGroup
            label="How many"
            options={BATCH_SIZES}
            value={batch}
            onChange={setBatch}
            render={(option) => `${option}`}
          />

          {error && (
            <p className="flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </p>
          )}

          <div className="sticky bottom-0 -mx-5 border-t border-white/10 bg-[#0b0c0b] px-5 pb-1 pt-4">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-zinc-500">
                {source.ownKey ? "Billed by your provider" : "Cost"}
              </span>
              <span
                className={source.ownKey ? "font-semibold text-[#b9f42e]" : "font-semibold text-zinc-300"}
                title={source.ownKey
                  ? `Runs on your own ${source.provider} key. Billed by them, no studio credits.`
                  : `${totalCredits} credits for ${batch} image${batch > 1 ? "s" : ""}.`}
              >
                {source.ownKey ? "Your key" : `⚡ ${totalCredits}`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void generate()}
              disabled={Boolean(pending.length) || !prompt.trim() || outOfCredits}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#b9f42e] px-4 py-3 text-sm font-bold text-black transition hover:bg-[#a5de25] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending.length ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {pending.length ? "Generating…" : outOfCredits ? "Not enough credits" : "Generate"}
            </button>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-[45vh] flex-1 items-center justify-center overflow-auto p-6">
            {pending.length ? (
              <div className="flex flex-col items-center gap-3 text-zinc-500">
                <Loader2 className="h-8 w-8 animate-spin text-[#b9f42e]" />
                <p className="text-sm">
                  Rendering {pending.length} image{pending.length > 1 ? "s" : ""}…
                </p>
              </div>
            ) : latest?.resultPath ? (
              <figure className="flex max-h-full flex-col items-center gap-3">
                <SignedMedia
                  path={latest.resultPath}
                  kind="image"
                  className="max-h-[62vh] w-auto max-w-full rounded-2xl border border-white/10 object-contain"
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
                <ImageIcon className="h-12 w-12" />
                <p className="max-w-sm text-sm">
                  Write a prompt and press Generate. Nothing here belongs to a production — it is just an image.
                </p>
              </div>
            )}
          </div>

          <RecentStrip
            history={history}
            kind="image"
            onFocus={setFocused}
            focusedId={latest?.id || null}
          />
        </section>
      </div>
    </CreateChrome>
  );
}
