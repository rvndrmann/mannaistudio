"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Globe, Loader2, MessageCircle, RefreshCw, Save } from "lucide-react";
import type { BrandView } from "./types";

type Field = { key: keyof BrandView; label: string; hint: string; rows?: number };

// Ordered the way a brief is actually written: who you are, what you want,
// who it is for, how it should sound, and what is off limits.
const fields: Field[] = [
  { key: "description", label: "What you do", hint: "The business in a few plain sentences.", rows: 3 },
  { key: "goals", label: "Goals", hint: "What this quarter's content has to achieve.", rows: 3 },
  { key: "offer", label: "Product or offer", hint: "What is being sold, and the offer attached to it.", rows: 2 },
  { key: "audience", label: "Audience", hint: "Who you are talking to, in their own terms.", rows: 3 },
  { key: "positioning", label: "Positioning", hint: "Why someone picks you over the alternative.", rows: 2 },
  { key: "brand_voice", label: "Voice", hint: "How the brand sounds. Give an example line if you have one.", rows: 3 },
  { key: "visual_style", label: "Visual style", hint: "Lighting, palette, texture, references. This drives every generated frame.", rows: 3 },
  { key: "do_rules", label: "Always", hint: "Things every piece must do.", rows: 2 },
  { key: "dont_rules", label: "Never", hint: "Things no piece may do.", rows: 2 },
];

