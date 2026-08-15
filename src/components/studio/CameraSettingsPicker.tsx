"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Aperture, Camera, Focus, Ruler, Video } from "lucide-react";
import {
  type CameraSettings,
  apertureOptions,
  cameraOptions,
  describeCameraSettings,
  focalLengthOptions,
  lensOptions,
} from "@/lib/studio/camera-settings";

/**
 * The camera dial. Four columns, each a vertical scroll-snap picker whose
 * selection is whatever sits in the vertical centre — not whatever was last
 * clicked. Clicking scrolls an item to the centre and the scroll handler makes
 * the selection, so there is exactly one path into state and exactly one
 * active item per column at all times.
 */

/**
 * Two sizes, because the same dial is mounted in a wide settings modal and in
 * the 420px generation sidebar, where a full-size dial is taller than the
 * prompt box it belongs to.
 */
const SIZES = {
  // 72px is what lets all four columns sit on one row inside the 420px
  // generation sidebar; anything wider wraps aperture onto its own line.
  compact: { item: 62, list: 186, thumb: "h-6 w-6", label: "text-[8px]", focal: "text-sm", minColumn: 72 },
  full: { item: 112, list: 352, thumb: "h-11 w-11", label: "text-[12px]", focal: "text-2xl", minColumn: 132 },
} as const;

type DialSize = keyof typeof SIZES;

/**
 * The tile artwork in public/camera-settings, keyed by the same strings the
 * maps use. Spelled out rather than slugified: the file names came from the
 * asset pack's own manifest, and a derived slug would silently miss on the one
 * key ("70s Cinema Prime") that does not round-trip.
 *
 * Focal lengths have no artwork — they render as their own number. Any key
 * without a file falls back to a glyph tile, never a broken image.
 */
const THUMBNAILS: Record<string, string> = {
  "Modular 8K Digital": "modular_8k_digital",
  "Full-Frame Cine Digital": "full_frame_cine_digital",
  "Grand Format 70mm Film": "grand_format_70mm_film",
  "Studio Digital S35": "studio_digital_s35",
  "Classic 16mm Film": "classic_16mm_film",
  "Premium Large Format Digital": "premium_large_format_digital",
  "Creative Tilt Lens": "creative_tilt_lens",
  "Compact Anamorphic": "compact_anamorphic",
  "Extreme Macro": "extreme_macro",
  "70s Cinema Prime": "70s_cinema_prime",
  "Classic Anamorphic": "classic_anamorphic",
  "Premium Modern Prime": "premium_modern_prime",
  "Warm Cinema Prime": "warm_cinema_prime",
  "Swirl Bokeh Portrait": "swirl_bokeh_portrait",
  "Vintage Prime": "vintage_prime",
  "Halation Diffusion": "halation_diffusion",
  "Clinical Sharp Prime": "clinical_sharp_prime",
  "f/1.4": "f_1_4",
  "f/4": "f_4",
  "f/11": "f_11",
};

function thumbnailPath(value: string) {
  const file = THUMBNAILS[value];
  return file ? `/camera-settings/${file}.png` : undefined;
}

type Option = {
  value: string | number;
  label: string;
  /** Focal lengths render as their own number, centred, rather than as artwork. */
  text?: string;
  thumbnail?: string;
  glyph?: typeof Camera;
};

function OptionThumbnail({ option, active, size }: { option: Option; active: boolean; size: DialSize }) {
  // One tile, one artwork path for the life of the column, so a failed load is
  // remembered rather than retried on every re-render.
  const [broken, setBroken] = useState(false);
  const shell = `grid ${SIZES[size].thumb} shrink-0 place-items-center overflow-hidden rounded-lg bg-white/[0.05]`;

  if (option.thumbnail && !broken) {
    return (
      <span className={shell}>
        <img src={option.thumbnail} alt="" aria-hidden className="h-full w-full object-contain p-0.5" onError={() => setBroken(true)} />
      </span>
    );
  }
  const Glyph = option.glyph || Camera;
  return (
    <span className={shell}>
      <Glyph className={`${size === "compact" ? "h-3 w-3" : "h-5 w-5"} ${active ? "text-[#b9f42e]" : "text-zinc-500"}`} aria-hidden />
    </span>
  );
}

