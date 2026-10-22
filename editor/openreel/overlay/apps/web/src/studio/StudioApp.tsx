/**
 * OpenReel as the AI Director studio's Timeline.
 *
 * Mounted instead of OpenReel's own App when the page is opened with
 * `?embed=studio` (see main.tsx). There is no welcome screen and no recovery
 * dialog: the studio decides what is open. It sends one "load" message with
 * the episode's shots; the editor either reopens the edit it saved for that
 * episode or lays the shots out on a fresh video track, trimmed as the
 * storyboard has them.
 *
 * Exports leave through the same pipeline OpenReel already uses for a browser
 * download. installStudioExportHandoff swaps the final download for a message
 * to the studio, which uploads the cut and answers when it is stored.
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { createEmptyProject } from "../stores/project/project-helpers";
import { useProjectStore } from "../stores/project-store";
import { autoSaveManager } from "../services/auto-save";
import { ToastContainer } from "../components/Toast";
import { toast } from "../stores/notification-store";
import { useAIConnectionStore } from "../stores/ai-connection-store";
import {
  EDITOR_MESSAGE_SOURCE,
  isStudioToEditorMessage,
  type EditorClip,
  type EditorToStudioMessage,
  type StudioToEditorMessage,
} from "./openreel-protocol";

const EditorInterface = lazy(() =>
  import("../components/editor/EditorInterface").then((m) => ({ default: m.EditorInterface })),
);

type LoadMessage = Extract<StudioToEditorMessage, { type: "load" }>;
type Status =
  | { kind: "waiting" }
  | { kind: "loading"; done: number; total: number; label: string }
  | { kind: "ready" }
  | { kind: "error"; message: string };

const DOWNLOAD_CONCURRENCY = 3;
// An upload of a long cut on a slow connection can take minutes; past this the
// temporary export file is released and the studio is told nothing came back.
const EXPORT_ACK_TIMEOUT_MS = 30 * 60 * 1000;
const VIDEO_EXPORT = /\.(mp4|webm|mov)$/i;

function post(message: EditorToStudioMessage) {
  window.parent.postMessage(message, window.location.origin);
}

function storyboardKeyStorage(editorProjectId: string) {
  return `openreel-studio:storyboard:${editorProjectId}`;
}

function readStoredKey(editorProjectId: string): string | null {
  try {
    return window.localStorage.getItem(storyboardKeyStorage(editorProjectId));
  } catch {
    return null;
  }
}

function storeKey(editorProjectId: string, key: string) {
  try {
    window.localStorage.setItem(storyboardKeyStorage(editorProjectId), key);
  } catch {
    // Without storage the editor still works; it just cannot tell the studio
    // that the storyboard moved on since the edit was built.
  }
}

async function downloadClip(clip: EditorClip, index: number): Promise<File> {
  const response = await fetch(clip.url);
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const blob = await response.blob();
  const type = blob.type && blob.type !== "application/octet-stream" ? blob.type : "video/mp4";
  const extension = type.includes("webm") ? "webm" : type.includes("quicktime") ? "mov" : "mp4";
  const safeTitle = clip.title.replace(/[^a-zA-Z0-9._ -]/g, "").trim().slice(0, 80) || "Shot";
  return new File([blob], `${String(index + 1).padStart(2, "0")} ${safeTitle}.${extension}`, { type });
}

/**
 * Starts every download up front, at most a few at a time, while the caller
 * imports them strictly in storyboard order.
 */
function downloadInOrder(clips: EditorClip[]): Promise<File>[] {
  const results: Promise<File>[] = [];
  const starters: Array<() => void> = [];
  let running = 0;
  const next = () => {
    while (running < DOWNLOAD_CONCURRENCY && starters.length) {
      running += 1;
      starters.shift()!();
    }
  };
  clips.forEach((clip, index) => {
    results.push(
      new Promise<File>((resolve, reject) => {
        starters.push(() => {
          downloadClip(clip, index).then(resolve, reject).finally(() => {
            running -= 1;
            next();
          });
        });
      }),
    );
  });
  // Rejections are read in order by the caller; until then they must not
  // surface as unhandled.
  results.forEach((result) => result.catch(() => undefined));
  next();
  return results;
}

