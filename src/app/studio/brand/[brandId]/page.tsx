"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import {
  ArrowLeft,
  Building2,
  FileText,
  FolderOpen,
  Globe,
  Images,
  Inbox,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
} from "lucide-react";
import CreditBadge from "@/components/CreditBadge";
import { useAuth } from "@/components/auth/auth-provider";
import AgentEditor from "@/components/studio/brand/AgentEditor";
import BrandAssets from "@/components/studio/brand/BrandAssets";
import BrandChat from "@/components/studio/brand/BrandChat";
import BrandKnowledge from "@/components/studio/brand/BrandKnowledge";
import BrandLeads from "@/components/studio/brand/BrandLeads";
import BrandProfileForm from "@/components/studio/brand/BrandProfileForm";
import BrandScripts from "@/components/studio/brand/BrandScripts";
import type { BrandAgentView, BrandChatView, BrandWorkspaceData } from "@/components/studio/brand/types";

type SidePanel = "brand" | "knowledge" | "assets" | "scripts" | "leads";

const panels: { id: SidePanel; label: string; icon: typeof Building2 }[] = [
  { id: "brand", label: "Brand", icon: Building2 },
  { id: "knowledge", label: "Knowledge", icon: FolderOpen },
  { id: "assets", label: "Assets", icon: Images },
  { id: "scripts", label: "Scripts", icon: FileText },
  { id: "leads", label: "Leads", icon: Inbox },
];

