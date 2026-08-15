"use client";

import { useEffect, useRef, useState } from "react";
import { Aperture, Camera, ChevronRight, Focus, Video } from "lucide-react";
import {
  type CameraSettings,
  apertureOptions,
  cameraOptions,
  focalLengthOptions,
  lensOptions,
} from "@/lib/studio/camera-settings";

/**
 * The camera package picker: four plain lists, one per setting.
 *
 * It was a scroll-snap dial — the selection was whatever row sat in the vertical
 * centre, over a radial glow, behind gradient fades, with everything unselected
 * at 40% opacity. Four separate mechanisms competed to say "this one is picked"
 * and the cost was that you could not read the options you had not picked, could
 * not see more than three at once, and could not click one without the column
 * animating underneath you. Each column then carried a duplicate <select> as its
 * keyboard twin, so every control existed twice.
 *
 * A list of buttons says the same thing with none of that: every option legible,
 * the selected one ringed, one control per setting, and keyboard support for
 * free because they are real buttons.
 */

const SIZES = {
  // 132px is what puts two columns side by side in the 420px generation
  // sidebar and all four in the settings modal, from the same grid.
  compact: { minColumn: 132, list: 208, thumb: "h-7 w-7", label: "text-[11px]", gap: "gap-2" },
  full: { minColumn: 168, list: 300, thumb: "h-9 w-9", label: "text-[13px]", gap: "gap-3" },
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
  thumbnail?: string;
  glyph?: typeof Camera;
};

function OptionThumbnail({ option, active, size }: { option: Option; active: boolean; size: DialSize }) {
  // One tile, one artwork path for the life of the row, so a failed load is
  // remembered rather than retried on every re-render.
  const [broken, setBroken] = useState(false);
  const shell = `grid ${SIZES[size].thumb} shrink-0 place-items-center overflow-hidden rounded-lg`;

  if (option.thumbnail && !broken) {
    return (
      <span className={shell}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={option.thumbnail}
          alt=""
          aria-hidden
          className={`h-full w-full object-contain transition-opacity ${active ? "opacity-100" : "opacity-55"}`}
          onError={() => setBroken(true)}
        />
      </span>
    );
  }
  const Glyph = option.glyph || Camera;
  return (
    <span className={shell}>
      <Glyph className={`h-4 w-4 ${active ? "text-[#b9f42e]" : "text-zinc-600"}`} aria-hidden />
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
  const activeRef = useRef<HTMLButtonElement | null>(null);

  // Bring the selection into view when the column opens or the value changes
  // from outside. Only the column scrolls — scrollIntoView would drag every
  // ancestor with it and yank the whole dialog sideways.
  useEffect(() => {
    const list = listRef.current;
    const item = activeRef.current;
    if (!list || !item) return;
    const above = item.offsetTop < list.scrollTop;
    const below = item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight;
    if (above || below) list.scrollTop = item.offsetTop - list.clientHeight / 2 + item.offsetHeight / 2;
  }, [value]);

  return (
    <div className="min-w-0">
      <p className={`mb-2 px-0.5 font-bold text-zinc-300 ${size === "compact" ? "text-[11px]" : "text-xs"}`}>{label}</p>
      <div
        ref={listRef}
        role="radiogroup"
        aria-label={label}
        style={{ maxHeight: metrics.list }}
        // relative, because the scroll maths below reads item.offsetTop, which
        // is measured against the nearest positioned ancestor — without this it
        // resolves to some outer container and the column scrolls to a position
        // that has nothing to do with the selected row.
        className={`camera-dial-column relative space-y-1.5 overflow-y-auto rounded-2xl border border-white/[0.07] bg-black/30 p-1.5 ${
          disabled ? "pointer-events-none opacity-40" : ""
        }`}
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={String(option.value)}
              ref={active ? activeRef : undefined}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => { if (option.value !== value) onChange(option.value); }}
              className={`flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#b9f42e]/60 ${
                active
                  ? "border-[#b9f42e]/50 bg-[#b9f42e]/[0.10]"
                  : "border-transparent bg-white/[0.04] hover:bg-white/[0.08]"
              }`}
            >
              {/* Readable whether or not it is the one picked. The old column
                  put everything unselected at 40% opacity, which made choosing
                  from it a matter of guessing. */}
              <span className={`min-w-0 flex-1 truncate font-semibold ${metrics.label} ${active ? "text-white" : "text-zinc-400"}`} title={option.label}>
                {option.label}
              </span>
              <OptionThumbnail option={option} active={active} size={size} />
            </button>
          );
        })}
      </div>
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
      className={`grid ${SIZES[size].gap}`}
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
        options={focalLengthOptions.map((option) => ({ value: option, label: `${option}mm`, glyph: Focus }))}
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
 * The mounted control: a summary row that opens the picker.
 *
 * Off is the honest default: nothing is appended to the prompt at all, and the
 * image is generated from exactly what the user wrote. The camera package is
 * something you opt into, per image — a project package only decides what the
 * switch starts on and what values it opens with.
 *
 * The settings read as chips rather than as one run-on string, because four
 * values separated by dots is a sentence you have to parse and four chips is a
 * thing you can scan.
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
  const chips = [value.camera, value.lens, `${value.focalLength}mm`, value.aperture];

  return (
    <div className={`overflow-hidden rounded-2xl border bg-white/[0.02] ${enabled ? "border-[#b9f42e]/25" : "border-white/10"}`}>
      <div className="flex items-center gap-2 p-2.5">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1 py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#b9f42e]/60"
        >
          <Aperture className={`h-4 w-4 shrink-0 ${enabled ? "text-[#b9f42e]" : "text-zinc-600"}`} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">Camera</span>
            {enabled ? (
              <span className="mt-1 flex flex-wrap items-center gap-1">
                {chips.map((chip) => (
                  <span key={chip} className="truncate rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300">
                    {chip}
                  </span>
                ))}
              </span>
            ) : (
              <span className="block truncate text-[11px] font-semibold text-zinc-500">Off — prompt sent unchanged</span>
            )}
          </span>
          <ChevronRight className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
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
        <div className="border-t border-white/[0.07] p-2.5">
          {/* One line, and only when it says something the row above does not.
              The panel used to carry a hint paragraph *and* a checkbox that
              repeated the toggle two inches above it. */}
          {!enabled && (
            <p className="mb-2.5 text-[11px] leading-relaxed text-zinc-500">
              Turn the switch on to shoot this image on {projectSummary || "the package below"}.
            </p>
          )}
          <CameraSettingsPicker value={value} onChange={onChange} disabled={!enabled} size={size} />
        </div>
      )}
    </div>
  );
}
