import { after } from "next/server"
import { setBackgroundKeepAlive } from "./background-work"

/**
 * Tells background work how to stay alive on this host: Next's `after`, which
 * holds the function open until the promise settles, within the route's
 * maxDuration. Imported for its effect by the routes that can start a render.
 */
setBackgroundKeepAlive((work) => { after(() => work) })
