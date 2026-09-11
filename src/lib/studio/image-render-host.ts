/**
 * Where an image model's render is able to finish.
 *
 * Its own module for the same reason image-quality.ts is: the browser has to
 * know the answer before it picks an endpoint, and reaching it from openai.ts
 * would pull that file — and through it byok/active-credential and
 * node:async_hooks — into the client bundle, which fails the build outright.
 * Nothing here talks to a provider.
 */

/**
 * Whether a model can be rendered through the Responses API's image_generation
 * tool, which is what submitOpenAIImage uses to get a recoverable handle.
 *
 * gpt-image-2.5-sunburst cannot: OpenAI lists `/v1/responses` as unsupported for
 * it, and only `/v1/images/generations` and `/v1/images/edits` are available. A
 * model routed there anyway is rejected at submit time, so the caller has to
 * fall back to the synchronous endpoints — see project-image-render, which does.
 */
export function supportsBackgroundImageResponse(model: string) {
  return model !== "gpt-image-2.5-sunburst"
}

/**
 * Whether this model's render has to run on the Edge Function rather than the
 * app's own host.
 *
 * Derived from the background-response question rather than named separately,
 * and the coupling is the point: a render with a recoverable handle survives a
 * request the host kills — the job keeps the provider's id and the next poll
 * finishes it — and a render without one does not. Netlify stops a request at
 * thirty seconds and a GPT Image render takes fifty to seventy-five, so a model
 * with no handle loses the picture every single time it is asked for there,
 * having already been billed for it.
 *
 * The Edge Function's budget is a hundred and fifty seconds, which is where the
 * Director's turn already runs for the same reason.
 */
export function rendersOnEdgeFunction(model: string) {
  return !supportsBackgroundImageResponse(model)
}
