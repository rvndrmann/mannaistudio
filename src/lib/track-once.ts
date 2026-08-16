// A per-browser ledger of conversion events that must only ever be reported once.
//
// Every client-side activation event has the same failure mode: the thing that
// tells us it happened (an auth state change, a page mount) fires again on every
// re-render, tab focus, and token refresh. CompleteRegistration once reported
// 1,232 registrations against 177 page views that way, and Meta's optimiser
// spent the day looking for more people who reload the site. So each of these
// events claims its slot here first, and only fires if the claim is new.

/**
 * Records that `id` has been reported under `key`, returning false if it already
 * had been. Returns false when storage is unavailable too: these events were
 * over-firing badly, so losing the odd private-window signal is much cheaper
 * than feeding the optimiser duplicates again.
 *
 * Only the most recent 20 ids per key are kept — enough that no real person
 * re-triggers an event, small enough that the ledger cannot grow unbounded.
 */
export function claimOnce(key: string, id: string): boolean {
    if (typeof window === 'undefined') return false
    try {
        const seen: string[] = JSON.parse(window.localStorage.getItem(key) || '[]')
        if (seen.includes(id)) return false
        window.localStorage.setItem(key, JSON.stringify([...seen.slice(-19), id]))
        return true
    } catch {
        return false
    }
}
