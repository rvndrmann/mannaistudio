import { afterEach, describe, expect, it, vi } from "vitest"
import { HIGGSFIELD_MINIMAX_H3_MODEL, HIGGSFIELD_CINEMA_STUDIO_4_MODEL, HIGGSFIELD_KLING_3_STD_MODEL, HIGGSFIELD_KLING_O3_MODEL, HIGGSFIELD_KLING_O3_VIDEO_MODEL, HIGGSFIELD_SEEDANCE_2_MODEL, HIGGSFIELD_WAN_3_PRIME_MODEL, submitHiggsfieldCinemaStudioVideo, submitHiggsfieldKlingO3Video, submitHiggsfieldKlingO3VideoReference, submitHiggsfieldKlingVideo, submitHiggsfieldMinimaxH3Video, submitHiggsfieldSeedanceVideo, submitHiggsfieldWanVideo, HIGGSFIELD_SEEDANCE_2_5_MODEL, isHiggsfieldSeedance25Model, isHiggsfieldSeedanceModel } from "./higgsfield"
import { generationProvider, higgsfieldTakesAudioReferences, isGenjutsuVideoModel, isImageOnlyVideoModel, isTextOnlyVideoModel, isVideoGenerationModel, videoDurationOptions, videoModelMaxDuration, videoModelNeedsSourceVideo } from "./generation-models"
import { generationModels } from "./model-routing"
import { calculateCreditCost } from "./credits"

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe("MiniMax H3 on Higgsfield", () => {
  it("is offered as a Higgsfield text-to-video model", () => {
    expect(isVideoGenerationModel(HIGGSFIELD_MINIMAX_H3_MODEL)).toBe(true)
    expect(generationProvider(HIGGSFIELD_MINIMAX_H3_MODEL)).toBe("higgsfield")
    expect(isTextOnlyVideoModel(HIGGSFIELD_MINIMAX_H3_MODEL)).toBe(true)
    expect(videoDurationOptions(HIGGSFIELD_MINIMAX_H3_MODEL)).toEqual([5, 6, 8, 10, 12, 15])
    // It is not a Genjutsu model: it starts from text, not from a source clip.
    const routed = generationModels.find((model) => model.model === HIGGSFIELD_MINIMAX_H3_MODEL)
    expect(routed).toMatchObject({ provider: "higgsfield", sources: ["text"], referenceImages: false })
  })

  it("posts the documented body to the model's own path", async () => {
    vi.stubEnv("HF_CREDENTIALS", "key-id:key-secret")
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ request_id: "req_1" }), { status: 200 }))
    const task = await submitHiggsfieldMinimaxH3Video({ prompt: " A cinematic scene at sunset ", duration: 8, aspectRatio: "9:16" })
    expect(task.id).toBe("req_1")
    const [url, init] = request.mock.calls[0]
    expect(url).toBe("https://api.higgsfield.ai/minimax/h3/text-to-video")
    expect(init).toMatchObject({ method: "POST", headers: { Authorization: "Key key-id:key-secret" } })
    expect(JSON.parse(String(init?.body))).toEqual({ prompt: "A cinematic scene at sunset", duration: 8, resolution: "2K", aspect_ratio: "9:16", aigc_watermark: false })
  })

  it("brings duration and ratio inside what the endpoint accepts", async () => {
    vi.stubEnv("HF_CREDENTIALS", "key-id:key-secret")
    const request = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ request_id: "req_2" }), { status: 200 }))
    await submitHiggsfieldMinimaxH3Video({ prompt: "A runner at dawn", duration: 3, aspectRatio: "2:3" })
    await submitHiggsfieldMinimaxH3Video({ prompt: "A runner at dawn", duration: 30 })
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toMatchObject({ duration: 5, aspect_ratio: "auto" })
    expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toMatchObject({ duration: 15, aspect_ratio: "auto" })
    await expect(submitHiggsfieldMinimaxH3Video({ prompt: "   " })).rejects.toThrow("needs a prompt")
  })
})