export default function BrandProfileForm({
  brand,
  canEdit,
  onSaved,
}: {
  brand: BrandView;
  canEdit: boolean;
  onSaved: (brand: BrandView) => void;
}) {
  const [draft, setDraft] = useState(brand);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [reading, setReading] = useState(false);

  useEffect(() => setDraft(brand), [brand]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(brand);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/studio/brands/${brand.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          kind: draft.kind,
          tagline: draft.tagline,
          website_url: draft.website_url,
          industry: draft.industry,
          description: draft.description,
          brand_voice: draft.brand_voice,
          audience: draft.audience,
          positioning: draft.positioning,
          goals: draft.goals,
          offer: draft.offer,
          visual_style: draft.visual_style,
          color_palette: draft.color_palette,
          do_rules: draft.do_rules,
          dont_rules: draft.dont_rules,
          forbidden_claims: draft.forbidden_claims,
          default_aspect: draft.default_aspect,
          widget_enabled: draft.widget_enabled,
          widget_greeting: draft.widget_greeting,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the brand.");
      onSaved(data.brand);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the brand.");
    } finally {
      setSaving(false);
    }
  };

  const readWebsite = async () => {
    setReading(true);
    setError("");
    try {
      const res = await fetch(`/api/studio/brands/${brand.id}/website`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not read the website.");
      onSaved(data.brand);
      if (data.error) setError(data.error);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read the website.");
    } finally {
      setReading(false);
    }
  };

  const set = (key: keyof BrandView, value: unknown) => setDraft((current) => ({ ...current, [key]: value } as BrandView));

  return (
    <div className="space-y-4 p-4">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="block">
          <span className="text-[11px] font-bold tracking-[.14em] text-zinc-500">NAME</span>
          <input
            value={draft.name}
            disabled={!canEdit}
            onChange={(event) => set("name", event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2 text-sm outline-none focus:border-[#b9f42e]/40 disabled:opacity-60"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-bold tracking-[.14em] text-zinc-500">TYPE</span>
          <select
            value={draft.kind}
            disabled={!canEdit}
            onChange={(event) => set("kind", event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2 text-sm outline-none focus:border-[#b9f42e]/40 disabled:opacity-60"
          >
            <option value="brand">Brand</option>
            <option value="creator">Creator</option>
            <option value="show">AI show</option>
          </select>
        </label>
      </div>

      <div>
        <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-[.14em] text-zinc-500">
          <Globe className="h-3.5 w-3.5" /> WEBSITE
        </span>
        <input
          value={draft.website_url}
          disabled={!canEdit}
          onChange={(event) => set("website_url", event.target.value)}
          placeholder="https://yourbrand.com"
          className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-[#b9f42e]/40 disabled:opacity-60"
        />

        {/* The agents read the site itself, so the panel has to show what they
            saw and when — a snapshot from three weeks ago is not today's shop. */}
        {brand.website_url && (
          <div className="mt-2 rounded-lg border border-white/[0.06] bg-[#111211] p-2.5">
            {brand.website_error ? (
              <p className="flex items-start gap-1.5 text-[11px] leading-5 text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {brand.website_error}
              </p>
            ) : brand.website_fetched_at ? (
              <p className="flex items-start gap-1.5 text-[11px] leading-5 text-zinc-400">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#b9f42e]" />
                Your agents have read {brand.website_pages?.length || 0} page
                {(brand.website_pages?.length || 0) === 1 ? "" : "s"} of this site, on{" "}
                {new Date(brand.website_fetched_at).toLocaleDateString()}.
              </p>
            ) : (
              <p className="text-[11px] leading-5 text-zinc-500">
                Not read yet. Your agents read the site on their own before the first answer, or you can do it now.
              </p>
            )}

            {(brand.website_pages || []).length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {brand.website_pages.map((page) => (
                  <li key={page.url} className="truncate text-[11px] text-zinc-600">
                    {page.title || page.url}
                  </li>
                ))}
              </ul>
            )}

            {canEdit && (
              <button
                onClick={readWebsite}
                disabled={reading || dirty}
                title={dirty ? "Save the brand first, then read the site" : "Read the site again"}
                className="mt-2 flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#141414] px-2.5 py-1.5 text-[11px] font-bold text-zinc-200 hover:border-[#b9f42e]/40 disabled:opacity-50"
              >
                {reading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {reading ? "Reading the site…" : brand.website_fetched_at ? "Read it again" : "Read the site now"}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="block">
          <span className="text-[11px] font-bold tracking-[.14em] text-zinc-500">INDUSTRY</span>
          <input
            value={draft.industry}
            disabled={!canEdit}
            onChange={(event) => set("industry", event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2 text-sm outline-none focus:border-[#b9f42e]/40 disabled:opacity-60"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-bold tracking-[.14em] text-zinc-500">DEFAULT ASPECT</span>
          <select
            value={draft.default_aspect}
            disabled={!canEdit}
            onChange={(event) => set("default_aspect", event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2 text-sm outline-none focus:border-[#b9f42e]/40 disabled:opacity-60"
          >
            <option value="9:16">9:16 — vertical</option>
            <option value="16:9">16:9 — landscape</option>
            <option value="1:1">1:1 — square</option>
            <option value="4:5">4:5 — feed</option>
          </select>
        </label>
      </div>

      <label className="block">
        <span className="text-[11px] font-bold tracking-[.14em] text-zinc-500">TAGLINE</span>
        <input
          value={draft.tagline}
          disabled={!canEdit}
          onChange={(event) => set("tagline", event.target.value)}
          className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2 text-sm outline-none focus:border-[#b9f42e]/40 disabled:opacity-60"
        />
      </label>

      {fields.map((field) => (
        <label key={String(field.key)} className="block">
          <span className="text-[11px] font-bold tracking-[.14em] text-zinc-500">{field.label.toUpperCase()}</span>
          <textarea
            value={String(draft[field.key] || "")}
            disabled={!canEdit}
            rows={field.rows || 2}
            onChange={(event) => set(field.key, event.target.value)}
            placeholder={field.hint}
            className="mt-1.5 w-full resize-y rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2 text-sm leading-6 outline-none placeholder:text-zinc-600 focus:border-[#b9f42e]/40 disabled:opacity-60"
          />
        </label>
      ))}

      <label className="block">
        <span className="text-[11px] font-bold tracking-[.14em] text-zinc-500">FORBIDDEN CLAIMS</span>
        <textarea
          value={(draft.forbidden_claims || []).join("\n")}
          disabled={!canEdit}
          rows={3}
          onChange={(event) => set("forbidden_claims", event.target.value.split("\n").map((line) => line.trim()).filter(Boolean))}
          placeholder={"One per line.\nNo agent will write these, in any wording."}
          className="mt-1.5 w-full resize-y rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2 text-sm leading-6 outline-none placeholder:text-zinc-600 focus:border-[#b9f42e]/40 disabled:opacity-60"
        />
      </label>

      <label className="block">
        <span className="text-[11px] font-bold tracking-[.14em] text-zinc-500">COLOUR PALETTE</span>
        <input
          value={(draft.color_palette || []).join(", ")}
          disabled={!canEdit}
          onChange={(event) => set("color_palette", event.target.value.split(",").map((value) => value.trim()).filter(Boolean))}
          placeholder="#2b1a12, #e9d5b8"
          className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-[#b9f42e]/40 disabled:opacity-60"
        />
      </label>

      <div className="rounded-xl border border-white/[0.06] bg-[#111211] p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-[.14em] text-zinc-500">
          <MessageCircle className="h-3.5 w-3.5" /> WEBSITE CHAT
        </p>
        <label className="mt-2 flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={draft.widget_enabled}
            disabled={!canEdit}
            onChange={(event) => set("widget_enabled", event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[#b9f42e]"
          />
          <span className="text-[12px] leading-5 text-zinc-300">
            Answer visitors on the home page, using this brand&apos;s material, and keep whoever leaves their details.
          </span>
        </label>
        <textarea
          value={draft.widget_greeting}
          disabled={!canEdit || !draft.widget_enabled}
          rows={2}
          onChange={(event) => set("widget_greeting", event.target.value)}
          placeholder={`Hi — I work with ${draft.name}. What are you trying to make?`}
          className="mt-2 w-full resize-y rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2 text-[12px] leading-6 outline-none placeholder:text-zinc-600 focus:border-[#b9f42e]/40 disabled:opacity-50"
        />
        {/* Only one widget can own the site, so say which one wins rather than
            letting a second brand silently take it over. */}
        <p className="mt-1.5 text-[11px] leading-5 text-zinc-600">
          One brand at a time answers on the site. If more than one is switched on, the most recently saved wins. Captures appear under
          Leads.
        </p>
      </div>

      {error && <p className="text-[12px] font-semibold text-red-400">{error}</p>}

      {canEdit && (
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#b9f42e] px-4 py-2.5 text-[13px] font-bold text-black transition duration-press ease-out active:scale-[0.98] disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saved && !dirty ? "Saved" : "Save brand"}
        </button>
      )}
    </div>
  );
}
