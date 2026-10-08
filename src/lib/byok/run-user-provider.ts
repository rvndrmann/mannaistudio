import "server-only"
import { hasByokSubscription, hasCredential, withCredential } from "./credential-service"
import { runWithCredential } from "./active-credential"
import { ownKeysOnly } from "./preferences"
import { OwnKeysOnlyError } from "./billing"
import type { ByokProvider } from "./providers"

export async function runUserProvider<T>(userId: string, provider: ByokProvider | null, work: () => Promise<T>): Promise<T> {
  const required = await ownKeysOnly(userId)
  if (required && !await hasByokSubscription(userId)) {
    throw new Error("Subscribe to All Access, then connect your own API keys to use AI chat, images, and videos.")
  }
  if (provider && await hasCredential(userId, provider)) {
    const result = await withCredential({ userId, provider }, parts => runWithCredential(provider, parts, work))
    if (result === null) throw new OwnKeysOnlyError(provider)
    return result
  }
  if (required) throw new OwnKeysOnlyError(provider || "supported provider")
  return work()
}