function CameraColumn({
  label,
  options,
  value,
  onChange,
  disabled,
  size,
}: {
  label: string;
  options: Option[];
  value: string | number;
  onChange: (value: string | number) => void;
  disabled?: boolean;
  size: DialSize;
}) {
  const metrics = SIZES[size];
  const listRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const frame = useRef<number | null>(null);
  // A scroll we started ourselves must not be read back as a choice. Centering
  // the initial value fires scroll events on the way there, and treating those
  // as user input selected whichever row the animation happened to pass
  // through — a panel opened on 35mm settled on 24mm.
  const programmatic = useRef(false);
  const programmaticTimer = useRef<number | null>(null);
  // The scroll handler reads the live value without re-subscribing on every
  // selection change.
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));

  const scrollToIndex = useCallback((index: number, smooth: boolean) => {
    const list = listRef.current;
    const item = itemRefs.current[index];
    if (!list || !item) return;
    programmatic.current = true;
    if (programmaticTimer.current !== null) window.clearTimeout(programmaticTimer.current);
    programmaticTimer.current = window.setTimeout(() => { programmatic.current = false; }, smooth ? 700 : 150);
    // Deliberately not scrollIntoView: that scrolls every ancestor too, which
    // on mount drags the whole dialog to wherever the column happens to sit.
    const top = item.offsetTop + item.offsetHeight / 2 - list.clientHeight / 2;
    list.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Centre the initial value once layout has settled. Twice, deliberately: the
  // first pass runs before the column has its final height inside a panel that
  // is still opening, and the second corrects it.
  useLayoutEffect(() => {
    scrollToIndex(selectedIndex, false);
    const raf = window.requestAnimationFrame(() => scrollToIndex(selectedIndex, false));
    const timer = window.setTimeout(() => scrollToIndex(selectedIndex, false), 120);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
    // Mount only; later value changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A value changed from outside (project defaults arriving, an override being
  // switched off) has to move the dial to match.
  useEffect(() => {
    const list = listRef.current;
    const item = itemRefs.current[selectedIndex];
    if (!list || !item) return;
    const centred = Math.abs(item.offsetTop + item.offsetHeight / 2 - (list.scrollTop + list.clientHeight / 2)) < metrics.item / 2;
    if (!centred) scrollToIndex(selectedIndex, true);
  }, [selectedIndex, scrollToIndex, metrics.item]);

  const handleScroll = useCallback(() => {
    // Every scroll event reads the layout of every child, so it is batched
    // into one frame or a low-end device janks its way down the column.
    if (frame.current !== null) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      const list = listRef.current;
      if (!list) return;
      const centre = list.scrollTop + list.clientHeight / 2;
      let nearest = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      itemRefs.current.forEach((item, index) => {
        if (!item) return;
        const distance = Math.abs(item.offsetTop + item.offsetHeight / 2 - centre);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = index;
        }
      });
      const next = options[nearest];
      // Only a changed centre is a change, and only when the user is the one
      // scrolling: firing on every frame would write the same value dozens of
      // times per flick, and firing on our own centering would fight it.
      if (!programmatic.current && next && next.value !== valueRef.current) onChangeRef.current(next.value);
    });
  }, [options]);

  useEffect(() => () => {
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    if (programmaticTimer.current !== null) window.clearTimeout(programmaticTimer.current);
  }, []);

  // Anything the user does to the column hands control straight back to them,
  // even mid-animation.
  const releaseToUser = () => { programmatic.current = false; };

  // Click-drag with a mouse, snap disabled for the duration so the column
  // follows the pointer instead of fighting it.
  const drag = useRef<{ startY: number; startTop: number } | null>(null);
  const beginDrag = (event: React.MouseEvent) => {
    if (disabled) return;
    const list = listRef.current;
    if (!list) return;
    programmatic.current = false;
    drag.current = { startY: event.pageY, startTop: list.scrollTop };
    list.style.scrollSnapType = "none";
  };
  const endDrag = () => {
    const list = listRef.current;
    if (!list || !drag.current) return;
    drag.current = null;
    list.style.scrollSnapType = "";
  };
  const moveDrag = (event: React.MouseEvent) => {
    const list = listRef.current;
    if (!list || !drag.current) return;
    event.preventDefault();
    list.scrollTop = drag.current.startTop - (event.pageY - drag.current.startY) * 1.5;
  };

  // A scroll-snap picker is invisible to a keyboard, so the column is a real
  // listbox: arrows, Home and End move the selection, and the scroll follows.
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    let nextIndex = selectedIndex;
    if (step !== 0) nextIndex = Math.min(options.length - 1, Math.max(0, selectedIndex + step));
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = options.length - 1;
    else return;
    event.preventDefault();
    if (nextIndex !== selectedIndex) onChange(options[nextIndex].value);
    scrollToIndex(nextIndex, true);
  };

  const listId = `camera-column-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <p id={`${listId}-label`} className={`font-semibold text-zinc-300 ${size === "compact" ? "text-[10px]" : "text-[11px]"}`}>{label}</p>
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#b9f42e]/70" />
      </div>
      <div className={`relative overflow-hidden border border-white/[0.07] bg-white/[0.02] backdrop-blur-md ${size === "compact" ? "rounded-2xl" : "rounded-[2rem]"}`}>
        {/* The centre row's glow and the top/bottom fades are what make a
            plain list read as a dial. */}
        <div aria-hidden style={{ height: metrics.item }} className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,rgba(185,244,46,0.10),transparent_70%)]" />
        <div aria-hidden className={`pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-[#101210] via-[#101210]/70 to-transparent ${size === "compact" ? "h-10" : "h-20"}`} />
        <div aria-hidden className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-[#101210] via-[#101210]/70 to-transparent ${size === "compact" ? "h-10" : "h-20"}`} />
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-labelledby={`${listId}-label`}
          aria-disabled={disabled || undefined}
          tabIndex={disabled ? -1 : 0}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          onWheel={releaseToUser}
          onTouchStart={releaseToUser}
          onMouseDown={beginDrag}
          onMouseMove={moveDrag}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          style={{ height: metrics.list }}
          className={`camera-dial-column snap-y snap-mandatory overflow-y-auto px-1.5 outline-none focus-visible:ring-2 focus-visible:ring-[#b9f42e]/50 ${
            disabled ? "pointer-events-none opacity-50" : ""
          }`}
        >
          <div aria-hidden style={{ height: `calc(50% - ${metrics.item / 2}px)` }} />
          {options.map((option, index) => {
            const active = index === selectedIndex;
            return (
              <div
                key={String(option.value)}
                ref={(node) => { itemRefs.current[index] = node; }}
                role="option"
                aria-selected={active}
                onClick={() => {
                  if (disabled) return;
                  if (option.value !== value) onChange(option.value);
                  scrollToIndex(index, true);
                }}
                style={{ height: metrics.item }}
                className={`flex cursor-pointer snap-center items-center ${size === "compact" ? "py-1" : "py-2"}`}
              >
                {/* The active row is a filled pill; the rest fade back rather
                    than shrinking away, so the column still reads as a list. */}
                <div
                  className={`flex h-full w-full items-center border transition-all duration-500 ease-out ${
                    size === "compact" ? "flex-col justify-center gap-1 rounded-xl px-1" : "gap-3 rounded-2xl px-3"
                  } ${
                    option.text ? "justify-center" : ""
                  } ${
                    active
                      ? "border-[#b9f42e]/40 bg-[#b9f42e]/[0.08] opacity-100"
                      : "border-transparent opacity-40"
                  }`}
                >
                  {option.text ? (
                    <span className={`${metrics.focal} font-semibold ${active ? "text-[#b9f42e]" : "text-zinc-500"}`}>{option.text}</span>
                  ) : (
                    <>
                      <OptionThumbnail option={option} active={active} size={size} />
                      <span className={`${metrics.label} font-medium leading-tight ${size === "compact" ? "text-center" : ""} ${active ? "text-white" : "text-zinc-400"}`}>
                        {option.label}
                      </span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          <div aria-hidden style={{ height: `calc(50% - ${metrics.item / 2}px)` }} />
        </div>
      </div>
      {/* The plain control underneath is not a fallback for the dial, it is the
          dial's accessible twin. Dropped when compact — at 84px it is
          unreadable, and the column itself is already a keyboard listbox. */}
      <label className={`mt-2 block ${size === "compact" ? "hidden" : ""}`}>
        <span className="sr-only">{label}</span>
        <select
          value={String(value)}
          disabled={disabled}
          onChange={(event) => {
            const raw = event.target.value;
            const matched = options.find((option) => String(option.value) === raw);
            if (matched) onChange(matched.value);
          }}
          className="w-full rounded-lg border border-white/10 bg-[#0b0c0b] px-2 py-1.5 text-[11px] font-semibold text-zinc-300 outline-none focus:border-[#b9f42e] disabled:opacity-50"
        >
          {options.map((option) => (
            <option key={String(option.value)} value={String(option.value)}>{option.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function CameraSettingsPicker({
  value,
  onChange,
  disabled,
  size = "compact",
}: {
  value: CameraSettings;
  onChange: (settings: CameraSettings) => void;
  disabled?: boolean;
  size?: DialSize;
}) {
  return (
    <div
      // auto-fit rather than a breakpoint: the panel is mounted both in a wide
      // modal and in a narrow sidebar, and a viewport breakpoint cannot tell
      // those apart.
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${SIZES[size].minColumn}px, 1fr))` }}
      className={`grid pb-1 ${size === "compact" ? "gap-1.5" : "gap-3"}`}
    >
      {/* Four columns, in the order a camera department would name them. */}
      <CameraColumn
        label="Camera"
        options={cameraOptions.map((option) => ({ value: option, label: option, thumbnail: thumbnailPath(option), glyph: Video }))}
        value={value.camera}
        disabled={disabled}
        size={size}
        onChange={(next) => onChange({ ...value, camera: String(next) })}
      />
      <CameraColumn
        label="Lens"
        options={lensOptions.map((option) => ({ value: option, label: option, thumbnail: thumbnailPath(option), glyph: Focus }))}
        value={value.lens}
        disabled={disabled}
        size={size}
        onChange={(next) => onChange({ ...value, lens: String(next) })}
      />
      <CameraColumn
        label="Focal Length"
        options={focalLengthOptions.map((option) => ({ value: option, label: `${option}mm`, text: `${option}mm` }))}
        value={value.focalLength}
        disabled={disabled}
        size={size}
        onChange={(next) => onChange({ ...value, focalLength: Number(next) })}
      />
      <CameraColumn
        label="Aperture"
        options={apertureOptions.map((option) => ({ value: option, label: option, thumbnail: thumbnailPath(option), glyph: Aperture }))}
        value={value.aperture}
        disabled={disabled}
        size={size}
        onChange={(next) => onChange({ ...value, aperture: String(next) })}
      />
    </div>
  );
}

/**
 * The mounted control: an off/on switch with the dial behind it.
 *
 * Off is the honest default: nothing is appended to the prompt at all, and the
 * image is generated from exactly what the user wrote. The camera package is
 * something you opt into, per image — a project package only decides what the
 * switch starts on and what values it opens with.
 */
export function CameraSettingsControl({
  value,
  onChange,
  enabled,
  onEnabledChange,
  projectSummary,
  size = "compact",
}: {
  value: CameraSettings;
  onChange: (settings: CameraSettings) => void;
  /** Whether this image gets a camera clause at all. */
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  /** The project package, named in the hint when there is one. */
  projectSummary?: string;
  size?: DialSize;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`rounded-2xl border bg-white/[0.02] ${enabled ? "border-[#b9f42e]/30" : "border-white/10"}`}>
      <div className="flex flex-wrap items-center gap-2 p-3">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <Aperture className={`h-3.5 w-3.5 shrink-0 ${enabled ? "text-[#b9f42e]" : "text-zinc-600"}`} aria-hidden />
          <span className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">Camera Settings</span>
            <span className={`block truncate text-[11px] font-semibold ${enabled ? "text-zinc-300" : "text-zinc-500"}`}>
              {enabled ? describeCameraSettings(value) : "Off — prompt sent unchanged"}
            </span>
          </span>
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Add camera settings to this image"
          onClick={() => {
            const next = !enabled;
            onEnabledChange(next);
            if (next) setOpen(true);
          }}
          className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${enabled ? "bg-[#b9f42e]" : "bg-white/15"}`}
          title={enabled ? "This image is generated with the camera package below" : "No camera language is added to this prompt"}
        >
          <span className={`h-4 w-4 rounded-full bg-black transition-transform ${enabled ? "translate-x-4" : "translate-x-0"}`} />
        </button>
      </div>
      {open && (
        <div className="border-t border-white/10 p-3">
          <p className="mb-3 flex items-start gap-1.5 rounded-lg bg-white/[0.03] px-3 py-2 text-[11px] leading-relaxed text-zinc-400">
            <Ruler className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <span>
              {enabled
                ? <>These optics are appended to the prompt when you generate. Your prompt text is never rewritten.</>
                : <>Off. The prompt is sent exactly as written, with no camera or lens language added{projectSummary ? <> — turn this on to shoot it on {projectSummary}</> : null}.</>}
            </span>
          </p>
          <CameraSettingsPicker value={value} onChange={onChange} disabled={!enabled} size={size} />
          <label className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-zinc-300">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => onEnabledChange(event.target.checked)}
              className="h-3.5 w-3.5 accent-[#b9f42e]"
            />
            Use camera settings for this image
          </label>
        </div>
      )}
    </div>
  );
}