export default function BrandWorkspacePage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = use(params);
  const { user, signInWithGoogle } = useAuth();
  const [data, setData] = useState<BrandWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [panel, setPanel] = useState<SidePanel>("brand");
  const [mobileView, setMobileView] = useState<"chat" | "panel">("chat");
  const [editingAgent, setEditingAgent] = useState<BrandAgentView | null>(null);
  const [agentEditorOpen, setAgentEditorOpen] = useState(false);
  const [startingChat, setStartingChat] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/studio/brands/${brandId}`);
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || "Could not open this brand.");
        setData(payload);
        setActiveChatId(payload.chats?.[0]?.id || null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not open this brand.");
      } finally {
        setLoading(false);
      }
    })();
  }, [brandId, user]);

  const startChat = async (agentKey: string) => {
    setStartingChat(true);
    try {
      const res = await fetch(`/api/studio/brands/${brandId}/chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentKey }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Could not start the chat.");
      setData((current) => (current ? { ...current, chats: [payload.chat, ...current.chats] } : current));
      setActiveChatId(payload.chat.id);
      setMobileView("chat");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the chat.");
    } finally {
      setStartingChat(false);
    }
  };

  const deleteChat = async (chat: BrandChatView) => {
    setData((current) => (current ? { ...current, chats: current.chats.filter((item) => item.id !== chat.id) } : current));
    if (activeChatId === chat.id) setActiveChatId(null);
    await fetch(`/api/studio/brands/${brandId}/chats/${chat.id}`, { method: "DELETE" });
  };

  if (!user && !loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#070807] px-6 text-center text-white">
        <div>
          <h1 className="text-xl font-bold">Sign in to open this brand room</h1>
          <button onClick={() => signInWithGoogle()} className="mt-5 rounded-lg bg-[#b9f42e] px-5 py-2.5 text-sm font-bold text-black">
            Sign in
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#070807] text-zinc-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#070807] px-6 text-center text-white">
        <div>
          <p className="text-sm font-bold text-red-400">{error || "Brand not found."}</p>
          <Link href="/studio/brand" className="mt-4 inline-block rounded-lg bg-[#b9f42e] px-4 py-2 text-[13px] font-bold text-black">
            Back to brand rooms
          </Link>
        </div>
      </div>
    );
  }

  const activeChat = data.chats.find((chat) => chat.id === activeChatId) || null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#070807] text-white">
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-white/[0.06] bg-[#0a0a0a] px-3 sm:flex-nowrap">
        <Link href="/studio/brand" className="flex items-center gap-1.5 text-[12px] font-bold text-zinc-300 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Brands
        </Link>
        <span className="truncate text-[13px] font-bold">{data.brand.name}</span>
        {data.brand.website_url && (
          <a
            href={data.brand.website_url}
            target="_blank"
            rel="noreferrer noopener"
            className="hidden items-center gap-1 rounded-full border border-white/[0.06] bg-[#141414] px-2.5 py-1 text-[11px] text-zinc-400 hover:text-[#b9f42e] sm:flex"
          >
            <Globe className="h-3 w-3" />
            {data.brand.website_url.replace(/^https?:\/\//, "").slice(0, 32)}
          </a>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/studio"
            className="hidden rounded-full bg-[#141414] px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 hover:bg-[#1e1e1e] sm:block"
          >
            Productions
          </Link>
          <CreditBadge />
        </div>
      </header>

      {/* Mobile switcher: the chat and the brand panels cannot both fit. */}
      <div className="flex shrink-0 gap-1.5 border-b border-white/[0.06] bg-[#0a0a0a] px-3 py-2 xl:hidden">
        <button
          onClick={() => setMobileView("chat")}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ${
            mobileView === "chat" ? "bg-[#b9f42e] text-black" : "bg-[#141414] text-zinc-300"
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" /> Chat
        </button>
        {panels.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setPanel(item.id);
              setMobileView("panel");
            }}
            className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${
              mobileView === "panel" && panel === item.id ? "bg-[#b9f42e] text-black" : "bg-[#141414] text-zinc-300"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Agents and chats */}
        <aside className="hidden w-64 shrink-0 flex-col overflow-auto border-r border-white/[0.06] bg-[#0b0c0b] xl:flex">
          <div className="p-3">
            <p className="text-[11px] font-bold tracking-[.16em] text-zinc-500">AGENTS</p>
            <div className="mt-2 space-y-1">
              {data.agents.map((agent) => (
                <div key={agent.agent_key} className="group flex items-center gap-1 rounded-lg px-1 hover:bg-white/[0.03]">
                  <button
                    onClick={() => startChat(agent.agent_key)}
                    disabled={startingChat}
                    className="min-w-0 flex-1 py-2 text-left"
                    title={agent.role_summary}
                  >
                    <span className="block truncate text-[12px] font-bold text-zinc-200">{agent.name}</span>
                    <span className="block truncate text-[10px] text-zinc-500">
                      {agent.writes_script ? "writes scripts" : "advises"}
                      {agent.enabled ? "" : " · off"}
                    </span>
                  </button>
                  {data.canEdit && (
                    <button
                      onClick={() => {
                        setEditingAgent(agent);
                        setAgentEditorOpen(true);
                      }}
                      className="rounded p-1 text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:text-[#b9f42e]"
                      title="Edit this agent's brief"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {data.canEdit && (
              <button
                onClick={() => {
                  setEditingAgent(null);
                  setAgentEditorOpen(true);
                }}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#141414] px-2 py-2 text-[11px] font-bold text-zinc-300 hover:border-[#b9f42e]/40"
              >
                <UserPlus className="h-3.5 w-3.5" /> Add your own agent
              </button>
            )}
          </div>

          <div className="border-t border-white/[0.06] p-3">
            <div className="flex items-center">
              <p className="text-[11px] font-bold tracking-[.16em] text-zinc-500">CHATS</p>
              <button
                onClick={() => startChat(data.agents[0]?.agent_key || "content_strategist")}
                disabled={startingChat}
                className="ml-auto rounded p-1 text-zinc-500 hover:text-[#b9f42e]"
                title="New chat"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 space-y-1">
              {data.chats.length === 0 && <p className="text-[11px] text-zinc-600">No chats yet.</p>}
              {data.chats.map((chat) => (
                <div
                  key={chat.id}
                  className={`group flex items-center gap-1 rounded-lg px-2 ${
                    chat.id === activeChatId ? "bg-[#b9f42e]/10" : "hover:bg-white/[0.03]"
                  }`}
                >
                  <button onClick={() => setActiveChatId(chat.id)} className="min-w-0 flex-1 py-2 text-left">
                    <span className={`block truncate text-[12px] ${chat.id === activeChatId ? "font-bold text-[#b9f42e]" : "text-zinc-300"}`}>
                      {chat.title}
                    </span>
                    <span className="block truncate text-[10px] text-zinc-500">
                      {data.agents.find((agent) => agent.agent_key === chat.agent_key)?.name || chat.agent_key}
                    </span>
                  </button>
                  <button
                    onClick={() => deleteChat(chat)}
                    className="rounded p-1 text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Chat */}
        <main className={`min-h-0 min-w-0 flex-1 flex-col bg-[#0d0d0d] ${mobileView === "chat" ? "flex" : "hidden"} xl:flex`}>
          <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-white/[0.06] p-2 xl:hidden">
            {data.agents.map((agent) => (
              <button
                key={agent.agent_key}
                onClick={() => startChat(agent.agent_key)}
                className="shrink-0 whitespace-nowrap rounded-full bg-[#141414] px-3 py-1.5 text-[11px] font-bold text-zinc-300"
              >
                + {agent.name}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            <BrandChat
              brandId={brandId}
              chat={activeChat}
              agents={data.agents.filter((agent) => agent.enabled)}
              onChatUpdated={(chat) =>
                setData((current) =>
                  current ? { ...current, chats: current.chats.map((item) => (item.id === chat.id ? chat : item)) } : current,
                )
              }
              onScriptSaved={(script) => {
                setData((current) => (current ? { ...current, scripts: [script, ...current.scripts] } : current));
                setPanel("scripts");
              }}
              onBrandLearned={({ brand, knowledge, assets }) =>
                setData((current) =>
                  current
                    ? {
                        ...current,
                        brand: brand || current.brand,
                        // Prepended and de-duplicated, because the same entry can
                        // arrive twice if a turn saved it and the panel already
                        // had it from an earlier reload.
                        knowledge: knowledge?.length
                          ? [...knowledge.filter((entry) => !current.knowledge.some((item) => item.id === entry.id)), ...current.knowledge]
                          : current.knowledge,
                        assets: assets?.length
                          ? [...assets.filter((entry) => !current.assets.some((item) => item.id === entry.id)), ...current.assets]
                          : current.assets,
                      }
                    : current,
                )
              }
            />
          </div>
        </main>

        {/* Brand record, knowledge base, assets, scripts */}
        <aside
          className={`min-h-0 w-full flex-col overflow-hidden border-l border-white/[0.06] bg-[#0b0c0b] ${
            mobileView === "panel" ? "flex" : "hidden"
          } xl:flex xl:w-[420px] xl:shrink-0`}
        >
          <div className="hidden shrink-0 gap-1.5 border-b border-white/[0.06] p-2 xl:flex">
            {panels.map((item) => (
              <button
                key={item.id}
                onClick={() => setPanel(item.id)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                  panel === item.id ? "bg-[#b9f42e] text-black" : "bg-[#141414] text-zinc-300 hover:bg-[#1e1e1e]"
                }`}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {panel === "brand" && (
              <BrandProfileForm
                brand={data.brand}
                canEdit={data.canEdit}
                onSaved={(brand) => setData((current) => (current ? { ...current, brand } : current))}
              />
            )}
            {panel === "knowledge" && (
              <BrandKnowledge
                brandId={brandId}
                entries={data.knowledge}
                canEdit={data.canEdit}
                onChange={(knowledge) => setData((current) => (current ? { ...current, knowledge } : current))}
              />
            )}
            {panel === "assets" && (
              <BrandAssets
                brandId={brandId}
                assets={data.assets}
                canEdit={data.canEdit}
                onChange={(assets) => setData((current) => (current ? { ...current, assets } : current))}
              />
            )}
            {panel === "leads" && <BrandLeads brandId={brandId} />}
            {panel === "scripts" && (
              <BrandScripts
                brandId={brandId}
                scripts={data.scripts}
                canEdit={data.canEdit}
                onChange={(scripts) => setData((current) => (current ? { ...current, scripts } : current))}
              />
            )}
          </div>
        </aside>
      </div>

      {agentEditorOpen && (
        <AgentEditor
          brandId={brandId}
          agent={editingAgent}
          onClose={() => setAgentEditorOpen(false)}
          onSaved={(agents) => setData((current) => (current ? { ...current, agents } : current))}
        />
      )}
    </div>
  );
}
