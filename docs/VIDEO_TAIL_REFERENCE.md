# Video Tail Reference — Deferred

**Status:** on hold. Nothing built. Video references themselves already ship; only the
trimming of a reference clip is deferred.

The intent is that a shot inherits motion, lighting, and pacing from the shot
before it by passing that shot's closing seconds as a reference, instead of every
shot restarting cold.

## What already works

Seedance accepts finished clips as references alongside images in the same
`content` array. This is wired up:

- `submitBytePlusVideo` emits `video_url` entries, capped per model.
- The video route accepts `referenceVideos`, plus a `continueFromPreviousShot`
  flag that finds the nearest earlier shot with a finished video and chains it in.
- The Storyboard Agent's instruction describes the chaining and the duration
  budget.

What is **not** built: cutting a clip down to its last few seconds. Today the
whole previous clip is passed.

## Provider limits

| | Seedance 2.0 | Seedance 2.5 |
| :--- | :--- | :--- |
| Video references | 3 | 10 |
| Total reference duration | 15s | 30s |
| Format | URL only, no inline upload | URL only |

The duration budget is the reason trimming matters. Three untrimmed six-second
clips exceed 15 seconds; three trimmed tails do not.

## Why this is not a small change

The ffmpeg command is trivial and cheap:

```bash
ffmpeg -sseof -5 -i input.mp4 -c copy tail.mp4
```

`-sseof -5` seeks five seconds from the end and `-c copy` stream-copies with no
decode or encode, so it is lossless and sub-second. ffmpeg can also read an
HTTPS URL directly using range requests, so the caller never needs the whole
file — it seeks near the end of a signed Supabase URL.

The work is nothing. The problem is where the binary lives.

**Netlify Functions cap at 50MB unzipped, and the `ffmpeg-static` Linux binary is
roughly 78MB on its own.** It cannot be bundled. Background Functions raise the
runtime to 15 minutes but keep the same 50MB bundle limit, so they do not help.
Vercel's 250MB would fit the binary, but Vercel advises against ffmpeg in
functions regardless.

## Options when this is picked up

| Option | Infrastructure | Cost | Runs unattended |
| :--- | :--- | :--- | :--- |
| Small ffmpeg container (Fly.io, Cloud Run, Railway) | One image, one endpoint | ~$0–5/mo, scales to zero | Yes |
| Hosted video API (Shotstack, Transloadit, Cloudinary, Mux) | None | Per operation | Yes |
| Browser-side (ffmpeg.wasm, WebCodecs) | None | Free | No — the tab must be open |
| Download ffmpeg to /tmp at runtime | None | Free | Fragile: ~80MB per cold start |

### Recommendation

A small ffmpeg container, with the tail cut **at generation time rather than at
reference time**.

When a shot's video completes and is saved — the existing polling step already
does this — store a short tail alongside it. Chaining then becomes a plain
lookup: no latency on the generation path, and a failed trim never blocks a
generation.

Browser-side trimming is tempting because it is free, but it breaks as soon as a
project runs unattended, which full-auto mode and enterprise engagements both
require. That rules it out for this product.

## Before spending anything

**Test the untrimmed chain first.** With three references against a 15 second
budget, trimming only matters once clips exceed about five seconds each. Shots of
four to six seconds can already chain two or three raw clips within budget, and
the shipped code caps at three. Confirm that continuity actually improves before
adding infrastructure to improve it further.

**`-sseof` against a Supabase signed URL is unverified.** Range-request seeking on
remote input is documented behaviour, but signed URLs and CDN caching can
interfere. This is a short test, and it should happen before the design is
committed to.

## Sources

- [Netlify Background Functions](https://docs.netlify.com/build/functions/background-functions/)
- [Netlify 50MB function size limit](https://answers.netlify.com/t/the-function-ssr-engine-is-larger-than-the-50mb-limit-please-consider-reducing-it/102379)
- [Vercel ffmpeg serverless limits](https://verygoodffmpeg.com/blog/vercel-ffmpeg-video-processing-serverless-functions-limits-2026)
- [Lossless trimming with `-c copy`](https://32blog.com/en/ffmpeg/ffmpeg-lossless-cut-fast)
- [Trimming from the end with `-sseof`](https://www.plainlyvideos.com/blog/ffmpeg-trim-videos)
- [Seedance reference limits](https://github.com/paperfoot/seedance-cli)
- [BytePlus ModelArk documentation](https://docs.byteplus.com/en/docs/ModelArk/2291680)
