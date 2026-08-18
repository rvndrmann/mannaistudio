"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, LockOpen, RefreshCw, Search, Zap } from "lucide-react";

type AdminProject = {
  project_id: string;
  project_name: string;
  owner_id: string;
  owner_name: string;
  owner_email: string;
  created_at: string;
  updated_at: string;
  episodes: number;
  shots: number;
  entities: number;
  jobs: number;
  credits_used: number;
  credits_refunded: number;
  last_activity: string | null;
  admin_has_access: boolean;
};

/**
 * Every production, whose it is, and what it has cost.
 *
 * Opening one grants the admin a normal membership row rather than a hidden
 * bypass, so the owner can see who has access and it can be dropped again.
 */
export default function AdminProjects() {
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/projects", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load projects.");
      setProjects(data.projects || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load projects.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const setAccess = async (project: AdminProject, action: "open" | "close") => {
    setBusyId(project.project_id);
    try {
      const res = await fetch("/api/admin/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.project_id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not change access.");
      setProjects((current) =>
        current.map((item) => (item.project_id === project.project_id ? { ...item, admin_has_access: action === "open" } : item)),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change access.");
    } finally {
      setBusyId("");
    }
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((project) =>
      [project.project_name, project.owner_name, project.owner_email].some((value) => (value || "").toLowerCase().includes(needle)),
    );
  }, [projects, query]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (sum, project) => ({
          credits: sum.credits + (project.credits_used || 0),
          refunded: sum.refunded + (project.credits_refunded || 0),
          jobs: sum.jobs + (project.jobs || 0),
        }),
        { credits: 0, refunded: 0, jobs: 0 },
      ),
    [filtered],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by project, name, or email"
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-primary/40"
          />
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm font-medium text-white/70 hover:bg-white/5"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs font-medium text-white/40">Productions</p>
          <p className="mt-1 text-2xl font-bold text-white">{filtered.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs font-medium text-white/40">Credits spent</p>
          <p className="mt-1 text-2xl font-bold text-primary">{totals.credits.toLocaleString()}</p>
          {totals.refunded > 0 && <p className="mt-0.5 text-[11px] text-white/40">{totals.refunded.toLocaleString()} refunded</p>}
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs font-medium text-white/40">Generations</p>
          <p className="mt-1 text-2xl font-bold text-white">{totals.jobs.toLocaleString()}</p>
        </div>
      </div>

      {error && <p className="text-sm font-semibold text-red-400">{error}</p>}

      {loading ? (
        <div className="grid place-items-center py-12 text-white/30">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-white/30">No productions found.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="bg-white/[0.03] text-xs uppercase tracking-wider text-white/40">
              <tr>
                <th className="px-4 py-3 font-medium">Production</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium text-right">Credits</th>
                <th className="px-4 py-3 font-medium text-right">Shots</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {filtered.map((project) => (
                <tr key={project.project_id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-white">{project.project_name}</p>
                    <p className="text-xs text-white/30">
                      {project.episodes} episode{project.episodes === 1 ? "" : "s"} · {project.entities} assets · {project.jobs} generations
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-white/80">{project.owner_name || "Unnamed"}</p>
                    <p className="text-xs text-white/30">{project.owner_email}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1 font-bold text-primary">
                      <Zap className="h-3.5 w-3.5" />
                      {(project.credits_used || 0).toLocaleString()}
                    </span>
                    {project.credits_refunded > 0 && (
                      <p className="text-[11px] text-white/30">−{project.credits_refunded.toLocaleString()} refunded</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-white/60">{project.shots}</td>
                  <td className="px-4 py-3 text-white/50">
                    {new Date(project.created_at).toLocaleDateString()}
                    {project.last_activity && (
                      <p className="text-[11px] text-white/25">last run {new Date(project.last_activity).toLocaleDateString()}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {project.admin_has_access ? (
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/studio/project/${project.project_id}`}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-black"
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> Open
                        </Link>
                        <button
                          onClick={() => setAccess(project, "close")}
                          disabled={busyId === project.project_id}
                          className="text-xs font-medium text-white/40 hover:text-white/70"
                        >
                          Drop access
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAccess(project, "open")}
                        disabled={busyId === project.project_id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/70 hover:border-primary/40 hover:text-white disabled:opacity-50"
                      >
                        {busyId === project.project_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LockOpen className="h-3.5 w-3.5" />}
                        Grant me access
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
