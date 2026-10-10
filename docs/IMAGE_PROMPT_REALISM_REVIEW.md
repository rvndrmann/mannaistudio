# Photographic prompt upgrade — local review

Implemented locally; no production deployment, Git push, paid image generation, or live database instruction update was performed.

## Changes and preserved behavior

- `src/lib/studio/image-prompt-composition.ts`: shared `composeImagePrompt`, photographic medium detection, scene-specific physical treatment, authoring supplement, adapter reference checks and Soul length validation. The layer is additive, scoped to applicable photographic requests, and idempotent. The base subject wording, explicit camera settings, reference identity and approved wardrobe remain authoritative. Unknown exposure values and artificial light sources are not invented.
- `conversation.ts` and `director-agent.ts`: append the photographic authoring supplement after existing instructions. Existing Director and specialist roles, live admin instructions, workflow tools and approvals remain intact. The supplement explicitly supersedes conflicting house defaults only for applicable image authoring.
- `project-image-render.ts`: the image-panel/shot/asset path composes base prompt, selected optics, ratio, compatible house style/Style DNA, physical treatment and likeness/wardrobe context through the shared composer. Draw-to-edit skips the treatment to avoid permission to re-render an approved frame.
- `execute-generation.ts`: Director reference-art and storyboard generation use the same composer once per image job. The exact resolved prompt and version are recorded in generation job settings. No video prompt construction changes.
- `quick-generation.ts` and `api/studio/generate/image/route.ts`: photographic Quick Create inputs use `composeQuickImagePrompt`; the standalone video helper is unchanged. Unspecified medium is not automatically treated as photography.
- `entity-image-workflow.ts`: removes the 8K reference-sheet tag and the contradictory no-grid clause for character sheets; keeps the existing reference-sheet workflow and preserves approved product lettering on props/assets. Stylized sheets no longer have a hard-coded photographic subject sentence.
- `camera-settings.ts`: untouched character/shot defaults now use f/4 rather than f/1.4; saved project presets and user overrides still win. Removes 8K/ultra-detailed/HDR tail language. The realism brief selects context-appropriate camera guidance rather than imposing one universal focal length.
- `project-image-generation.ts`: the shared standalone project-image utility also applies the composer before provider dispatch.
- `openai.ts`, `google.ts`, `byteplus.ts`, `fal.ts`, `higgsfield.ts`: transport guards leave composed prompt text intact. Soul rejects overlong prompts rather than slicing off critical locks. Google and fal checks refuse references that their current adapter cannot carry. Text-only Flux no longer pretends to use a reference image; selected Flux canvases no longer always become square. Existing model IDs, quality, resolution, billing/account selection and provider parameters otherwise remain in place.

## Database

No migration and no live `site_settings` update. Existing live agent text is retained. Updated code supplies a targeted authoring supplement when deployed; stored user prompts are not bulk rewritten. New image jobs additionally snapshot `settings.resolvedPrompt` and `settings.imagePromptVersion` using existing JSON fields.

Validation: full suite **1,380 passed, 13 skipped**; TypeScript passed; both edge bundles built locally. No edge function was deployed.

## Tests and limits

Six scenario snapshots below are deterministic composer outputs, exercised through mocked outgoing OpenAI image payloads. No image model was actually called. Additional tests cover explicit optics, repeated composition, identity/wardrobe across two shots, character grids, packaging text, illustrated Style DNA, explicit animation override, draw edits, Soul limits, unsupported references, Flux canvas selection, video preservation and production-path wiring. This is prompt/payload verification, not visual quality validation against generated images.

Scene classification is intentionally conservative and rule-based. It cannot infer every hidden material, light source, real sunrise location/date or exposure setting. Existing user-authored contradictions are not silently deleted; explicit choices remain authoritative. Old live instructions still exist, with the new supplement defining precedence. Unknown upstream character limits are not invented. Higgsfield's existing `enhance_prompt` setting is preserved; provider-side enhancement may still alter wording. Reference compatibility checks may surface errors for jobs that previously silently lost references; choose a compatible model rather than expect text-only endpoints to preserve likeness. Some provider output sizes remain discrete approximations as before. No guarantee of visual identity or realism is made without a separate, approved visual generation test.