describe("Seedance 2.0 on Higgsfield", () => {
  it("is offered as a Higgsfield model that takes references", () => {
    expect(isVideoGenerationModel(HIGGSFIELD_SEEDANCE_2_MODEL)).toBe(true)
    expect(generationProvider(HIGGSFIELD_SEEDANCE_2_MODEL)).toBe("higgsfield")
    expect(isGenjutsuVideoModel(HIGGSFIELD_SEEDANCE_2_MODEL)).toBe(false)
    expect(isTextOnlyVideoModel(HIGGSFIELD_SEEDANCE_2_MODEL)).toBe(false)
    expect(videoModelMaxDuration(HIGGSFIELD_SEEDANCE_2_MODEL)).toBe(15)
    const routed = generationModels.find((model) => model.model === HIGGSFIELD_SEEDANCE_2_MODEL)
    expect(routed).toMatchObject({ provider: "higgsfield", sources: ["text", "image"], referenceImages: true, dialogue: true })
  })

  it("posts references, resolution and audio the way the endpoint names them", async () => {
    vi.stubEnv("HF_CREDENTIALS", "key-id:key-secret")
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ request_id: "req_3" }), { status: 200 }))
    const task = await submitHiggsfieldSeedanceVideo({
      prompt: "She laces up and runs",
      duration: 8,
      resolution: "4K",
      aspectRatio: "9:16",
      imageUrls: ["https://cdn.example/a.png", "asset://byteplus-only", "https://cdn.example/a.png"],
      videoUrls: [],
      audioUrls: ["https://cdn.example/voice.mp3"],
      audioEnabled: false,
    })
    expect(task.id).toBe("req_3")
    const [url, init] = request.mock.calls[0]
    expect(url).toBe("https://api.higgsfield.ai/bytedance/seedance-2.0/reference-to-video")
    expect(JSON.parse(String(init?.body))).toEqual({
      prompt: "She laces up and runs",
      duration: 8,
      audio_urls: ["https://cdn.example/voice.mp3"],
      image_urls: ["https://cdn.example/a.png"],
      resolution: "4k",
      aspect_ratio: "9:16",
      generate_audio: false,
    })
  })

  it("holds duration to 4-15 seconds and refuses a request with nothing in it", async () => {
    vi.stubEnv("HF_CREDENTIALS", "key-id:key-secret")
    const request = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ request_id: "req_4" }), { status: 200 }))
    await submitHiggsfieldSeedanceVideo({ imageUrls: ["https://cdn.example/a.png"], duration: 30 })
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({ duration: 15, image_urls: ["https://cdn.example/a.png"], resolution: "720p", aspect_ratio: "16:9", generate_audio: true })
    // The schema requires an image or a clip; a prompt on its own is refused.
    await expect(submitHiggsfieldSeedanceVideo({ prompt: "Just words", imageUrls: ["asset://x"] })).rejects.toThrow("needs a reference image or video")
    await submitHiggsfieldSeedanceVideo({ imageUrls: Array.from({ length: 12 }, (_, n) => `https://cdn.example/${n}.png`), videoUrls: Array.from({ length: 5 }, (_, n) => `https://cdn.example/${n}.mp4`) })
    const capped = JSON.parse(String(request.mock.calls[1][1]?.body))
    expect([capped.image_urls.length, capped.video_urls.length]).toEqual([9, 3])
  })
})

