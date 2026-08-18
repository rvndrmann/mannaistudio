"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Building2, Globe, Loader2, Plus, Sparkles } from "lucide-react";
import CreditBadge from "@/components/CreditBadge";
import { useAuth } from "@/components/auth/auth-provider";

type BrandSummary = {
  id: string;
  name: string;
  kind: string;
  tagline: string;
  website_url: string;
  industry: string;
  updated_at: string;
};

const kindLabels: Record<string, string> = {
  brand: "Brand",
  creator: "Creator",
  show: "AI show",
};

export default function BrandHome() {
  const router = useRouter();
  const { user, signInWithGoogle } = useAuth();
  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("brand");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/studio/brands");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load your brands.");
        setBrands(data.brands || []);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not load your brands.");
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const createBrand = async () => {
    if (!user) {
      signInWithGoogle();
      return;
    }
    const cleanName = name.trim();
    if (!cleanName) {
      setError("Give the brand a name first.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/studio/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cleanName, kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create the brand.");
      router.push(`/studio/brand/${data.brand.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the brand.");
      setCreating(false);
    }
  };

  if (!user && !loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#070807] px-6 text-center text-white">
        <div>
          <h1 className="text-2xl font-bold">Sign in to open your brand room</h1>
          <p className="mt-2 max-w-md text-sm text-zinc-400">
            Your brand, its knowledge base, and its asset library live here so every campaign and every show is produced from the same source.
          </p>
          <button
            onClick={() => signInWithGoogle()}
            className="mt-6 rounded-lg bg-[#b9f42e] px-5 py-2.5 text-sm font-bold text-black"
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070807] text-white">
      <header className="flex min-h-12 items-center gap-3 border-b border-white/[0.06] bg-[#0a0a0a] px-3">
        <Link href="/studio" className="flex items-center gap-1.5 text-[12px] font-bold text-zinc-300 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Studio
        </Link>
        <span className="ml-1 flex items-center gap-1.5 text-[12px] font-bold text-[#b9f42e]">
          <Building2 className="h-4 w-4" />
          Brand rooms
        </span>
        <div className="ml-auto">
          <CreditBadge />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Brand rooms</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          One place per brand, creator, or show. Your goals, voice, product and character art, and website all live here — the strategist and
          script writer read them, and every production you start inherits them.
        </p>

        <section className="mt-6 rounded-2xl border border-white/10 bg-[#0f100f] p-4 sm:p-5">
          <p className="text-xs font-bold tracking-[.2em] text-[#b9f42e]">NEW BRAND ROOM</p>
          <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") createBrand();
              }}
              placeholder="Aurora Coffee, or the name of your show"
              className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2.5 text-sm outline-none placeholder:text-zinc-600 focus:border-[#b9f42e]/40"
            />
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value)}
              className="rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2.5 text-sm outline-none focus:border-[#b9f42e]/40"
            >
              <option value="brand">Brand</option>
              <option value="creator">Creator</option>
              <option value="show">AI show</option>
            </select>
            <button
              onClick={createBrand}
              disabled={creating}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-[#b9f42e] px-4 py-2.5 text-[13px] font-bold text-black transition duration-press ease-out active:scale-[0.97] disabled:opacity-60"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create
            </button>
          </div>
          {error && <p className="mt-3 text-[12px] font-semibold text-red-400">{error}</p>}
        </section>

        {loading ? (
          <div className="mt-10 grid place-items-center text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : brands.length === 0 ? (
          <p className="mt-10 text-sm text-zinc-500">No brand rooms yet. Create one above to start briefing your agents.</p>
        ) : (
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {brands.map((brand) => (
              <Link
                key={brand.id}
                href={`/studio/brand/${brand.id}`}
                className="group rounded-2xl border border-white/10 bg-[#0f100f] p-4 transition hover:border-[#b9f42e]/40"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-white/[0.08] bg-[#141414] px-2 py-0.5 text-[10px] font-bold text-zinc-400">
                    {kindLabels[brand.kind] || brand.kind}
                  </span>
                  {brand.industry && <span className="truncate text-[11px] text-zinc-500">{brand.industry}</span>}
                </div>
                <p className="mt-3 text-base font-bold tracking-tight group-hover:text-[#b9f42e]">{brand.name}</p>
                {brand.tagline && <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-zinc-400">{brand.tagline}</p>}
                {brand.website_url && (
                  <p className="mt-3 flex items-center gap-1.5 truncate text-[11px] text-zinc-500">
                    <Globe className="h-3.5 w-3.5 shrink-0" />
                    {brand.website_url.replace(/^https?:\/\//, "")}
                  </p>
                )}
                <p className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-[#b9f42e] opacity-0 transition group-hover:opacity-100">
                  <Sparkles className="h-3.5 w-3.5" />
                  Open brand room
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
