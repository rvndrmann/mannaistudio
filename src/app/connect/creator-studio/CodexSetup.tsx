"use client"

import { useState } from "react"

export default function CodexSetup({ endpoint }: { endpoint: string }) {
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState("")
  const commands = `codex mcp add creator-studio --url ${endpoint}\ncodex mcp login creator-studio\ncodex mcp list`
  const prompt = `Help me connect Codex to my AI Director Hub account using the remote MCP server ${endpoint}.

First check whether a server named creator-studio is already configured. Keep other MCP servers unchanged. If creator-studio already points to a different URL, ask me before replacing it.

If it is not configured, run:
codex mcp add creator-studio --url ${endpoint}

Authenticate using:
codex mcp login creator-studio

Let me complete the browser sign-in and approve Connect my account on AI Director Hub. Do not ask me to paste passwords, API keys, or access tokens into chat. If the Codex CLI is unavailable, guide me through adding a remote HTTP MCP server in Codex settings with the name creator-studio and the URL above, then signing in.

Verify the connection with codex mcp list. If the tools are not available in this chat yet, tell me to start a new chat or reload Codex. Once the tools are available, list my Creator Studio projects and hired-team orders using the connected tools. Work only with my authenticated account. Do not create projects, generate paid media, or send messages until I request those actions.`
  async function copy(label: string, value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(label); setError("") }
    catch { setError("Copy the text manually from the box below.") }
  }
  const examples = [
    "Show my previous Creator Studio projects.",
    "Create a new project called Summer Campaign, then help me plan it with my AI Director.",
    "Open my project and use its existing storyboard, characters, and assets to plan the next scene.",
    "Show my hired-team orders, what is left, and the expected delivery date.",
    "Show Hire Our Team packages, help me choose one, and save my brief with a checkout link.",
    "Show the approved final delivery for my completed order.",
  ]
  return <div className="space-y-8">
    <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">1. Copy this prompt into Codex</h2><button onClick={() => void copy("prompt", prompt)} className="rounded-xl bg-[#b9f42e] px-5 py-3 font-semibold text-black">{copied === "prompt" ? "Prompt copied ✓" : "Copy connection prompt"}</button></div>
      <p className="text-sm text-white/70">Codex can help configure the connection. You complete sign-in and account approval in your browser.</p>
      <textarea readOnly aria-label="Codex connection prompt" value={prompt} className="h-72 w-full rounded-xl border border-white/10 bg-black/30 p-4 text-sm leading-relaxed text-white/80" />
    </section>
    <section className="space-y-4 rounded-2xl border border-white/10 p-6">
      <h2 className="text-xl font-semibold">2. Sign in to your own account</h2>
      <p className="text-white/70">In the browser window opened by Codex, sign in to AI Director Hub. Check the account shown and the requested permissions, then choose <strong className="text-white">Connect my account</strong>.</p>
      <p className="text-sm text-white/60">Start a new Codex chat or reload Codex if the new tools do not appear. You can disconnect an assistant on your account connections page.</p>
      <a href="/connect/creator-studio" className="inline-block text-[#b9f42e] underline">Manage my account connections →</a>
    </section>
    <section className="space-y-4 rounded-2xl border border-white/10 p-6">
      <h2 className="text-xl font-semibold">Prefer to connect manually?</h2>
      <p className="text-white/70">In Codex settings, add a remote HTTP MCP server named <code>creator-studio</code>, enter this URL, and use the sign-in option.</p>
      <div className="flex flex-wrap items-center gap-3"><code className="break-all rounded-lg bg-white/5 p-3 text-sm">{endpoint}</code><button onClick={() => void copy("url", endpoint)} className="rounded-lg border border-white/20 px-4 py-2">{copied === "url" ? "URL copied ✓" : "Copy URL"}</button></div>
      <p className="text-sm text-white/60">With the Codex CLI installed, you can run these commands in your terminal:</p>
      <pre className="overflow-x-auto rounded-xl bg-black/30 p-4 text-sm"><code>{commands}</code></pre>
      <button onClick={() => void copy("commands", commands)} className="rounded-lg border border-white/20 px-4 py-2">{copied === "commands" ? "Commands copied ✓" : "Copy commands"}</button>
      <a href="https://learn.chatgpt.com/docs/extend/mcp?surface=cli" target="_blank" rel="noopener noreferrer" className="block text-sm text-white/60 underline">Official OpenAI MCP setup documentation</a>
    </section>
    <section className="space-y-4"><h2 className="text-xl font-semibold">3. Talk to your studio</h2><div className="grid gap-3">{examples.map((example) => <button key={example} onClick={() => void copy(example, example)} className="rounded-xl border border-white/10 p-4 text-left text-sm text-white/80 hover:bg-white/5">{example}<span className="mt-2 block text-xs text-[#b9f42e]">{copied === example ? "Copied ✓" : "Copy example →"}</span></button>)}</div><p className="text-sm text-white/60">Creating and generating requires active Creator Studio access. Generation uses your credits and configured providers. Hired-team customers can track their own orders and approved deliveries without a Studio subscription.</p></section>
    <p role="status" aria-live="polite" className="text-sm text-[#b9f42e]">{copied ? "Copied to clipboard. Paste it into Codex." : ""}</p>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
  </div>
}
