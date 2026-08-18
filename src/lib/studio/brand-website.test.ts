import { describe, expect, it } from "vitest"
import {
  buildWebsiteSnapshot,
  discoverPageLinks,
  extractMetaDescription,
  extractPageTitle,
  extractReadableText,
  isBlockedAddress,
  normalizeWebsiteUrl,
  websiteSnapshotIsStale,
  websiteStaleAfterMs,
} from "./brand-website"

describe("normalizeWebsiteUrl", () => {
  it("accepts a public site and fills in a missing scheme", () => {
    expect(normalizeWebsiteUrl("auroracoffee.example")).toBe("https://auroracoffee.example/")
    expect(normalizeWebsiteUrl("  http://auroracoffee.example/shop  ")).toBe("http://auroracoffee.example/shop")
  })

  it("drops the fragment, which names nothing the server can fetch", () => {
    expect(normalizeWebsiteUrl("https://auroracoffee.example/about#team")).toBe("https://auroracoffee.example/about")
  })

  it("refuses anything that is not http or https", () => {
    expect(normalizeWebsiteUrl("file:///etc/passwd")).toBeNull()
    expect(normalizeWebsiteUrl("javascript:alert(1)")).toBeNull()
    expect(normalizeWebsiteUrl("")).toBeNull()
    expect(normalizeWebsiteUrl("not a url")).toBeNull()
  })

  it("refuses the private network, so a brand URL cannot aim the server inward", () => {
    expect(normalizeWebsiteUrl("http://localhost:3000")).toBeNull()
    expect(normalizeWebsiteUrl("http://127.0.0.1/")).toBeNull()
    expect(normalizeWebsiteUrl("http://169.254.169.254/latest/meta-data/")).toBeNull()
    expect(normalizeWebsiteUrl("http://10.0.0.5/")).toBeNull()
    expect(normalizeWebsiteUrl("http://192.168.1.1/")).toBeNull()
    expect(normalizeWebsiteUrl("http://172.16.4.4/")).toBeNull()
    expect(normalizeWebsiteUrl("http://metadata.google.internal/")).toBeNull()
    expect(normalizeWebsiteUrl("http://build.internal/")).toBeNull()
  })
})

