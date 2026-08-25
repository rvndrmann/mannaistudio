/**
 * The cookie-reading Supabase client, which does not exist here.
 *
 * The edge path never authenticates from cookies: it is handed the user's own
 * access token and builds a client from that. Anything reaching for this is
 * reaching for a Next.js request that is not present, and should say so loudly
 * rather than quietly returning a client with no session attached — which would
 * read as "signed out" and fail much further from the cause.
 */
export const createClient = async () => {
  throw new Error("createClient() from lib/supabase/server is not available in the edge runtime; the turn runs on the caller's access token instead.")
}
