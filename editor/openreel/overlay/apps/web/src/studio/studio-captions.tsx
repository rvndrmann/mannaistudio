/**
 * Captions on the user's own OpenAI key, through the studio.
 *
 * OpenReel's Auto Captions panel runs Whisper in the browser, which first
 * downloads a model of up to ~760 MB. In the studio the same panel can instead
 * send the clip's audio to the studio's proxy, which transcribes it with the
 * OpenAI key saved under API keys (see src/app/api/studio/editor-ai/audio).
 * The proxy takes the user's session token in place of an API key, exactly as
 * the AI Editor does; the key itself never reaches the browser.
 *
 * The panel is patched by scripts/build-openreel.mjs to read the source
 * choice from useStudioCaptionSource and to call transcribeWithStudioKey.
 */
import { useEffect, useState } from "react";
import { WHISPER_SAMPLE_RATE } from "../utils/whisper-audio";

type Transcription = { baseUrl: string; token: string } | null;
export type CaptionSource = "studio" | "local";

// Short pieces keep each upload well under hosting request limits; Whisper
// handles a minute of 16 kHz mono (≈1.9 MB as WAV) comfortably.
const CHUNK_SECONDS = 60;

let transcription: Transcription = null;
const listeners = new Set<() => void>();

/** Set by the studio bridge whenever the AI connection (or its token) changes. */
export function setStudioTranscription(next: Transcription) {
  transcription = next;
  listeners.forEach((listener) => listener());
}

function useTranscription() {
  const [current, setCurrent] = useState(transcription);
  useEffect(() => {
    const update = () => setCurrent(transcription);
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);
  return current;
}

/** The panel's caption source: the saved OpenAI key when there is one, else the browser model. */
export function useStudioCaptionSource(): [CaptionSource, (source: CaptionSource) => void] {
  const available = useTranscription() !== null;
  const [chosen, setChosen] = useState<CaptionSource>("studio");
  return [available ? chosen : "local", setChosen];
}

export function StudioCaptionSource({ value, onChange, disabled }: { value: CaptionSource; onChange: (source: CaptionSource) => void; disabled?: boolean }) {
  const available = useTranscription() !== null;
  if (!available) return null;
  const option = (source: CaptionSource, label: string) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(source)}
      className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${
        value === source ? "bg-primary text-white" : "text-fg-2 hover:bg-bg-2"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="space-y-1.5 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex gap-1 rounded-lg bg-bg-1 p-1">
        {option("studio", "Your OpenAI key")}
        {option("local", "In-browser model")}
      </div>
      <p className="text-[9px] leading-relaxed text-fg-muted">
        {value === "studio"
          ? "Fast, no download. The clip's audio is transcribed with the OpenAI key saved under API keys; it is billed to that key."
          : "Downloads a caption model into this browser once; audio never leaves your device."}
      </p>
    </div>
  );
}

function wavFrom(samples: Float32Array): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, WHISPER_SAMPLE_RATE, true);
  view.setUint32(28, WHISPER_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index++) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

type Chunk = { text: string; timestamp: [number | null, number | null] };

/**
 * Transcribes 16 kHz mono samples on the saved OpenAI key, a minute at a time.
 * Returns the same shape as the local Whisper worker: text and timed chunks,
 * in seconds from the start of the samples.
 */
export async function transcribeWithStudioKey(
  samples: Float32Array,
  language: string,
  onProgress?: (fraction: number) => void,
): Promise<{ text: string; chunks: Chunk[] }> {
  const connection = transcription;
  if (!connection) throw new Error("Add an OpenAI key under API keys to make captions with it.");
  const chunkLength = CHUNK_SECONDS * WHISPER_SAMPLE_RATE;
  const pieces = Math.max(1, Math.ceil(samples.length / chunkLength));
  const chunks: Chunk[] = [];
  const texts: string[] = [];
  for (let piece = 0; piece < pieces; piece++) {
    const offset = (piece * chunkLength) / WHISPER_SAMPLE_RATE;
    const form = new FormData();
    form.append("file", wavFrom(samples.subarray(piece * chunkLength, (piece + 1) * chunkLength)), "clip.wav");
    if (language) form.append("language", language);
    const response = await fetch(`${connection.baseUrl}/audio/transcriptions`, {
      method: "POST",
      credentials: "omit",
      headers: { Authorization: `Bearer ${transcription?.token || connection.token}` },
      body: form,
    });
    const data = (await response.json().catch(() => null)) as
      | { text?: string; segments?: Array<{ start: number; end: number; text: string }>; error?: { message?: string } }
      | null;
    if (!response.ok) throw new Error(data?.error?.message || `Transcription failed (HTTP ${response.status}).`);
    if (data?.text?.trim()) texts.push(data.text.trim());
    for (const segment of data?.segments || []) {
      chunks.push({ text: segment.text, timestamp: [offset + segment.start, offset + segment.end] });
    }
    onProgress?.((piece + 1) / pieces);
  }
  return { text: texts.join(" "), chunks };
}
