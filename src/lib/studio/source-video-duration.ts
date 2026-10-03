import { HiggsfieldProviderError, genjutsuDuration } from "./higgsfield"

/** Read ISO BMFF (MP4/MOV) movie metadata without downloading the video frames. */
export async function readSourceVideoDuration(url: string, requireResolution = false) {
  // Only probe our storage server, never a user-supplied network address.
  const target = new URL(url)
  const storage = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://invalid.invalid")
  if (target.origin !== storage.origin || !target.pathname.startsWith("/storage/v1/object/")) {
    throw new HiggsfieldProviderError("Upload the Genjutsu source video to the project or select a saved storyboard clip.", 400)
  }
  let totalBytes: number | null = null
  async function range(start: number, length: number) {
    const response = await fetch(url, { headers: { Range: `bytes=${start}-${start + length - 1}` }, signal: AbortSignal.timeout(15_000), redirect: "error" })
    if (response.status !== 206) { await response.body?.cancel(); throw new HiggsfieldProviderError("Source video metadata could not be read. Upload an MP4 or MOV source video.", 400) }
    const contentRange = response.headers.get("content-range")
    const total = contentRange?.match(/\/(\d+)$/)?.[1]
    if (total) totalBytes = Number(total)
    const data = Buffer.from(await response.arrayBuffer())
    if (data.length > length) throw new HiggsfieldProviderError("Invalid source video range response", 400)
    return data
  }
  let offset = 0
  for (let count = 0; count < 64; count++) {
    const header = await range(offset, 16)
    if (header.length < 8) break
    let size = header.readUInt32BE(0)
    const kind = header.toString("ascii", 4, 8)
    const headerSize = size === 1 ? 16 : 8
    if (size === 1) size = Number(header.readBigUInt64BE(8))
    if (!Number.isSafeInteger(size) || size < headerSize) break
    if (kind === "moov") {
      if (size > 16 * 1024 * 1024) break
      const movie = await range(offset + headerSize, size - headerSize)
      let width = 0
      let height = 0
      let durationSeconds = 0
      const readAtoms = (buffer: Buffer, start: number, end: number): void => {
        for (let position = start; position + 8 <= end;) {
          let atomSize = buffer.readUInt32BE(position)
          const atomType = buffer.toString("ascii", position + 4, position + 8)
          const atomHeader = atomSize === 1 ? 16 : 8
          if (atomSize === 1) atomSize = Number(buffer.readBigUInt64BE(position + 8))
          if (atomSize < atomHeader || position + atomSize > end) return
          const payloadStart = position + atomHeader
          const payload = buffer.subarray(payloadStart, position + atomSize)
          if (atomType === "mvhd") {
            const version = payload[0]
            if ((version === 0 || version === 1) && payload.length >= (version === 1 ? 32 : 20)) {
              const scale = payload.readUInt32BE(version === 1 ? 20 : 12)
              const duration = version === 1 ? Number(payload.readBigUInt64BE(24)) : payload.readUInt32BE(16)
              if (scale && duration !== 0xffffffff) durationSeconds = duration / scale
            }
          } else if (atomType === "tkhd" && payload.length >= 8) {
            width = payload.readUInt32BE(payload.length - 8) >>> 16
            height = payload.readUInt32BE(payload.length - 4) >>> 16
          } else if (["trak", "mdia"].includes(atomType)) {
            readAtoms(buffer, payloadStart, position + atomSize)
          }
          position += atomSize
        }
      }
      readAtoms(movie, 0, movie.length)
      if (!durationSeconds) break
      const sourceDuration = durationSeconds
      const preparedDuration = genjutsuDuration(sourceDuration)
      if (requireResolution && width * height < 409_600) throw new HiggsfieldProviderError("Genjutsu Object Swap needs source video resolution of at least 409,600 pixels per frame.", 400)
      return { sourceDuration, duration: preparedDuration, billedSeconds: Math.ceil(preparedDuration), width, height, totalBytes }
    }
    offset += size
  }
  throw new HiggsfieldProviderError("Could not determine the source duration. Upload an MP4 or MOV with valid duration metadata.", 400)
}
