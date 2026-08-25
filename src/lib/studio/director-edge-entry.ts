/**
 * What the Supabase Edge Function is allowed to reach.
 *
 * Deliberately a short list. The bundle is built from this file, so anything
 * not re-exported here is not shipped to the edge runtime at all — which makes
 * the surface the function can call something you can read in one screen rather
 * than infer from a bundler's output.
 */
export { resolveDirectorTurn, prepareDirectorTurn, executeDirectorTurn } from "./director-turn"
export { requireAuthenticatedProject, StudioAccessError } from "./server-context"
export { directorChatInputSchema } from "./domain"
export { describeError } from "./errors"
