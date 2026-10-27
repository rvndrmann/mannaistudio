/**
 * The messages between the Timeline tab and the OpenReel editor in its iframe.
 *
 * This file is copied verbatim into the OpenReel build by
 * scripts/build-openreel.mjs, so both sides compile against the same shapes.
 * It must stay free of imports.
 *
 * Both sides accept a message only from the other's window and from their own
 * origin: the editor is served from /editor on this site, never from elsewhere.
 */

export const STUDIO_MESSAGE_SOURCE = "ai-director-studio"
export const EDITOR_MESSAGE_SOURCE = "openreel-editor"

/** One storyboard shot, placed on the editor's video track in order. */
export type EditorClip = {
  shotId: string
  title: string
  /** A signed URL the editor can fetch. */
  url: string
  /** The stored video's path: changes with every new take, unlike `url`. */
  videoKey: string
  /** The shot's saved trim, in seconds into its own video. */
  trimStart: number
  trimEnd: number
}

export type StudioToEditorMessage =
  | {
      source: typeof STUDIO_MESSAGE_SOURCE
      type: "load"
      /** One editor project per studio episode; reopening restores it. */
      editorProjectId: string
      name: string
      width: number
      height: number
      frameRate: number
      clips: EditorClip[]
      /** Fingerprint of the storyboard. */
      storyboardKey: string
      /**
       * Lay the Storyboard track out again from the shots. The rest of the
       * saved edit (other tracks, captions, imported media) is kept.
       */
      rebuild: boolean
    }
  | {
      source: typeof STUDIO_MESSAGE_SOURCE
      /**
       * The storyboard changed while the editor is open (a new take, a new
       * shot). The editor places new shots in storyboard order and swaps
       * new takes in where the old ones were, rippling later clips.
       */
      type: "sync"
      editorProjectId: string
      clips: EditorClip[]
      storyboardKey: string
    }
  | {
      source: typeof STUDIO_MESSAGE_SOURCE
      /**
       * Where the editor's AI should send its requests: our proxy, which runs
       * them on the user's saved provider key. `token` is the user's session
       * token, sent in place of an API key and re-sent whenever it refreshes.
       * `transcription` is whether captions can run on the saved OpenAI key
       * (`${baseUrl}/audio/transcriptions`).
       */
      type: "aiConnection"
      connection: { connected: true; baseUrl: string; model: string; token: string; label: string; transcription: boolean } | { connected: false; reason: string }
    }
  | {
      source: typeof STUDIO_MESSAGE_SOURCE
      type: "exportSaved"
      exportId: string
      ok: boolean
      message?: string
    }

export type EditorToStudioMessage =
  | { source: typeof EDITOR_MESSAGE_SOURCE; type: "ready" }
  | { source: typeof EDITOR_MESSAGE_SOURCE; type: "progress"; done: number; total: number; label: string }
  | {
      source: typeof EDITOR_MESSAGE_SOURCE
      type: "loaded"
      /** True when a saved edit was reopened instead of built from the shots. */
      restored: boolean
      /** The storyboard has changed since that saved edit was built. */
      storyboardChanged: boolean
      /** Shots whose video could not be fetched or decoded. */
      failed: string[]
    }
  | {
      source: typeof EDITOR_MESSAGE_SOURCE
      /** Answer to a "sync": shot titles placed, swapped to a new take, or skipped. */
      type: "synced"
      added: string[]
      replaced: string[]
      failed: string[]
    }
  | {
      source: typeof EDITOR_MESSAGE_SOURCE
      type: "export"
      exportId: string
      file: Blob
      filename: string
      durationSeconds: number
    }
  | { source: typeof EDITOR_MESSAGE_SOURCE; type: "error"; message: string }

export function isEditorToStudioMessage(value: unknown): value is EditorToStudioMessage {
  return Boolean(value && typeof value === "object" && (value as { source?: unknown }).source === EDITOR_MESSAGE_SOURCE)
}

export function isStudioToEditorMessage(value: unknown): value is StudioToEditorMessage {
  return Boolean(value && typeof value === "object" && (value as { source?: unknown }).source === STUDIO_MESSAGE_SOURCE)
}
