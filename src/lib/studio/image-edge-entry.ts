/**
 * What the render-image Edge Function is allowed to reach.
 *
 * Deliberately a short list, the same way the Director's entry is: the bundle
 * is built from this file, so anything not re-exported here is not shipped to
 * the edge runtime at all — which makes the surface the function can call
 * something you can read in one screen rather than infer from a bundler's
 * output.
 */
export { renderProjectImage, imageRequestSchema, imageGenerationErrorResponse } from "./project-image-render"
export { requireAuthenticatedProject } from "./server-context"