async function buildFromStoryboard(
  message: LoadMessage,
  onProgress: (done: number, label: string) => void,
): Promise<string[]> {
  const failed: string[] = [];
  const base = createEmptyProject(message.name, {
    width: message.width,
    height: message.height,
    frameRate: message.frameRate,
  });
  useProjectStore.getState().loadProject({ ...base, id: message.editorProjectId });

  const trackId = `track-storyboard-${crypto.randomUUID()}`;
  const trackResult = await useProjectStore.getState().addTrack("video", undefined, { name: "Storyboard", trackId });
  if (!trackResult.success) throw new Error(trackResult.error?.message || "Could not create the video track");

  const downloads = downloadInOrder(message.clips);
  let cursor = 0;
  for (let index = 0; index < message.clips.length; index++) {
    const clip = message.clips[index];
    onProgress(index, `Adding ${clip.title}`);
    try {
      const file = await downloads[index];
      const knownIds = new Set(useProjectStore.getState().project.mediaLibrary.items.map((item) => item.id));
      const imported = await useProjectStore.getState().importMedia(file);
      if (!imported.success) throw new Error(imported.error?.message || "Import failed");
      const media = useProjectStore.getState().project.mediaLibrary.items.find((item) => !knownIds.has(item.id));
      if (!media || media.type !== "video") throw new Error("Not a video");

      const sourceDuration = media.metadata.duration > 0 ? media.metadata.duration : clip.trimEnd;
      const inPoint = Math.min(Math.max(0, clip.trimStart), Math.max(0, sourceDuration - 0.1));
      const outPoint = Math.max(inPoint + 0.1, Math.min(clip.trimEnd > 0 ? clip.trimEnd : sourceDuration, sourceDuration));

      const added = await useProjectStore.getState().addClip(trackId, media.id, cursor);
      if (!added.success) throw new Error(added.error?.message || "Could not place the clip");
      const placed = useProjectStore
        .getState()
        .project.timeline.tracks.find((track) => track.id === trackId)
        ?.clips.find((item) => item.mediaId === media.id);
      if (!placed) throw new Error("Could not place the clip");
      if (inPoint > 0 || outPoint < placed.outPoint) {
        await useProjectStore.getState().trimClip(placed.id, inPoint, outPoint);
      }
      cursor += outPoint - inPoint;
    } catch (error) {
      console.warn(`[studio] Skipped ${clip.title}:`, error);
      failed.push(clip.title);
    }
  }
  onProgress(message.clips.length, "Saving");
  await useProjectStore.getState().forceSave().catch((error) => {
    console.warn("[studio] The new edit could not be saved in this browser yet:", error);
  });
  return failed;
}

async function openEdit(message: LoadMessage, onProgress: (done: number, label: string) => void) {
  await autoSaveManager.initialize();
  if (message.rebuild) {
    await autoSaveManager.clearProjectSaves(message.editorProjectId);
  } else {
    const saved = await autoSaveManager.getMostRecentSave(message.editorProjectId);
    if (saved && (await useProjectStore.getState().recoverFromAutoSave(saved.id))) {
      const storedKey = readStoredKey(message.editorProjectId);
      return { restored: true, storyboardChanged: storedKey !== null && storedKey !== message.storyboardKey, failed: [] };
    }
  }
  const failed = await buildFromStoryboard(message, onProgress);
  storeKey(message.editorProjectId, message.storyboardKey);
  return { restored: false, storyboardChanged: false, failed };
}

const pendingExports = new Map<string, (saved: boolean) => void>();

/**
 * Hands a finished video export to the studio as well as downloading it.
 *
 * Called by OpenReel's export runner (patched by scripts/build-openreel.mjs)
 * with the file it was about to download. Returns null for anything that is
 * not a video export, which then downloads as usual — an audio-only WAV is not
 * a cut of the episode. The promise settles once the studio has answered, so
 * the runner keeps the temporary file alive until then.
 */
function installStudioExportHandoff() {
  (window as { __openreelStudioExport?: (file: Blob, filename: string) => Promise<boolean> | null }).__openreelStudioExport = (
    file,
    filename,
  ) => {
    if (!VIDEO_EXPORT.test(filename)) return null;
    const exportId = crypto.randomUUID();
    const durationSeconds = useProjectStore.getState().getTimelineDuration();
    toast.info("Saving the cut to your project", "Uploading the exported video…");
    return new Promise<boolean>((resolve) => {
      const timeout = window.setTimeout(() => {
        pendingExports.delete(exportId);
        toast.error("The studio did not confirm the upload", "The video is in your downloads; export again to save it to the project.");
        resolve(false);
      }, EXPORT_ACK_TIMEOUT_MS);
      pendingExports.set(exportId, (saved) => {
        window.clearTimeout(timeout);
        resolve(saved);
      });
      post({ source: EDITOR_MESSAGE_SOURCE, type: "export", exportId, file, filename, durationSeconds });
    });
  };
}

