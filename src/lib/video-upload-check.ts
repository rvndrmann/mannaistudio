"use client"

/**
 * What is wrong with a video before it becomes an episode.
 *
 * Written after an episode that played its audio over a black frame. The file
 * was fine — H.264, yuv420p, bt709, real picture in every frame — it was just
 * too heavy to arrive in time: 33 MB for 45 seconds, 5.9 Mbit/s of video
 * against 0.25 Mbit/s of audio. The audio track is twenty-three times lighter,
 * so it streams instantly and starts, and the picture is still coming. On
 * phone data that is not a stall anyone recognises as a stall; it is a show
 * with no picture.
 *
 * Three of the five episodes in the library at the time also had their `moov`
 * index written at the end of the file, which is where a player has to reach
 * before it can draw anything. Both faults come from whatever produced the
 * file, so they are caught here, at the one door every episode comes through,
 * rather than found later by a viewer.
 *
 * Nothing is rejected outright. An admin who knows why a file is heavy can
 * still upload it; they just cannot do it without being told.
 */

export type VideoCheck = {
  sizeBytes: number
  /** Null when the browser could not read metadata — then bitrate is unknown too. */
  durationSeconds: number | null
  /** Overall bitrate, video and audio together. Null without a duration. */
  mbps: number | null
  /**
   * Whether the `moov` index sits before the media data, so playback can start
   * on the first chunk. Null when the layout could not be determined (a
   * container that is not MP4, or a header larger than the slice read).
   */
  faststart: boolean | null
  width: number | null
  height: number | null
}

/** Above this, a phone on mobile data cannot keep up with the video track. */
export const TARGET_MAX_MBPS = 3.5

/** What to run on a file that fails the check. */
export const FFMPEG_FIX =
  'ffmpeg -i in.mp4 -c:v libx264 -crf 24 -maxrate 2.5M -bufsize 5M -preset slow ' +
  '-c:a aac -b:a 128k -movflags +faststart out.mp4'

/**
 * Walk the top-level MP4 boxes to see which of `moov` and `mdat` comes first.
 *
 * Each box is a 4-byte big-endian length followed by a 4-byte type, so the
 * layout can be read by hopping from one to the next — which beats searching
 * the bytes for "moov", since those four characters also occur inside media
 * data and would report a faststart file that is not one.
 */
export async function readAtomOrder(file: File): Promise<boolean | null> {
  const header = new DataView(await file.slice(0, 256 * 1024).arrayBuffer())
  let offset = 0
  while (offset + 8 <= header.byteLength) {
    let size = header.getUint32(offset)
    const type = String.fromCharCode(
      header.getUint8(offset + 4), header.getUint8(offset + 5),
      header.getUint8(offset + 6), header.getUint8(offset + 7),
    )
    if (offset === 0 && type !== "ftyp") return null // not an MP4 we can read
    if (type === "moov") return true
    if (type === "mdat") return false
    // A size of 1 means the real 64-bit length follows the type; 0 means the
    // box runs to the end of the file, so there is nothing after it to find.
    if (size === 1) {
      if (offset + 16 > header.byteLength) return null
      const high = header.getUint32(offset + 8)
      const low = header.getUint32(offset + 12)
      size = high * 2 ** 32 + low
    } else if (size === 0) {
      return null
    }
    if (size < 8) return null
    offset += size
  }
  return null
}

function readMetadata(file: File): Promise<{ duration: number | null; width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const probe = document.createElement("video")
    probe.preload = "metadata"
    const done = (result: { duration: number | null; width: number | null; height: number | null }) => {
      URL.revokeObjectURL(url)
      resolve(result)
    }
    probe.onloadedmetadata = () => done({
      duration: Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : null,
      width: probe.videoWidth || null,
      height: probe.videoHeight || null,
    })
    probe.onerror = () => done({ duration: null, width: null, height: null })
    // A file the browser cannot read metadata for must not hang the upload.
    setTimeout(() => done({ duration: null, width: null, height: null }), 8000)
    probe.src = url
  })
}

export async function inspectVideoFile(file: File): Promise<VideoCheck> {
  const [faststart, meta] = await Promise.all([
    readAtomOrder(file).catch(() => null),
    readMetadata(file),
  ])
  return {
    sizeBytes: file.size,
    durationSeconds: meta.duration,
    mbps: meta.duration ? (file.size * 8) / meta.duration / 1_000_000 : null,
    faststart,
    width: meta.width,
    height: meta.height,
  }
}

/**
 * The problems worth stopping an admin over, in the words they would use to
 * explain them to somebody else.
 */
export function videoUploadProblems(check: VideoCheck): string[] {
  const problems: string[] = []
  if (check.mbps !== null && check.mbps > TARGET_MAX_MBPS) {
    const mb = (check.sizeBytes / 1_048_576).toFixed(0)
    problems.push(
      `Too heavy to stream: ${check.mbps.toFixed(1)} Mbit/s (${mb} MB` +
      `${check.durationSeconds ? ` for ${Math.round(check.durationSeconds)}s` : ""}). ` +
      `On phone data the audio arrives and the picture does not, so it plays as sound over a black frame. ` +
      `Aim for 2.5 Mbit/s or less — on a phone screen it looks the same.`,
    )
  }
  if (check.faststart === false) {
    problems.push(
      "The moov index is at the end of the file, so the player has to reach the end before it can show anything.",
    )
  }
  return problems
}