describe("Wan 3.0 Prime on Higgsfield", () => {
  it("is offered as a Higgsfield reference model that runs to 30 seconds", () => {
    expect(isVideoGenerationModel(HIGGSFIELD_WAN_3_PRIME_MODEL)).toBe(true)
    expect(generationProvider(HIGGSFIELD_WAN_3_PRIME_MODEL)).toBe("higgsfield")
    expect(isGenjutsuVideoModel(HIGGSFIELD_WAN_3_PRIME_MODEL)).toBe(false)
    expect(videoModelMaxDuration(HIGGSFIELD_WAN_3_PRIME_MODEL)).toBe(30)
    expect(higgsfieldTakesAudioReferences(HIGGSFIELD_WAN_3_PRIME_MODEL)).toBe(true)
    expect(higgsfieldTakesAudioReferences(HIGGSFIELD_MINIMAX_H3_MODEL)).toBe(false)
  })

  it("posts the documented body and keeps within what Wan offers", async () => {
    vi.stubEnv("HF_CREDENTIALS", "key-id:key-secret")
    const request = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ request_id: "req_5" }), { status: 200 }))
    await submitHiggsfieldWanVideo({ prompt: "A cinematic scene at sunset", duration: 5, resolution: "1080p", aspectRatio: "9:16", imageUrls: ["https://cdn.example/a.png"] })
    const [url, init] = request.mock.calls[0]
    expect(url).toBe("https://api.higgsfield.ai/alibaba/wan-3.0-prime/reference-to-video")
    expect(JSON.parse(String(init?.body))).toEqual({ prompt: "A cinematic scene at sunset", duration: 5, image_urls: ["https://cdn.example/a.png"], resolution: "1080p", aspect_ratio: "9:16", generate_audio: true, enable_thinking: false })
    // No 4K and no 21:9 on this endpoint; six clips become the five it accepts.
    await submitHiggsfieldWanVideo({ prompt: "Wide desert road", duration: 45, resolution: "4K", aspectRatio: "21:9", videoUrls: [1, 2, 3, 4, 5, 6].map((n) => `https://cdn.example/${n}.mp4`) })
    const second = JSON.parse(String(request.mock.calls[1][1]?.body))
    expect(second).toMatchObject({ duration: 30, resolution: "1080p", aspect_ratio: "adaptive" })
    expect(second.video_urls).toHaveLength(5)
    await expect(submitHiggsfieldWanVideo({ prompt: "  ", imageUrls: ["https://cdn.example/a.png"] })).rejects.toThrow("needs a prompt")
  })
})

describe("Kling 3.0 Standard on Higgsfield", () => {
  it("is offered as a Higgsfield model that needs a start image", () => {
    expect(isVideoGenerationModel(HIGGSFIELD_KLING_3_STD_MODEL)).toBe(true)
    expect(generationProvider(HIGGSFIELD_KLING_3_STD_MODEL)).toBe("higgsfield")
    expect(isImageOnlyVideoModel(HIGGSFIELD_KLING_3_STD_MODEL)).toBe(true)
    const routed = generationModels.find((model) => model.model === HIGGSFIELD_KLING_3_STD_MODEL)
    expect(routed).toMatchObject({ provider: "higgsfield", sources: ["image"] })
  })

  it("posts the start image, sound and duration, and an end image when there is one", async () => {
    vi.stubEnv("HF_CREDENTIALS", "key-id:key-secret")
    const request = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ request_id: "req_6" }), { status: 200 }))
    await submitHiggsfieldKlingVideo({ imageUrl: "https://cdn.example/start.png", duration: 5 })
    const [url, init] = request.mock.calls[0]
    expect(url).toBe("https://api.higgsfield.ai/kling-video/v3.0/std/image-to-video")
    expect(JSON.parse(String(init?.body))).toEqual({ sound: "on", duration: 5, cfg_scale: 0.5, image_url: "https://cdn.example/start.png", multi_shots: false })
    await submitHiggsfieldKlingVideo({ prompt: "She turns to camera", imageUrl: "https://cdn.example/start.png", lastImageUrl: "https://cdn.example/end.png", duration: 40, audioEnabled: false })
    expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toEqual({ sound: "off", prompt: "She turns to camera", duration: 15, cfg_scale: 0.5, image_url: "https://cdn.example/start.png", multi_shots: false, last_image_url: "https://cdn.example/end.png" })
    await expect(submitHiggsfieldKlingVideo({ prompt: "No picture", imageUrl: "asset://x" })).rejects.toThrow("needs a start image")
  })
})

