"use client";

import { useRef, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { referenceRejection, uploadQuickReference } from "@/lib/studio/quick-uploads";
import { SignedMedia } from "./SignedMedia";

/**
 * The pictures (or clips) a generation is given to work from.
 *
 * Files upload as they are picked rather than on submit, so the wait happens
 * while the prompt is still being written instead of after the Generate button
 * is pressed — and a file that storage rejects is found before any credits are
 * committed to it.
 */
export function ReferenceStrip({
  label,
  hint,
  kind,
  paths,
  onChange,
  max = 8,
  disabled = false,
}: {
  label: string;
  hint?: string;
  kind: "image" | "video";
  paths: string[];
  onChange: (paths: string[]) => void;
  max?: number;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    const room = max - paths.length;
    const chosen = Array.from(files).slice(0, Math.max(0, room));
    if (chosen.length < files.length) setError(`Only ${max} allowed here — the rest were skipped.`);

    // Collected and published once. Appending to `paths` inside the loop reads
    // a value captured before the first upload started, so every file but one
    // would be dropped when several are picked together.
    const added: string[] = [];
    for (const file of chosen) {
      const rejection = referenceRejection(file, kind);
      if (rejection) {
        setError(rejection);
        continue;
      }
      setUploading((count) => count + 1);
      try {
        added.push(await uploadQuickReference(file));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That file could not be uploaded.");
      } finally {
        setUploading((count) => count - 1);
      }
    }
    if (added.length) onChange([...paths, ...added]);
  };

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{label}</p>
        <span className="text-[11px] text-zinc-600">{paths.length}/{max}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {paths.map((path) => (
          <div key={path} className="group relative h-16 w-16 overflow-hidden rounded-lg border border-white/10">
            <SignedMedia path={path} kind={kind} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(paths.filter((item) => item !== path))}
              className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/75 text-zinc-300 opacity-0 transition group-hover:opacity-100 hover:bg-red-500 hover:text-white"
              title="Remove"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {Array.from({ length: uploading }).map((_, index) => (
          <div key={`uploading-${index}`} className="grid h-16 w-16 place-items-center rounded-lg border border-white/10 bg-[#131413] text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ))}
        {paths.length + uploading < max && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="grid h-16 w-16 place-items-center rounded-lg border border-dashed border-white/20 text-zinc-500 transition hover:border-[#b9f42e]/60 hover:text-[#b9f42e] disabled:opacity-40"
            title={`Add ${kind}`}
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
      {hint && !error && <p className="mt-2 text-[11px] leading-snug text-zinc-600">{hint}</p>}
      {error && <p className="mt-2 text-[11px] leading-snug text-red-300">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={kind === "image" ? "image/*" : "video/*"}
        multiple={max > 1}
        className="hidden"
        onChange={(event) => {
          void addFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
