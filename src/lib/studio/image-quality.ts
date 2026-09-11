/**
 * Which quality tiers each image model will accept.
 *
 * Its own module, deliberately. This started out in openai.ts next to the
 * request code, and importing it from entity-image-workflow pulled that whole
 * file — and through it `@/lib/byok/active-credential` and its
 * `node:async_hooks` — into the storyboard page's client bundle, which fails the
 * build outright. Nothing here talks to a provider, so nothing here should be
 * able to drag a server-only dependency across that line.
 */

/** What the image endpoints accept, which is not what the UI calls it. */
export type OpenAIImageQuality = "low" | "medium" | "high" | "xhigh" | "max"

/**
 * The ladder a given model can climb.
 *
 * Only Sunburst goes above "high" — gpt-image-2 and 1.5 reject xhigh and max
 * outright. The UI offers one ladder for every model, so a project left on
 * Ultra and switched to GPT Image 2 would otherwise send a tier that model has
 * never heard of and fail at the provider.
 */
export function openAIImageQualityCeiling(model: string): OpenAIImageQuality[] {
  // Named outright rather than derived from another capability. Sunburst also
  // happens to be the one model that cannot run on /v1/responses, and keying
  // this off that would tie two unrelated facts together — the next model to
  // differ on one but not the other would silently get the wrong ladder.
  return model === "gpt-image-2.5-sunburst"
    ? ["low", "medium", "high", "xhigh", "max"]
    : ["low", "medium", "high"]
}

/**
 * The highest tier this model can serve, at or below what was asked for.
 *
 * Clamps rather than throws: a model swap should degrade the picture, not fail
 * the render. Pricing is read from the same UI tier the caller passed, and the
 * rate card prices Ultra and Max on a clamping model at what High actually
 * costs — so a clamp here can never bill less than the render it produced.
 */
export function clampOpenAIImageQuality(model: string, quality: OpenAIImageQuality): OpenAIImageQuality {
  const allowed = openAIImageQualityCeiling(model)
  if (allowed.includes(quality)) return quality
  return allowed[allowed.length - 1]
}