describe("Kling O3 on Higgsfield", () => {
  it("is a Higgsfield model, not a Genjutsu one", () => {
    expect(isVideoGenerationModel(HIGGSFIELD_KLING_O3_MODEL)).toBe(true)
    expect(generationProvider(HIGGSFIELD_KLING_O3_MODEL)).toBe("higgsfield")
    expect(isGenjutsuVideoModel(HIGGSFIELD_KLING_O3_MODEL)).toBe(false)
    expect(videoModelMaxDuration(HIGGSFIELD_KLING_O3_MODEL)).toBe(15)
  })

  it("maps resolution to a quality tier and splits the opening frame from the references", async () => {
    vi.stubEnv("HF_CREDENTIALS", "key-id:key-secret")
    const request = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ request_id: "req_7" }), { status: 200 }))
    await submitHiggsfieldKlingO3Video({ prompt: "He sprints down the wing", duration: 5, resolution: "720p", aspectRatio: "16:9", imageUrls: ["https://cdn.example/a.png"], audioEnabled: false })
    const [url, init] = request.mock.calls[0]
    expect(url).toBe("https://api.higgsfield.ai/kling-video/o3/image-reference")
    expect(JSON.parse(String(init?.body))).toEqual({ mode: "std", sound: "off", prompt: "He sprints down the wing", duration: 5, shot_type: "customize", image_urls: ["https://cdn.example/a.png"], multi_shots: false, aspect_ratio: "16:9" })
    await submitHiggsfieldKlingO3Video({ prompt: "Close on the boots", duration: 20, resolution: "4K", aspectRatio: "21:9", imageUrls: ["https://cdn.example/first.png", "https://cdn.example/b.png"], firstFrameUrl: "https://cdn.example/first.png", lastFrameUrl: "https://cdn.example/last.png" })
    const second = JSON.parse(String(request.mock.calls[1][1]?.body))
    expect(second).toMatchObject({ mode: "4k", sound: "on", duration: 15, image_urls: ["https://cdn.example/b.png"], first_frame_url: "https://cdn.example/first.png", last_frame_url: "https://cdn.example/last.png" })
    // 21:9 is not offered here, so the ratio is left for the model to take from the images.
    expect(second).not.toHaveProperty("aspect_ratio")
    await expect(submitHiggsfieldKlingO3Video({ prompt: " ", imageUrls: ["https://cdn.example/a.png"] })).rejects.toThrow("needs a prompt")
  })
})

describe("Cinema Studio 4.0 on Higgsfield", () => {
  it("is offered up to 30 seconds", () => {
    expect(isVideoGenerationModel(HIGGSFIELD_CINEMA_STUDIO_4_MODEL)).toBe(true)
    expect(generationProvider(HIGGSFIELD_CINEMA_STUDIO_4_MODEL)).toBe("higgsfield")
    expect(isGenjutsuVideoModel(HIGGSFIELD_CINEMA_STUDIO_4_MODEL)).toBe(false)
    expect(videoModelMaxDuration(HIGGSFIELD_CINEMA_STUDIO_4_MODEL)).toBe(30)
  })

  it("sends the published fields, at a resolution it renders", async () => {
    vi.stubEnv("HF_CREDENTIALS", "key-id:key-secret")
    const request = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ request_id: "req_8" }), { status: 200 }))
    await submitHiggsfieldCinemaStudioVideo({ prompt: "A cinematic portrait in soft natural light", duration: 8, resolution: "1080p", aspectRatio: "9:16", imageUrls: ["https://cdn.example/a.png", "asset://x"] })
    const [url, init] = request.mock.calls[0]
    expect(url).toBe("https://api.higgsfield.ai/higgsfield/cinema-studio/4.0")
    expect(init).toMatchObject({ headers: { Authorization: "Key key-id:key-secret" } })
    expect(JSON.parse(String(init?.body))).toEqual({ prompt: "A cinematic portrait in soft natural light", duration: 8, resolution: "720p", aspect_ratio: "9:16", generate_audio: true, image_urls: ["https://cdn.example/a.png"] })
    await submitHiggsfieldCinemaStudioVideo({ prompt: "Continue the chase", videoUrls: ["https://cdn.example/prev.mp4"], audioUrls: ["https://cdn.example/voice.mp3"] })
    expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toEqual({ prompt: "Continue the chase", duration: 5, resolution: "720p", generate_audio: true, video_urls: ["https://cdn.example/prev.mp4"], audio_urls: ["https://cdn.example/voice.mp3"] })
    await expect(submitHiggsfieldCinemaStudioVideo({ prompt: "" })).rejects.toThrow("needs a prompt")
  })
})

