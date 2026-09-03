"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Clapperboard,
  FolderKanban,
  Image,
  LayoutGrid,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Users, KeyRound, Wand2,} from "lucide-react";
import { BillingModeToggle } from "@/components/studio/BillingModeToggle";
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

export default function StudioHome() {
  const router = useRouter();
  const { user, signInWithGoogle } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");


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
    } finally {
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

  const handleCreateProject = async (name: string = "Untitled production") => {
    if (!user) {
      signInWithGoogle();
      return;
    }

    const cleanName = name.trim() || "Untitled production";
    setCreating(true);
    setError("");

    try {
      const res = await fetch("/api/studio/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanName.slice(0, 65),
          description: cleanName,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create project");

      router.push(`/studio/project/${data.project.id}?openSettings=1`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create the project.",
      );
      setCreating(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm("Are you sure you want to delete this project?")) return;
    try {
      const res = await fetch(`/api/studio/projects/${projectId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete project");
      }
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "Could not delete project");
    }
  };

  return (
    <main className="studio-dense min-h-screen bg-[#070807] text-[#f5f2e5]">
      <TopBar onOpenCreate={() => handleCreateProject("Untitled production")} creating={creating} />
      <StudioRail />
      <section className="min-h-screen pl-[84px] pt-[84px] lg:pl-[156px]">
        <div className="mx-auto max-w-[1500px] px-5 pb-16 lg:px-10">
          {!user && (
            <div className="mx-auto my-8 max-w-2xl rounded-2xl border border-[#b9f42e]/30 bg-[#b9f42e]/[0.05] p-8 text-center">
              <Sparkles className="mx-auto h-10 w-10 text-[#b9f42e] mb-3" />
              <h2 className="text-2xl font-semibold text-white">Sign In to Access Studio</h2>
              <p className="mt-2 text-sm text-zinc-400">
                Sign in with Google to create AI projects, generate videos, and chat with your AI Director Agent.
              </p>
              <button
                onClick={() => signInWithGoogle()}
                className="mt-6 rounded-xl bg-[#b9f42e] px-8 py-3.5 text-sm font-semibold text-black hover:bg-[#a5de25] transition"
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
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
                Recent projects
              </h1>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => handleCreateProject("Untitled production")}
                  className="touch-target flex items-center gap-1.5 rounded-md bg-[#b9f42e] px-3.5 py-2 text-xs font-semibold text-black transition duration-press ease-out hover:bg-[#a6de25] active:scale-[0.97] disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
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
                id="projects"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
                className="grid gap-5 pb-4"
              >
                <button
                  type="button"
                  onClick={() => handleCreateProject("Untitled production")}
                  disabled={creating}
                  className="flex h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-[#b9f42e]/60 bg-[#202119] text-[#b9f42e] transition hover:bg-[#292b20] disabled:cursor-wait disabled:opacity-60"
                >
                  <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#b9f42e]/15">
                    {creating ? <Loader2 className="animate-spin" /> : <Plus />}
                  </span>
                  <span className="font-semibold">
                    {creating ? "Creating..." : "New project"}
                  </span>
                </button>
                {projects.map((project) => (
                  <ProjectGalleryCard key={project.id} project={project} onDelete={handleDeleteProject} />
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function ProjectGalleryCard({ project, onDelete }: { project: Project; onDelete?: (id: string) => void }) {
  const images = project.gallery_images || [];
  return (
    <Link
      href={`/studio/project/${project.id}`}
      className="group relative h-56 overflow-hidden rounded-2xl border border-white/10 bg-[#171817] shadow-[0_12px_36px_rgba(0,0,0,.24)] transition hover:-translate-y-1 hover:border-[#b9f42e]/55"
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
        <span className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-full border border-[#b9f42e]/35 bg-black/70 px-2.5 py-1 text-[10px] font-bold text-[#b9f42e] backdrop-blur">
          <Users className="h-3 w-3" />
          {project.enterprise_status ? "Client work" : "Shared with you"}
        </span>
      )}
      {onDelete && (
        <button
          title="Delete Project"
          className="absolute right-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-zinc-400 opacity-0 backdrop-blur transition group-hover:opacity-100 hover:!bg-red-500/90 hover:!text-white"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(project.id);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </button>
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

function TopBar({ onOpenCreate, creating }: { onOpenCreate: () => void; creating: boolean }) {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-white/10 bg-[#090a09]/95 px-3 backdrop-blur sm:h-20 sm:gap-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link
            href="/"
            className="touch-target flex shrink-0 items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-white/20 hover:text-white sm:px-3.5"
            title="Back to Home"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to Home</span>
          </Link>
          <span className="hidden h-6 border-r border-white/10 sm:block" />
          <div className="flex min-w-0 items-center gap-2 truncate text-base font-semibold sm:gap-3 sm:text-xl">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#b9f42e] text-black sm:h-10 sm:w-10">
              <Clapperboard className="h-5 w-5" />
            </span>
            <span className="hidden truncate sm:inline">AI Director&nbsp;</span>
            <span className="text-[#b9f42e]">Studio</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            disabled={creating}
            onClick={onOpenCreate}
            className="touch-target flex items-center gap-1.5 rounded-md bg-[#b9f42e] px-3 py-2 text-xs font-semibold text-black transition duration-press ease-out hover:bg-[#a6de25] active:scale-[0.97] disabled:opacity-50 sm:px-4"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <span className="hidden sm:inline">New Production</span>
          </button>
          <CreditBadge />
          <Link
            href="/studio/create"
            title="Generate a single image or clip, with no production attached"
            className="touch-target hidden items-center gap-1.5 rounded-md border border-[#b9f42e]/35 px-3 py-2 text-sm font-medium text-[#b9f42e] transition hover:bg-[#b9f42e]/10 md:flex"
          >
            <Wand2 className="h-4 w-4" />
            Quick Create
          </Link>
          <Link
            href="/studio/brand"
            title="Your brand rooms: goals, knowledge base, asset library, and the agents that write your scripts"
            className="touch-target hidden items-center gap-1.5 rounded-md border border-white/10 px-3 py-2 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white md:flex"
          >
            <Building2 className="h-4 w-4" />
            Brands
          </Link>
          <Link
            href="/studio/team"
            title="Add and manage team members"
            className="touch-target hidden items-center gap-1.5 rounded-md border border-white/10 px-3 py-2 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white md:flex"
          >
            <Users className="h-4 w-4" />
            Team
          </Link>
          <BillingModeToggle />
          {/* Beside the credit badge, because this is the switch that decides
              whether generations spend credits at all. */}
          <Link
            href="/studio/integrations"
            title="Use your own provider API keys instead of studio credits"
            className="touch-target hidden items-center gap-1.5 rounded-md border border-white/10 px-3 py-2 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white md:flex"
          >
            <KeyRound className="h-4 w-4" />
            API keys
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
        {/* The one rail entry that leaves this page, so it is a link rather
            than a tab: the brand room is where a production's brief, assets,
            and script come from before a project exists. */}
        <Link
          href="/studio/brand"
          className="flex w-full flex-col items-center gap-2 rounded-xl py-4 text-xs font-semibold text-zinc-500 transition hover:bg-white/5 hover:text-white"
        >
          <Building2 className="h-6 w-6" />
          Brand Room
        </Link>
        {/* The way out of the project model entirely: one image or one clip,
            belonging to nothing. It sits in the rail beside the productions
            because someone who came here to make a single picture should not
            have to create a production to find the button. */}
        <Link
          href="/studio/create"
          className="flex w-full flex-col items-center gap-2 rounded-xl py-4 text-xs font-semibold text-zinc-500 transition hover:bg-white/5 hover:text-white"
        >
          <Wand2 className="h-6 w-6" />
          Quick Create
        </Link>
      </nav>
    </aside>
  );
}
