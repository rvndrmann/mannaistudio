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
  Sparkles,
  Users,
  X,
} from "lucide-react";
import CreditBadge from "@/components/CreditBadge";
import { useAuth } from "@/components/auth/auth-provider";

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
  const { user, signInWithGoogle } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // New Project modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");

  const projectsScrollerRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/studio/projects");
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setError("Please sign in to view your studio projects.");
          return;
        }
        throw new Error(data.error || "Could not load projects.");
      }
      setProjects(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load projects. Please sign in again.",
      );
    } fontally: {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      load();
    } else {
      setLoading(false);
    }
  }, [user]);

  const handleCreateProject = async (name: string, description?: string) => {
    if (!user) {
      signInWithGoogle();
      return;
    }

    const cleanName = name.trim() || "My AI Production";
    setCreating(true);
    setError("");

    try {
      const res = await fetch("/api/studio/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanName.slice(0, 65),
          description: (description || cleanName).trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create project");

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
      <TopBar onOpenCreate={() => setShowCreateModal(true)} />
      <StudioRail />
      <section className="min-h-screen pl-[84px] pt-[84px] lg:pl-[156px]">
        <div className="mx-auto max-w-[1500px] px-5 pb-16 lg:px-10">
          {!user && (
            <div className="mx-auto my-8 max-w-2xl rounded-2xl border border-[#b9f42e]/30 bg-[#b9f42e]/[0.05] p-8 text-center">
              <Sparkles className="mx-auto h-10 w-10 text-[#b9f42e] mb-3" />
              <h2 className="text-2xl font-black text-white">Sign In to Access Studio</h2>
              <p className="mt-2 text-sm text-zinc-400">
                Sign in with Google to create AI projects, generate videos, and chat with your AI Director Employee.
              </p>
              <button
                onClick={signInWithGoogle}
                className="mt-6 rounded-xl bg-[#b9f42e] px-8 py-3.5 text-sm font-black text-black hover:bg-[#a5de25] transition"
              >
                Sign In with Google
              </button>
            </div>
          )}

          {error && (
            <p className="mx-auto mt-6 max-w-5xl rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
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
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="ml-2 flex items-center gap-1.5 rounded-lg bg-[#b9f42e] px-3.5 py-1.5 text-xs font-black text-black hover:bg-[#a6de25] transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Project
                </button>
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
                  onClick={() => setShowCreateModal(true)}
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

      {/* CREATE NEW PROJECT MODAL DIALOG */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/15 bg-[#141615] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2 font-bold text-white">
                <Sparkles className="h-5 w-5 text-[#b9f42e]" />
                <span>Create New Production</span>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateProject(newProjectName, newProjectDesc);
              }}
              className="mt-5 space-y-4"
            >
              <div>
                <label htmlFor="proj-name" className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Project Title
                </label>
                <input
                  id="proj-name"
                  type="text"
                  required
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g. Cyberpunk Short Film, UGC Ad"
                  className="w-full rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-sm text-white outline-none focus:border-[#b9f42e]"
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="proj-desc" className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Creative Brief / Description (Optional)
                </label>
                <textarea
                  id="proj-desc"
                  rows={3}
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  placeholder="Briefly describe what you want the AI Director to produce..."
                  className="w-full resize-none rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-sm text-white outline-none focus:border-[#b9f42e]"
                />
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-bold text-zinc-300 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex items-center gap-2 rounded-xl bg-[#b9f42e] px-6 py-2.5 text-xs font-black text-black hover:bg-[#a6de25] transition disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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

function TopBar({ onOpenCreate }: { onOpenCreate: () => void }) {
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
          <button
            type="button"
            onClick={onOpenCreate}
            className="flex items-center gap-1.5 rounded-xl bg-[#b9f42e] px-4 py-2 text-xs font-black text-black hover:bg-[#a6de25] transition"
          >
            <Plus className="h-4 w-4" />
            <span>New Production</span>
          </button>
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
