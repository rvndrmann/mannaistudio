"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Loader2, Sparkles, Trash2, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isVideoReferencePath } from "@/lib/studio/media-reference";
import { MAX_STYLE_REFERENCE_IMAGES, isEmptyStyleDna, type StyleDna } from "@/lib/studio/style-dna";

/**
 * The Look & Feel control: drop reference images, read the look back as fields,
 * correct the ones that are wrong.
 *
 * The extracted look is held here and saved with the rest of Basic Settings
 * rather than written straight to the project, so a bad reading of a mood board
 * never silently becomes the look every image in the project inherits — the user
 * sees it, edits it, and confirms it like every other setting in the dialog.
 */

type Editable = { label: string; hint?: string; get: (dna: StyleDna) => string; set: (dna: StyleDna, value: string) => StyleDna };

const SECTIONS: Array<{ title: string; fields: Editable[] }> = [
  {
    title: "Feeling",
    fields: [
      { label: "Mood", get: (d) => d.feeling.mood, set: (d, v) => ({ ...d, feeling: { ...d.feeling, mood: v } }) },
      { label: "Core emotions", hint: "comma separated", get: (d) => d.feeling.coreEmotions.join(", "), set: (d, v) => ({ ...d, feeling: { ...d.feeling, coreEmotions: splitList(v) } }) },
      { label: "Atmosphere", hint: "comma separated", get: (d) => d.feeling.atmosphere.join(", "), set: (d, v) => ({ ...d, feeling: { ...d.feeling, atmosphere: splitList(v) } }) },
    ],
  },
  {
    title: "Colour",
    fields: [
      { label: "Dominant", hint: "comma separated", get: (d) => d.color.dominant.join(", "), set: (d, v) => ({ ...d, color: { ...d.color, dominant: splitList(v) } }) },
      { label: "Accent", hint: "comma separated", get: (d) => d.color.accent.join(", "), set: (d, v) => ({ ...d, color: { ...d.color, accent: splitList(v) } }) },
      { label: "Overall tone", get: (d) => d.color.tone, set: (d, v) => ({ ...d, color: { ...d.color, tone: v } }) },
    ],
  },
  {
    title: "Lighting",
    fields: [
      { label: "Type", get: (d) => d.lighting.type, set: (d, v) => ({ ...d, lighting: { ...d.lighting, type: v } }) },
      { label: "Source & direction", get: (d) => d.lighting.sourceDirection, set: (d, v) => ({ ...d, lighting: { ...d.lighting, sourceDirection: v } }) },
      { label: "Brightness", get: (d) => d.lighting.key, set: (d, v) => ({ ...d, lighting: { ...d.lighting, key: v } }) },
      { label: "Atmospherics", hint: "comma separated", get: (d) => d.lighting.atmospherics.join(", "), set: (d, v) => ({ ...d, lighting: { ...d.lighting, atmospherics: splitList(v) } }) },
    ],
  },
  {
    title: "Composition",
    fields: [
      { label: "Layout", get: (d) => d.composition.layout, set: (d, v) => ({ ...d, composition: { ...d.composition, layout: v } }) },
      { label: "Perspective", get: (d) => d.composition.perspective, set: (d, v) => ({ ...d, composition: { ...d.composition, perspective: v } }) },
      { label: "Depth of field", get: (d) => d.composition.depthOfField, set: (d, v) => ({ ...d, composition: { ...d.composition, depthOfField: v } }) },
      { label: "Framing", get: (d) => d.composition.framing, set: (d, v) => ({ ...d, composition: { ...d.composition, framing: v } }) },
    ],
  },
  {
    title: "Texture & scale",
    fields: [
      { label: "Textures", hint: "comma separated", get: (d) => d.texture.textures.join(", "), set: (d, v) => ({ ...d, texture: { ...d.texture, textures: splitList(v) } }) },
      { label: "Materials", hint: "comma separated", get: (d) => d.texture.materials.join(", "), set: (d, v) => ({ ...d, texture: { ...d.texture, materials: splitList(v) } }) },
      { label: "Sense of scale", get: (d) => d.scale.senseOfScale, set: (d, v) => ({ ...d, scale: { ...d.scale, senseOfScale: v } }) },
      { label: "Viewer relationship", get: (d) => d.scale.viewerRelationship, set: (d, v) => ({ ...d, scale: { ...d.scale, viewerRelationship: v } }) },
    ],
  },
  {
    title: "Rendering",
    fields: [
      { label: "Realism", get: (d) => d.subject.realism, set: (d, v) => ({ ...d, subject: { ...d.subject, realism: v } }) },
      { label: "Overarching style", get: (d) => d.subject.overarchingStyle, set: (d, v) => ({ ...d, subject: { ...d.subject, overarchingStyle: v } }) },
      { label: "Critical details", hint: "comma separated", get: (d) => d.subject.criticalDetails.join(", "), set: (d, v) => ({ ...d, subject: { ...d.subject, criticalDetails: splitList(v) } }) },
      { label: "Avoid", hint: "comma separated", get: (d) => d.negatives.join(", "), set: (d, v) => ({ ...d, negatives: splitList(v) }) },
    ],
  },
];

