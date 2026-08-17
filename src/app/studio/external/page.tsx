"use client"

import Navbar from "@/components/Navbar"
import { createClient } from "@/lib/supabase/client"
import { fetchSiteFeatures } from "@/lib/studio/feature-flags"
import { AlertCircle, Bot, Code2, Copy, ExternalLink, KeyRound, MessageCircle, Pause, Plug, PlugZap, Sparkles, Terminal, Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

type TokenRecord = {
  id: string
  name: string
  token_prefix: string
  scopes: string[]
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

const clients = [
  { id: "claude", label: "Claude", icon: "✹" },
  { id: "chatgpt", label: "ChatGPT", icon: "◎" },
  { id: "cursor", label: "Cursor", icon: "◆" },
  { id: "claude-code", label: "Claude Code", icon: "▣" },
  { id: "terminal", label: "Terminal", icon: "⌁" },
]

export default function StudioExternalAccessPage() {
  const [tokens, setTokens] = useState<TokenRecord[]>([])
  const [name, setName] = useState("AI Director MCP")
  const [newToken, setNewToken] = useState("")
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState("")
  const [client, setClient] = useState("claude")
  const [mode, setMode] = useState<"mcp" | "cli">("mcp")
  const [isPaused, setIsPaused] = useState(false)

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"
  const mcpServerPath = "/Users/apple/Downloads/mannaistudio/scripts/ai-director-mcp-server.mjs"
  const mcpConnectorUrl = `${baseUrl}/api/studio/external/projects`
  const tokenValue = newToken || "aih_your_token_here"
  const mcpConfig = useMemo(() => JSON.stringify({
    mcpServers: {
      "ai-director-hub": {
        command: "node",
        args: [mcpServerPath],
        env: {
          AI_DIRECTOR_BASE_URL: baseUrl,
          AI_DIRECTOR_TOKEN: tokenValue,
        },
      },
    },
  }, null, 2), [baseUrl, tokenValue])

  const cliCommands = `export AI_DIRECTOR_BASE_URL=${baseUrl}
export AI_DIRECTOR_TOKEN=${tokenValue}
npm run director:cli -- projects
npm run director:cli -- chat <projectId> <episodeId> "Plan a 20 second product ad"`

  const promptText = mode === "mcp"
    ? `Set up AI Director Hub for me so I can create images and videos from here.
1. Use this MCP server config:
${mcpConfig}
2. After connecting, list my AI Director projects.
3. Ask me which project and episode to use.
4. Then send my requests to the AI Director agent.`
    : `Set up AI Director Hub CLI for me.
1. In the project folder, run: npm run director:cli -- projects
2. Use this token in the environment: ${tokenValue}
3. Then help me send chat requests to my AI Director project.`

  async function loadTokens() {
    const response = await fetch("/api/studio/external/tokens", { cache: "no-store" })
    const body = await response.json()
    if (response.ok) setTokens(body.tokens || [])
  }

  useEffect(() => {
    loadTokens()
    const supabase = createClient()
    fetchSiteFeatures(supabase).then((feats) => {
      if (feats.mcp === false) setIsPaused(true)
    })
  }, [])

  async function createToken() {
    setLoading(true)
    try {
      const response = await fetch("/api/studio/external/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not create token")
      setNewToken(body.token)
      await loadTokens()
    } finally {
      setLoading(false)
    }
  }

  async function revokeToken(tokenId: string) {
    await fetch(`/api/studio/external/tokens/${tokenId}`, { method: "DELETE" })
    await loadTokens()
  }

  async function copy(label: string, text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(""), 1600)
  }

  return (
    <main className="min-h-screen bg-[#0b0d0c] text-white">
      <Navbar />

      {isPaused && (
        <div className="mx-auto max-w-[1400px] px-4 pt-24 md:px-6">
          <div className="flex items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm font-bold text-amber-300">
            <Pause className="h-5 w-5 shrink-0 fill-current" />
            <span>
              MCP & CLI Access is currently paused by the administrator. Existing integration tokens and connections are temporarily disabled.
            </span>
          </div>
        </div>
      )}

      <section className="mx-auto max-w-[1400px] px-4 pb-10 pt-28 md:px-6">
        <div className="flex flex-col items-center text-center">
          <div className="relative h-28 w-80">
            <div className="absolute left-8 top-7 grid h-16 w-16 rotate-[-10deg] place-items-center rounded-2xl bg-[#0f5a68] text-3xl shadow-2xl">☄</div>
            <div className="absolute left-20 top-5 grid h-20 w-20 rotate-[-5deg] place-items-center rounded-3xl bg-white text-3xl text-black shadow-2xl">✶</div>
            <div className="absolute left-[126px] top-0 z-10 grid h-28 w-28 place-items-center rounded-[28px] bg-primary text-black shadow-[0_20px_80px_rgba(185,255,24,.25)]">
              <img src="/logo.png" alt="AI Director Hub" className="h-20 w-20 rounded-3xl object-cover" />
            </div>
            <div className="absolute right-20 top-5 grid h-20 w-20 rotate-[5deg] place-items-center rounded-3xl bg-[#202225] text-3xl shadow-2xl">◼</div>
            <div className="absolute right-8 top-7 grid h-16 w-16 rotate-[10deg] place-items-center rounded-2xl bg-[#df7a54] text-3xl shadow-2xl">✺</div>
          </div>

          <h1 className="mt-8 text-4xl font-semibold leading-none tracking-tight text-primary md:text-6xl">
            AI Director MCP & CLI for any AI
          </h1>
          <p className="mt-5 max-w-2xl text-lg font-medium text-white/45">
            Create images, plan storyboards, update scripts, and prepare videos directly from Claude, ChatGPT-style clients, Cursor, Claude Code, or terminal.
          </p>
          <button onClick={createToken} disabled={loading} className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-primary/15 px-5 py-3 text-sm font-semibold text-primary disabled:opacity-60">
            <KeyRound className="h-4 w-4" />
            {newToken ? "Access token ready" : loading ? "Creating access token..." : "Connect MCP and create access token"}
            <span className="rounded bg-primary px-2 py-0.5 text-xs text-black">FREE SETUP</span>
          </button>
        </div>

        <div className="mx-auto mt-20 overflow-hidden rounded-[28px] border border-white/10 bg-[#202221] p-2 shadow-2xl">
          <div className="flex flex-col gap-3 p-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {clients.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setClient(item.id)}
                  className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition ${client === item.id ? "bg-white text-black" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 rounded-2xl bg-black/20 p-1">
              <button onClick={() => setMode("mcp")} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${mode === "mcp" ? "bg-white/15 text-white" : "text-white/45"}`}>
                <Plug className="h-4 w-4" /> MCP
              </button>
              <button onClick={() => setMode("cli")} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${mode === "cli" ? "bg-white/15 text-white" : "text-white/45"}`}>
                <Code2 className="h-4 w-4" /> CLI
              </button>
            </div>
          </div>

          <div className="grid gap-px overflow-hidden rounded-[22px] bg-white/5 lg:grid-cols-3">
            <div className="bg-[#111312] p-7">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-lg font-semibold">1</div>
              <h2 className="mt-8 text-2xl font-semibold">
                {mode === "mcp" ? "Copy the connector config" : "Copy and send this to your AI client"}
              </h2>
              <p className="mt-3 text-sm leading-6 text-white/45">
                {mode === "mcp" ? "Paste this into your MCP client or ask Claude/Cursor to configure it for you." : "Send this setup prompt to Claude Code, Cursor, ChatGPT, or your terminal assistant."}
              </p>
              <div className="mt-8 rounded-2xl border border-white/10 bg-white/[.06] p-4">
                <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap text-left text-xs leading-6 text-white/55">{mode === "mcp" ? mcpConfig : promptText}</pre>
                <button onClick={() => copy("step1", mode === "mcp" ? mcpConfig : promptText)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:text-primary">
                  <Copy className="h-4 w-4" /> {copied === "step1" ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            <div className="bg-[#111312] p-7">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-lg font-semibold">2</div>
              <h2 className="mt-8 text-2xl font-semibold">
                {mode === "mcp" ? `Go to ${clients.find((item) => item.id === client)?.label || "your client"} settings` : "Run the CLI command"}
              </h2>
              <p className="mt-3 text-sm leading-6 text-white/45">
                {mode === "mcp" ? "Open connectors, MCP servers, or custom tools. Add AI Director Hub with the config from step one." : "Use the exported token and ask the CLI to list projects or send a chat message."}
              </p>
              <div className="mt-8 rounded-2xl border border-white/10 bg-white/[.06] p-4">
                <pre className="whitespace-pre-wrap text-left text-xs leading-6 text-white/55">{mode === "mcp" ? mcpConnectorUrl : cliCommands}</pre>
                <button onClick={() => copy("step2", mode === "mcp" ? mcpConnectorUrl : cliCommands)} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold hover:border-primary hover:text-primary">
                  <Copy className="h-4 w-4" /> {copied === "step2" ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            <div className="bg-[#111312] p-7">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-lg font-semibold">3</div>
              <h2 className="mt-8 text-2xl font-semibold">Connect, sign in, and start creating</h2>
              <p className="mt-3 text-sm leading-6 text-white/45">
                Ask the external AI to list your projects, choose an episode, then send requests to the AI Director agent.
              </p>
              <div className="mt-8 rounded-2xl bg-black/25 p-5">
                <p className="text-sm font-semibold text-white">Try asking:</p>
                <p className="mt-3 text-sm leading-6 text-white/55">“Plan a 20 second product ad, create storyboard images, and prepare video generation for approval.”</p>
              </div>
              <button onClick={() => copy("try", "Plan a 20 second product ad, create storyboard images, and prepare video generation for approval.")} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#df7a54] px-5 py-3 text-sm font-semibold text-white hover:bg-[#ef875f]">
                <Sparkles className="h-4 w-4" /> {copied === "try" ? "Copied" : "Start creating"}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-6 text-sm text-white/35">
          <a href="https://github.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 hover:text-primary">
            GitHub <ExternalLink className="h-4 w-4" />
          </a>
          <span className="hidden md:inline">If you are using Claude Code or Cursor, CLI mode is usually fastest.</span>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl gap-5 lg:grid-cols-[.9fr_1.1fr]">
          <div className="rounded-[24px] border border-white/10 bg-white/[.04] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Access token</h2>
                <p className="mt-1 text-sm text-white/40">The token is shown once. Store it securely.</p>
              </div>
              <PlugZap className="h-6 w-6 text-primary" />
            </div>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-5 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-primary"
              placeholder="Token name"
            />
            <button onClick={createToken} disabled={loading} className="btn-primary mt-4 w-full py-3 disabled:opacity-50">
              {loading ? "Creating..." : "Create token"}
            </button>
            {newToken && (
              <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/10 p-4">
                <p className="t-caption text-primary">New token</p>
                <code className="mt-3 block break-all rounded-xl bg-black/50 p-3 text-xs text-white">{newToken}</code>
                <button onClick={() => copy("token", newToken)} className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-primary">
                  <Copy className="h-4 w-4" /> {copied === "token" ? "Copied" : "Copy token"}
                </button>
              </div>
            )}
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[.04] p-5">
            <h2 className="text-xl font-semibold">Active tokens</h2>
            <div className="mt-4 space-y-3">
              {tokens.length === 0 && <p className="text-sm text-white/45">No external tokens yet.</p>}
              {tokens.map((token) => (
                <div key={token.id} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/25 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-bold">{token.name}</p>
                    <p className="mt-1 text-xs text-white/45">
                      {token.token_prefix}... | {token.revoked_at ? "Revoked" : "Active"} | Last used {token.last_used_at ? new Date(token.last_used_at).toLocaleString() : "never"}
                    </p>
                  </div>
                  {!token.revoked_at && (
                    <button onClick={() => revokeToken(token.id)} className="inline-flex items-center gap-2 rounded-xl border border-red-400/20 px-4 py-2 text-sm font-bold text-red-300 hover:bg-red-500/10">
                      <Trash2 className="h-4 w-4" /> Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
