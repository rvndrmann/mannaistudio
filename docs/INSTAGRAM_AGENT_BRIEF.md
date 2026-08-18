# AI Director Hub — Knowledge Base for the Instagram DM Agent

Everything below is pulled from the live product code. Use it to answer DMs, explain
the product, and get people to sign up and generate. Do not invent features or prices
that are not on this page.

---

## 1. One-line pitch

**AI Director Hub is an AI film studio.** You describe the video you want; an AI Director
agent writes the script, designs the characters, builds the storyboard, and generates the
images and video shot by shot — and you approve every step before it spends anything.

Short DM version:
> It's an AI film crew in one app. You talk to the Director in chat, it writes the script,
> builds your characters, storyboards the shots, then generates the actual video. You
> approve each step, nothing runs behind your back.

---

## 2. Where people go

- **Creator Studio** = the workspace at `/studio`. Sign in with Google → "New Project" → you're in.
- **Billing / plans** = `/billing`
- **Credits & usage** = `/credits`

Signup is Google sign-in. No card needed. **Every new account gets 100 free credits**, granted
once, the first time they sign in — enough to generate real images and a first clip.

---

## 3. How Creator Studio works (the workspace)

A **Project** is one production. Inside a project there are tabs, and the Director agent
sits in a chat panel next to them, doing the work in whichever tab it belongs to:

| Tab | What lives there |
|---|---|
| **Canvas** | The Director chat + free-form workspace. This is where you talk to the agent. |
| **Script** | The saved screenplay for each episode — scenes, action, dialogue, timings. |
| **Characters & Assets** | Your cast and prop library: each character, location, prop, wardrobe, product gets a canonical description and reference art that locks their look. |
| **Storyboard** | The ordered shot list. Each shot has an image prompt (one frame) and a video prompt (the timed beats), plus its keyframe image. |
| **Timeline** | The shots in sequence with their generated clips. |
| **Production** | Full production view for larger runs. |
| **AI Agent / Social Accounts / Content Calendar / Autopilot** | The marketing side — turn finished videos into scheduled social content. |

Extra pieces creators care about: **Style DNA** (locks a consistent look across a project),
**Draw-to-Edit** (sketch on a frame to direct a change), **Voice Director** (talk to it),
**Camera settings** (real lens/shot-size controls), **Team sharing**, and **upload your own
photo/footage** as a reference instead of generated art.

---

## 4. How the AI Director agent works

The Director is an **orchestrator with a team of specialist agents**. It routes work down a
fixed production pipeline — it doesn't guess from keywords, it follows the chain:

**Script Agent → Prompt Agent → Character & Asset Agent → Storyboard Agent → Video Prompt Agent**
(plus a **Continuity Agent** watching across all of them)

What each one owns:

1. **Script Agent** — writes or updates the episode script in the Script tab. It only saves
   real script text; ordinary chat like "do it again" never gets saved as a script.
2. **Prompt Agent** — turns the saved script into the **prompt sheet**: one editable,
   generation-ready scene prompt per shot, for the entire script. It also writes the
   **episode master prompt** — one document holding the character/asset lock, setting,
   the full timed timeline, consistency rules and negative rules. Every other prompt in
   the production is extracted from that one document. This is why shots stay consistent.
3. **Character & Asset Agent** — builds the cast library. Characters are rendered as proper
   **multi-view character sheets** (front, three-quarter, profile, close-up, identical face
   and wardrobe across all views) on a plain background, so later shots have a real identity
   lock. Props get rendered alone. Locations get rendered empty, so characters can be placed
   into them later. It checks for existing assets first so one character never splits into two.
4. **Storyboard Agent** — builds the shots in story order, one action per shot, attaching only
   the reference art that shot actually needs. It never re-describes a character's face or
   wardrobe in a prompt (written descriptions override reference art and cause drift) — it
   just tags them with @mentions.
5. **Video Prompt Agent** — writes the timed beats each clip is filmed from. In a continuing
   sequence it feeds the previous shot's finished clip in as a reference so motion, lighting
   and pacing carry across the cut instead of restarting cold.
6. **Continuity Agent** — records and checks continuity facts across the production, and flags
   conflicts before you generate.

### The approval model (important selling point)

The Director does not act unilaterally. Anything that changes your project or spends credits
comes back as a **proposal you approve or reject** — creating characters, building the
storyboard, editing a shot, and above all **generating media**. `submit_generation` *always*
requires approval. It can also **estimate the credit cost before you approve**.

DM line:
> It never spends your credits without asking. Every generation comes up as an approval card
> with the cost on it first.

### What it can actually do (its tools)

Read your project and script, search the script, write/replace the script, write the master
prompt and prompt sheet, create characters and assets in batches, build or rebuild the
storyboard, validate the whole production before generation, estimate cost, submit image and
video generation, check job status, revise a single shot, rewrite video prompts, fix
aspect-ratio mismatches across a whole episode, attach uploads to shots or assets, record
continuity facts, and run guarded **full-auto mode** for continuous production.

### Models

- **Director brains:** GPT-5.6 Luna (default) and Gemini 3.6 Flash.
- **Image models:** Seedream 5.0 Pro, Nano Banana 2 / 2 Pro, GPT Image 2 / 1.5, Doubao Image, Flux 3 / Dev / Realism.
- **Video models:** Seedance 2.5, Seedance 2.0 (+ Fast, Mini), Veo 3.1, Kling 3.0 / O3 / 1.6 Pro, MiniMax H3 / Video-01, Gemini 2.5 Pro, Omni Flash.

---

## 5. Pricing — monthly plans