function splitList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function StyleDnaPanel({
  projectId,
  value,
  onChange,
  lockable = false,
  overrideEnabled = true,
  onOverrideChange,
  projectSummary,
  heading = "Look & Feel Reference",
  blurb = "Drop images whose look you want copied. Every character, asset, and shot then inherits their palette, light, and texture.",
}: {
  projectId: string;
  value: StyleDna | null;
  onChange: (next: StyleDna | null) => void;
  /** Renders the project-look lock, for the per-image copies of this panel. */
  lockable?: boolean;
  overrideEnabled?: boolean;
  onOverrideChange?: (next: boolean) => void;
  /** One line describing the look this image inherits while the lock is on. */
  projectSummary?: string | null;
  heading?: string;
  blurb?: string;
}) {
  const [pending, setPending] = useState<string[]>(value?.sourceImages || []);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<"upload" | "analyse" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const registerPreview = async (path: string) => {
    const { data } = await createClient().storage.from("creator-studio-media").createSignedUrl(path, 60 * 60);
    if (data?.signedUrl) setPreviews((current) => ({ ...current, [path]: data.signedUrl }));
  };

  // Reopening the dialog restores stored paths, which are not URLs the browser
  // can render. Without this the panel shows a saved look with blank thumbnails
  // and looks like it lost the references it is still using.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const path of pending) {
        if (previews[path] || /^https?:\/\//i.test(path)) continue;
        const { data } = await createClient().storage.from("creator-studio-media").createSignedUrl(path, 60 * 60);
        if (!cancelled && data?.signedUrl) setPreviews((current) => ({ ...current, [path]: data.signedUrl }));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const upload = async (file?: File) => {
    if (!file) return;
    setError(null);
    if (isVideoReferencePath(file.name)) {
      setError("A look reference has to be a still image.");
      return;
    }
    setBusy("upload");
    try {
      const userId = (await createClient().auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Please sign in before uploading a reference.");
      const path = `${userId}/${projectId}/style-reference-${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      const { error: uploadError } = await createClient().storage.from("creator-studio-media").upload(path, file);
      if (uploadError) throw uploadError;
      setPending((current) => (current.includes(path) ? current : [...current, path].slice(0, 6)));
      await registerPreview(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  const analyse = async () => {
    if (!pending.length) return;
    setBusy("analyse");
    setError(null);
    try {
      const response = await fetch(`/api/studio/projects/${projectId}/style-dna`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceImages: pending, notes: notes.trim() || undefined }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not analyse the reference images");
      // The toggle is the user's, not the model's: re-reading the same board
      // must not silently take back a decision they already made about whether
      // the reference outranks the project's visual style.
      onChange({ ...body.styleDna, overrideProjectStyle: value?.overrideProjectStyle ?? false });
      setExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setBusy(null);
    }
  };

  const removeReference = (path: string) => {
    setPending((current) => current.filter((item) => item !== path));
    if (value) onChange({ ...value, sourceImages: value.sourceImages.filter((item) => item !== path) });
  };

  const hasLook = Boolean(value && !isEmptyStyleDna(value));

  const lock = lockable && onOverrideChange ? (
    <label className="flex shrink-0 items-center gap-2 text-[11px] font-bold text-zinc-300">
      <input
        type="checkbox"
        checked={overrideEnabled}
        onChange={(event) => onOverrideChange(event.target.checked)}
        className="h-3.5 w-3.5 accent-[#b9f42e]"
      />
      Different look for this one
    </label>
  ) : null;

  // Locked to the project look: one line saying what that look is, and the way
  // out. The uploader stays hidden, because a reference dropped here while the
  // lock is on would be quietly ignored at generation time.
  if (lockable && !overrideEnabled) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#0b0c0b] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-zinc-500">{heading}</p>
            <p className="mt-0.5 truncate text-[11px] text-zinc-400">
              {projectSummary || "No project look set. This image follows the Visual Style setting alone."}
            </p>
          </div>
          {lock}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#0b0c0b] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-zinc-400">{heading}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
            {blurb} The first {MAX_STYLE_REFERENCE_IMAGES} are also sent to the image model as look references.
          </p>
        </div>
        {lock}
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy !== null}
          className="flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-zinc-200 hover:border-white/30 disabled:opacity-50"
        >
          {busy === "upload" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Add reference
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            upload(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>

      {pending.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {pending.map((path, index) => (
            <div key={path} className="group relative h-20 w-20 overflow-hidden rounded-lg border border-white/15 bg-black">
              {previews[path] ? (
                <Image src={previews[path]} alt={`Look reference ${index + 1}`} fill sizes="80px" className="object-cover" unoptimized />
              ) : (
                <div className="grid h-full place-items-center text-[10px] text-zinc-600">ref {index + 1}</div>
              )}
              <button
                type="button"
                onClick={() => removeReference(path)}
                className="absolute right-1 top-1 rounded bg-black/70 p-1 text-zinc-300 opacity-0 transition group-hover:opacity-100 hover:text-white"
                aria-label="Remove reference"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={2000}
            placeholder="Optional: what about these do you want copied?"
            className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-[#b9f42e]"
          />
          <button
            type="button"
            onClick={analyse}
            disabled={busy !== null}
            className="flex items-center justify-center gap-2 rounded-lg bg-[#b9f42e] px-4 py-2 text-xs font-bold text-black hover:bg-[#a8e024] disabled:opacity-50"
          >
            {busy === "analyse" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {hasLook ? "Re-read the look" : "Read the look"}
          </button>
        </div>
      )}

      {error && <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-300">{error}</p>}

      {hasLook && value && (
        <div className="mt-4 rounded-lg border border-[#b9f42e]/30 bg-[#b9f42e]/5 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="flex-1 text-xs font-bold text-[#b9f42e]">{value.summary || "Look extracted"}</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setExpanded(!expanded)} className="text-[11px] font-bold text-zinc-300 hover:text-white">
                {expanded ? "Hide details" : "Edit details"}
              </button>
              <button
                type="button"
                onClick={() => { onChange(null); setPending([]); setExpanded(false); }}
                className="rounded p-1 text-zinc-400 hover:text-red-400"
                aria-label="Clear the look"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <label className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-zinc-300">
            <input
              type="checkbox"
              checked={value.overrideProjectStyle}
              onChange={(event) => onChange({ ...value, overrideProjectStyle: event.target.checked })}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#b9f42e]"
            />
            <span>
              <span className="font-bold">The reference decides the medium too.</span>{" "}
              Off, the Visual Style below still decides photoreal vs anime vs 3D and the reference supplies palette, light, and texture.
              Turn it on when the reference <em>is</em> the medium — a painting, an illustration, a film stock.
            </span>
          </label>

          {expanded && (
            <div className="mt-4 space-y-4">
              {SECTIONS.map((section) => (
                <div key={section.title}>
                  <p className="mb-2 text-[10px] font-bold text-zinc-500">{section.title}</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {section.fields.map((field) => (
                      <label key={field.label} className="block">
                        <span className="mb-1 block text-[10px] font-bold text-zinc-500">
                          {field.label}
                          {field.hint && <span className="ml-1 font-normal normal-case text-zinc-600">({field.hint})</span>}
                        </span>
                        <input
                          value={field.get(value)}
                          onChange={(event) => onChange(field.set(value, event.target.value))}
                          className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-[#b9f42e]"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