describe("Kling O3 Video Reference on Higgsfield", () => {
  it("is routed as a model that needs a source clip, up to 10 seconds", () => {
    expect(isVideoGenerationModel(HIGGSFIELD_KLING_O3_VIDEO_MODEL)).toBe(true)
    expect(generationProvider(HIGGSFIELD_KLING_O3_VIDEO_MODEL)).toBe("higgsfield")
    expect(videoModelNeedsSourceVideo(HIGGSFIELD_KLING_O3_VIDEO_MODEL)).toBe(true)
    // Needing a source clip does not make it a Genjutsu model.
    expect(isGenjutsuVideoModel(HIGGSFIELD_KLING_O3_VIDEO_MODEL)).toBe(false)
    expect(videoModelMaxDuration(HIGGSFIELD_KLING_O3_VIDEO_MODEL)).toBe(10)
    expect(videoDurationOptions(HIGGSFIELD_KLING_O3_VIDEO_MODEL)).toEqual([4, 5, 6, 8, 10])
    const routed = generationModels.find((model) => model.model === HIGGSFIELD_KLING_O3_VIDEO_MODEL)
    expect(routed).toMatchObject({ provider: "higgsfield", sources: ["video"], dialogue: false })
  })

  it("posts the prompt and one source clip, and refuses a request without either", async () => {
    vi.stubEnv("HF_CREDENTIALS", "key-id:key-secret")
    const request = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ request_id: "req_9" }), { status: 200 }))
    await submitHiggsfieldKlingO3VideoReference({ prompt: "A cinematic scene at sunset", duration: 5, resolution: "1080p", videoUrls: ["https://cdn.example/input.mp4", "https://cdn.example/second.mp4"] })
    const [url, init] = request.mock.calls[0]
    expect(url).toBe("https://api.higgsfield.ai/kling-video/o3/video-reference")
    expect(JSON.parse(String(init?.body))).toEqual({ mode: "pro", prompt: "A cinematic scene at sunset", duration: 5, video_urls: ["https://cdn.example/input.mp4"] })
    await submitHiggsfieldKlingO3VideoReference({ prompt: "Same move, new jersey", duration: 15, resolution: "720p", aspectRatio: "9:16", imageUrls: ["https://cdn.example/jersey.png"], videoUrls: ["https://cdn.example/input.mp4"] })
    expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toEqual({ mode: "std", prompt: "Same move, new jersey", duration: 10, image_urls: ["https://cdn.example/jersey.png"], video_urls: ["https://cdn.example/input.mp4"], aspect_ratio: "9:16" })
    await expect(submitHiggsfieldKlingO3VideoReference({ prompt: "No clip", videoUrls: [] })).rejects.toThrow("needs a source video")
    await expect(submitHiggsfieldKlingO3VideoReference({ prompt: " ", videoUrls: ["https://cdn.example/input.mp4"] })).rejects.toThrow("needs a prompt")
  })
})

