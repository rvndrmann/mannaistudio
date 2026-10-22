"use client";

/**
 * The Timeline tab: OpenReel, the open-source editor, in an iframe.
 *
 * The editor is built from editor/openreel into public/editor and served from
 * this site, so the two windows share an origin and talk by postMessage (see
 * lib/studio/openreel-protocol). This side hands over the episode's shots with
 * their trims; the editor lays them out, or reopens the edit it saved for this
 * episode in the browser. An export from the editor comes back here as a file,
 * is uploaded to the project's storage and recorded as the episode's edited
 * cut.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, ExternalLink, Film, Loader2, Maximize2, Minimize2, RefreshCw, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { downloadSignedMedia, getSignedMediaUrl } from "@/lib/studio/signed-media";
import { finalCutStoragePath, readFinalCut } from "@/lib/studio/final-cut";
import { getShotTrimEnd, getShotTrimStart } from "@/lib/studio/shot-trim";
import {
  STUDIO_MESSAGE_SOURCE,
  isEditorToStudioMessage,
  type EditorClip,
  type StudioToEditorMessage,
} from "@/lib/studio/openreel-protocol";

const EDITOR_URL = "/editor/index.html?embed=studio";

type TimelineShot = {
  id: string;
  title: string;
  video_url: string | null;
  duration_seconds: number;
  aspect_ratio?: string | null;
  order_index: number;
  metadata?: Record<string, unknown> | null;
};

type Status =
  | { kind: "starting" }
  | { kind: "missing" }
  | { kind: "loading"; done: number; total: number; label: string }
  | { kind: "ready"; restored: boolean; storyboardChanged: boolean; failed: string[]; built: number }
  | { kind: "error"; message: string };

type Upload = { kind: "idle" } | { kind: "uploading"; filename: string } | { kind: "saved" } | { kind: "failed"; message: string };

/** The canvas the edit starts on; the export dialog can still change it. */
function canvasFor(aspect: string | null | undefined) {
  const match = (aspect || "").match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  const ratio = match ? Number(match[1]) / Number(match[2]) : 9 / 16;
  const even = (value: number) => Math.round(value / 2) * 2;
  return ratio >= 1 ? { width: even(1080 * ratio), height: 1080 } : { width: 1080, height: even(1080 / ratio) };
}

// Short and stable: tells the editor whether the shots it was built from are
// still the ones on the storyboard.
function fingerprint(clips: EditorClip[], paths: string[]) {
  const text = clips.map((clip, index) => `${clip.shotId}|${paths[index]}|${clip.trimStart}|${clip.trimEnd}`).join("\n");
  let hash = 5381;
  for (let index = 0; index < text.length; index++) hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  return `${clips.length}:${(hash >>> 0).toString(36)}`;
}

function formatSeconds(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}

