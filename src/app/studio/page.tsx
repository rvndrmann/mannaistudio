"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  FolderKanban,
  Image,
  LayoutGrid,
  Loader2,
  MessageSquarePlus,
  Plus,
  Sparkles,
  Upload,
  Users,
  WandSparkles,
} from "lucide-react";
import CreditBadge from "@/components/CreditBadge";

type Project = {
  id: string;
  name: string;
  description: string | null;
  cover_image?: string | null;
  default_style?: string;
  default_aspect?: string;
  gallery_images?: string[];
  created_at: string;
};
type ProductionMode = "legacy" | "quick_video" | "story_campaign" | "ai_show";
type ProjectType = "unspecified" | "ai_ad" | "brand_series" | "short_drama";
const templates = [
  "Story video",
  "Music video",
  "Product promo",
  "Digital human ad",
];
const categories = [
  "Featured",
  "Short drama",
  "Advertisement",
  "Music video",
  "Movie",
  "Animation",
];
const modes: Array<{
  id: Exclude<ProductionMode, "legacy">;
  projectType: Exclude<ProjectType, "unspecified">;
  title: string;
  description: string;
}> = [
  {
    id: "quick_video",
    projectType: "ai_ad",
    title: "Quick Video",
    description: "One ad, UGC video, promo, or social story.",
  },
  {
    id: "story_campaign",
    projectType: "brand_series",
    title: "Story Campaign",
    description: "Connected branded videos with recurring creative memory.",
  },
  {
    id: "ai_show",
    projectType: "short_drama",
    title: "AI Show",
    description: "Episodes, characters, story arcs, and continuity.",
  },
];