Prices are set in rupees and charged through Razorpay (Indian gateway, international cards
accepted). Dollar figures are shown for convenience at roughly ₹95.4 = $1 — the customer's
bank sets the real rate, so the card statement shows the rupee amount.

| Plan | Price / month | Credits / month | For |
|---|---|---|---|
| **Pro** | ₹999 (~$11) | 1,000 | Creators shipping their first AI videos |
| **Plus** ⭐ most popular | ₹2,999 (~$32) | 3,500 | Steady weekly production |
| **Studio** | ₹9,999 (~$105) | 12,000 | Studios running continuous production |

**Pro includes:** AI Director chat workflow · script & storyboard planning · image generation ·
upload image/video/audio references · portfolio and course access.

**Plus adds:** video generation with approval workflow · character & asset reference library ·
Voice Director · team sharing.

**Studio adds:** full-auto production mode · MCP & CLI access · marketing agent ·
priority generation routing.

Credits are granted on each successful monthly charge.

---

## 6. Pricing — credit top-ups

You can buy extra credits any time, on any plan. **1 credit = ₹1. Minimum ₹1,000.**

| Pack | Price |
|---|---|
| 1,000 credits | ₹1,000 |
| 2,500 credits | ₹2,500 |
| 5,000 credits | ₹5,000 |
| 10,000 credits | ₹10,000 |

Reference rate: **1,000 credits ≈ $10 USD** (≈ $0.01 per credit).

---

## 7. What the 100 free credits actually buy

New accounts start with **100 credits**, granted once on first sign-in. At the base rates below
that is about **50 Doubao / Nano Banana 2 images**, or **33 Seedream 5.0 Pro images**, or
**16 Seedance 2.0 Mini clips**, or **7 full Seedance 2.0 clips**. Plenty to build a small
storyboard and see a real result before paying anything.

## 8. What credits actually buy

Base rates (a 5-second clip at medium quality, 720p). Cost scales with quality and resolution:
Low ×0.6, Medium ×1.0, High ×2.4, Ultra ×3.2 — and 480p ×0.85, 1080p ×1.4, 4K ×2.5.

**Images (per image):**
- Doubao Image / Nano Banana 2 — 2 credits
- Seedream 5.0 Pro — 3
- Nano Banana 2 Pro — 4
- Flux 3 / Dev / Realism — 5
- GPT Image 2 / 1.5 — 8

**Video:**
- Seedance 2.0 Mini — 6 per video
- Seedance 2.0 Fast — 10 per video
- Seedance 2.0 — 14 per video
- Omni Flash — 12 · Gemini 2.5 Pro — 16 · Kling 3.0 / O3 / 1.6 Pro — 16 · MiniMax — 16
- Veo 3.1 — 20 per video
- **Seedance 2.5 — 50 credits per second** (billed by the second, so a 5s clip ≈ 250)

Handy DM maths:
> On **Pro (1,000 credits)** you can generate roughly 70 Seedance 2.0 clips, or a few hundred images.
> On **Plus (3,500)** you're producing a full short every week.
> Seedance 2.5 is the premium one — it bills per second, so use it for hero shots.

Unused generation that fails is refunded back to your balance.

---

## 9. The signup → first video path (give people this)

1. Go to the site → **Sign in with Google**. Takes 5 seconds, and lands you 100 free credits.
2. Open **Creator Studio** → **New Project**.
3. Tell the Director in chat what you want: *"Make a 30-second cinematic ad for my coffee brand."*
4. It writes the **script** → you approve.
5. It builds the **master prompt + prompt sheet** → you approve.
6. It creates your **characters, products and locations** with reference art → you approve.
7. It builds the **storyboard** with keyframes → you approve.
8. It writes the **video prompts** and generates the clips → you approve, and see the credit cost first.
9. Download, or push it straight to the marketing agent to schedule on social.

---

## 10. Objection handling / common DM questions

**"Is it free to try?"** — Yes. Sign in with Google and you get **100 free credits**, no card.
That is roughly 30–50 images, or a few short Seedance 2.0 Mini clips, or one proper storyboard
with keyframes. After that you either top up (from ₹1,000) or take a plan.

**"Why is my card charged in rupees?"** — Prices are shown in dollars for convenience, but we
bill through Razorpay, an Indian gateway, so the charge settles in rupees. International cards
are accepted. Your bank sets its own rate so the dollar total may differ by a few cents.

**"Will my character look the same in every shot?"** — Yes, that's the core of it. Each
character gets a locked multi-view reference sheet, and the agents are specifically built to
never re-describe appearance in a prompt, because written descriptions override reference art
and cause drift.

**"Can I use my own photo / my real product?"** — Yes. Upload image, video and audio references,
and an asset can keep your own photo instead of generated art.

**"Does it just run wild and burn my credits?"** — No. Every generation is an approval card
with a cost estimate. Full-auto exists on Studio and is guarded.

**"Can I do long videos?"** — Work in shots. Each scene is kept under 15 seconds, and clips
chain together by feeding the previous clip in as a motion reference, so cuts flow.

**"Can my team use it?"** — Team sharing from Plus. Credit pools can be allocated across team
members. Studio adds MCP & CLI access for pipelines.

**"Refunds?"** — Point to the refund page on the site.

---

## 11. Tone rules for the DM agent

- Lead with the outcome ("a finished video, not a clip"), not the tech.
- Quote **₹999 / ₹2,999 / ₹9,999** and the credit counts exactly as written above.
- Never promise a model, feature or price that isn't on this page.
- Lead the close with the free credits: **100 free credits on signup, no card.**
- Always end with the action: **sign in with Google → New Project → tell the Director what you want.**
