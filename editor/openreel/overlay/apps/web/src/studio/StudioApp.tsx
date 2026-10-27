/**
 * OpenReel as the AI Director studio's Timeline.
 *
 * Mounted instead of OpenReel's own App when the page is opened with
 * `?embed=studio` (see main.tsx). There is no welcome screen and no recovery
 * dialog: the studio decides what is open. It sends one "load" message with
 * the episode's shots; the editor reopens the edit it saved for that episode
 * (or starts an empty one) and brings its Storyboard track up to date.
 *
 * The Storyboard track follows the storyboard: a shot that gets a video is
 * placed after the shot before it, and a new take replaces the old one where
 * it stood, rippling the clips after it. Which media item holds which shot is
 * remembered per edit (see placementStorage), so everything else on the
 * timeline — the user's own media, other tracks, captions — is left alone.
 *
 * OpenReel's own App starts autosave; here every change is saved shortly
 * after it happens, so imported media and edits survive a reload.
 *
 * Exports leave through the same pipeline OpenReel already uses for a browser
 * download. installStudioExportHandoff swaps the final download for a message
 * to the studio, which uploads the cut and answers when it is stored.
 */
import { lazy, Suspense, useEffect, useState } from "react";
import type { Track } from "@openreel/core";
import { createEmptyProject } from "../stores/project/project-helpers";
import { useProjectStore } from "../stores/project-store";
import { autoSaveManager } from "../services/auto-save";
import { ToastContainer } from "../components/Toast";
import { toast } from "../stores/notification-store";
import { useAIConnectionStore } from "../stores/ai-connection-store";
import { setStudioTranscription } from "./studio-captions";
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
const SAVE_DEBOUNCE_MS = 1200;
const STORYBOARD_TRACK = "Storyboard";
const EPSILON = 1e-3;

function post(message: EditorToStudioMessage) {
  window.parent.postMessage(message, window.location.origin);
}

// --- What is placed where ----------------------------------------------------

/** One shot on the Storyboard track: the media item holding it, and what it was made from. */
type Placement = { mediaId: string; videoKey: string; trimStart: number; trimEnd: number };
type Placements = { trackId: string | null; shots: Record<string, Placement> };

function placementStorage(editorProjectId: string) {
  return `openreel-studio:placements:${editorProjectId}`;
}

function readPlacements(editorProjectId: string): Placements | null {
  try {
    const raw = window.localStorage.getItem(placementStorage(editorProjectId));
    const parsed = raw ? (JSON.parse(raw) as Placements) : null;
    return parsed && typeof parsed === "object" && parsed.shots ? parsed : null;
  } catch {
    return null;
  }
}

function storePlacements(editorProjectId: string, placements: Placements) {
  try {
    window.localStorage.setItem(placementStorage(editorProjectId), JSON.stringify(placements));
  } catch {
    // Without storage the next sync re-derives placements from media names.
  }
}

function forgetPlacements(editorProjectId: string) {
  try {
    window.localStorage.removeItem(placementStorage(editorProjectId));
  } catch {
    // Nothing stored.
  }
}

function safeTitle(title: string) {
  return title.replace(/[^a-zA-Z0-9._ -]/g, "").trim().slice(0, 80) || "Shot";
}

/** The storyboard fingerprint the previous bridge stored when it built an edit. */
function legacyStoryboardKey(editorProjectId: string) {
  try {
    return window.localStorage.getItem(`openreel-studio:storyboard:${editorProjectId}`);
  } catch {
    return null;
  }
}

/**
 * Edits built before placements were recorded: their storyboard media are
 * named "NN Title.mp4", so shots are matched to them by title. Unless the
 * storyboard is provably the one they were built from, their takes are
 * unknown and each matched shot is refreshed once.
 */
function placementsFromMediaNames(track: Track, clips: EditorClip[], unchanged: boolean): Placements {
  const media = useProjectStore.getState().project.mediaLibrary.items;
  const onTrack = [...track.clips].sort((a, b) => a.startTime - b.startTime);
  const used = new Set<string>();
  const shots: Record<string, Placement> = {};
  for (const clip of clips) {
    const match = onTrack.find((placed) => {
      if (used.has(placed.mediaId)) return false;
      const name = media.find((item) => item.id === placed.mediaId)?.name || "";
      return name.replace(/^\d+\s+/, "").replace(/\.(mp4|webm|mov)$/i, "") === safeTitle(clip.title);
    });
    if (!match) continue;
    used.add(match.mediaId);
    shots[clip.shotId] = { mediaId: match.mediaId, videoKey: unchanged ? clip.videoKey : "", trimStart: clip.trimStart, trimEnd: clip.trimEnd };
  }
  return { trackId: track.id, shots };
}