describe("isBlockedAddress", () => {
  it("blocks loopback, link-local, private, and carrier-grade ranges", () => {
    for (const address of ["127.0.0.1", "0.0.0.0", "10.1.2.3", "172.31.255.255", "192.168.0.1", "169.254.169.254", "100.64.0.1", "224.0.0.1"]) {
      expect(isBlockedAddress(address), address).toBe(true)
    }
  })

  it("blocks IPv6 loopback, unique-local, link-local, and IPv4-mapped private", () => {
    for (const address of ["::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isBlockedAddress(address), address).toBe(true)
    }
  })

  it("allows a public address", () => {
    expect(isBlockedAddress("93.184.216.34")).toBe(false)
    expect(isBlockedAddress("172.32.0.1")).toBe(false)
    expect(isBlockedAddress("2606:2800:220:1::")).toBe(false)
  })
})

describe("extractReadableText", () => {
  const html = `
    <html><head><title>Aurora Coffee — Roasted before sunrise</title>
    <meta name="description" content="Small-batch coffee, roasted to order.">
    <style>.hero { color: red }</style></head>
    <body>
      <script>window.__STATE__ = {"a":1,"b":2}</script>
      <h1>Cold brew, done properly</h1>
      <p>We roast in small batches&nbsp;&amp; ship the same day.</p>
      <noscript>Enable JavaScript</noscript>
    </body></html>`

  it("keeps the words a reader sees", () => {
    const text = extractReadableText(html)
    expect(text).toContain("Cold brew, done properly")
    expect(text).toContain("We roast in small batches & ship the same day.")
  })

  it("drops scripts, styles, and noscript rather than feeding them to the agent", () => {
    const text = extractReadableText(html)
    expect(text).not.toContain("__STATE__")
    expect(text).not.toContain("color: red")
    expect(text).not.toContain("Enable JavaScript")
  })

  it("reads the title and description", () => {
    expect(extractPageTitle(html)).toBe("Aurora Coffee — Roasted before sunrise")
    expect(extractMetaDescription(html)).toBe("Small-batch coffee, roasted to order.")
  })

  it("survives markup it cannot make sense of", () => {
    expect(extractReadableText("")).toBe("")
    expect(extractReadableText("<p>only<p>text")).toContain("only")
  })
})

describe("discoverPageLinks", () => {
  const html = `
    <a href="/about">About</a>
    <a href="/products/cold-brew">Cold brew</a>
    <a href="/terms">Terms</a>
    <a href="https://instagram.com/aurora">Instagram</a>
    <a href="/brochure.pdf">Brochure</a>
    <a href="mailto:hi@aurora.example">Mail</a>
    <a href="/about#team">About again</a>`

  it("prefers the pages that carry product and positioning copy", () => {
    const links = discoverPageLinks(html, "https://aurora.example/", 3)
    expect(links[0]).toBe("https://aurora.example/about")
    expect(links).toContain("https://aurora.example/products/cold-brew")
  })

  it("never leaves the site, and skips files and other schemes", () => {
    const links = discoverPageLinks(html, "https://aurora.example/", 10)
    expect(links.some((link) => link.includes("instagram.com"))).toBe(false)
    expect(links.some((link) => link.endsWith(".pdf"))).toBe(false)
    expect(links.some((link) => link.startsWith("mailto"))).toBe(false)
  })

  it("skips sign-in and legal pages, which describe nobody's brand", () => {
    const links = discoverPageLinks(
      `<a href="/login?next=%2Fbilling">Plans</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/products/cold-brew">Cold brew</a>`,
      "https://aurora.example/",
      10,
    )
    expect(links).toEqual(["https://aurora.example/products/cold-brew"])
  })

  it("counts a fragment link as the page it points at, not a second page", () => {
    const links = discoverPageLinks(html, "https://aurora.example/", 10)
    expect(links.filter((link) => link === "https://aurora.example/about")).toHaveLength(1)
  })

  it("honours the limit and returns nothing for an unusable base", () => {
    expect(discoverPageLinks(html, "https://aurora.example/", 2)).toHaveLength(2)
    expect(discoverPageLinks(html, "not a url")).toEqual([])
  })
})

describe("buildWebsiteSnapshot", () => {
  it("labels each page with its title and address", () => {
    const snapshot = buildWebsiteSnapshot([
      { url: "https://aurora.example/", title: "Aurora Coffee", text: "Roasted before sunrise." },
      { url: "https://aurora.example/about", title: "About", text: "Founded in 2019." },
    ])
    expect(snapshot).toContain("## Aurora Coffee — https://aurora.example/")
    expect(snapshot).toContain("Roasted before sunrise.")
    expect(snapshot).toContain("Founded in 2019.")
  })

  it("stays inside the briefing budget however long the site is", () => {
    const snapshot = buildWebsiteSnapshot(
      Array.from({ length: 20 }, (_, index) => ({ url: `https://aurora.example/${index}`, title: `Page ${index}`, text: "x".repeat(9_000) })),
    )
    expect(snapshot.length).toBeLessThanOrEqual(13_000)
  })

  it("is empty when there is nothing to show", () => {
    expect(buildWebsiteSnapshot([])).toBe("")
    expect(buildWebsiteSnapshot([{ url: "https://aurora.example/", title: "", text: "   " }])).toBe("")
  })
})

describe("websiteSnapshotIsStale", () => {
  const now = Date.parse("2026-08-18T12:00:00Z")

  it("treats a missing or unreadable timestamp as stale", () => {
    expect(websiteSnapshotIsStale(null, now)).toBe(true)
    expect(websiteSnapshotIsStale("", now)).toBe(true)
    expect(websiteSnapshotIsStale("whenever", now)).toBe(true)
  })

  it("re-reads a snapshot older than a week and keeps a fresh one", () => {
    expect(websiteSnapshotIsStale(new Date(now - websiteStaleAfterMs - 1_000).toISOString(), now)).toBe(true)
    expect(websiteSnapshotIsStale(new Date(now - 60_000).toISOString(), now)).toBe(false)
  })
})