export default function StudioHome() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [productionModesEnabled, setProductionModesEnabled] = useState(false);
  const [mode, setMode] =
    useState<Exclude<ProductionMode, "legacy">>("quick_video");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const projectsScrollerRef = useRef<HTMLDivElement>(null);

  const focusComposer = () => {
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => composerRef.current?.focus(), 250);
  };

  const load = async () => {
    try {
      const res = await fetch("/api/studio/projects");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProjects(data);
    } catch {
      setError("Could not load projects. Please sign in again.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    const requestedMode = new URLSearchParams(window.location.search).get("mode");
    if (requestedMode && modes.some((item) => item.id === requestedMode)) {
      setMode(requestedMode as Exclude<ProductionMode, "legacy">);
    }
    fetch("/api/studio/features")
      .then((response) => (response.ok ? response.json() : null))
      .then((flags) =>
        setProductionModesEnabled(Boolean(flags?.production_modes_enabled)),
      )
      .catch(() => setProductionModesEnabled(false));
  }, []);
  const createProject = async (projectPrompt: string) => {
    const cleanPrompt = projectPrompt.trim() || "Untitled production";
    setCreating(true);
    setError("");
    try {
      const selectedMode = modes.find((item) => item.id === mode);
      const modeFields =
        productionModesEnabled && selectedMode
          ? {
              production_mode: selectedMode.id,
              project_type: selectedMode.projectType,
            }
          : {};
      const res = await fetch("/api/studio/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanPrompt.slice(0, 65),
          description: cleanPrompt,
          ...modeFields,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.href = `/studio/project/${data.project.id}?openSettings=1`;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create the project.",
      );
      setCreating(false);
    }
  };
  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!prompt.trim()) return;
    await createProject(prompt);
  };
  const scrollProjects = (direction: "left" | "right") => {
    projectsScrollerRef.current?.scrollBy({ left: direction === "right" ? 440 : -440, behavior: "smooth" });
  };
  return (
    <main className="min-h-screen bg-[#070807] text-[#f5f2e5]">
      <TopBar />
      <StudioRail />
      <section className="min-h-screen pl-[84px] pt-[132px] lg:pl-[156px]">
        <div className="mx-auto max-w-[1500px] px-5 pb-16 lg:px-10">
          <div className="mx-auto max-w-5xl">
            {productionModesEnabled && (
              <ProductionModePicker value={mode} onChange={setMode} />
            )}
            <form
              onSubmit={create}
              className="rounded-2xl border border-[#b9f42e]/65 bg-gradient-to-br from-[#242524] to-[#151615] p-1 shadow-[0_0_45px_rgba(230,236,107,.06)]"
            >
              <textarea
                ref={composerRef}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Describe the video you want to create..."
                className="h-32 w-full resize-none rounded-xl bg-transparent px-5 py-5 text-xl text-white outline-none placeholder:text-zinc-500"
              />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-3 pt-3">
                <div className="flex flex-wrap gap-2">
                  <Pill icon={<Plus />} label="Add" />
                  <Pill icon={<Upload />} label="Upload script" />
                  <Pill icon={<Image />} label="Upload storyboard" />
                  <Pill icon={<WandSparkles />} label="Cinematic" />
                </div>
                <button
                  disabled={creating || !prompt.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#b9f42e] px-5 py-3 font-semibold text-[#151609] transition hover:bg-[#ffffa8] disabled:opacity-40"
                >
                  {creating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}{" "}
                  Create
                </button>
              </div>
            </form>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              {templates.map((template) => (
                <button
                  key={template}
                  onClick={() =>
                    setPrompt(
                      `Create a ${template.toLowerCase()} with cinematic pacing, detailed shots, and a clear visual story.`,
                    )
                  }
                  className="rounded-xl border border-white/10 bg-[#222423] px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-[#b9f42e]/60 hover:text-[#b9f42e]"
                >
                  {template}
                </button>
              ))}
            </div>
          </div>
          {error && (
            <p className="mx-auto mt-6 max-w-5xl rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </p>
          )}
          <section className="mt-14">
            <div className="mb-5 flex items-center justify-between">
              <h1 className="text-3xl font-bold tracking-tight">
                Recent projects
              </h1>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => scrollProjects("left")} aria-label="Show previous projects" className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-zinc-300 transition hover:border-[#b9f42e] hover:text-[#b9f42e]"><ChevronLeft className="h-4 w-4" /></button>
                <button type="button" onClick={() => scrollProjects("right")} aria-label="Show more projects" className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-zinc-300 transition hover:border-[#b9f42e] hover:text-[#b9f42e]"><ChevronRight className="h-4 w-4" /></button>
                <Link href="#projects" className="ml-2 text-sm font-semibold tracking-[.18em] text-[#b9f42e]">VIEW ALL →</Link>
              </div>
            </div>
            {loading ? (
              <div className="flex h-52 items-center justify-center">
                <Loader2 className="animate-spin text-[#b9f42e]" />
              </div>
            ) : (
              <div ref={projectsScrollerRef} id="projects" className="flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-4 [scrollbar-width:thin]">
                <button
                  type="button"
                  onClick={() => createProject("Untitled production")}
                  disabled={creating}
                  className="flex h-56 w-[360px] shrink-0 snap-start flex-col items-center justify-center rounded-2xl border border-dashed border-[#b9f42e]/60 bg-[#202119] text-[#b9f42e] transition hover:bg-[#292b20] disabled:cursor-wait disabled:opacity-60"
                >
                  <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#b9f42e]/15">
                    {creating ? <Loader2 className="animate-spin" /> : <Plus />}
                  </span>
                  <span className="font-semibold">{creating ? "Creating..." : "New project"}</span>
                </button>
                {projects.map((project) => <ProjectGalleryCard key={project.id} project={project} />)}
              </div>
            )}
          </section>
          <section className="mt-12">
            <h2 className="text-3xl font-bold text-[#b9f42e]">Showcase</h2>
            <div className="mt-5 flex gap-2 overflow-x-auto">
              {categories.map((category, index) => (
                <button
                  key={category}
                  className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm ${index === 0 ? "border-[#b9f42e] bg-[#b9f42e]/10 text-[#b9f42e]" : "border-white/10 text-zinc-400"}`}
                >
                  {category}
                </button>
              ))}
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {["Film concept", "Product story", "Music visual"].map(
                (title, index) => (
                  <article
                    key={title}
                    className="overflow-hidden rounded-xl border border-white/10 bg-[#151615]"
                  >
                    <div
                      className={`aspect-video ${["bg-gradient-to-br from-[#6e4925] to-[#15120f]", "bg-gradient-to-br from-[#183c4a] to-[#08171d]", "bg-gradient-to-br from-[#40205c] to-[#160d21]"][index]}`}
                    />
                    <p className="p-4 font-semibold">{title}</p>
                  </article>
                ),
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function ProjectGalleryCard({ project }: { project: Project }) {
  const images = project.gallery_images || [];
  return (
    <Link href={`/studio/project/${project.id}`} className="group relative h-56 w-[360px] shrink-0 snap-start overflow-hidden rounded-2xl border border-white/10 bg-[#171817] shadow-[0_12px_36px_rgba(0,0,0,.24)] transition hover:-translate-y-1 hover:border-[#b9f42e]/55">
      {images.length ? (
        <div className={`absolute inset-0 grid h-full gap-px bg-black ${images.length === 1 ? "grid-cols-1" : images.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
          {images.slice(0, 3).map((image, index) => <img key={`${image}-${index}`} src={image} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]" />)}
        </div>
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-[#363b30] via-[#1b1e1a] to-[#0c0d0c] text-zinc-600"><Image className="h-12 w-12" /></div>
      )}
      <div className="absolute inset-x-0 bottom-0 min-h-24 bg-gradient-to-t from-black via-black/80 to-transparent p-4 pt-10">
        <p className="text-xs font-semibold text-[#d9ff84]">{project.default_style || "Cinematic"}</p>
        <p className="mt-1 truncate text-xl font-bold text-white">{project.name}</p>
        <p className="mt-1 text-xs text-zinc-400">Edited {new Date(project.created_at).toLocaleDateString()}</p>
      </div>
    </Link>
  );
}

function ProductionModePicker({
  value,
  onChange,
}: {
  value: Exclude<ProductionMode, "legacy">;
  onChange: (mode: Exclude<ProductionMode, "legacy">) => void;
}) {
  const icons = [Sparkles, MessageSquarePlus, Bot];
  return (
    <section className="mb-5" aria-labelledby="production-mode-heading">
      <div className="mb-3">
        <p className="text-xs font-bold tracking-[.2em] text-[#b9f42e]">
          START A PRODUCTION
        </p>
        <h1 id="production-mode-heading" className="mt-1 text-2xl font-bold">
          What are you creating?
        </h1>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {modes.map((item, index) => {
          const Icon = icons[index];
          const active = value === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(item.id)}
              className={`rounded-xl border p-4 text-left transition ${active ? "border-[#b9f42e] bg-[#b9f42e]/10" : "border-white/10 bg-[#171817] hover:border-white/25"}`}
            >
              <Icon className={`h-5 w-5 ${active ? "text-[#b9f42e]" : "text-zinc-500"}`} />
              <p className="mt-3 font-bold">{item.title}</p>
              <p className="mt-1 text-sm leading-5 text-zinc-400">
                {item.description}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function TopBar() {
  return (
    <>
      <div className="fixed inset-x-0 top-0 z-30 flex h-12 items-center justify-center border-b border-[#b9f42e]/20 bg-[#1b1c14] px-4 text-sm font-semibold">
        ✨ Top up & subscribe to get{" "}
        <span className="ml-1 text-[#b9f42e]">bonus points</span>
        <button className="ml-4 rounded-full bg-gradient-to-r from-orange-400 to-violet-600 px-4 py-1.5 text-white">
          Upgrade
        </button>
      </div>
      <header className="fixed inset-x-0 top-12 z-30 flex h-20 items-center justify-between border-b border-white/10 bg-[#090a09]/95 px-5 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-white/20 hover:text-white"
            title="Back to Home"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to Home</span>
          </Link>
          <span className="h-6 border-r border-white/10" />
          <div className="flex items-center gap-3 text-xl font-bold">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#b9f42e] text-black">
              <Clapperboard className="h-5 w-5" />
            </span>
            AI Director <span className="text-[#b9f42e]">Studio</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <CreditBadge />
          <Link
            href="/studio/team"
            title="Add and manage team members"
            className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <Users className="h-4 w-4" />
            Team
          </Link>
          <button className="rounded-xl bg-gradient-to-r from-orange-400 to-violet-600 px-4 py-2 text-sm font-semibold">
            Upgrade
          </button>
        </div>
      </header>
    </>
  );
}
function StudioRail() {
  const items = [
    [LayoutGrid, "Home"],
    [FolderKanban, "Projects"],
  ] as const;
  return (
    <aside className="fixed bottom-0 left-0 top-[132px] z-20 hidden w-[156px] border-r border-white/10 bg-[#0b0c0b] py-7 lg:block">
      <nav className="space-y-2 px-3">
        {items.map(([Icon, label], index) => (
          <button
            key={label}
            className={`flex w-full flex-col items-center gap-2 rounded-xl py-4 text-xs font-semibold ${index === 0 ? "bg-[#b9f42e]/10 text-[#b9f42e]" : "text-zinc-500 hover:bg-white/5 hover:text-white"}`}
          >
            <Icon className="h-6 w-6" />
            {label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
function Pill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#292b2a] px-3 py-2 text-sm font-semibold text-zinc-200 [&_svg]:h-4 [&_svg]:w-4"
    >
      {icon}
      {label}
    </button>
  );
}
