"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Eraser,
  ImagePlus,
  Loader2,
  MousePointer2,
  Pencil,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getSignedMediaUrl } from "@/lib/studio/signed-media";
import {
  DEFAULT_BRUSH_SIZE,
  DEFAULT_COLOR,
  PRESET_COLORS,
  SEEDED_PROMPTS,
  TEXT_LINE_HEIGHT,
  composeDrawPrompt,
  compositeFormat,
  eraseAt,
  handleSize,
  hydrateCanvasObjects,
  isOnResizeHandle,
  isTypingTarget,
  moveObject,
  objectBounds,
  pushHistory,
  readDrawEditRecord,
  resolveAspectRatio,
  serializeCanvasObjects,
  simplifyPoints,
  toCanvasPoint,
  toolForShortcut,
  topmostObjectAt,
  wrapText,
  type CanvasObject,
  type CanvasPoint,
  type DrawBlockType,
  type DrawTool,
  type StoredCanvasObject,
} from "@/lib/studio/draw-edit";

/**
 * Draw on a generated image, say what the marks mean, get an edited version.
 *
 * Two stacked canvases: the source image is painted once into the background
 * canvas and never cleared, and every mark lives in an object array that is
 * re-rendered onto the transparent overlay on each change. Object-based rather
 * than raster, because that is the only way selecting, moving, and undoing a
 * single mark is possible at all.
 *
 * Both canvases are sized to the source image's *native* resolution and scaled
 * down with CSS. Compositing at the on-screen size instead would quietly
 * downsample the frame on every round trip — the result just looks slightly
 * softer each time, with nothing to point at.
 */

const MAX_COMPOSITE_BYTES = 20 * 1024 * 1024;

type BusyState = null | "compositing" | "uploading" | "generating";

