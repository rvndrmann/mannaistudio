"use client";

import { createRoot } from "react-dom/client";
import { STYLE_CONFLICT_CODE, STYLE_CONFLICT_MESSAGE } from "@/lib/studio/visual-style";

type Answer = "switch" | "keep" | null;

function Dialog({ message, answer }: { message: string; answer: (value: Answer) => void }) {
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/80 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="style-conflict-title">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#141517] p-6 text-white shadow-2xl">
        <h2 id="style-conflict-title" className="text-lg font-bold">Project style doesn&apos;t match</h2>
        <p className="mt-3 text-sm text-zinc-300">{message}</p>
        <p className="mt-2 text-xs text-zinc-500">Nothing was generated or charged.</p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={() => answer(null)} className="rounded-xl px-4 py-2 text-sm font-semibold text-zinc-400 hover:bg-white/5 hover:text-white">Cancel</button>
          <button type="button" onClick={() => answer("keep")} className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/5">Keep photorealistic</button>
          <button type="button" autoFocus onClick={() => answer("switch")} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-black hover:opacity-90">Switch</button>
        </div>
      </div>
    </div>
  );
}

/** Asks once, outside whichever panel started the generation, and resolves with the answer. */
function askStyleConflict(message: string): Promise<Answer> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const answer = (value: Answer) => {
      root.unmount();
      host.remove();
      resolve(value);
    };
    root.render(<Dialog message={message} answer={answer} />);
  });
}

/**
 * Sends a generation, and if the server holds it because its prompt asks for
 * claymation on a photorealistic project, asks the user and sends it again:
 * after switching the project to Claymation, or as it is when they keep
 * photorealistic. Cancel hands back the held response, so the caller reports it
 * like any other refusal.
 *
 * One wrapper rather than a dialog per call site: images, videos and Director
 * approvals all reach the same check.
 */
export async function sendWithStyleCheck(projectId: string, send: (styleConflict?: "keep") => Promise<Response>): Promise<Response> {
  const first = await send();
  if (first.status !== 409) return first;
  const body = await first.clone().json().catch(() => null) as { error?: string; code?: string; suggestedStyle?: string } | null;
  if (body?.code !== STYLE_CONFLICT_CODE) return first;
  const answer = await askStyleConflict(body.error || STYLE_CONFLICT_MESSAGE);
  if (answer === "keep") return send("keep");
  if (answer !== "switch") return first;
  const switched = await fetch(`/api/studio/projects/${projectId}/workspace`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "setVisualStyle", style: body.suggestedStyle }),
  });
  if (!switched.ok) return switched;
  return send();
}
