"use client";

import { useRef, useState } from "react";
import { Link2, Loader2, Trash2, Upload } from "lucide-react";
import BrandImage from "./BrandImage";
import type { BrandAssetView } from "./types";

const kinds = ["product", "character", "logo", "location", "reference"];

export default function BrandAssets({
  brandId,
  assets,
  canEdit,
  onChange,
}: {
  brandId: string;
  assets: BrandAssetView[];
  canEdit: boolean;
  onChange: (assets: BrandAssetView[]) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState("product");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState({ name: "", external_url: "", description: "" });

  const save = async (payload: Record<string, unknown>) => {
    const res = await fetch(`/api/studio/brands/${brandId}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not save the asset.");
    return data.asset as BrandAssetView;
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    try {
      const saved: BrandAssetView[] = [];
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`/api/studio/brands/${brandId}/uploads`, { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not upload the image.");
        saved.push(await save({ kind, name: file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 160), storage_path: data.path }));
      }
      onChange([...saved, ...assets]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not upload the image.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const addLink = async () => {
    if (!link.name.trim() || !link.external_url.trim()) {
      setError("A linked asset needs a name and a URL.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const asset = await save({ kind, ...link });
      onChange([asset, ...assets]);
      setLink({ name: "", external_url: "", description: "" });
      setLinkOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the asset.");
    } finally {
      setBusy(false);
    }
  };

  // Saved on blur rather than per keystroke: the name and description are the
  // words the Director reads for this asset, not a search box.
  const rename = async (asset: BrandAssetView, patch: Partial<BrandAssetView>) => {
    if (Object.entries(patch).every(([key, value]) => asset[key as keyof BrandAssetView] === value)) return;
    onChange(assets.map((item) => (item.id === asset.id ? { ...item, ...patch } : item)));
    await fetch(`/api/studio/brands/${brandId}/assets/${asset.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  };

  const remove = async (asset: BrandAssetView) => {
    onChange(assets.filter((item) => item.id !== asset.id));
    await fetch(`/api/studio/brands/${brandId}/assets/${asset.id}`, { method: "DELETE" });
  };

  return (
    <div className="space-y-3 p-4">
      <p className="text-[12px] leading-5 text-zinc-500">
        Product shots, character references, logos, locations. A script sent to production imports these as project assets, so every episode
        renders the same product and the same cast.
      </p>

      {canEdit && (
        <div className="space-y-2 rounded-xl border border-white/[0.06] bg-[#111211] p-3">
          <div className="flex flex-wrap gap-1.5">
            {kinds.map((option) => (
              <button
                key={option}
                onClick={() => setKind(option)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                  kind === option ? "bg-[#b9f42e] text-black" : "bg-[#1a1a1a] text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => fileInput.current?.click()}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#b9f42e] px-3 py-2 text-[12px] font-bold text-black disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload {kind}
            </button>
            <button
              onClick={() => setLinkOpen((open) => !open)}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2 text-[12px] font-bold text-zinc-300 hover:border-[#b9f42e]/40"
            >
              <Link2 className="h-4 w-4" /> Link
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => upload(event.target.files)}
          />
          {linkOpen && (
            <div className="space-y-2 border-t border-white/[0.06] pt-2">
              <input
                value={link.name}
                onChange={(event) => setLink({ ...link, name: event.target.value })}
                placeholder="Asset name"
                className="w-full rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2 text-[12px] outline-none placeholder:text-zinc-600"
              />
              <input
                value={link.external_url}
                onChange={(event) => setLink({ ...link, external_url: event.target.value })}
                placeholder="https://image-url"
                className="w-full rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2 text-[12px] outline-none placeholder:text-zinc-600"
              />
              <button
                onClick={addLink}
                disabled={busy}
                className="rounded-lg bg-[#b9f42e] px-3 py-2 text-[12px] font-bold text-black disabled:opacity-60"
              >
                Save link
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-[12px] font-semibold text-red-400">{error}</p>}

      {assets.length === 0 ? (
        <p className="text-[12px] text-zinc-600">No assets yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {assets.map((asset) => (
            <div key={asset.id} className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#111211]">
              <BrandImage
                path={asset.storage_path}
                url={asset.external_url}
                alt={asset.name}
                className="aspect-square w-full object-cover"
              />
              <div className="p-2">
                <div className="flex items-center gap-1">
                  <span className="rounded-full bg-[#1a1a1a] px-1.5 py-0.5 text-[9px] font-bold uppercase text-zinc-500">{asset.kind}</span>
                  {canEdit && (
                    <button onClick={() => remove(asset)} className="ml-auto rounded p-0.5 text-zinc-600 hover:text-red-400">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <input
                  key={`${asset.id}-name`}
                  defaultValue={asset.name}
                  disabled={!canEdit}
                  onBlur={(event) => rename(asset, { name: event.target.value })}
                  className="mt-1 w-full bg-transparent text-[12px] font-bold text-zinc-200 outline-none disabled:opacity-70"
                />
                <input
                  key={`${asset.id}-description`}
                  defaultValue={asset.description}
                  disabled={!canEdit}
                  onBlur={(event) => rename(asset, { description: event.target.value })}
                  placeholder="What it is"
                  className="mt-0.5 w-full bg-transparent text-[11px] text-zinc-500 outline-none placeholder:text-zinc-700 disabled:opacity-70"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
