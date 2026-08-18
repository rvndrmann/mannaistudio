import { describe, expect, it } from "vitest"
import {
  appendTranscript,
  applyLeadCapture,
  buildLeadWidgetInstructions,
  captureLeadSchema,
  leadCaptureToolDefinition,
  leadIsReachable,
  leadWidgetInputSchema,
  leadWidgetMessageLimit,
  transcriptHistory,
  visitorKey,
  widgetGreeting,
  type LeadFields,
} from "./lead-widget"
import type { BrandRecord } from "./brand"

const blank: LeadFields = { name: "", email: "", phone: "", company: "", intent: "" }

const brand: BrandRecord = {
  id: "brand-1",
  name: "Aurora Coffee",
  kind: "brand",
  tagline: "Roasted before sunrise",
  website_url: "https://auroracoffee.example",
  industry: "Speciality coffee",
  description: "Small-batch roaster.",
  brand_voice: "Warm, unhurried.",
  audience: "Home brewers.",
  positioning: "Taste the origin.",
  goals: "Launch cold brew.",
  offer: "Free shipping on the first bag.",
  visual_style: "Soft morning light.",
  color_palette: [],
  do_rules: "",
  dont_rules: "",
  forbidden_claims: ["cures fatigue"],
  logo_path: "",
  default_aspect: "9:16",
}

describe("applyLeadCapture", () => {
  it("keeps what the visitor gives, across several calls", () => {
    const first = applyLeadCapture(blank, { name: "Ravi" })
    expect(first.fields.name).toBe("Ravi")
    const second = applyLeadCapture(first.fields, { email: "ravi@example.com", intent: "A launch film" })
    expect(second.fields).toMatchObject({ name: "Ravi", email: "ravi@example.com", intent: "A launch film" })
  })

  it("never erases a detail with a blank, so declining later does not undo giving earlier", () => {
    const current = { ...blank, name: "Ravi", email: "ravi@example.com" }
    const { fields } = applyLeadCapture(current, { name: "", email: "   " })
    expect(fields.name).toBe("Ravi")
    expect(fields.email).toBe("ravi@example.com")
  })

  it("refuses an email nobody could reply to", () => {
    const { fields, rejected } = applyLeadCapture(blank, { email: "ravi at example dot com" })
    expect(fields.email).toBe("")
    expect(rejected).toEqual(["email"])
  })

  it("accepts a corrected email on the next attempt", () => {
    const { fields, rejected } = applyLeadCapture(blank, { email: "ravi@example.co.in" })
    expect(fields.email).toBe("ravi@example.co.in")
    expect(rejected).toEqual([])
  })
})

describe("leadIsReachable", () => {
  it("counts a lead only once somebody can reply to it", () => {
    expect(leadIsReachable(blank)).toBe(false)
    expect(leadIsReachable({ ...blank, name: "Ravi", intent: "A launch film" })).toBe(false)
    expect(leadIsReachable({ ...blank, email: "ravi@example.com" })).toBe(true)
    expect(leadIsReachable({ ...blank, phone: "+91 90000 00000" })).toBe(true)
  })
})

describe("transcript", () => {
  it("keeps the conversation in order and caps its length", () => {
    let transcript: ReturnType<typeof appendTranscript> = []
    for (let index = 0; index < 200; index += 1) {
      transcript = appendTranscript(transcript, { role: index % 2 ? "agent" : "visitor", content: `line ${index}`, at: "2026-08-18T00:00:00Z" })
    }
    expect(transcript.length).toBe(120)
    expect(transcript[transcript.length - 1].content).toBe("line 199")
  })

  it("replays as model roles, most recent first-limited", () => {
    const transcript = [
      { role: "visitor" as const, content: "hi", at: "" },
      { role: "agent" as const, content: "hello", at: "" },
      { role: "visitor" as const, content: "   ", at: "" },
    ]
    expect(transcriptHistory(transcript)).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ])
  })

  it("survives a session with no transcript yet", () => {
    expect(transcriptHistory(null)).toEqual([])
    expect(appendTranscript(undefined, { role: "visitor", content: "hi", at: "" })).toHaveLength(1)
  })
})

describe("visitorKey", () => {
  it("is stable for one visitor and different for another", () => {
    const a = visitorKey("203.0.113.4", "Chrome", "salt")
    expect(visitorKey("203.0.113.4", "Chrome", "salt")).toBe(a)
    expect(visitorKey("203.0.113.5", "Chrome", "salt")).not.toBe(a)
  })

  it("does not keep the address it was given", () => {
    // The key is what gets stored, so it must not be reversible to an IP.
    expect(visitorKey("203.0.113.4", "Chrome", "salt")).not.toContain("203.0.113.4")
    expect(visitorKey("203.0.113.4", "Chrome", "salt")).toHaveLength(64)
  })

  it("changes with the salt, so keys are not portable between deployments", () => {
    expect(visitorKey("203.0.113.4", "Chrome", "a")).not.toBe(visitorKey("203.0.113.4", "Chrome", "b"))
  })
})

describe("widgetGreeting", () => {
  it("uses the brand's own greeting when it set one", () => {
    expect(widgetGreeting({ name: "Aurora Coffee", widget_greeting: "Morning! Need a roast?" })).toBe("Morning! Need a roast?")
  })

  it("falls back to something that names the brand", () => {
    expect(widgetGreeting({ name: "Aurora Coffee", widget_greeting: "  " })).toContain("Aurora Coffee")
  })
})

describe("buildLeadWidgetInstructions", () => {
  it("briefs the agent on answering first and grounding in brand material", () => {
    const instructions = buildLeadWidgetInstructions({ brand })
    expect(instructions).toContain("Answer the question first")
    expect(instructions).toContain("Aurora Coffee")
    expect(instructions).toContain("cures fatigue")
  })

  it("forbids inventing product answers and asking for anything sensitive", () => {
    const instructions = buildLeadWidgetInstructions({ brand })
    expect(instructions).toContain("rather than inventing an answer")
    expect(instructions).toContain("Never ask for a password, a card number")
  })

  it("tells it to ask once and drop it", () => {
    expect(buildLeadWidgetInstructions({ brand })).toContain("Ask once.")
  })
})

describe("widget input", () => {
  it("caps a message so one request cannot carry a whole document", () => {
    expect(() => leadWidgetInputSchema.parse({ message: "x".repeat(leadWidgetMessageLimit + 1) })).toThrow()
    expect(leadWidgetInputSchema.parse({ message: " hello " })).toEqual({ message: "hello", sourcePath: "/" })
  })

  it("rejects an empty message rather than paying for a turn about nothing", () => {
    expect(() => leadWidgetInputSchema.parse({ message: "   " })).toThrow()
  })

  it("offers one capture tool, with no field that could take a secret", () => {
    const tool = leadCaptureToolDefinition()
    expect(tool.name).toBe("capture_lead")
    expect(Object.keys(tool.parameters.properties)).toEqual(["name", "email", "phone", "company", "intent"])
  })

  it("defaults every lead field so a partial capture is still valid", () => {
    expect(captureLeadSchema.parse({})).toEqual(blank)
  })
})