// --- Downloads -----------------------------------------------------------------

async function downloadClip(clip: EditorClip, index: number): Promise<File> {
  const response = await fetch(clip.url);
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const blob = await response.blob();
  const type = blob.type && blob.type !== "application/octet-stream" ? blob.type : "video/mp4";
  const extension = type.includes("webm") ? "webm" : type.includes("quicktime") ? "mov" : "mp4";
  return new File([blob], `${String(index + 1).padStart(2, "0")} ${safeTitle(clip.title)}.${extension}`, { type });
}

/**
 * Starts every download up front, at most a few at a time, while the caller
 * imports them strictly in storyboard order.
 */
function downloadInOrder(jobs: Array<{ clip: EditorClip; index: number }>): Promise<File>[] {
  const results: Promise<File>[] = [];
  const starters: Array<() => void> = [];
  let running = 0;
  const next = () => {
    while (running < DOWNLOAD_CONCURRENCY && starters.length) {
      running += 1;
      starters.shift()!();
    }
  };
  jobs.forEach(({ clip, index }) => {
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

// --- Timeline edits ------------------------------------------------------------

function trackById(trackId: string | null) {
  return trackId ? useProjectStore.getState().project.timeline.tracks.find((track) => track.id === trackId) : undefined;
}

function clipOfMedia(trackId: string, mediaId: string) {
  return trackById(trackId)?.clips.find((clip) => clip.mediaId === mediaId);
}

/** Moves every clip on the track that starts at or after `from` by `delta` seconds. */
async function ripple(trackId: string, from: number, delta: number, exceptClipId?: string) {
  if (Math.abs(delta) < EPSILON) return;
  const later = (trackById(trackId)?.clips || [])
    .filter((clip) => clip.id !== exceptClipId && clip.startTime >= from - EPSILON)
    .sort((a, b) => (delta > 0 ? b.startTime - a.startTime : a.startTime - b.startTime));
  for (const clip of later) {
    await useProjectStore.getState().moveClip(clip.id, Math.max(0, clip.startTime + delta), trackId);
  }
}

async function importVideo(file: File) {
  const knownIds = new Set(useProjectStore.getState().project.mediaLibrary.items.map((item) => item.id));
  const imported = await useProjectStore.getState().importMedia(file);
  if (!imported.success) throw new Error(imported.error?.message || "Import failed");
  const media = useProjectStore.getState().project.mediaLibrary.items.find((item) => !knownIds.has(item.id));
  if (!media || media.type !== "video") throw new Error("Not a video");
  return media;
}

/** Places media at `at` on the track, trimmed to the shot. Returns the placed length. */
async function placeAt(trackId: string, mediaId: string, at: number, clip: EditorClip) {
  const media = useProjectStore.getState().getMediaItem(mediaId);
  const sourceDuration = media && media.metadata.duration > 0 ? media.metadata.duration : clip.trimEnd;
  const inPoint = Math.min(Math.max(0, clip.trimStart), Math.max(0, sourceDuration - 0.1));
  const outPoint = Math.max(inPoint + 0.1, Math.min(clip.trimEnd > 0 ? clip.trimEnd : sourceDuration, sourceDuration));
  const length = outPoint - inPoint;

  // Room first, so the clip never lands on top of the one after it.
  await ripple(trackId, at, length);
  const added = await useProjectStore.getState().addClip(trackId, mediaId, at);
  if (!added.success) throw new Error(added.error?.message || "Could not place the clip");
  const placed = clipOfMedia(trackId, mediaId);
  if (!placed) throw new Error("Could not place the clip");
  if (inPoint > 0 || outPoint < placed.outPoint) {
    await useProjectStore.getState().trimClip(placed.id, inPoint, outPoint);
  }
  return length;
}

/** Removes a clip and closes the gap it leaves. */
async function liftClip(trackId: string, clipId: string) {
  const clip = trackById(trackId)?.clips.find((item) => item.id === clipId);
  if (!clip) return 0;
  const end = clip.startTime + clip.duration;
  await useProjectStore.getState().removeClip(clipId);
  await ripple(trackId, end, -clip.duration);
  return clip.startTime;
}

/** Drops a media item once nothing on the timeline uses it any more. */
async function dropIfUnused(mediaId: string) {
  const inUse = useProjectStore.getState().project.timeline.tracks.some((track) => track.clips.some((clip) => clip.mediaId === mediaId));
  if (!inUse && useProjectStore.getState().getMediaItem(mediaId)) await useProjectStore.getState().deleteMedia(mediaId);
}

async function ensureStoryboardTrack(placements: Placements, position?: number) {
  const existing = trackById(placements.trackId)
    || useProjectStore.getState().project.timeline.tracks.find((track) => track.type === "video" && track.name === STORYBOARD_TRACK);
  if (existing) return existing.id;
  const trackId = `track-storyboard-${crypto.randomUUID()}`;
  const result = await useProjectStore.getState().addTrack("video", position, { name: STORYBOARD_TRACK, trackId });
  if (!result.success) throw new Error(result.error?.message || "Could not create the video track");
  return trackId;
}

type SyncResult = { added: string[]; replaced: string[]; failed: string[] };

/**
 * Brings the Storyboard track in line with the shots: places shots that are
 * not on it yet, swaps in new takes and new storyboard trims. A shot the user
 * deleted from the timeline stays deleted until it gets a new take.
 */
async function syncStoryboard(
  editorProjectId: string,
  clips: EditorClip[],
  storyboardKey: string,
  onProgress?: (done: number, label: string) => void,
  trackPosition?: number,
): Promise<SyncResult> {
  const result: SyncResult = { added: [], replaced: [], failed: [] };
  let placements = readPlacements(editorProjectId);
  if (!placements) {
    const legacy = useProjectStore.getState().project.timeline.tracks.find((track) => track.type === "video" && track.name === STORYBOARD_TRACK);
    placements = legacy
      ? placementsFromMediaNames(legacy, clips, legacyStoryboardKey(editorProjectId) === storyboardKey)
      : { trackId: null, shots: {} };
  }
  const trackId = await ensureStoryboardTrack(placements, trackPosition);
  placements.trackId = trackId;

  type Job = { clip: EditorClip; index: number; kind: "add" | "take" | "trim" };
  const jobs: Job[] = [];
  clips.forEach((clip, index) => {
    const placement = placements!.shots[clip.shotId];
    const onTimeline = placement ? clipOfMedia(trackId, placement.mediaId) : undefined;
    if (!placement) jobs.push({ clip, index, kind: "add" });
    else if (placement.videoKey !== clip.videoKey) jobs.push({ clip, index, kind: onTimeline ? "take" : "add" });
    else if (onTimeline && (Math.abs(placement.trimStart - clip.trimStart) > EPSILON || Math.abs(placement.trimEnd - clip.trimEnd) > EPSILON)) {
      jobs.push({ clip, index, kind: "trim" });
    }
  });
  if (!jobs.length) {
    storePlacements(editorProjectId, placements);
    return result;
  }

  const downloads = downloadInOrder(jobs.filter((job) => job.kind !== "trim"));
  let downloadIndex = 0;
  for (let step = 0; step < jobs.length; step++) {
    const { clip, index, kind } = jobs[step];
    onProgress?.(step, kind === "add" ? `Adding ${clip.title}` : `Updating ${clip.title}`);
    try {
      const previous = placements.shots[clip.shotId];
      let mediaId = previous?.mediaId;
      if (kind !== "trim") {
        const file = await downloads[downloadIndex++];
        mediaId = (await importVideo(file)).id;
      }

      let at: number;
      const current = previous ? clipOfMedia(trackId, previous.mediaId) : undefined;
      if (kind !== "add" && current) {
        at = await liftClip(trackId, current.id);
      } else {
        // After the nearest earlier shot that is on the track; first otherwise.
        at = 0;
        for (let earlier = index - 1; earlier >= 0; earlier--) {
          const before = placements.shots[clips[earlier].shotId];
          const placed = before ? clipOfMedia(trackId, before.mediaId) : undefined;
          if (placed) {
            at = placed.startTime + placed.duration;
            break;
          }
        }
      }
      await placeAt(trackId, mediaId!, at, clip);
      if (kind === "take" && previous && previous.mediaId !== mediaId) await dropIfUnused(previous.mediaId);

      placements.shots[clip.shotId] = { mediaId: mediaId!, videoKey: clip.videoKey, trimStart: clip.trimStart, trimEnd: clip.trimEnd };
      storePlacements(editorProjectId, placements);
      (kind === "add" ? result.added : result.replaced).push(clip.title);
    } catch (error) {
      console.warn(`[studio] Skipped ${clip.title}:`, error);
      result.failed.push(clip.title);
    }
  }
  onProgress?.(jobs.length, "Saving");
  await useProjectStore.getState().forceSave().catch((error) => {
    console.warn("[studio] The edit could not be saved in this browser yet:", error);
  });
  return result;
}

/**
 * Removes the Storyboard track and the media only it used; everything else
 * stays. Returns where the track stood, so the new one takes its place.
 */
async function clearStoryboard(editorProjectId: string) {
  const placements = readPlacements(editorProjectId);
  const isStoryboard = (track: Track) => track.id === placements?.trackId || (track.type === "video" && track.name === STORYBOARD_TRACK);
  const allTracks = useProjectStore.getState().project.timeline.tracks;
  const tracks = allTracks.filter(isStoryboard);
  const position = allTracks.findIndex(isStoryboard);
  const mediaIds = new Set([
    ...Object.values(placements?.shots || {}).map((placement) => placement.mediaId),
    ...tracks.flatMap((track) => track.clips.map((clip) => clip.mediaId)),
  ]);
  for (const track of tracks) await useProjectStore.getState().removeTrack(track.id);
  for (const mediaId of mediaIds) await dropIfUnused(mediaId);
  forgetPlacements(editorProjectId);
  return position >= 0 ? position : undefined;
}

// --- Opening an episode --------------------------------------------------------

let savingFor: string | null = null;
let saveTimer: number | null = null;

/** Saves the open edit shortly after every change, and when the tab is hidden. */
function keepSaving(editorProjectId: string) {
  if (savingFor !== null) {
    savingFor = editorProjectId;
    return;
  }
  savingFor = editorProjectId;
  const save = () => {
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = null;
    if (useProjectStore.getState().project.id !== savingFor) return;
    void useProjectStore.getState().forceSave().catch((error) => {
      console.warn("[studio] The edit could not be saved in this browser:", error);
    });
  };
  useProjectStore.subscribe(
    (state) => state.project,
    () => {
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(save, SAVE_DEBOUNCE_MS);
    },
  );
  window.addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") save();
  });
}

async function openEdit(message: LoadMessage, onProgress: (done: number, label: string) => void) {
  await autoSaveManager.initialize();
  const saved = await autoSaveManager.getMostRecentSave(message.editorProjectId);
  const restored = Boolean(saved && (await useProjectStore.getState().recoverFromAutoSave(saved.id)));
  let trackPosition: number | undefined;
  if (!restored) {
    forgetPlacements(message.editorProjectId);
    const base = createEmptyProject(message.name, {
      width: message.width,
      height: message.height,
      frameRate: message.frameRate,
    });
    useProjectStore.getState().loadProject({ ...base, id: message.editorProjectId });
  } else if (message.rebuild) {
    trackPosition = await clearStoryboard(message.editorProjectId);
  }
  const { failed } = await syncStoryboard(message.editorProjectId, message.clips, message.storyboardKey, onProgress, trackPosition);
  keepSaving(message.editorProjectId);
  return { restored: restored && !message.rebuild, storyboardChanged: false, failed };
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
    setStudioTranscription(connection.transcription ? { baseUrl: connection.baseUrl, token: connection.token } : null);
    return;
  }
  setStudioTranscription(null);
  try {
    if (window.sessionStorage.getItem("openreel-studio:ai-reason")) return;
    window.sessionStorage.setItem("openreel-studio:ai-reason", "1");
  } catch {
    // Shown every time when storage is unavailable.
  }
  toast.info("AI Editor is not connected", connection.reason);
}

