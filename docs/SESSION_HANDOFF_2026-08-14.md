# Session handoff - 2026-08-14

Two themes: the chat driving the production forward without wandering, and the account's Seedance asset quota surviving a day's work.

## Generation went to the wrong shot, or the wrong path

Several requests were falling past the deterministic paths to the agent, which — on Gemini 3.6 Flash in particular — answered them with a read-only inspection report on shot 1 rather than doing the work.

- **`recreate` matched nothing.** `\bcreate\b` does not fire inside "recreate", and the redo list did not include it. Both media paths now share one vocabulary (`wantsRedo`): recreate, re-create, regenerate, redo, remake, rerender, rerun, and a trailing "again".
- **"Skip shot N and continue"** is answered from the pipeline. Skipping changes nothing in the workspace — it only says which shot not to offer — so there is nothing to propose and nothing to approve.
- **A message naming a shot no longer routes to bulk entity art.** "create shot image again with better character consistency" names "character", which was enough to answer a shot re-render with a report about reference images.
- **A multi-shot image request goes to the agent** that can batch it; the single-shot number match would have kept the first and dropped the rest.

## The batch card sent one prompt for every shot

A batch proposal carries a prompt per shot, but the card read only the first and rebroadcast it on approval. Approving "generate shot 8, 9, 10" rendered shot 8's scene three times, under all three numbers, and the card showed nothing that would reveal it. The card now holds every prompt under the proposal's own keys, offers a shot tab each, and approves with each shot's own text.

The optimistic "generating" mark had the same blind spot from the other side: it read `request.shotIds`, which a number-keyed proposal does not carry, so none of the batch showed as generating until a poll caught up.

## The next step kept disappearing, or offering paid work twice

- **A shot mid-render was still being offered.** On stored state alone it looks exactly like a shot nobody has started. Generations in flight are now excluded from the step and the batch; when everything outstanding is rendering there is no button, only what is rendering — which also stopped the stage falling through to "Review" over unfinished shots.
- **A dead job hid the next step forever.** A generation that never reaches a terminal status stays `processing`, and its shot was excluded permanently. Jobs older than twenty minutes are read as abandoned.
- **One unanswered proposal silenced every later reply.** The card hid on any pending proposal in the session; only the newest reply's own approval blocks it now.
- **Replying instead of approving now withdraws the proposal.** It reads "Withdrawn — you replied instead", says nothing was generated and no credits were spent, and the Director is told the message is the new brief.
- The stage now reports what is outstanding and carries **alternatives**: finish the remaining images in one batch, or film a shot whose keyframe is already approved.

## Continuity, and what a generation actually sends

- **The workflow picker drives generation.** Under Video Reference or Elements Sequential, a plain "generate shot 3 video" continues from shot 2's clip — attached, multi-image mode, extend-from prompt. Shot 1 never inherits; an unrendered previous shot falls back to images and says so. Previously the picker reached the model as advice only.
- **The storyboard panel shows the motion reference** as a removable thumbnail, and offers "Continue from shot N" when it is empty. The manual route never sent a video reference at all, so a render started there could not continue from anything.
- **One image per entity — the chosen one.** An entity's other images are rejected attempts, which is what the Choose button settles; the models blend every reference into one output. GPT Image's budget rose to 16 so a large cast is not cut short, and it is spent on subjects rather than on second opinions.
- **The job records what was sent.** Execution writes the resolved reference list back, so the shot panel shows what the chat card promised and a failed job leaves a true record.
- **Keyframes are registered with BytePlus**, which fixed `content[1] may contain real person` on continuity renders: a keyframe is a rendered frame of the project's characters and trips the same check as a face photo.

## Vision attachments no longer fail the run

The Director attaches up to six workspace images as signed URLs, which OpenAI downloaded itself on a short timeout — and a multi-megabyte keyframe on slow storage failed the whole request with *"Unable to download content from the provided URL before the timeout"*. The bytes are now read server-side and sent inline (8s timeout, 4MB per image, 12MB total); anything unreadable in time is dropped rather than passed on as a URL that would fail the same way.

## Seedance asset quota

Registration was running on every generated image and on every render's face references, filling the account's 50-image library within hours with duplicates, and nothing recorded what was in it. See [`SEEDANCE_ASSET_LIBRARY.md`](SEEDANCE_ASSET_LIBRARY.md) for the registry, the admin panel, and what deletion does and does not touch.

## Manual panels reuse what produced an image

Characters & Assets opened on the entity description and an empty reference strip. Selecting a concept now loads the prompt, model and references that made it — ready to run again or to edit, with the strip's add and remove already in place. Failed and in-flight attempts load their own recipe too.

## Verification

- `npm run typecheck`
- `npm test` (190 tests)
- `npm run build`
- `npx supabase db push --linked` for the asset registry migration

## Known gaps left open

- **`DeleteAsset` unverified** against the live BytePlus API; the panel surfaces the provider error verbatim.
- **@mention to reference-image binding.** Seedance binds positionally (`@Image1`); our prompts name entities. The index convention comes from third-party guides only, so it was not shipped.
- **Storyboard rebuilds drop shot media.** `create_storyboard_batch` with `replaceExisting` deletes shot rows, discarding keyframes and orphaning generation history.
- **The agent still wanders on weaker models.** Each deterministic path removes one more opportunity; a bare greeting is not yet one of them.