type AiConnection = Extract<StudioToEditorMessage, { type: "aiConnection" }>["connection"];

/**
 * Points the AI Editor at the studio's proxy, which runs it on the user's own
 * saved key. Without a usable key the panel keeps its own "Connect a model"
 * state, and the reason is shown once per session.
 */
function applyAiConnection(connection: AiConnection) {
  if (connection.connected) {
    useAIConnectionStore.getState().configure({
      provider: "compatible",
      baseUrl: connection.baseUrl,
      model: useAIConnectionStore.getState().baseUrl === connection.baseUrl ? useAIConnectionStore.getState().model : connection.model,
      apiKey: connection.token,
    });
    return;
  }
  try {
    if (window.sessionStorage.getItem("openreel-studio:ai-reason")) return;
    window.sessionStorage.setItem("openreel-studio:ai-reason", "1");
  } catch {
    // Shown every time when storage is unavailable.
  }
  toast.info("AI Editor is not connected", connection.reason);
}

let activeLoad: Promise<void> | null = null;

export function StudioApp() {
  const [status, setStatus] = useState<Status>({ kind: "waiting" });

  useEffect(() => {
    installStudioExportHandoff();

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== window.location.origin) return;
      const message = event.data;
      if (!isStudioToEditorMessage(message)) return;

      if (message.type === "aiConnection") {
        applyAiConnection(message.connection);
        return;
      }

      if (message.type === "exportSaved") {
        const settle = pendingExports.get(message.exportId);
        pendingExports.delete(message.exportId);
        settle?.(message.ok);
        if (message.ok) toast.success("Cut saved to your project", "A copy is in your downloads.");
        else toast.error("The cut could not be saved to your project", `${message.message || "Upload failed."} The video is in your downloads.`);
        return;
      }

      if (message.type === "load") {
        if (activeLoad) return;
        const total = message.clips.length;
        setStatus({ kind: "loading", done: 0, total, label: "Opening the edit" });
        const progress = (done: number, label: string) => {
          setStatus({ kind: "loading", done, total, label });
          post({ source: EDITOR_MESSAGE_SOURCE, type: "progress", done, total, label });
        };
        activeLoad = openEdit(message, progress)
          .then((result) => {
            setStatus({ kind: "ready" });
            post({ source: EDITOR_MESSAGE_SOURCE, type: "loaded", ...result });
          })
          .catch((error: unknown) => {
            const text = error instanceof Error ? error.message : "The editor could not open this episode.";
            setStatus({ kind: "error", message: text });
            post({ source: EDITOR_MESSAGE_SOURCE, type: "error", message: text });
          })
          .finally(() => {
            activeLoad = null;
          });
      }
    };

    window.addEventListener("message", onMessage);
    post({ source: EDITOR_MESSAGE_SOURCE, type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div className="h-screen h-[100dvh] w-screen bg-background text-text-primary overflow-hidden">
      {status.kind === "ready" ? (
        <Suspense fallback={<Centered label="Loading editor…" />}>
          <EditorInterface />
        </Suspense>
      ) : status.kind === "error" ? (
        <Centered label={status.message} />
      ) : status.kind === "loading" ? (
        <Centered
          label={status.label}
          detail={status.total ? `${Math.min(status.done, status.total)} of ${status.total} shots` : undefined}
          progress={status.total ? status.done / status.total : undefined}
        />
      ) : (
        <Centered label="Waiting for the studio…" />
      )}
      <ToastContainer />
    </div>
  );
}

function Centered({ label, detail, progress }: { label: string; detail?: string; progress?: number }) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-3 text-sm text-text-secondary">
      {progress === undefined ? (
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      ) : (
        <div className="h-1.5 w-64 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      <span>{label}</span>
      {detail && <span className="text-xs opacity-70">{detail}</span>}
    </div>
  );
}