The Flux capability correction is based on official endpoint schemas:
- https://fal.ai/models/fal-ai/flux/dev/api
- https://fal.ai/models/fal-ai/flux-pro/v1.1/api
- https://fal.ai/models/fal-ai/flux-realism/api

## Exact before-and-after prompts

The before values reproduce the prior composition for the same fixture base prompt, style, ratio and entity context. These fixtures are not historical saved user jobs or newly model-authored scripts. The after values are the exact mocked outgoing prompts captured by regression snapshots.

### 04:30 footballer

Before:

```text
A footballer training alone at 04:30 AM before sunrise under stadium floodlights, wide sideline frame.

Required composition: 16:9.

Required project style: Realistic - Photorealistic.

Strict live-action photorealism: a real human or real physical object photographed with natural skin/material texture, realistic anatomy and proportions, cinematic photographic lighting, authentic lens depth, and high-end film still detail. No anime, illustration, painting, cartoon, comic, stylized drawing, 3D render, CG look, doll-like face, game art, collage, grid, typography, labels, captions, or UI.
```

After:

```text
A footballer training alone at 04:30 AM before sunrise under stadium floodlights, wide sideline frame.

Required composition: 16:9.

Required project style: Realistic - Photorealistic.

Strict live-action photorealism: a real human or real physical object photographed with natural skin/material texture, realistic anatomy and proportions, cinematic photographic lighting, authentic lens depth, and high-end film still detail. No anime, illustration, painting, cartoon, comic, stylized drawing, 3D render, CG look, doll-like face, game art, collage, grid, typography, labels, captions, or UI.

Photographic treatment: For a medium or wide sports frame, place the camera roughly 3–15 metres away at a plausible crouched or standing sideline height; move closer only when the requested framing needs it; preserve natural limb perspective, readable motion and sufficient depth of field. The outdoor pre-dawn or night setting has a blue-black sky and naturally dark surroundings, with no sunlight or glowing sunrise horizon; directional stadium floodlights supply the light. Keep artificial-light colour consistent with those lamps, exposure that retains skin detail and bright-lamp highlights, and shadows falling away from the actual light sources. Where visible, preserve natural skin pores, subtle asymmetry, realistic hair and local sweat from exertion, with highlights confined to plausibly damp surfaces rather than uniformly matte or artificially oiled skin. Keep anatomy, posture, weight distribution and ground contact physically credible. Visible clothing follows the approved wardrobe, with natural folds, tension and contact with the body; do not redesign or recolour it. Keep visible environmental depth and material wear appropriate to this scene, without adding subjects or props. Retain the approved colour and grain treatment, restrained sharpening and believable photographic detail. Explicit camera, lighting, reference and user choices take precedence over these defaults.
```

### animated project

Before:

```text
An animated footballer on a stylized pitch.

Required composition: 16:9.

Required project style: Pixar 3D animation.

Polished feature-animation 3D character styling with expressive proportions, cinematic lighting, detailed materials, and a clean studio-quality finish. No collage, grid, typography, labels, captions, or UI.
```

After:

```text
An animated footballer on a stylized pitch.

Required composition: 16:9.

Required project style: Pixar 3D animation.

Polished feature-animation 3D character styling with expressive proportions, cinematic lighting, detailed materials, and a clean studio-quality finish. No collage, grid, typography, labels, captions, or UI.
```

### consistent character

Before:

```text
@Maya stands beside the window in @Room, medium frame, with her approved wardrobe unchanged.

Required composition: 16:9.

Required project style: Realistic - Photorealistic.

Strict live-action photorealism: a real human or real physical object photographed with natural skin/material texture, realistic anatomy and proportions, cinematic photographic lighting, authentic lens depth, and high-end film still detail. No anime, illustration, painting, cartoon, comic, stylized drawing, 3D render, CG look, doll-like face, game art, collage, grid, typography, labels, captions, or UI.

Canonical production entities explicitly mentioned by the user:
- @Maya [character] id=maya (1 reference image available): Approved lead
Treat these IDs as authoritative even when similar names or aliases appear elsewhere.
Every mentioned entity already has reference art. Reuse it for visual consistency instead of inventing a new look.
LIKENESS LOCK — highest priority, overrides everything above:
- @Maya: the supplied reference image of @Maya defines their face, hair colour, hair style, skin tone, build, and age. Reproduce that person exactly. Any words above describing @Maya's appearance are outdated and must be ignored where they differ from the image.
Do not restyle, recolour, age, or idealise a referenced person. Expression, pose, and lighting follow the shot; the person does not change.
WARDROBE LOCK — what a referenced character wears is part of that character, not part of this shot:
- @Maya wears the exact outfit shown in their reference image: the same garments, the same colours, the same proportions, the same footwear. Reproduce it rather than reinterpreting it.
Only what the action does to clothing may differ — sleeves pushed up, a jacket open, fabric wet, creased, or dusty. The garments themselves are never swapped, restyled, recoloured, or upgraded, and no accessory the reference does not show is added.
A different outfit is a different character asset, created in Characters & Assets with its own reference image. It is never invented in a shot.
```

After:

```text
@Maya stands beside the window in @Room, medium frame, with her approved wardrobe unchanged.

Required composition: 16:9.

Required project style: Realistic - Photorealistic.

Strict live-action photorealism: a real human or real physical object photographed with natural skin/material texture, realistic anatomy and proportions, cinematic photographic lighting, authentic lens depth, and high-end film still detail. No anime, illustration, painting, cartoon, comic, stylized drawing, 3D render, CG look, doll-like face, game art, collage, grid, typography, labels, captions, or UI.

Photographic treatment: For a human portrait, use an approximately eye-level viewpoint about 1–3 metres away unless the requested framing specifies otherwise; for other subjects, match camera height and distance to their scale. Maintain natural perspective and optical depth without exaggerated background blur. Use the stated window, room or studio sources and their actual direction and softness, plausible colour balance, light falloff and shadow behaviour; do not invent additional sources. Retain the approved colour and grain treatment, restrained sharpening and believable photographic detail. Explicit camera, lighting, reference and user choices take precedence over these defaults.

Canonical production entities explicitly mentioned by the user:
- @Maya [character] id=maya (1 reference image available): Approved lead
Treat these IDs as authoritative even when similar names or aliases appear elsewhere.
Every mentioned entity already has reference art. Reuse it for visual consistency instead of inventing a new look.
LIKENESS LOCK — highest priority, overrides everything above:
- @Maya: the supplied reference image of @Maya defines their face, hair colour, hair style, skin tone, build, and age. Reproduce that person exactly. Any words above describing @Maya's appearance are outdated and must be ignored where they differ from the image.
Do not restyle, recolour, age, or idealise a referenced person. Expression, pose, and lighting follow the shot; the person does not change.
WARDROBE LOCK — what a referenced character wears is part of that character, not part of this shot:
- @Maya wears the exact outfit shown in their reference image: the same garments, the same colours, the same proportions, the same footwear. Reproduce it rather than reinterpreting it.
Only what the action does to clothing may differ — sleeves pushed up, a jacket open, fabric wet, creased, or dusty. The garments themselves are never swapped, restyled, recoloured, or upgraded, and no accessory the reference does not show is added.
A different outfit is a different character asset, created in Characters & Assets with its own reference image. It is never invented in a shot.
```

### daytime fashion

Before:

```text
A daytime outdoor fashion photograph of a woman mid-step, unchanged outfit, in soft daylight.

Required composition: 3:4.
```

After:

```text
A daytime outdoor fashion photograph of a woman mid-step, unchanged outfit, in soft daylight.

Required composition: 3:4.

Photographic treatment: For a human portrait, use an approximately eye-level viewpoint about 1–3 metres away unless the requested framing specifies otherwise; for other subjects, match camera height and distance to their scale. Maintain natural perspective and optical depth without exaggerated background blur. Follow the stated daylight direction, colour and softness, retaining highlight detail and physically consistent contact shadows; do not substitute a golden-hour look unless requested. Where visible, preserve natural skin texture, subtle asymmetry and realistic hair without inventing identity details or smoothing the person into plastic skin; keep anatomy, posture and surface contact believable. Visible clothing follows the approved wardrobe, with natural folds, tension and contact with the body; do not redesign or recolour it. Keep visible environmental depth and material wear appropriate to this scene, without adding subjects or props. Retain the approved colour and grain treatment, restrained sharpening and believable photographic detail. Explicit camera, lighting, reference and user choices take precedence over these defaults.
```

### indoor UGC skincare

Before:

```text
A natural photographic indoor AI UGC skincare testimonial, talking to a consumer camera beside a window.

Required composition: 9:16.
```

After:

```text
A natural photographic indoor AI UGC skincare testimonial, talking to a consumer camera beside a window.

Required composition: 9:16.

Photographic treatment: Use a believable eye-level consumer camera about an arm's length to a metre away, natural face perspective and readable room depth, without studio-glamour processing. Use the stated window, room or studio sources and their actual direction and softness, plausible colour balance, light falloff and shadow behaviour; do not invent additional sources. Where visible, preserve natural skin texture, subtle asymmetry and realistic hair without inventing identity details or smoothing the person into plastic skin; keep anatomy, posture and surface contact believable. Visible clothing follows the approved wardrobe, with natural folds, tension and contact with the body; do not redesign or recolour it. Keep visible environmental depth and material wear appropriate to this scene, without adding subjects or props. Retain the approved colour and grain treatment, restrained sharpening and believable photographic detail. Explicit camera, lighting, reference and user choices take precedence over these defaults.
```

### premium exact packaging

Before:

```text
A premium photographic product advertisement: the reference bottle, label reading "AURORA SPF 50", brand colours and geometry unchanged, close-up on a stone shelf in the studio.

Required composition: 4:3.

Required project style: Realistic - Photorealistic.

Strict live-action photorealism: a real human or real physical object photographed with natural skin/material texture, realistic anatomy and proportions, cinematic photographic lighting, authentic lens depth, and high-end film still detail. No anime, illustration, painting, cartoon, comic, stylized drawing, 3D render, CG look, doll-like face, game art, collage, grid, typography, labels, captions, or UI.
```

After:

```text
A premium photographic product advertisement: the reference bottle, label reading "AURORA SPF 50", brand colours and geometry unchanged, close-up on a stone shelf in the studio.

Required composition: 4:3.

Required project style: Realistic - Photorealistic.

Strict live-action photorealism: a real human or real physical object photographed with natural skin/material texture, realistic anatomy and proportions, cinematic photographic lighting, authentic lens depth, and high-end film still detail. No anime, illustration, painting, cartoon, comic, stylized drawing, 3D render, CG look, doll-like face, game art, collage, grid, unrelated captions, overlays, or UI; preserve required product lettering.

Photographic treatment: Use a practical product-camera distance and perspective without exaggerated distortion, keeping required surface and label detail within the focus plane. Use the stated window, room or studio sources and their actual direction and softness, plausible colour balance, light falloff and shadow behaviour; do not invent additional sources. Preserve the referenced geometry, brand colours and exact quoted packaging text; keep requested lettering legible and material reflections and surface contact physically plausible. Do not add unrelated captions or overlays. Retain the approved colour and grain treatment, restrained sharpening and believable photographic detail. Explicit camera, lighting, reference and user choices take precedence over these defaults.
```