function savedAgo(iso: string) {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";
  const minutes = Math.round((Date.now() - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(at).toLocaleDateString();
}

export function OpenReelTimeline({
  projectId,
  projectName,
  defaultAspect,
  episode,
  shots,
  save,
  reload,
}: {
  projectId: string;
  projectName: string;
  defaultAspect?: string | null;
  episode: { id: string; name: string; final_cut?: unknown };
  shots: TimelineShot[];
  save: (body: unknown) => Promise<unknown>;
  reload: () => Promise<void>;
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "starting" });
  const [upload, setUpload] = useState<Upload>({ kind: "idle" });
  const [aiLabel, setAiLabel] = useState<string | null>(null);
  // Expanded, the editor covers the window: beside the Director panel it is
  // narrow enough for OpenReel to fall back to its compact layout.
  const [expanded, setExpanded] = useState(false);
  const aiRef = useRef<{ connected: true; model: string; label: string } | null>(null);
  const finalCut = readFinalCut(episode.final_cut);
  // The handlers below are bound once per iframe; they read the latest props.
  const latest = useRef({ shots, projectName, defaultAspect, episode, save, reload });
  latest.current = { shots, projectName, defaultAspect, episode, save, reload };

  const send = useCallback((message: StudioToEditorMessage) => {
    frameRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, []);

  // The editor's AI runs on the user's own saved key through our proxy. The
  // editor sends the session token in place of an API key, so the token has to
  // follow every refresh.
  const sendAiConnection = useCallback(async (token?: string) => {
    let connection = aiRef.current;
    if (!token || !connection) {
      const response = await fetch("/api/studio/editor-ai", { cache: "no-store" }).catch(() => null);
      const data = response?.ok ? await response.json().catch(() => null) : null;
      if (!data?.connected) {
        aiRef.current = null;
        setAiLabel(null);
        send({ source: STUDIO_MESSAGE_SOURCE, type: "aiConnection", connection: { connected: false, reason: data?.reason || "Your API keys could not be checked." } });
        return;
      }
      connection = { connected: true, model: String(data.model), label: String(data.label) };
      aiRef.current = connection;
      setAiLabel(connection.label);
    }
    const accessToken = token || (await createClient().auth.getSession()).data.session?.access_token;
    if (!accessToken) return;
    send({
      source: STUDIO_MESSAGE_SOURCE,
      type: "aiConnection",
      connection: { connected: true, baseUrl: `${window.location.origin}/api/studio/editor-ai`, model: connection.model, token: accessToken, label: connection.label },
    });
  }, [send]);

  const loadEditor = useCallback(async (rebuild: boolean) => {
    const { shots: current, projectName: name, defaultAspect: aspect, episode: active } = latest.current;
    const withVideo = [...current].filter((shot) => shot.video_url).sort((a, b) => a.order_index - b.order_index);
    setStatus({ kind: "loading", done: 0, total: withVideo.length, label: "Preparing shots" });
    const urls = await Promise.all(withVideo.map((shot) => getSignedMediaUrl(shot.video_url!)));
    const clips: EditorClip[] = [];
    const paths: string[] = [];
    const unsigned: string[] = [];
    withVideo.forEach((shot, index) => {
      const url = urls[index];
      if (!url) {
        unsigned.push(shot.title);
        return;
      }
      clips.push({ shotId: shot.id, title: shot.title || `Shot ${index + 1}`, url, trimStart: getShotTrimStart(shot), trimEnd: getShotTrimEnd(shot) });
      paths.push(shot.video_url!);
    });
    const canvas = canvasFor(withVideo[0]?.aspect_ratio || aspect);
    send({
      source: STUDIO_MESSAGE_SOURCE,
      type: "load",
      editorProjectId: `studio-${projectId}-${active.id}`,
      name: `${name} — ${active.name}`,
      width: canvas.width,
      height: canvas.height,
      frameRate: 30,
      clips,
      storyboardKey: fingerprint(clips, paths),
      rebuild,
    });
    if (unsigned.length) console.warn("[timeline] Could not sign these shot videos:", unsigned);
  }, [projectId, send]);

  const storeExport = useCallback(async (exportId: string, file: Blob, filename: string, durationSeconds: number) => {
    const { episode: active, save: persist, reload: refresh } = latest.current;
    setUpload({ kind: "uploading", filename });
    try {
      const client = createClient();
      const userId = (await client.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Please sign in again before saving the cut.");
      const path = finalCutStoragePath({ userId, projectId, episodeId: active.id, filename });
      // The export arrives as a browser-storage file with no type of its own,
      // and supabase-js sends a Blob with the Blob's type, ignoring the
      // contentType option — so the type goes on the Blob. Re-wrapping a Blob
      // references its bytes; it does not copy them.
      const contentType = path.endsWith(".webm") ? "video/webm" : path.endsWith(".mov") ? "video/quicktime" : "video/mp4";
      const typed = file.type === contentType ? file : new Blob([file], { type: contentType });
      const { error } = await client.storage.from("creator-studio-media").upload(path, typed, { contentType, upsert: false });
      if (error) throw new Error(error.message);
      await persist({ action: "saveFinalCut", episodeId: active.id, path, filename, durationSeconds, sizeBytes: file.size });
      setUpload({ kind: "saved" });
      send({ source: STUDIO_MESSAGE_SOURCE, type: "exportSaved", exportId, ok: true });
      void refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "The cut could not be uploaded.";
      setUpload({ kind: "failed", message });
      send({ source: STUDIO_MESSAGE_SOURCE, type: "exportSaved", exportId, ok: false, message });
    }
  }, [projectId, send]);

  useEffect(() => {
    let cancelled = false;
    // The editor is a build artefact; a checkout that has not run
    // `npm run editor:build` would otherwise show Next's 404 inside the frame.
    fetch(EDITOR_URL, { method: "HEAD" })
      .then((response) => {
        if (!cancelled && !response.ok) setStatus({ kind: "missing" });
      })
      .catch(() => undefined);

    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== window.location.origin) return;
      const message = event.data;
      if (!isEditorToStudioMessage(message)) return;
      switch (message.type) {
        case "ready":
          void loadEditor(false);
          void sendAiConnection();
          break;
        case "progress":
          setStatus({ kind: "loading", done: message.done, total: message.total, label: message.label });
          break;
        case "loaded":
          setStatus((previous) => ({
            kind: "ready",
            restored: message.restored,
            storyboardChanged: message.storyboardChanged,
            failed: message.failed,
            built: previous.kind === "loading" ? previous.total - message.failed.length : 0,
          }));
          break;
        case "export":
          void storeExport(message.exportId, message.file, message.filename, message.durationSeconds);
          break;
        case "error":
          setStatus({ kind: "error", message: message.message });
          break;
      }
    };
    window.addEventListener("message", onMessage);
    const { data: auth } = createClient().auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" && session?.access_token && aiRef.current) void sendAiConnection(session.access_token);
    });
    return () => {
      cancelled = true;
      window.removeEventListener("message", onMessage);
      auth.subscription.unsubscribe();
    };
  }, [loadEditor, storeExport, sendAiConnection]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  const rebuild = () => {
    if (!window.confirm("Replace this edit with the current storyboard? Changes made in the editor will be lost.")) return;
    void loadEditor(true);
  };

  const watchCut = async () => {
    if (!finalCut) return;
    const url = await getSignedMediaUrl(finalCut.path);
    if (url) window.open(url, "_blank", "noopener");
  };

  const shotsWithVideo = shots.filter((shot) => shot.video_url).length;

  return (
    <div className={`flex flex-col bg-[#0c0d0c] text-white ${expanded ? "fixed inset-0 z-[80] h-[100dvh]" : "h-[calc(100dvh-74px)] min-h-[560px]"}`}>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white/10 bg-[#111211] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
            <Film className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-zinc-100">Timeline · {episode.name}</h2>
            <p className="truncate text-[11px] text-zinc-400">
              {status.kind === "loading"
                ? `${status.label} · ${Math.min(status.done, status.total)} of ${status.total} shots`
                : status.kind === "ready"
                  ? status.restored
                    ? "Reopened your saved edit · Export in the editor to save the cut here"
                    : `Built from ${status.built} shot${status.built === 1 ? "" : "s"} · Export in the editor to save the cut here`
                  : status.kind === "error"
                    ? status.message
                    : "Opening the editor…"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {aiLabel && (
            <span className="flex items-center gap-1.5 text-xs text-zinc-400" title="The editor's AI panel runs on your own saved key">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> AI on your {aiLabel} key
            </span>
          )}
          {upload.kind === "uploading" && (
            <span className="flex items-center gap-1.5 text-xs text-zinc-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Saving {upload.filename}…
            </span>
          )}
          {upload.kind === "failed" && (
            <span className="flex items-center gap-1.5 text-xs text-red-300" title={upload.message}>
              <AlertTriangle className="h-3.5 w-3.5" /> Cut not saved — downloaded instead
            </span>
          )}
          {finalCut && upload.kind !== "uploading" && (
            <span className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-300">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              Edited cut {formatSeconds(finalCut.duration_seconds)} · saved {savedAgo(finalCut.saved_at)}
              <button type="button" onClick={watchCut} className="ml-1 text-zinc-400 hover:text-white" title="Watch the cut">
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void downloadSignedMedia(finalCut.path, finalCut.filename).catch((error) => window.alert(error instanceof Error ? error.message : "Download failed."))}
                className="text-zinc-400 hover:text-white"
                title="Download the cut"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
          <button
            type="button"
            onClick={rebuild}
            disabled={status.kind === "loading" || status.kind === "starting" || status.kind === "missing"}
            className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/10 disabled:opacity-50"
            title="Lay the current storyboard out again, replacing this edit"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Rebuild from storyboard
          </button>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
            title={expanded ? "Back to the studio (Esc)" : "Give the editor the whole window"}
          >
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {expanded ? "Exit full view" : "Expand"}
          </button>
        </div>
      </header>

      {status.kind === "ready" && status.storyboardChanged && (
        <div className="flex items-center justify-between gap-3 border-b border-amber-400/20 bg-amber-400/10 px-4 py-2 text-xs text-amber-100">
          <span>The storyboard has changed since this edit was built. Rebuild to pick up the new shots and trims; your edits here would be replaced.</span>
          <button type="button" onClick={rebuild} className="shrink-0 font-semibold text-amber-200 hover:underline">Rebuild</button>
        </div>
      )}
      {status.kind === "ready" && status.failed.length > 0 && (
        <div className="border-b border-red-400/20 bg-red-400/10 px-4 py-2 text-xs text-red-100">
          Could not add: {status.failed.join(", ")}. Their videos could not be downloaded or decoded.
        </div>
      )}
      {status.kind === "ready" && !status.restored && shotsWithVideo === 0 && (
        <div className="border-b border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-zinc-300">
          No shot has a video yet. Generate videos in Storyboard, then rebuild — or import your own media in the editor.
        </div>
      )}

      {status.kind === "missing" ? (
        <div className="grid flex-1 place-items-center p-6 text-center text-sm text-zinc-400">
          <div>
            <p className="font-semibold text-zinc-200">The editor has not been built in this checkout.</p>
            <p className="mt-2">Run <code className="rounded bg-white/10 px-1.5 py-0.5 text-zinc-200">npm run editor:build</code> and reload.</p>
          </div>
        </div>
      ) : (
        <iframe
          ref={frameRef}
          src={EDITOR_URL}
          title="Timeline editor"
          className="min-h-0 w-full flex-1 border-0 bg-black"
          allow="clipboard-read; clipboard-write; fullscreen; autoplay"
        />
      )}
    </div>
  );
}
