"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  FolderKanban,
  Image,
  LayoutGrid,
  Loader2,
  Plus,
  Users,
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
  shared?: boolean;
  ownerName?: string | null;
  ownerEmail?: string | null;
  enterprise_status?: string | null;
};

const categories = [
  "Featured",
  "Short drama",
  "Advertisement",
  "Music video",
  "Movie",
  "Animation",
];

export default function StudioHome() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const projectsScrollerRef = useRef<HTMLDivElement>(null);

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
  }, []);

  const createProject = async (projectPrompt: string) => {
    const cleanPrompt = projectPrompt.trim() || "Untitled production";
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/studio/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanPrompt.slice(0, 65),
          description: cleanPrompt,
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

  const scrollProjects = (direction: "left" | "right") => {
    projectsScrollerRef.current?.scrollBy({
      left: direction === "right" ? 440 : -440,
      behavior: "smooth",
    });
  };

  return (
    <main className="min-h-screen bg-[#070807] text-[#f5f2e5]">
      <TopBar />
      <StudioRail />
      <section className="min-h-screen pl-[84px] pt-[84px] lg:pl-[156px]">
        <div className="mx-auto max-w-[1500px] px-5 pb-16 lg:px-10">
          {error && (
            <p className="mx-auto mt-6 max-w-5xl rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </p>
          )}

          <section className="mt-6">
            <div className="mb-5 flex items-center justify-between">
              <h1 className="text-3xl font-bold tracking-tight">
                Recent projects
              </h1>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => scrollProjects("left")}
                  aria-label="Show previous projects"
                  className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-zinc-300 transition hover:border-[#b9f42e] hover:text-[#b9f42e]"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollProjects("right")}
                  aria-label="Show more projects"
                  className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-zinc-300 transition hover:border-[#b9f42e] hover:text-[#b9f42e]"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <Link
                  href="#projects"
                  className="ml-2 text-sm font-semibold tracking-[.18em] text-[#b9f42e]"
                >
                  VIEW ALL →
                </Link>
              </div>
            </div>

            {loading ? (
              <div className="flex h-52 items-center justify-center">
                <Loader2 className="animate-spin text-[#b9f42e]" />
              </div>
            ) : (
              <div
                ref={projectsScrollerRef}
                id="projects"
                className="flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-4 [scrollbar-width:thin]"
              >
                <button
                  type="button"
                  onClick={() => createProject("Untitled production")}
                  disabled={creating}
                  className="flex h-56 w-[360px] shrink-0 snap-start flex-col items-center justify-center rounded-2xl border border-dashed border-[#b9f42e]/60 bg-[#202119] text-[#b9f42e] transition hover:bg-[#292b20] disabled:cursor-wait disabled:opacity-60"
                >
                  <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#b9f42e]/15">
                    {creating ? <Loader2 className="animate-spin" /> : <Plus />}
                  </span>
                  <span className="font-semibold">
                    {creating ? "Creating..." : "New project"}
                  </span>
                </button>
                {projects.map((project) => (
                  <ProjectGalleryCard key={project.id} project={project} />
                ))}
              </div>
            )}
          </section>

          <section className="mt-12">
            <h2 className="text-3xl font-bold text-[#b9f42e]">Showcase</h2>
            <div className="mt-5 flex gap-2 overflow-x-auto">
              {categories.map((category, index) => (
                <button
                  key={category}
                  className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm ${
                    index === 0
                      ? "border-[#b9f42e] bg-[#b9f42e]/10 text-[#b9f42e]"
                      : "border-white/10 text-zinc-400"
                  }`}
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
                      className={`aspect-video ${
                        [
                          "bg-gradient-to-br from-[#6e4925] to-[#15120f]",
                          "bg-gradient-to-br from-[#183c4a] to-[#08171d]",
                          "bg-gradient-to-br from-[#40205c] to-[#160d21]",
                        ][index]
                      }`}
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
    <Link
      href={`/studio/project/${project.id}`}
      className="group relative h-56 w-[360px] shrink-0 snap-start overflow-hidden rounded-2xl border border-white/10 bg-[#171817] shadow-[0_12px_36px_rgba(0,0,0,.24)] transition hover:-translate-y-1 hover:border-[#b9f42e]/55"
    >
      {images.length ? (
        <div
          className={`absolute inset-0 grid h-full gap-px bg-black ${
            images.length === 1
              ? "grid-cols-1"
              : images.length === 2
                ? "grid-cols-2"
                : "grid-cols-3"
          }`}
        >
          {images.slice(0, 3).map((image, index) => (
            <img
              key={`${image}-${index}`}
              src={image}
              alt=""
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
            />
          ))}
        </div>
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-[#363b30] via-[#1b1e1a] to-[#0c0d0c] text-zinc-600">
          <Image className="h-12 w-12" />
        </div>
      )}
      {project.shared && (
        <span className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full border border-[#b9f42e]/35 bg-black/70 px-2.5 py-1 text-[10px] font-bold text-[#b9f42e] backdrop-blur">
          <Users className="h-3 w-3" />
          {project.enterprise_status ? "Client work" : "Shared with you"}
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 min-h-24 bg-gradient-to-t from-black via-black/80 to-transparent p-4 pt-10">
        <p className="text-xs font-semibold text-[#d9ff84]">
          {project.default_style || "Cinematic"}
        </p>
        <p className="mt-1 truncate text-xl font-bold text-white">
          {project.name}
        </p>
        {project.shared && (project.ownerName || project.ownerEmail) ? (
          <p className="mt-1 truncate text-xs text-[#d9ff84]/80">
            {project.enterprise_status ? "Producing for" : "Owned by"}{" "}
            {project.ownerName || project.ownerEmail}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-zinc-400">
          Edited {new Date(project.created_at).toLocaleDateString()}
        </p>
      </div>
    </Link>
  );
}

function TopBar() {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-30 flex h-20 items-center justify-between border-b border-white/10 bg-[#090a09]/95 px-5 backdrop-blur">
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
    <aside className="fixed bottom-0 left-0 top-[84px] z-20 hidden w-[156px] border-r border-white/10 bg-[#0b0c0b] py-7 lg:block">
      <nav className="space-y-2 px-3">
        {items.map(([Icon, label], index) => (
          <button
            key={label}
            className={`flex w-full flex-col items-center gap-2 rounded-xl py-4 text-xs font-semibold ${
              index === 0
                ? "bg-[#b9f42e]/10 text-[#b9f42e]"
                : "text-zinc-500 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon className="h-6 w-6" />
            {label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