export default function DrawToEditModal({
  projectId,
  sourcePath,
  blockType,
  target,
  targetId,
  episodeId,
  model,
  quality,
  title,
  close,
  onEdited,
}: {
  projectId: string;
  sourcePath: string;
  blockType: DrawBlockType;
  target: "asset" | "shot";
  targetId: string;
  episodeId?: string;
  model: string;
  quality?: "Low" | "Medium" | "High" | "Ultra";
  title: string;
  close: () => void;
  /** Fires with the new version's storage path once the edit comes back. */
  onEdited: (result: { path: string; jobId: string | null; prompt: string }) => void;
}) {
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const insertInputRef = useRef<HTMLInputElement | null>(null);
  const backgroundRef = useRef<HTMLImageElement | null>(null);

  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [objects, setObjects] = useState<CanvasObject[]>([]);
  const [history, setHistory] = useState<CanvasObject[][]>([[]]);
  const [historyIdx, setHistoryIdx] = useState(0);

  const [tool, setTool] = useState<DrawTool>("pencil");
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  const [promptText, setPromptText] = useState(SEEDED_PROMPTS[blockType]);
  const [cleanUpMarks, setCleanUpMarks] = useState(true);
  const [busy, setBusy] = useState<BusyState>(null);
  const [error, setError] = useState<string | null>(null);

  // A drag in progress. Held in a ref, not state: the pointer handlers run far
  // more often than React should re-render, and the committed object array is
  // the only thing the undo stack ever sees.
  const dragRef = useRef<
    | null
    | { kind: "draw"; object: CanvasObject }
    | { kind: "erase"; erased: boolean }
    | { kind: "move"; id: string; last: CanvasPoint }
    | { kind: "resize"; id: string }
  >(null);

  // The object array and the undo stack are mirrored in refs and mutated
  // synchronously. Pointer handlers fire between renders, and a functional
  // state updater that also pushed history would run twice under StrictMode —
  // which is exactly the kind of duplicated undo step nobody can reproduce.
  const objectsRef = useRef<CanvasObject[]>([]);
  const historyRef = useRef<CanvasObject[][]>([[]]);
  const historyIdxRef = useRef(0);

  const applyObjects = useCallback((next: CanvasObject[]) => {
    objectsRef.current = next;
    setObjects(next);
  }, []);

  const commit = useCallback((next: CanvasObject[]) => {
    applyObjects(next);
    const pushed = pushHistory(historyRef.current, historyIdxRef.current, next);
    historyRef.current = pushed.history;
    historyIdxRef.current = pushed.index;
    setHistory(pushed.history);
    setHistoryIdx(pushed.index);
  }, [applyObjects]);

  const restoreHistory = useCallback((index: number) => {
    if (index < 0 || index >= historyRef.current.length) return;
    historyIdxRef.current = index;
    setHistoryIdx(index);
    applyObjects(historyRef.current[index]);
    setSelectedId(null);
  }, [applyObjects]);

  /* ---------------------------------------------------------------- loading */

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const url = await getSignedMediaUrl(sourcePath);
        if (!url) throw new Error("This image could not be opened for editing.");
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => {
          if (!active) return;
          backgroundRef.current = image;
          setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
        };
        image.onerror = () => { if (active) setLoadError("This image could not be loaded onto the canvas."); };
        image.src = url;
      } catch (loadFailure) {
        if (active) setLoadError(loadFailure instanceof Error ? loadFailure.message : "This image could not be loaded.");
      }
    })();
    return () => { active = false; };
  }, [sourcePath]);

  // Reopening an edit restores what was drawn rather than making the user
  // redraw it. The marks live on the job that produced this image.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await createClient()
        .from("creator_generation_jobs")
        .select("settings")
        .eq("result_url", sourcePath)
        .eq("type", "image")
        .order("created_at", { ascending: false })
        .limit(1);
      if (!active || !data?.length) return;
      const settings = data[0].settings && typeof data[0].settings === "object" ? data[0].settings as Record<string, unknown> : null;
      const record = readDrawEditRecord(settings?.drawEdit);
      if (!record?.objects.length) return;
      const restored = await rehydrateImages(record.objects);
      if (!active) return;
      objectsRef.current = restored;
      setObjects(restored);
      historyRef.current = [[], restored];
      historyIdxRef.current = 1;
      setHistory(historyRef.current);
      setHistoryIdx(1);
    })().catch(() => {
      // A missing or unreadable prior edit just means starting from a clean
      // overlay; it is never worth blocking the editor over.
    });
    return () => { active = false; };
  }, [sourcePath]);

  /* -------------------------------------------------------------- rendering */

  // The background is painted once. Clearing and redrawing it alongside the
  // overlay would flash the frame on every stroke.
  useLayoutEffect(() => {
    const canvas = bgCanvasRef.current;
    const image = backgroundRef.current;
    if (!canvas || !image || !naturalSize) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  }, [naturalSize]);

  useLayoutEffect(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas || !naturalSize) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    renderObjects(ctx, objects);
    const selected = objects.find((object) => object.id === selectedId);
    if (selected) drawSelection(ctx, selected, canvas.width);
  }, [objects, selectedId, naturalSize]);

  /* --------------------------------------------------------------- pointers */

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): CanvasPoint => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    return toCanvasPoint(event.clientX, event.clientY, canvas.getBoundingClientRect(), canvas.width, canvas.height);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (busy || editingTextId) return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);

    if (tool === "pointer") {
      const selected = objectsRef.current.find((object) => object.id === selectedId);
      if (selected && isOnResizeHandle(selected, point, canvas.width)) {
        dragRef.current = { kind: "resize", id: selected.id };
        return;
      }
      const hit = topmostObjectAt(objectsRef.current, point, handleSize(canvas.width));
      setSelectedId(hit?.id || null);
      if (hit) dragRef.current = { kind: "move", id: hit.id, last: point };
      return;
    }

    if (tool === "eraser") {
      const next = eraseAt(objectsRef.current, point, handleSize(canvas.width));
      const erased = next.length !== objectsRef.current.length;
      dragRef.current = { kind: "erase", erased };
      if (erased) applyObjects(next);
      return;
    }

    if (tool === "text") {
      const fontSize = Math.max(16, Math.round(canvas.width / 26));
      const object: CanvasObject = {
        id: newId(),
        type: "text",
        color,
        brushSize,
        x: point.x,
        y: point.y,
        width: Math.min(canvas.width - point.x, canvas.width * 0.45),
        height: fontSize * TEXT_LINE_HEIGHT,
        text: "",
        fontSize,
      };
      applyObjects([...objectsRef.current, object]);
      setSelectedId(object.id);
      setEditingTextId(object.id);
      return;
    }

    if (tool === "image") {
      insertInputRef.current?.click();
      return;
    }

    const object: CanvasObject = tool === "pencil"
      ? { id: newId(), type: "stroke", color, brushSize, points: [point] }
      : { id: newId(), type: tool === "rect" ? "rect" : "arrow", color, brushSize, x: point.x, y: point.y, width: 0, height: 0 };
    dragRef.current = { kind: "draw", object };
    applyObjects([...objectsRef.current, object]);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const point = pointFromEvent(event);

    if (drag.kind === "draw") {
      const { object } = drag;
      const updated: CanvasObject = object.type === "stroke"
        ? { ...object, points: [...(object.points || []), point] }
        : { ...object, width: point.x - (object.x || 0), height: point.y - (object.y || 0) };
      drag.object = updated;
      applyObjects(objectsRef.current.map((item) => (item.id === updated.id ? updated : item)));
      return;
    }

    if (drag.kind === "erase") {
      const next = eraseAt(objectsRef.current, point, handleSize(canvas.width));
      if (next.length !== objectsRef.current.length) {
        drag.erased = true;
        applyObjects(next);
      }
      return;
    }

    if (drag.kind === "move") {
      const dx = point.x - drag.last.x;
      const dy = point.y - drag.last.y;
      drag.last = point;
      applyObjects(objectsRef.current.map((item) => (item.id === drag.id ? moveObject(item, dx, dy) : item)));
      return;
    }

    applyObjects(objectsRef.current.map((item) => {
      if (item.id !== drag.id) return item;
      const width = Math.max(8, point.x - (item.x || 0));
      const height = Math.max(8, point.y - (item.y || 0));
      // Text keeps its own line height; only the wrap width is dragged.
      return item.type === "text" ? { ...item, width } : { ...item, width, height };
    }));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    drawCanvasRef.current?.releasePointerCapture(event.pointerId);
    if (!drag) return;

    // One history entry per gesture. Pushing on every move turns a single
    // stroke into hundreds of undo steps.
    if (drag.kind === "erase" && !drag.erased) return;
    let next = objectsRef.current;
    if (drag.kind === "resize") {
      // Dragging a text box narrower rewraps it, so its height — which is what
      // the selection box and hit test are drawn from — has to be remeasured.
      const canvas = drawCanvasRef.current;
      next = next.map((item) => {
        if (item.id !== drag.id || item.type !== "text" || !item.text || !canvas) return item;
        const fontSize = item.fontSize || 32;
        const lines = wrapText(item.text, item.width || canvas.width, textMeasurer(canvas, fontSize));
        return { ...item, height: lines.length * fontSize * TEXT_LINE_HEIGHT };
      });
    }
    if (drag.kind === "draw") {
      next = next
        .map((item) => (item.type === "stroke" && item.id === drag.object.id
          ? { ...item, points: simplifyPoints(item.points || []) }
          : item))
        // A click with a shape tool leaves a zero-size box that can never be
        // selected again, so it is dropped rather than left on the canvas.
        .filter((item) => !(item.id === drag.object.id && isDegenerate(item)));
    }
    commit(next);
  };

  /* ------------------------------------------------------------------ tools */

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    commit(objectsRef.current.filter((object) => object.id !== selectedId));
    setSelectedId(null);
  }, [commit, selectedId]);

  const undo = useCallback(() => restoreHistory(historyIdxRef.current - 1), [restoreHistory]);
  const redo = useCallback(() => restoreHistory(historyIdxRef.current + 1), [restoreHistory]);

  const clearAll = () => {
    if (!objects.length) return;
    commit([]);
    setSelectedId(null);
  };

  const commitText = (id: string, value: string) => {
    setEditingTextId(null);
    const canvas = drawCanvasRef.current;
    const text = value.trim();
    if (!text) {
      // An empty text box is discarded without an undo step: placing one and
      // clicking away is not an edit the user should have to undo.
      applyObjects(objectsRef.current.filter((object) => object.id !== id));
      setSelectedId(null);
      return;
    }
    const next = objectsRef.current.map((object) => {
      if (object.id !== id) return object;
      const fontSize = object.fontSize || 32;
      const lines = canvas
        ? wrapText(text, object.width || canvas.width, textMeasurer(canvas, fontSize))
        : [text];
      return { ...object, text, height: lines.length * fontSize * TEXT_LINE_HEIGHT };
    });
    commit(next);
  };

  const insertImage = async (file: File | undefined) => {
    if (!file) return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    setError(null);
    setBusy("uploading");
    try {
      const path = await uploadToStorage(file, projectId, "draw-insert");
      const url = await getSignedMediaUrl(path);
      if (!url) throw new Error("The inserted image could not be prepared.");
      const image = await loadImage(url);
      const width = canvas.width * 0.35;
      const height = width * (image.naturalHeight / image.naturalWidth || 1);
      commit([...objectsRef.current, {
        id: newId(),
        type: "image",
        color,
        brushSize,
        x: (canvas.width - width) / 2,
        y: (canvas.height - height) / 2,
        width,
        height,
        src: path,
        img: image,
      }]);
      setTool("pointer");
    } catch (insertError) {
      setError(insertError instanceof Error ? insertError.message : "Could not insert that image.");
    } finally {
      setBusy(null);
    }
  };

  /* -------------------------------------------------------------- shortcuts */

  // Bound once, so it must read through a ref. A listener that closed over
  // state directly would keep undoing against the array the modal opened with.
  const shortcutRef = useRef<(event: KeyboardEvent) => void>(() => {});
  shortcutRef.current = (event: KeyboardEvent) => {
    if (isTypingTarget(document.activeElement)) return;
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
      return;
    }
    if (meta && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }
    if (meta) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      if (selectedId) {
        event.preventDefault();
        deleteSelected();
      }
      return;
    }
    if (event.key === "Escape") {
      setSelectedId(null);
      return;
    }
    const nextTool = toolForShortcut(event.key);
    if (nextTool) {
      event.preventDefault();
      setTool(nextTool);
      if (nextTool === "image") insertInputRef.current?.click();
    }
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => shortcutRef.current(event);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  /* -------------------------------------------------------------- generate */

  const aspectRatio = useMemo(
    () => (naturalSize ? resolveAspectRatio(naturalSize.width, naturalSize.height) : "9:16"),
    [naturalSize],
  );

  const generate = async () => {
    const background = backgroundRef.current;
    if (!background || !naturalSize) return;
    setError(null);
    setBusy("compositing");
    try {
      const blob = await buildComposite(background, objects, naturalSize, sourcePath);
      if (blob.size > MAX_COMPOSITE_BYTES) {
        throw new Error("This edit is too large to upload. Try removing an inserted image.");
      }
      setBusy("uploading");
      const format = compositeFormat(sourcePath);
      const compositePath = await uploadToStorage(
        new File([blob], `composite.${format.extension}`, { type: format.mimeType }),
        projectId,
        "draw-composite",
      );

      setBusy("generating");
      const response = await fetch(`/api/studio/projects/${projectId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          targetId,
          ...(episodeId ? { episodeId } : {}),
          prompt: composeDrawPrompt(promptText, cleanUpMarks),
          model,
          // The flattened composite is the only reference. Adding the entity's
          // other art here would pull the edit away from the frame the user
          // actually drew on.
          referenceImages: [compositePath],
          aspectRatio,
          ...(quality ? { quality } : {}),
          drawEdit: {
            sourceImage: sourcePath,
            compositeImage: compositePath,
            objects: serializeCanvasObjects(objects),
          },
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Image edit failed");
      const path = typeof body.path === "string" ? body.path : typeof body.imageUrl === "string" ? body.imageUrl : null;
      if (!path) throw new Error("The edit completed without a saved image.");
      onEdited({
        path,
        jobId: typeof body.jobId === "string" ? body.jobId : null,
        prompt: composeDrawPrompt(promptText, cleanUpMarks),
      });
      close();
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Image edit failed");
    } finally {
      setBusy(null);
    }
  };

  /* ------------------------------------------------------------------- view */

  const editingText = objects.find((object) => object.id === editingTextId) || null;
  const busyLabel = busy === "compositing" ? "Flattening your drawing…"
    : busy === "uploading" ? "Uploading…"
    : busy === "generating" ? "Editing the image…"
    : null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#080908] text-white">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-4 sm:px-6">
        <p className="t-caption text-[#b9f42e]">Draw to Edit</p>
        <p className="truncate text-sm font-semibold text-zinc-300">{title}</p>
        {naturalSize && (
          <span className="hidden rounded-md border border-white/10 px-2 py-0.5 text-[11px] font-semibold text-zinc-500 sm:inline">
            {naturalSize.width}×{naturalSize.height} · {aspectRatio}
          </span>
        )}
        <button
          type="button"
          onClick={close}
          disabled={Boolean(busy)}
          className="ml-auto rounded-xl p-2 text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-40"
          aria-label="Close the drawing editor"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Toolbar */}
        <aside className="flex shrink-0 flex-row items-center gap-2 border-b border-white/10 bg-[#0b0c0b] p-2 lg:w-16 lg:flex-col lg:border-b-0 lg:border-r lg:py-4">
          {TOOLS.map((entry) => (
            <button
              key={entry.tool}
              type="button"
              title={`${entry.label} (${entry.shortcut})`}
              aria-label={entry.label}
              aria-pressed={tool === entry.tool}
              onClick={() => {
                setTool(entry.tool);
                if (entry.tool === "image") insertInputRef.current?.click();
              }}
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition ${
                tool === entry.tool ? "bg-[#b9f42e] text-black" : "text-zinc-400 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              <entry.icon className="h-4.5 w-4.5" />
            </button>
          ))}
          <span className="mx-1 h-8 border-l border-white/10 lg:mx-0 lg:my-1 lg:h-0 lg:w-8 lg:border-l-0 lg:border-t" />
          <button
            type="button"
            onClick={undo}
            disabled={historyIdx <= 0}
            title="Undo (Cmd/Ctrl+Z)"
            aria-label="Undo"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-zinc-400 hover:bg-white/[0.06] hover:text-white disabled:opacity-25"
          >
            <Undo2 className="h-4.5 w-4.5" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={historyIdx >= history.length - 1}
            title="Redo (Cmd/Ctrl+Y)"
            aria-label="Redo"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-zinc-400 hover:bg-white/[0.06] hover:text-white disabled:opacity-25"
          >
            <Redo2 className="h-4.5 w-4.5" />
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={!objects.length}
            title="Clear every mark"
            aria-label="Clear every mark"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-zinc-400 hover:bg-red-500/15 hover:text-red-300 disabled:opacity-25"
          >
            <Trash2 className="h-4.5 w-4.5" />
          </button>
        </aside>

        {/* Stage */}
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center overflow-auto bg-black/50 p-3 sm:p-6">
          {loadError ? (
            <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{loadError}</p>
          ) : !naturalSize ? (
            <div className="flex flex-col items-center gap-3 text-zinc-500">
              <Loader2 className="h-7 w-7 animate-spin text-[#b9f42e]" />
              <p className="text-sm">Loading the image…</p>
            </div>
          ) : (
            <div ref={stageRef} className="relative max-h-full" style={{ width: "min(100%, 1100px)" }}>
              <canvas
                ref={bgCanvasRef}
                width={naturalSize.width}
                height={naturalSize.height}
                className="block h-auto w-full max-w-full rounded-lg bg-black shadow-2xl"
              />
              <canvas
                ref={drawCanvasRef}
                width={naturalSize.width}
                height={naturalSize.height}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                // Pointer events, not mouse events, and touch-action none so a
                // finger draws instead of scrolling the page away.
                style={{ touchAction: "none" }}
                className={`absolute inset-0 h-full w-full rounded-lg ${tool === "pointer" ? "cursor-default" : tool === "text" ? "cursor-text" : "cursor-crosshair"}`}
              />
              {editingText && (
                <TextEditor
                  object={editingText}
                  canvasWidth={naturalSize.width}
                  stage={stageRef.current}
                  onCommit={(value) => commitText(editingText.id, value)}
                />
              )}
            </div>
          )}
        </main>

        {/* Prompt + palette */}
        <aside className="flex w-full shrink-0 flex-col gap-4 border-t border-white/10 bg-[#151715] p-4 lg:w-[380px] lg:border-l lg:border-t-0 lg:p-6 overflow-y-auto">
          <div>
            <p className="mb-2 text-[10px] font-bold text-zinc-500">Colour</p>
            <div className="flex flex-wrap items-center gap-2">
              {PRESET_COLORS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-label={`Draw in ${preset}`}
                  aria-pressed={color === preset}
                  onClick={() => setColor(preset)}
                  style={{ backgroundColor: preset }}
                  className={`h-7 w-7 rounded-full border-2 transition ${color === preset ? "border-white scale-110" : "border-white/20 hover:border-white/50"}`}
                />
              ))}
            </div>
          </div>

          <label className="block">
            <span className="text-[10px] font-bold text-zinc-500">Brush size · {brushSize}</span>
            <input
              type="range"
              min={1}
              max={40}
              value={brushSize}
              onChange={(event) => setBrushSize(Number(event.target.value))}
              className="mt-2 w-full accent-[#b9f42e]"
            />
          </label>

          <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-[11px] leading-relaxed text-zinc-400">
            <p className="mb-1.5 font-bold text-zinc-500">What the marks mean</p>
            <p><span className="font-bold text-zinc-200">Box</span> — change what is inside it.</p>
            <p><span className="font-bold text-zinc-200">Arrow</span> — move this here, or look this way.</p>
            <p><span className="font-bold text-zinc-200">Scribble</span> — remove or replace this.</p>
            <p><span className="font-bold text-zinc-200">Text</span> — an instruction anchored to that spot.</p>
            <p className="mt-1.5 text-zinc-500">Your marks are drawn into the image the model sees, so the prompt should say what they are for.</p>
          </div>

          <label className="block">
            <span className="text-[10px] font-bold text-zinc-500">Instruction</span>
            <textarea
              value={promptText}
              onChange={(event) => setPromptText(event.target.value)}
              rows={5}
              aria-label="Edit instruction"
              placeholder="Say what the marks mean…"
              className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-[#1c1c1c] p-3 text-[13px] leading-relaxed text-zinc-200 outline-none focus:border-[#b9f42e]/50 placeholder:text-zinc-600"
            />
          </label>

          <label className="flex items-start gap-2.5 text-[12px] text-zinc-300">
            <input
              type="checkbox"
              checked={cleanUpMarks}
              onChange={(event) => setCleanUpMarks(event.target.checked)}
              className="mt-0.5 accent-[#b9f42e]"
            />
            <span>Ask the model to remove the drawn marks from the result.</span>
          </label>

          {error && (
            <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">{error}</p>
          )}

          <div className="mt-auto space-y-2 pt-2">
            <p className="text-[11px] text-zinc-500">
              The edit is saved as a new version — {blockType === "shot" ? "this frame" : "this concept"} stays where it is.
            </p>
            <button
              type="button"
              onClick={generate}
              disabled={Boolean(busy) || !naturalSize}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#b9f42e] px-5 py-3 text-sm font-semibold text-black transition hover:bg-[#a6de25] disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busyLabel || "Apply edit"}
            </button>
          </div>
        </aside>
      </div>

      <input
        ref={insertInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void insertImage(file);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

const TOOLS: Array<{ tool: DrawTool; label: string; shortcut: string; icon: typeof Pencil }> = [
  { tool: "pointer", label: "Select and move", shortcut: "V", icon: MousePointer2 },
  { tool: "pencil", label: "Pencil", shortcut: "B", icon: Pencil },
  // Named for what it does: it removes whole marks, not pixels of the photo.
  { tool: "eraser", label: "Delete marks", shortcut: "E", icon: Eraser },
  { tool: "rect", label: "Rectangle", shortcut: "R", icon: Square },
  { tool: "arrow", label: "Arrow", shortcut: "A", icon: ArrowUpRight },
  { tool: "text", label: "Text", shortcut: "T", icon: Type },
  { tool: "image", label: "Insert image", shortcut: "I", icon: ImagePlus },
];

/** The inline text box, positioned over the canvas in CSS space. */
function TextEditor({
  object,
  canvasWidth,
  stage,
  onCommit,
}: {
  object: CanvasObject;
  canvasWidth: number;
  stage: HTMLDivElement | null;
  onCommit: (value: string) => void;
}) {
  const [value, setValue] = useState(object.text || "");
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const scale = (stage?.clientWidth || canvasWidth) / canvasWidth;
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(event) => {
        if (event.key === "Escape" || (event.key === "Enter" && !event.shiftKey)) {
          event.preventDefault();
          onCommit(value);
        }
      }}
      aria-label="Text to place on the image"
      className="absolute resize-none rounded border-2 border-dashed border-white/70 bg-black/70 p-1 leading-tight text-white outline-none"
      style={{
        left: (object.x || 0) * scale,
        top: (object.y || 0) * scale,
        width: (object.width || 0) * scale,
        fontSize: (object.fontSize || 32) * scale,
        color: object.color,
      }}
    />
  );
}

/* ------------------------------------------------------------------ canvas */

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `mark-${Date.now()}-${Math.random()}`;
}

function isDegenerate(object: CanvasObject) {
  if (object.type === "rect" || object.type === "arrow") {
    return Math.abs(object.width || 0) < 4 && Math.abs(object.height || 0) < 4;
  }
  return false;
}

function textMeasurer(canvas: HTMLCanvasElement, fontSize: number) {
  const ctx = canvas.getContext("2d");
  return (value: string) => {
    if (!ctx) return value.length * fontSize * 0.5;
    ctx.save();
    ctx.font = `bold ${fontSize}px sans-serif`;
    const width = ctx.measureText(value).width;
    ctx.restore();
    return width;
  };
}

/**
 * The one renderer, used for both the on-screen overlay and the exported
 * composite, so the layer order can only ever be: inserted images, then
 * strokes and shapes, then text on top. Two renderers would eventually
 * disagree and the export would stop matching what was drawn.
 */
function renderObjects(ctx: CanvasRenderingContext2D, objects: CanvasObject[]) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const object of objects) {
    if (object.type !== "image" || !object.img) continue;
    const bounds = objectBounds(object);
    ctx.drawImage(object.img, bounds.x, bounds.y, bounds.width, bounds.height);
  }

  for (const object of objects) {
    if (object.type === "stroke") {
      const points = object.points || [];
      if (!points.length) continue;
      ctx.strokeStyle = object.color;
      ctx.lineWidth = object.brushSize;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
      // A single tap still leaves a dot rather than nothing at all.
      if (points.length === 1) ctx.lineTo(points[0].x + 0.1, points[0].y);
      ctx.stroke();
    } else if (object.type === "rect") {
      const bounds = objectBounds(object);
      ctx.strokeStyle = object.color;
      ctx.lineWidth = object.brushSize;
      ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    } else if (object.type === "arrow") {
      drawArrow(ctx, object);
    }
  }

  for (const object of objects) {
    if (object.type !== "text" || !object.text) continue;
    const fontSize = object.fontSize || 32;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textBaseline = "top";
    const lines = wrapText(object.text, object.width || ctx.canvas.width, (value) => ctx.measureText(value).width);
    // A dark halo, because yellow-on-white text is unreadable to the model as
    // well as to the user.
    ctx.lineWidth = Math.max(2, fontSize / 10);
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.fillStyle = object.color;
    lines.forEach((line, index) => {
      const y = (object.y || 0) + index * fontSize * TEXT_LINE_HEIGHT;
      ctx.strokeText(line, object.x || 0, y);
      ctx.fillText(line, object.x || 0, y);
    });
  }

  ctx.restore();
}

function drawArrow(ctx: CanvasRenderingContext2D, object: CanvasObject) {
  const tailX = object.x || 0;
  const tailY = object.y || 0;
  const headX = tailX + (object.width || 0);
  const headY = tailY + (object.height || 0);
  const angle = Math.atan2(headY - tailY, headX - tailX);
  const head = Math.max(object.brushSize * 3.5, 12);
  ctx.strokeStyle = object.color;
  ctx.fillStyle = object.color;
  ctx.lineWidth = object.brushSize;
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(headX, headY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(headX, headY);
  ctx.lineTo(headX - head * Math.cos(angle - Math.PI / 7), headY - head * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(headX - head * Math.cos(angle + Math.PI / 7), headY - head * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
}

/** Selection chrome. Drawn on the overlay for the screen only — never composited. */
function drawSelection(ctx: CanvasRenderingContext2D, object: CanvasObject, canvasWidth: number) {
  const bounds = objectBounds(object);
  const pad = Math.max(4, canvasWidth / 300);
  ctx.save();
  ctx.strokeStyle = "#b9f42e";
  ctx.lineWidth = Math.max(2, canvasWidth / 500);
  ctx.setLineDash([pad * 2, pad * 2]);
  ctx.strokeRect(bounds.x - pad, bounds.y - pad, bounds.width + pad * 2, bounds.height + pad * 2);
  ctx.setLineDash([]);
  if (object.type === "rect" || object.type === "image" || object.type === "text") {
    const size = handleSize(canvasWidth);
    ctx.fillStyle = "#b9f42e";
    ctx.fillRect(bounds.x + bounds.width - size / 2, bounds.y + bounds.height - size / 2, size, size);
  }
  ctx.restore();
}

/**
 * Flatten to one image at the source's native resolution.
 *
 * The merge canvas is deliberately built from the natural dimensions rather
 * than from the on-screen canvas: an 800px-wide preview of a 2048px frame
 * would otherwise hand the model a quarter-resolution picture, and each edit
 * would compound the loss.
 */
async function buildComposite(
  background: HTMLImageElement,
  objects: CanvasObject[],
  size: { width: number; height: number },
  sourcePath: string,
): Promise<Blob> {
  const merge = document.createElement("canvas");
  merge.width = size.width;
  merge.height = size.height;
  const ctx = merge.getContext("2d");
  if (!ctx) throw new Error("This browser could not prepare the edited image.");
  ctx.drawImage(background, 0, 0, merge.width, merge.height);
  renderObjects(ctx, objects);
  const format = compositeFormat(sourcePath);
  const blob = await new Promise<Blob | null>((resolve) => merge.toBlob(resolve, format.mimeType, format.quality));
  if (!blob) throw new Error("This browser could not prepare the edited image.");
  return blob;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That image could not be loaded."));
    image.src = url;
  });
}

/** Rebuild the live elements a stored edit needs before it can be drawn again. */
async function rehydrateImages(stored: StoredCanvasObject[]): Promise<CanvasObject[]> {
  return Promise.all(stored.map(async (object) => {
    if (object.type !== "image" || !object.src) return object as CanvasObject;
    try {
      const url = await getSignedMediaUrl(object.src);
      if (!url) return object as CanvasObject;
      return { ...object, img: await loadImage(url) } as CanvasObject;
    } catch {
      // A reference image that has since been deleted leaves a gap in the
      // replay rather than refusing to reopen the edit at all.
      return object as CanvasObject;
    }
  }));
}

async function uploadToStorage(file: File, projectId: string, prefix: string): Promise<string> {
  const supabase = createClient();
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("Your session expired. Sign in again to save this edit.");
  const extension = (file.name.split(".").pop() || "png").replace(/[^a-zA-Z0-9]/g, "").slice(0, 5) || "png";
  const path = `${userId}/${projectId}/${prefix}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("creator-studio-media").upload(path, file, { contentType: file.type });
  if (error) throw error;
  return path;
}
