/**
 * A draggable split between the player and the panel below it in OpenReel's
 * compact layout.
 *
 * Upstream gives the player a fixed 48% of a narrow editor, which inside the
 * studio — beside the Director panel — leaves a thumbnail-sized preview. The
 * share is remembered per browser. Wired into EditorInterface by
 * scripts/build-openreel.mjs.
 */
import { useCallback, useState } from "react";

const STORAGE_KEY = "openreel-studio:compact-stage-pct";
const DEFAULT_PCT = 58;
const MIN_PCT = 38;
const MAX_PCT = 88;

const clamp = (value: number) => Math.min(MAX_PCT, Math.max(MIN_PCT, value));

function readStored(): number {
  try {
    const value = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(value) && value > 0 ? clamp(value) : DEFAULT_PCT;
  } catch {
    return DEFAULT_PCT;
  }
}

export function useCompactStageSplit(): [number, (pct: number) => void] {
  const [pct, setPct] = useState(readStored);
  const update = useCallback((next: number) => {
    const value = clamp(next);
    setPct(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Math.round(value)));
    } catch {
      // The split still works for this session.
    }
  }, []);
  return [pct, update];
}

export function CompactStageResizer({ pct, onChange }: { pct: number; onChange: (pct: number) => void }) {
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const handle = event.currentTarget;
    const grid = handle.parentElement;
    if (!grid) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const rect = grid.getBoundingClientRect();
      if (rect.height > 0) onChange(((moveEvent.clientY - rect.top) / rect.height) * 100);
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "row-resize";
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize the player"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={MIN_PCT}
      aria-valuemax={MAX_PCT}
      tabIndex={0}
      title="Drag to resize the player · double-click to make it large"
      className="grid place-items-center cursor-row-resize touch-none group/sh"
      style={{ gridArea: "sh" }}
      onPointerDown={onPointerDown}
      onDoubleClick={() => onChange(pct >= MAX_PCT - 1 ? DEFAULT_PCT : MAX_PCT)}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") onChange(pct - 4);
        if (event.key === "ArrowDown") onChange(pct + 4);
      }}
    >
      <span className="w-12 h-1 rounded-full bg-fg-muted/40 group-hover/sh:bg-accent transition-colors" />
    </div>
  );
}