describe("Seedance 2.5 on Higgsfield", () => {
  // A fresh response each call: a body can be read only once.
  const accept = () => vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ request_id: "req_25" }), { status: 200 }))
  const sent = (request: ReturnType<typeof accept>) => JSON.parse(String(request.mock.calls[0][1]?.body))

  it("is offered as a Higgsfield video model that runs to thirty seconds and can start from text", () => {
    expect(isVideoGenerationModel(HIGGSFIELD_SEEDANCE_2_5_MODEL)).toBe(true)
    expect(generationProvider(HIGGSFIELD_SEEDANCE_2_5_MODEL)).toBe("higgsfield")
    expect(isHiggsfieldSeedanceModel(HIGGSFIELD_SEEDANCE_2_5_MODEL)).toBe(true)
    expect(isHiggsfieldSeedance25Model(HIGGSFIELD_SEEDANCE_2_MODEL)).toBe(false)
    expect(videoModelMaxDuration(HIGGSFIELD_SEEDANCE_2_5_MODEL)).toBe(30)
    expect(videoModelMaxDuration(HIGGSFIELD_SEEDANCE_2_MODEL)).toBe(15)
    expect(higgsfieldTakesAudioReferences(HIGGSFIELD_SEEDANCE_2_5_MODEL)).toBe(true)
    expect(generationModels.find((model) => model.model === HIGGSFIELD_SEEDANCE_2_5_MODEL)).toMatchObject({ provider: "higgsfield" })
    expect(calculateCreditCost(HIGGSFIELD_SEEDANCE_2_5_MODEL, "video", 10)).toBe(870)
  })

  it("posts the documented body to its own path", async () => {
    vi.stubEnv("HF_CREDENTIALS", "key-id:key-secret")
    const request = accept()
    const task = await submitHiggsfieldSeedanceVideo({ model: HIGGSFIELD_SEEDANCE_2_5_MODEL, prompt: " A slow dolly in ", duration: 13, resolution: "1080p", aspectRatio: "16:9", imageUrls: ["https://cdn.example/frame.png"], audioEnabled: false })
    expect(task.id).toBe("req_25")
    expect(request.mock.calls[0][0]).toBe("https://api.higgsfield.ai/bytedance/seedance-2.5/reference-to-video")
    expect(request.mock.calls[0][1]).toMatchObject({ method: "POST", headers: { Authorization: "Key key-id:key-secret" } })
    expect(sent(request)).toEqual({ prompt: "A slow dolly in", duration: 13, image_urls: ["https://cdn.example/frame.png"], resolution: "1080p", aspect_ratio: "16:9", output_format: "mp4", generate_audio: false })
  })

  it("starts from a prompt alone, holds the length to 4 to 30 seconds, and has no 4k", async () => {
    vi.stubEnv("HF_CREDENTIALS", "key-id:key-secret")
    const request = accept()
    await submitHiggsfieldSeedanceVideo({ model: HIGGSFIELD_SEEDANCE_2_5_MODEL, prompt: "Just words", duration: 45, resolution: "4K" })
    expect(sent(request)).toMatchObject({ prompt: "Just words", duration: 30, resolution: "1080p" })
    expect(sent(request)).not.toHaveProperty("image_urls")
    request.mockClear()
    await submitHiggsfieldSeedanceVideo({ model: HIGGSFIELD_SEEDANCE_2_5_MODEL, prompt: "Short", duration: 1 })
    expect(sent(request).duration).toBe(4)
    await expect(submitHiggsfieldSeedanceVideo({ model: HIGGSFIELD_SEEDANCE_2_5_MODEL, imageUrls: ["asset://x"] })).rejects.toThrow("needs a prompt or a reference")
  })

  it("leaves Seedance 2.0 exactly as it was when no model is named", async () => {
    vi.stubEnv("HF_CREDENTIALS", "key-id:key-secret")
    const request = accept()
    await submitHiggsfieldSeedanceVideo({ imageUrls: ["https://cdn.example/a.png"], duration: 30 })
    expect(request.mock.calls[0][0]).toBe("https://api.higgsfield.ai/bytedance/seedance-2.0/reference-to-video")
    expect(sent(request).duration).toBe(15)
    expect(sent(request)).not.toHaveProperty("output_format")
  })
})
