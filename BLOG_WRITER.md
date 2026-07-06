# Blog Writer — standing instructions

This is the procedure the AI (Claude) follows on every run, whether triggered
manually or by the 6×/day schedule. Goal: publish-worthy SEO articles that rank
AI Director Hub for **"AI video course"** and **"AI film making course"**, each
showing a *real* example generated in the Higgsfield ("Zopia") workspace.

Every post lands as **`pending_review`** — an admin approves it in
`/admin → Blog` before it ever goes live.

---

## Run procedure (one post per run)

### 1. Pick the next topic
Query Supabase for the next unused keyword:
```sql
select id, keyword, target_url, cluster
from blog_topics
where status = 'todo'
order by created_at
limit 1;
```
After the post is ingested, mark it used:
```sql
update blog_topics set status = 'used' where id = '<id>';
```
(Topics live in the `blog_topics` table, seeded in migration `20260701120000_blog_extend.sql`. Add more keywords there any time.)

### 2. Gather 1–3 REAL examples from Higgsfield
Use the Higgsfield MCP (server id `b0fa19a5-…`):
- `show_generations` / `show_medias` — browse recent generations.
- For each example capture: the **media URL** (video or image), its **poster/thumbnail** if a video, the exact **prompt**, and the **model** (e.g. `Seedance 2.0`).
Pick examples that match the article's keyword (a cinematic shot for a cinematic
post, a product clip for an e-commerce post, etc.).

> **EXCLUDED SOURCE — do not use:** Never pull, reference, or publish any media,
> prompts, or generations from the **"Play Scene 2" / "PLAY episode" project**
> (e.g. files/folders named `play_scene_2_storyboard_images_*`, `play episode 4`,
> `PLAY_*`, `POWER_PLAY_*`, or any "Scene N" assets tied to that storyline). That
> project's content is off-limits for the public blog. If a Higgsfield
> generation's title, folder, or prompt mentions "Play"/"PLAY" scenes/episodes,
> skip it and pick a different example.

> Note: Higgsfield URLs can expire. If a post's media 404s later, re-generate or
> re-host. (A future upgrade re-hosts media into a Supabase `blog-media` bucket.)

### 3. Write the article (HTML body)
- 900–1400 words, genuinely useful — a real tutorial/breakdown, not filler.
- **Structure:** one implied `<h1>` (the title field — do NOT repeat it in the body), then `<h2>`/`<h3>` sections, `<p>`, `<ul>`/`<ol>`.
- **On-page SEO:** target keyword in the title, the slug, the first paragraph, and one `<h2>`. Meta description ≤ 155 chars containing the keyword.
- **Internal links:** at least one `<a href="/courses">…</a>` in the body (the ranking target). The template already adds a course CTA at the end, so the body just needs natural in-context links.
- **Inline media (optional):** you may embed examples directly in the body with
  lazy attributes so the page stays fast:
  - image: `<img src="…" loading="lazy" decoding="async" alt="…">`
  - video: `<video src="…" poster="…" preload="none" controls playsinline></video>`
  Anything you put in the `media` array is also rendered as an "Examples"
  gallery with prompt + model shown — so prefer putting examples in `media`.

### 4. Ingest as pending review
POST the finished draft to the site's ingest endpoint:
```bash
curl -X POST "https://www.aidirectorhub.com/api/blog/ingest" \
  -H "Content-Type: application/json" \
  -H "x-ingest-secret: $BLOG_INGEST_SECRET" \
  -d '{
    "title": "...",
    "slug": "...",                 // optional; auto from title
    "excerpt": "...",
    "meta_description": "...",      // ≤155 chars
    "keywords": "kw1, kw2, kw3",
    "cover_image": "https://…",
    "content": "<h2>…</h2><p>…</p>",
    "media": [
      { "type": "video", "url": "https://…", "poster": "https://…",
        "prompt": "…", "model": "Seedance 2.0", "caption": "…" }
    ]
  }'
```
A `201` with `{ "status": "pending_review" }` means success. The admin will see
it under **Pending review** in the dashboard.

(For local testing, use `http://localhost:3000/api/blog/ingest`.)

---

## Quality bar (reject your own draft if any fail)
- Keyword present in title, slug, first paragraph, one `<h2>`, meta description.
- Meta description ≤ 155 chars and reads like ad copy.
- At least one real Higgsfield example with its actual prompt + model.
- At least one internal link to `/courses`.
- No invented facts, no duplicate of an existing post's angle.

---

## Scheduling (6 posts/day)
Run every 4 hours = 6×/day. This is set up as a scheduled cloud routine whose
prompt is: *"Follow BLOG_WRITER.md in the mannaistudio repo and produce exactly
one new blog post."* Prerequisites before enabling the schedule:
1. `BLOG_INGEST_SECRET` + `SUPABASE_SERVICE_ROLE_KEY` set in production env.
2. The ingest route deployed and reachable.
3. One successful manual run verified end-to-end (draft appears as pending review).