// Loads and syncs run one at a time, in the order they arrive.
let queue: Promise<unknown> = Promise.resolve();
let openProjectId: string | null = null;

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.catch(() => undefined);
  return run;
}

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

      if (message.type === "sync") {
        void enqueue(async () => {
          if (openProjectId !== message.editorProjectId || useProjectStore.getState().project.id !== message.editorProjectId) return;
          const result = await syncStoryboard(message.editorProjectId, message.clips, message.storyboardKey);
          if (result.added.length) toast.success(`Added to the timeline: ${result.added.join(", ")}`, "Placed in storyboard order.");
          if (result.replaced.length) toast.success(`New take on the timeline: ${result.replaced.join(", ")}`, "Later clips moved to make room.");
          if (result.failed.length) toast.error(`Could not add: ${result.failed.join(", ")}`, "Their videos could not be downloaded or decoded.");
          post({ source: EDITOR_MESSAGE_SOURCE, type: "synced", ...result });
        });
        return;
      }

      if (message.type === "load") {
        const total = message.clips.length;
        void enqueue(async () => {
          setStatus({ kind: "loading", done: 0, total, label: "Opening the edit" });
          const progress = (done: number, label: string) => {
            setStatus({ kind: "loading", done, total, label });
            post({ source: EDITOR_MESSAGE_SOURCE, type: "progress", done, total, label });
          };
          try {
            const result = await openEdit(message, progress);
            openProjectId = message.editorProjectId;
            setStatus({ kind: "ready" });
            post({ source: EDITOR_MESSAGE_SOURCE, type: "loaded", ...result });
          } catch (error: unknown) {
            const text = error instanceof Error ? error.message : "The editor could not open this episode.";
            setStatus({ kind: "error", message: text });
            post({ source: EDITOR_MESSAGE_SOURCE, type: "error", message: text });
          }
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
