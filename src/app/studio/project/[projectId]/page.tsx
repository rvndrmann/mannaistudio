"use client";

import Link from "next/link";
import { FormEvent, use, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Bot,
  ChevronDown,
  Clapperboard,
  Gem,
  History,
  FileText,
  Film,
  Image as ImageIcon,
  LayoutPanelTop,
  Loader2,
  Mic,
  MicOff,
  Download,
  MoreVertical,
  Pencil,
  Plus,
  Send,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  Users,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import { activeDirectorModels, defaultDirectorModelId, defaultDirectorModels, type DirectorModelConfig } from "@/lib/studio/ai-models";
import { getModelLabel, imageGenerationModels, videoGenerationModels } from "@/lib/studio/generation-models";
import { defaultDirectorWorkflows, type DirectorWorkflowConfig } from "@/lib/studio/workflows";
import { calculateCreditCost, getUserCredits } from "@/lib/studio/credits";
import { notifyCreditBalanceChanged } from "@/lib/credit-balance-events";
import { parseVoiceToolCall, type VoiceToolCall } from "@/lib/studio/voice";
import { createClient } from "@/lib/supabase/client";
import { parseDirectorTimeline, type DirectorTimelineBlock } from "@/lib/studio/timeline";
import { EntityMentionInput } from "@/components/studio/EntityMentionInput";
import ShareProjectDialog from "@/components/studio/ShareProjectDialog";
import ConvertToEnterpriseDialog from "@/components/enterprise/ConvertToEnterpriseDialog";
import ProjectActivityDialog from "@/components/studio/ProjectActivityDialog";
import { findMentionedEntityIds } from "@/lib/studio/entity-mentions";

import {
  Share2,
  Calendar as CalendarIcon,
  BarChart3,
  Megaphone,
  Crosshair,
  Settings2,
  Sliders,
} from "lucide-react";
import { SocialAccountsPage } from "@/components/studio/marketing/SocialConnectionCard";
import { ContentCalendar } from "@/components/studio/marketing/ContentCalendar";
import { AutopilotPanel } from "@/components/studio/marketing/AutopilotPanel";
import { AnalyticsDashboard } from "@/components/studio/marketing/AnalyticsDashboard";
import { AdsManager } from "@/components/studio/marketing/AdsManager";
import { CompetitorIntelligence } from "@/components/studio/marketing/CompetitorIntelligence";
import { MarketingAgentHome } from "@/components/studio/marketing/MarketingAgentHome";
import { IntegrationsSettings } from "@/components/studio/marketing/IntegrationsSettings";

type Entity = {
  id: string;
  name: string;
  type: "character" | "scene" | "prop";
  description: string | null;
  reference_images: string[];
  metadata: Record<string, unknown>;
  voice_id: string | null;
  status: string;
};

function entityImageGenerationStatus(entity: Entity): "generating" | "completed" | "failed" | null {
  const generation = entity.metadata?.image_generation
  if (!generation || typeof generation !== "object") return null
  const status = (generation as Record<string, unknown>).status
  return status === "generating" || status === "completed" || status === "failed" ? status : null
}
type Shot = {
  id: string;
  title: string;
  prompt: string | null;
  keyframe_image: string | null;
  video_url: string | null;
  video_status: string;
  duration_seconds: number;
  aspect_ratio?: string | null;
  resolution?: string | null;
  referenced_entities: string[];
  order_index: number;
  is_trusted_provider_asset?: boolean;
  provider_asset_uri?: string | null;
  metadata?: Record<string, unknown>;
};
type Episode = {
  id: string;
  name: string;
  description: string | null;
  script_content: unknown;
};
type Workspace = {
  project: {
    id: string;
    name: string;
    default_aspect: string;
    default_style: string;
    production_mode?: string;
    project_type?: string;
    creative_brief?: Record<string, unknown>;
    enterprise_status?: string | null;
    metadata?: Record<string, unknown>;
  };
  episodes: Episode[];
  activeEpisode: Episode;
  entities: Entity[];
  shots: Shot[];
  scriptSuggestions: {
    id: string;
    content: unknown;
    summary: string;
    status: string;
  }[];
  chatMessages: { id: string; role: string; content: string | null; media?: Array<Record<string, unknown>> | null; suggested_actions?: Array<Record<string, unknown>> | null; timeline_blocks?: unknown; referenced_entity_ids?: string[] | null }[];
  activeSessionId?: string | null;
  chatSessions: { id: string; title: string; model?: string | null; created_at: string; updated_at?: string | null }[];
  actionProposals: {
    id: string;
    action_type: string;
    title: string;
    summary: string | null;
    status: string;
    estimated_credits: number;
    payload: Record<string, unknown>;
    created_at: string;
    session_id?: string | null;
  }[];
  directorWorkflows?: DirectorWorkflowConfig[];
  features?: Record<string, boolean>;
  production?: {
    series: Array<Record<string, unknown>>;
    scenes: Array<Record<string, unknown>>;
    referenceAssets: Array<Record<string, unknown>>;
    continuityIssues: Array<Record<string, unknown>>;
    revisions: Array<Record<string, unknown>>;
    generationJobs: Array<Record<string, unknown>>;
    creditAccount: { balance: number; reserved: number } | null;
  };
};
const tabs = [
  ["canvas", "Canvas", LayoutPanelTop],
  ["script", "Script", FileText],
  ["characters", "Characters & Assets", Users],
  ["storyboard", "Storyboard", ImageIcon],
  ["timeline", "Timeline", Film],
] as const;
const productionTab = ["production", "Production", Clapperboard] as const;
const marketingTabs = [
  ["marketing", "AI Agent", Bot],
  ["social-accounts", "Social Accounts", Share2],
  ["calendar", "Content Calendar", CalendarIcon],
  ["autopilot", "Autopilot", Sliders],
  ["analytics", "Analytics", BarChart3],
  ["ads-manager", "Ads Manager", Megaphone],
  ["competitors", "Competitor Radar", Crosshair],
  ["integrations", "Integrations", Settings2],
] as const;
const blankScript = {
  title: "Untitled production",
  overview: "",
  body: "",
  scenes: [] as {
    heading: string;
    timing: string;
    direction: string;
    framing: string;
    continuity: string;
  }[],
};

export default function WorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const [data, setData] = useState<Workspace | null>(null);
  const [tab, setTabState] = useState<string>("canvas");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlParams = new URLSearchParams(window.location.search);
    const urlTab = urlParams.get("tab");
    const validTabs = [
      "canvas", "script", "characters", "storyboard", "timeline", "production",
      "marketing", "social-accounts", "calendar", "autopilot", "analytics", "ads-manager", "competitors", "integrations"
    ];
    if (urlTab && validTabs.includes(urlTab)) {
      setTabState(urlTab);
      return;
    }
    const savedTab = localStorage.getItem(`studio_tab_${projectId}`);
    if (savedTab && validTabs.includes(savedTab)) {
      setTabState(savedTab);
      const url = new URL(window.location.href);
      url.searchParams.set("tab", savedTab);
      window.history.replaceState(null, "", url.toString());
    }
  }, [projectId]);

  const setTab = (nextTab: string) => {
    setTabState(nextTab);
    if (typeof window !== "undefined") {
      localStorage.setItem(`studio_tab_${projectId}`, nextTab);
      const url = new URL(window.location.href);
      url.searchParams.set("tab", nextTab);
      window.history.replaceState(null, "", url.toString());
    }
  };
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [proposalBusy, setProposalBusy] = useState<string | null>(null);
  const [chatUploading, setChatUploading] = useState(false);
  const [directorModel, setDirectorModel] = useState<string>(defaultDirectorModelId);
  const [directorModels, setDirectorModels] = useState<DirectorModelConfig[]>(defaultDirectorModels.map((model) => ({ ...model })).filter((model) => model.status === "active"));
  const [voiceState, setVoiceState] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);
  const voiceConnectionRef = useRef<RTCPeerConnection | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const hasLoadedRef = useRef(false);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [data?.chatMessages.length, chatSending, chatError, voiceState]);
  useEffect(() => () => {
    voiceConnectionRef.current?.close();
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);
  useEffect(() => {
    createClient()
      .from("site_settings")
      .select("value")
      .eq("key", "ai_director_models")
      .maybeSingle()
      .then(({ data: settings }) => {
        const nextModels = activeDirectorModels(settings?.value);
        if (!nextModels.length) return;
        setDirectorModels(nextModels);
        setDirectorModel((current) => nextModels.some((model) => model.id === current) ? current : nextModels[0].id);
      });
  }, []);
  const [assetType, setAssetType] = useState<Entity["type"] | null>(null);
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [episodeMenu, setEpisodeMenu] = useState(false);
  const [chatSessionMenu, setChatSessionMenu] = useState(false);
  const [showBasicSettings, setShowBasicSettings] = useState(false);
  const openedInitialSettingsRef = useRef(false);
  const [projectMenu, setProjectMenu] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [enterpriseOpen, setEnterpriseOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await fetch(
        `/api/studio/projects/${projectId}${episodeId || chatSessionId ? `?${new URLSearchParams({ ...(episodeId ? { episodeId } : {}), ...(chatSessionId ? { sessionId: chatSessionId } : {}) }).toString()}` : ""}`,
      );
      const json = await r.json();
      if (!r.ok) throw new Error(json.error);
      setData(json);
    } catch {
      if (!silent) setData(null);
    } finally {
      if (!silent) setLoading(false);
    }
  };
  useEffect(() => {
    // Only the first load may blank the workspace. Switching chat session or
    // episode swaps data in place, so the full-screen loader would read as an
    // unexpected page reload.
    load(hasLoadedRef.current);
    hasLoadedRef.current = true;
  }, [projectId, episodeId, chatSessionId]);
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`director-workflow-${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "creator_workflow_runs", filter: `project_id=eq.${projectId}` }, () => load(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "creator_generation_jobs", filter: `project_id=eq.${projectId}` }, () => load(true))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [projectId, episodeId, chatSessionId]);
  useEffect(() => {
    if (!data || openedInitialSettingsRef.current || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("openSettings") !== "1") return;
    openedInitialSettingsRef.current = true;
    setShowBasicSettings(true);
    url.searchParams.delete("openSettings");
    window.history.replaceState(null, "", url.toString());
  }, [data]);
  const save = async (body: unknown) => {
    const r = await fetch(`/api/studio/projects/${projectId}/workspace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await r.json();
    if (!r.ok) throw new Error(json.error);
    return json;
  };
  if (loading)
    return (
      <div className="grid min-h-screen place-items-center bg-[#070807]">
        <Loader2 className="animate-spin text-[#b9f42e]" />
      </div>
    );
  if (!data)
    return (
      <div className="grid min-h-screen place-items-center bg-[#070807] text-white">
        <div className="text-center">
          <p className="text-xl font-semibold">Workspace unavailable</p>
          <Link href="/studio" className="mt-4 inline-block text-[#b9f42e]">
            Back to Studio
          </Link>
        </div>
      </div>
    );
  const episode = data.activeEpisode || data.episodes[0];
  const visibleTabs = data.features?.production_modes_enabled
    ? [...tabs, productionTab]
    : tabs;

  const createEpisode = async () => {
    const created = await save({ action: "createEpisode" });
    setEpisodeMenu(false);
    setEpisodeId(created.id);
    setTab("script");
  };
  const createChatSession = async () => {
    const created = await save({ action: "createChatSession", episodeId: episode.id, model: directorModel, title: "New Chat" }) as { id: string };
    setChatSessionMenu(false);
    // Setting the session id triggers the silent reload effect; loading here too
    // would fetch the same workspace twice.
    setChatSessionId(created.id);
  };
  const sendDirectorMessage = async (outgoing: string) => {
    if (!outgoing.trim() || chatSending) return;
    outgoing = outgoing.trim();
    const mentionedEntityIds = findMentionedEntityIds(outgoing, data.entities);
    // The timeline owns the sent copy. Clear the composer before awaiting the
    // network response so the same message never appears as an unsent draft.
    setMessage("");
    setChatSending(true);
    setChatError(null);
    setData((current) => current ? {
      ...current,
      chatMessages: [
        ...current.chatMessages,
        { id: `local-user-${Date.now()}`, role: "user", content: outgoing, referenced_entity_ids: mentionedEntityIds },
      ],
    } : current);
    try {
      const response = await fetch(`/api/studio/projects/${projectId}/director/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: episode.id, sessionId: data.activeSessionId || chatSessionId || undefined, message: outgoing, mentionedEntityIds, model: directorModel, idempotencyKey: crypto.randomUUID() }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "AI Director could not respond");
      notifyCreditBalanceChanged(typeof json.creditBalance === "number" ? json.creditBalance : undefined);
      if (json.sessionId) setChatSessionId(json.sessionId);
      setData((current) => current && json.assistantMessage ? {
        ...current,
        activeSessionId: json.sessionId || current.activeSessionId,
        chatMessages: [
          ...current.chatMessages,
          json.assistantMessage,
        ],
      } : current);
      await load(true);
    } catch (error) {
      notifyCreditBalanceChanged();
      setChatError(error instanceof Error ? error.message : "AI Director could not respond");
      await load(true);
    } finally {
      setChatSending(false);
    }
  };
  const sendChat = async (e: FormEvent) => {
    e.preventDefault();
    await sendDirectorMessage(message);
  };
  const uploadChatFiles = async (files: FileList | null) => {
    const selected = Array.from(files || []);
    if (!selected.length || chatUploading) return;
    setChatUploading(true);
    setChatError(null);
    try {
      for (const file of selected) {
        const form = new FormData();
        form.append("episodeId", episode.id);
        if (data.activeSessionId) form.append("sessionId", data.activeSessionId);
        form.append("file", file);
        const response = await fetch(`/api/studio/projects/${projectId}/director/uploads`, { method: "POST", body: form });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Upload failed");
        if (json.sessionId) setChatSessionId(json.sessionId);
        setData((current) => current ? {
          ...current,
          activeSessionId: json.sessionId || current.activeSessionId,
          chatMessages: [...current.chatMessages, json.message],
        } : current);
      }
      await load(true);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setChatUploading(false);
      if (chatFileInputRef.current) chatFileInputRef.current.value = "";
    }
  };
  const decideProposal = async (proposalId: string, decision: "approved" | "rejected") => {
    setProposalBusy(proposalId);
    setChatError(null);
    try {
      const response = await fetch(`/api/studio/projects/${projectId}/director/proposals/${proposalId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not update proposal");
      notifyCreditBalanceChanged(typeof json.creditBalance === "number" ? json.creditBalance : undefined);
      await load(true);
    } catch (error) {
      notifyCreditBalanceChanged();
      setChatError(error instanceof Error ? error.message : "Could not update proposal");
    } finally {
      setProposalBusy(null);
    }
  };
  const stopVoice = () => {
    voiceConnectionRef.current?.close();
    voiceConnectionRef.current = null;
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceStreamRef.current = null;
    setVoiceState("idle");
  };
  const startVoice = async () => {
    if (voiceState === "connected") return stopVoice();
    setVoiceState("connecting");
    setVoiceError(null);
    try {
      const chatSession = data.activeSessionId || chatSessionId || undefined;
      const sessionResponse = await fetch(`/api/studio/projects/${projectId}/voice/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voice: "marin", language: "en", interactionMode: "hands_free", episodeId: episode?.id, chatSessionId: chatSession }) });
      const session = await sessionResponse.json();
      if (!sessionResponse.ok) throw new Error(session.error || "Could not start the Voice Director");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const peer = new RTCPeerConnection();
      const audio = new Audio();
      audio.autoplay = true;
      peer.ontrack = (event) => { audio.srcObject = event.streams[0]; };
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      const events = peer.createDataChannel("oai-events");
      const runVoiceTool = async (call: VoiceToolCall) => {
        let output: Record<string, unknown>;
        let status: "completed" | "awaiting_approval" | "failed" = "completed";
        let summary = "";
        let proposalId: string | undefined;
        let executionId: string | undefined;
        try {
          const response = await fetch(`/api/studio/projects/${projectId}/director/tools`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tool: call.name, input: call.arguments, sessionId: chatSession, idempotencyKey: `voice:${crypto.randomUUID()}` }),
          });
          const json = await response.json();
          if (!response.ok) throw new Error(json.error || "Voice Director tool failed");
          output = json;
          proposalId = json.proposal?.id;
          executionId = json.executionId || json.execution?.id;
          status = json.approvalRequired ? "awaiting_approval" : "completed";
          const label = call.name.replaceAll("_", " ");
          summary = json.approvalRequired
            ? `Voice Director prepared “${label}” and is waiting for your approval.`
            : `Voice Director ran “${label}”.`;
          const creditBalance = (json.data as Record<string, unknown> | undefined)?.creditBalance;
          if (typeof creditBalance === "number") notifyCreditBalanceChanged(creditBalance);
        } catch (toolError) {
          const message = toolError instanceof Error ? toolError.message : "Voice Director tool failed";
          output = { error: message };
          status = "failed";
          summary = `Voice Director could not run “${call.name.replaceAll("_", " ")}”: ${message}`;
        }
        // Mirror the spoken action into the chat timeline so approvals and audit
        // history do not depend on the user remembering what they said.
        if (chatSession) {
          try {
            await fetch(`/api/studio/projects/${projectId}/director/voice-activity`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId: chatSession, tool: call.name, status, summary, proposalId, executionId }),
            });
          } catch {
            // Logging must never break the voice turn.
          }
        }
        await load(true);
        if (events.readyState !== "open") return;
        events.send(JSON.stringify({ type: "conversation.item.create", item: { type: "function_call_output", call_id: call.callId, output: JSON.stringify(output) } }));
        events.send(JSON.stringify({ type: "response.create" }));
      };
      events.addEventListener("message", (event) => {
        let payload: unknown;
        try { payload = JSON.parse(event.data); } catch { return; }
        const call = parseVoiceToolCall(payload);
        if (call) { void runVoiceTool(call); return; }
        if ((payload as { type?: string })?.type?.includes("error")) setVoiceError("The Voice Director connection reported an error. Please retry.");
      });
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const answerResponse = await fetch(session.realtimeUrl, { method: "POST", headers: { Authorization: `Bearer ${session.ephemeralCredential}`, "Content-Type": "application/sdp" }, body: offer.sdp });
      if (!answerResponse.ok) throw new Error("Could not connect the Voice Director");
      await peer.setRemoteDescription({ type: "answer", sdp: await answerResponse.text() });
      voiceConnectionRef.current = peer;
      voiceStreamRef.current = stream;
      setVoiceState("connected");
    } catch (error) {
      stopVoice();
      setVoiceState("error");
      setVoiceError(error instanceof Error ? error.message : "Could not start the Voice Director");
    }
  };
  return (
    <main className="h-screen overflow-hidden bg-black text-[#e8e6df]">
      {shareOpen && <ShareProjectDialog projectId={projectId} onClose={() => setShareOpen(false)} />}
      {activityOpen && <ProjectActivityDialog projectId={projectId} onClose={() => setActivityOpen(false)} />}
      {enterpriseOpen && (
        <ConvertToEnterpriseDialog
          projectId={projectId}
          projectName={data.project.name || "this project"}
          onClose={() => setEnterpriseOpen(false)}
          onPlaced={() => load(true)}
        />
      )}
      <header className="relative z-50 flex h-12 items-center gap-2 border-b border-white/[0.06] bg-[#0a0a0a] px-3">
        {(projectMenu || episodeMenu) && (
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => {
              setProjectMenu(false);
              setEpisodeMenu(false);
            }}
          />
        )}
        <Link
          href="/studio"
          className="rounded-md p-1.5 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <Clapperboard className="hidden h-4 w-4 text-[#b9f42e] sm:block" />
        <p className="truncate text-[13px] font-semibold text-zinc-100">{data.project.name}</p>
        <span className="text-zinc-600">/</span>

        {/* Episode Selector Dropdown */}
        <div className="relative z-50">
          <button
            onClick={() => setEpisodeMenu((open) => !open)}
            className="flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-zinc-300 hover:text-[#b9f42e] transition"
          >
            {episode?.name || "Episode 1"}
            <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
          </button>
          {episodeMenu && (
            <div className="absolute left-0 top-full z-[100] mt-1.5 w-[280px] overflow-hidden rounded-lg border border-white/[0.08] bg-[#141414] p-1.5 shadow-2xl">
              <div className="space-y-0.5">
                {data.episodes.map((item, index) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setEpisodeId(item.id);
                      setEpisodeMenu(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[12px] ${item.id === episode.id ? "bg-white/[0.06] font-bold text-white" : "text-zinc-300 hover:bg-white/[0.04]"}`}
                  >
                    <span className="font-mono text-[11px] text-zinc-500">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
              <div className="my-1.5 border-t border-white/[0.06]" />
              <button
                onClick={() => {
                  setShowBasicSettings(true);
                  setEpisodeMenu(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[12px] text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
              >
                <Settings className="h-3.5 w-3.5 text-[#b9f42e]" /> Basic Settings
              </button>
              <button
                onClick={createEpisode}
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[12px] font-bold text-zinc-200 hover:bg-[#b9f42e]/10"
              >
                <Plus className="h-4 w-4 text-[#b9f42e]" /> Create Next Episode
              </button>
            </div>
          )}
        </div>

        {/* Share and Project Options Dropdown */}
        <div className="flex items-center gap-0.5 relative z-50">
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="rounded-md p-1 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300"
            title="Share project with team members"
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setProjectMenu((open) => !open)}
              className="rounded-md p-1 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300"
              title="Project settings & options"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
            {projectMenu && (
              <div className="absolute left-0 top-full z-[100] mt-1.5 w-48 overflow-hidden rounded-lg border border-white/[0.08] bg-[#141414] p-1.5 shadow-2xl">
                <button
                  type="button"
                  onClick={() => {
                    setShowBasicSettings(true);
                    setProjectMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[11px] font-bold text-zinc-300 hover:bg-white/[0.04] hover:text-[#b9f42e]"
                >
                  <Settings className="h-3.5 w-3.5 text-[#b9f42e]" />
                  <span>Settings</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    alert("Exporting project package...");
                    setProjectMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[11px] font-bold text-zinc-300 hover:bg-white/[0.04]"
                >
                  <Download className="h-3.5 w-3.5 text-zinc-500" />
                  <span>Export</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShareOpen(true);
                    setProjectMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[11px] font-bold text-zinc-300 hover:bg-white/[0.04]"
                >
                  <Users className="h-3.5 w-3.5 text-zinc-500" />
                  <span>Share to Team</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActivityOpen(true);
                    setProjectMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[11px] font-bold text-zinc-300 hover:bg-white/[0.04]"
                >
                  <History className="h-3.5 w-3.5 text-zinc-500" />
                  <span>Project activity</span>
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 overflow-x-auto">
          {visibleTabs.map(([id, label, Icon], index) => (
            <div key={id} className="flex items-center gap-1.5">
              <button
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-bold transition ${tab === id ? "bg-[#b9f42e] text-black" : "bg-[#141414] text-zinc-300 hover:bg-[#1e1e1e]"}`}
              >
                <Icon className="h-3 w-3" />
                <span>{label}</span>
              </button>
              {index < visibleTabs.length - 1 && (
                <span className="text-[10px] text-zinc-700">·</span>
              )}
            </div>
          ))}

          <span className="h-4 border-l border-white/[0.06] mx-0.5" />

          {/* AI Marketing & Ads Navigation Dropdown */}
          <div className="relative group">
            <button
              type="button"
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-bold transition ${marketingTabs.some(([id]) => id === tab) ? "bg-[#b9f42e] text-black" : "bg-[#141414] text-[#b9f42e] hover:bg-[#1e1e1e]"}`}
            >
              <Bot className="h-3 w-3" />
              <span>Marketing Agent</span>
              <ChevronDown className="h-3 w-3 text-zinc-500" />
            </button>
            <div className="absolute right-0 top-full z-[90] hidden w-48 rounded-lg border border-white/[0.08] bg-[#141414] p-1.5 shadow-2xl group-hover:block">
              {marketingTabs.map(([id, label, Icon]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[11px] font-bold transition ${tab === id ? "bg-[#b9f42e] text-black" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"}`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-[#b9f42e]" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          <span className="h-4 border-l border-white/[0.06] mx-0.5" />

          {/* Hand the project to the AI Director Hub production team */}
          {data.project.enterprise_status ? (
            <span className="flex items-center gap-1 rounded-full border border-[#b9f42e]/30 bg-[#b9f42e]/10 px-2.5 py-1.5 text-[11px] font-bold text-[#b9f42e]" title="This project is with the AI Director Hub production team">
              <BadgeCheck className="h-3 w-3" />
              <span>{data.project.enterprise_status === "delivered" ? "Delivered" : data.project.enterprise_status === "active" ? "Enterprise" : "Enterprise requested"}</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setEnterpriseOpen(true)}
              className="flex items-center gap-1 rounded-full border border-[#b9f42e]/25 bg-[#b9f42e]/[0.07] px-2.5 py-1.5 text-[11px] font-bold text-[#b9f42e] transition hover:bg-[#b9f42e]/15"
              title="Hire the AI Director Hub team to finish this project"
            >
              <BadgeCheck className="h-3 w-3" />
              <span>Hire our team</span>
            </button>
          )}

          {/* Team */}
          <Link href="/studio/team" className="flex items-center gap-1 rounded-full bg-[#141414] px-2.5 py-1.5 text-[11px] font-bold text-zinc-300 hover:bg-[#1e1e1e] hover:text-white transition" title="Add and manage team members">
            <Users className="h-3 w-3" />
            <span>Team</span>
          </Link>

          {/* Credits badge */}
          <Link href="/studio/credits" className="flex items-center gap-1 rounded-full bg-[#141414] px-2.5 py-1.5 text-[11px] font-bold text-[#b9f42e] hover:bg-[#1e1e1e] transition">
            <Zap className="h-3 w-3" />
            <span>Credits</span>
          </Link>
        </div>
      </header>
      <div className="flex h-[calc(100vh-48px)]">
        <section className="min-w-0 flex-1 overflow-auto border-r border-white/[0.06]">
          <div
            className={`${tab === "timeline" ? "max-w-none p-0" : "mx-auto max-w-6xl p-4 lg:p-6"}`}
          >
            {/* Compact settings bar — visible on storyboard */}
            {tab === "storyboard" && (
              <div className="mb-4 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowBasicSettings(true)}
                  className="flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-[#141414] px-2.5 py-1 text-[11px] font-bold text-zinc-200 hover:border-[#b9f42e]/40 transition"
                  title="Edit Basic Settings"
                >
                  <Settings className="h-3 w-3 text-[#b9f42e]" />
                  <span>{data.project.default_aspect || "9:16"}</span>
                </button>
                <span className="text-[10px] text-zinc-700">•</span>
                <span className="rounded-full border border-white/[0.06] bg-[#141414] px-2.5 py-1 text-[11px] font-medium text-zinc-300">
                  {(data.project.metadata as Record<string, unknown> | null)?.basic_settings && typeof ((data.project.metadata as Record<string, unknown>).basic_settings as Record<string, unknown>).videoModel === "string" ? getModelLabel(((data.project.metadata as Record<string, unknown>).basic_settings as Record<string, unknown>).videoModel as string) : "Seedance 2.0 Fast"}
                </span>
                <span className="text-[10px] text-zinc-700">•</span>
                <span className="rounded-full border border-white/[0.06] bg-[#141414] px-2.5 py-1 text-[11px] font-medium text-zinc-300">720p</span>
                <span className="text-[10px] text-zinc-700">•</span>
                <button
                  type="button"
                  onClick={() => alert("Batch download queued for all shots")}
                  className="flex items-center gap-1 rounded-full border border-white/[0.06] bg-[#141414] px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:bg-[#1e1e1e] transition"
                >
                  <Download className="h-3 w-3 text-zinc-500" />
                  <span>Batch Download</span>
                  <ChevronDown className="h-2.5 w-2.5 text-zinc-600" />
                </button>
                <span className="text-[10px] text-zinc-700">•</span>
                <span className="rounded-full border border-[#b9f42e]/20 bg-[#b9f42e]/[0.06] px-2.5 py-1 text-[11px] font-bold text-[#b9f42e]">
                  Estimated: {data.shots?.length ? data.shots.length * 10 : 409}
                </span>
              </div>
            )}
            {tab !== "storyboard" && tab !== "timeline" && (
              <h1 className="mb-4 text-lg font-bold text-zinc-100">
                {visibleTabs.find((x) => x[0] === tab)?.[1] || marketingTabs.find((x) => x[0] === tab)?.[1]}
              </h1>
            )}
            {tab === "canvas" && <Canvas data={data} onTab={setTab} />}
            {tab === "script" && (
              <Script
                episode={episode}
                suggestions={data.scriptSuggestions}
                save={save}
                reload={load}
              />
            )}
            {tab === "characters" && (
              <Assets
                entities={data.entities}
                projectId={projectId}
                save={save}
                reload={load}
                openAdd={setAssetType}
              />
            )}
            {tab === "storyboard" && (
              <Storyboard
                shots={data.shots}
                entities={data.entities}
                episodeId={episode.id}
                projectId={projectId}
                save={save}
                reload={load}
              />
            )}
            {tab === "timeline" && (
              <Timeline
                shots={data.shots}
                entities={data.entities}
                save={save}
                reload={load}
              />
            )}
            {tab === "production" && <ProductionOverview data={data} />}

            {/* AI Social & Advertising Agent Views */}
            {tab === "marketing" && <MarketingAgentHome onNavigateTab={setTab} />}
            {tab === "social-accounts" && <SocialAccountsPage />}
            {tab === "calendar" && <ContentCalendar shots={data.shots} />}
            {tab === "autopilot" && <AutopilotPanel />}
            {tab === "analytics" && <AnalyticsDashboard onGenerateVariations={() => setTab("storyboard")} />}
            {tab === "ads-manager" && <AdsManager />}
            {tab === "competitors" && <CompetitorIntelligence onSendToStudio={() => setTab("storyboard")} />}
            {tab === "integrations" && <IntegrationsSettings />}
          </div>
        </section>
        <aside className="hidden w-[40%] min-w-[360px] max-w-[520px] flex-col bg-[#0d0d0d] xl:flex">
          <div className="border-b border-white/[0.06] px-4 py-3">
            {chatSessionMenu && (
              <div
                className="fixed inset-0 z-40 bg-transparent"
                onClick={() => setChatSessionMenu(false)}
              />
            )}
            <div className="flex items-center gap-2 text-[12px] text-zinc-400">
              <Bot className="h-4 w-4 text-[#b9f42e]" />
              <span className="font-bold text-zinc-200">AI Director</span>
              <div className="relative ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setChatSessionMenu((open) => !open)}
                  className="flex max-w-[190px] items-center gap-2 rounded-lg border border-white/[0.08] bg-[#141414] px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 hover:border-[#b9f42e]/40"
                >
                  <span className="truncate">{data.chatSessions.find((session) => session.id === data.activeSessionId)?.title || "Current chat"}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                </button>
                <button
                  type="button"
                  onClick={createChatSession}
                  className="rounded-lg border border-white/[0.08] bg-[#141414] px-2.5 py-1.5 text-[11px] font-bold text-zinc-100 hover:border-[#b9f42e]/40 hover:text-[#b9f42e]"
                >
                  New Chat
                </button>
                {chatSessionMenu && (
                  <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-72 overflow-hidden rounded-xl border border-white/10 bg-[#18191c] p-2 shadow-2xl">
                    {data.chatSessions.length ? data.chatSessions.map((session) => (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => {
                          setChatSessionId(session.id);
                          setChatSessionMenu(false);
                        }}
                        className={`block w-full rounded-lg px-3 py-2 text-left text-[12px] ${session.id === data.activeSessionId ? "bg-[#b9f42e] text-black" : "text-zinc-300 hover:bg-white/10"}`}
                      >
                        <span className="block truncate font-bold">{session.title || "AI Director"}</span>
                        <span className="mt-0.5 block truncate text-[10px] opacity-70">{session.model || "Studio chat"}</span>
                      </button>
                    )) : (
                      <p className="p-3 text-[12px] text-zinc-500">No chats yet.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-2 flex gap-1.5">
              <span className="rounded-full border border-white/[0.06] bg-[#141414] px-2 py-0.5 text-[10px] font-medium text-zinc-400">{data.project.default_style || "Cinematic"}</span>
              <span className="rounded-full border border-white/[0.06] bg-[#141414] px-2 py-0.5 text-[10px] font-medium text-zinc-400">{data.project.default_aspect || "9:16"}</span>
              <span className="rounded-full border border-white/[0.06] bg-[#141414] px-2 py-0.5 text-[10px] font-medium text-zinc-400">6 sec</span>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {!data.chatMessages.length && (
              <div className="flex h-full items-end pb-3 text-[13px] leading-6 text-zinc-600">
                Tell the AI Director what you want to create, revise, or plan.
              </div>
            )}
            {data.chatMessages.map((item) => (
              <div
                key={item.id}
                className={`mt-3 max-w-[90%] rounded-xl p-3 text-[13px] ${item.role === "user" ? "ml-auto bg-[#b9f42e] text-black" : "bg-[#1a1a1a] text-zinc-200"}`}
              >
                {item.content}
                <ChatTimeline blocks={item.timeline_blocks} onAction={sendDirectorMessage} disabled={chatSending} />
                <ChatMedia media={item.media} />
                <ChatSuggestedActions actions={item.suggested_actions} proposals={data.actionProposals} busyId={proposalBusy} onDecide={decideProposal} />
              </div>
            ))}
            {chatSending && <ThinkingBubble />}
            <PendingProposalCards
              proposals={data.actionProposals}
              excludeIds={data.chatMessages.flatMap((item) => proposalIdsFromActions(item.suggested_actions))}
              sessionId={data.activeSessionId}
              busyId={proposalBusy}
              onDecide={decideProposal}
            />
            {chatError && <p role="alert" className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-[12px] text-red-200">{chatError}</p>}
            {voiceState !== "idle" && <p className={`mt-3 rounded-lg border p-2.5 text-[12px] ${voiceState === "connected" ? "border-[#b9f42e]/30 bg-[#b9f42e]/10 text-[#d9ff84]" : "border-white/[0.06] bg-white/[0.03] text-zinc-300"}`}>{voiceState === "connecting" ? "Connecting your AI Voice Director…" : voiceState === "connected" ? "AI Voice Director is listening. You can speak naturally." : voiceError}</p>}
            <div ref={chatEndRef} />
          </div>
          <form
            onSubmit={sendChat}
            className="border-t border-white/[0.06] bg-[#111111] p-3"
          >
            <EntityMentionInput
              value={message}
              onChange={setMessage}
              entities={data.entities}
              menuPlacement="top"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Tell the director what to shoot..."
              className="h-20 w-full resize-none bg-transparent text-[14px] outline-none placeholder:text-zinc-600"
              ariaLabel="AI Director message. Type @ to mention a character, scene, or asset."
            />
            <p className="mb-2 mt-1 text-[10px] text-zinc-600">Type @ to mention a character, scene, or asset.</p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <input
                  ref={chatFileInputRef}
                  type="file"
                  multiple
                  accept="image/*,video/*,audio/*"
                  onChange={(event) => uploadChatFiles(event.target.files)}
                  className="hidden"
                />
                <button type="button" onClick={() => chatFileInputRef.current?.click()} disabled={chatUploading} className="rounded-md p-1 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300 disabled:opacity-50" aria-label="Upload image, video, or audio to AI Director chat">
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <select
                  value={directorModel}
                  onChange={(event) => setDirectorModel(event.target.value)}
                  className="rounded-full border border-white/[0.06] bg-[#141414] px-2.5 py-1 text-[11px] font-medium text-zinc-300 outline-none hover:border-[#b9f42e]/40"
                >
                  {directorModels.map((modelOption) => (
                    <option key={modelOption.id} value={modelOption.id}>
                      {modelOption.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={startVoice} disabled={voiceState === "connecting"} aria-label={voiceState === "connected" ? "Stop AI Voice Director" : "Start AI Voice Director"} className={`rounded-full border p-2 ${voiceState === "connected" ? "border-red-400 bg-red-500/15 text-red-200" : "border-white/[0.08] text-zinc-400 hover:border-[#b9f42e] hover:text-[#b9f42e]"}`}>
                  {voiceState === "connected" ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                </button>
                <button type="submit" disabled={chatSending} aria-label="Send message to AI Director" className="rounded-full bg-[#b9f42e] p-2 text-black disabled:opacity-50">
                  {chatSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </form>
        </aside>
      </div>
      {assetType && (
        <AssetModal
          type={assetType}
          projectId={projectId}
          close={() => setAssetType(null)}
          save={save}
          reload={load}
        />
      )}
      {showBasicSettings && (
        <BasicSettingsModal
          data={data}
          close={() => setShowBasicSettings(false)}
          save={save}
          reload={load}
        />
      )}
    </main>
  );
}

function ProductionOverview({ data }: { data: Workspace }) {
  const production = data.production ?? {
    series: [], scenes: [], referenceAssets: [], continuityIssues: [], revisions: [], generationJobs: [], creditAccount: null,
  };
  const approvedAssets = production.referenceAssets.filter((asset) => asset.approval_status === "approved").length;
  const rejectedAssets = production.referenceAssets.filter((asset) => asset.approval_status === "rejected").length;
  const activeJobs = production.generationJobs.filter((job) => ["queued", "approved", "processing"].includes(String(job.status))).length;
  const cards = [
    ["Series", production.series.length],
    ["Episodes", data.episodes.length],
    ["Scenes", production.scenes.length],
    ["Shots", data.shots.length],
    ["Active jobs", activeJobs],
    ["Continuity warnings", production.continuityIssues.length],
  ] as const;
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-[#121412] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[.2em] text-[#b9f42e]">PROJECT OVERVIEW</p>
            <h2 className="mt-2 text-2xl font-bold">{data.project.name}</h2>
            <p className="mt-2 text-sm text-zinc-400">{data.project.production_mode || "Legacy project"} · {data.project.project_type || "Unspecified type"}</p>
          </div>
          <div className="rounded-xl border border-[#b9f42e]/30 bg-[#b9f42e]/5 px-4 py-3 text-right">
            <p className="text-xs text-zinc-500">AVAILABLE CREDITS</p>
            <p className="text-xl font-bold text-[#b9f42e]">{production.creditAccount ? production.creditAccount.balance - production.creditAccount.reserved : "—"}</p>
            <p className="text-xs text-zinc-500">{production.creditAccount?.reserved || 0} reserved</p>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(([label, value]) => <div key={label} className="rounded-xl bg-white/[.04] p-4"><p className="text-2xl font-black">{value}</p><p className="mt-1 text-xs uppercase tracking-wider text-zinc-500">{label}</p></div>)}
        </div>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardPanel title="Creative brief">
          {Object.keys(data.project.creative_brief || {}).length ? <dl className="space-y-3">{Object.entries(data.project.creative_brief || {}).filter(([key]) => key !== "confirmedFields").map(([key, value]) => <div key={key}><dt className="text-xs uppercase tracking-wide text-zinc-500">{key.replace(/([A-Z])/g, " $1")}</dt><dd className="mt-1 text-sm text-zinc-200">{value === null || value === "" ? "Not confirmed" : String(value)}</dd></div>)}</dl> : <EmptyState>Start a conversation with the AI Director to build an editable brief.</EmptyState>}
        </DashboardPanel>
        <DashboardPanel title="Assets and continuity">
          <div className="grid grid-cols-3 gap-3 text-center"><Metric label="Approved" value={approvedAssets} /><Metric label="Rejected" value={rejectedAssets} /><Metric label="Warnings" value={production.continuityIssues.length} /></div>
          {production.continuityIssues.length > 0 && <div className="mt-4 space-y-2">{production.continuityIssues.slice(0, 5).map((issue) => <div key={String(issue.id)} className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-100">{String(issue.description || "Continuity issue")}</div>)}</div>}
        </DashboardPanel>
        <DashboardPanel title="Generation and export">
          <p className="text-sm text-zinc-400">{activeJobs ? `${activeJobs} generation jobs are active.` : "No generation jobs are running."}</p>
          <div className="mt-4 rounded-lg border border-dashed border-white/15 p-4 text-sm text-zinc-500">Export remains unavailable until approved shots have completed provider outputs. No placeholder export will be created.</div>
        </DashboardPanel>
        <DashboardPanel title="Revisions">
          {production.revisions.length ? <div className="space-y-2">{production.revisions.slice(0, 6).map((revision) => <div key={String(revision.id)} className="rounded-lg bg-white/[.04] p-3"><p className="text-sm text-zinc-200">{String(revision.instruction)}</p><p className="mt-1 text-xs uppercase text-zinc-500">{String(revision.status)}</p></div>)}</div> : <EmptyState>No project revisions have been proposed.</EmptyState>}
        </DashboardPanel>
      </div>
      <section className="rounded-2xl border border-white/10 bg-[#121412] p-5">
        <div className="flex items-center justify-between gap-4"><div><h3 className="font-bold">Voice Director</h3><p className="mt-1 text-sm text-zinc-500">Realtime voice controls will appear here when voice sessions are configured and enabled.</p></div><button disabled className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-600">Voice unavailable</button></div>
      </section>
    </div>
  );
}

function DashboardPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-white/10 bg-[#121412] p-5"><h3 className="mb-4 font-bold">{title}</h3>{children}</section>;
}
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-lg bg-white/[.04] p-3"><p className="text-xl font-bold">{value}</p><p className="text-xs text-zinc-500">{label}</p></div>; }
function EmptyState({ children }: { children: React.ReactNode }) { return <p className="rounded-lg border border-dashed border-white/15 p-4 text-sm text-zinc-500">{children}</p>; }

function Canvas({
  data,
  onTab,
}: {
  data: Workspace;
  onTab: (tab: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const script = parseScript(data.episodes[0]?.script_content);
  const total = data.shots.reduce(
    (sum, shot) => sum + Number(shot.duration_seconds || 0),
    0,
  );
  const zoomTo = (next: number) =>
    setZoom(Math.max(0.5, Math.min(1.5, Number(next.toFixed(2)))));
  return (
    <div
      className="relative -mx-5 h-[calc(100vh-210px)] min-h-[620px] overflow-auto border-y border-white/10 bg-[#080908] lg:-mx-8"
      onWheel={(event) => {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          zoomTo(zoom + (event.deltaY > 0 ? -0.1 : 0.1));
        }
      }}
    >
      <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(#3a3c38_1px,transparent_1px)] [background-size:22px_22px]" />
      <div
        className="relative h-[1100px] w-[1400px]"
        aria-label="Studio production canvas"
      >
        <div
          className={`absolute left-0 top-0 h-[900px] w-[1200px] select-none ${dragStart ? "cursor-grabbing" : "cursor-grab"}`}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "top left",
          }}
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest("button")) return;
            setDragStart({
              x: event.clientX - pan.x,
              y: event.clientY - pan.y,
            });
          }}
          onPointerMove={(event) => {
            if (dragStart)
              setPan({
                x: event.clientX - dragStart.x,
                y: event.clientY - dragStart.y,
              });
          }}
          onPointerUp={() => setDragStart(null)}
          onPointerLeave={() => setDragStart(null)}
        >
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <path
              d="M305 220 C430 220 440 380 555 380 S690 340 760 340"
              fill="none"
              stroke="#b9f42e"
              strokeOpacity=".45"
              strokeDasharray="5 8"
              strokeWidth="2"
            />
            <path
              d="M315 505 C440 505 480 510 610 510 S750 590 860 590"
              fill="none"
              stroke="#98a6ff"
              strokeOpacity=".38"
              strokeDasharray="5 8"
              strokeWidth="2"
            />
          </svg>
          <CanvasNode
            className="left-[7%] top-16 w-[300px]"
            eyebrow="SCRIPT"
            title={script.title || "Production script"}
            action="Open script"
            onClick={() => onTab("script")}
          >
            <p className="line-clamp-5 text-sm leading-6 text-zinc-400">
              {script.overview ||
                script.body ||
                "Write the story, visual direction, framing, timing, continuity notes and references."}
            </p>
            <div className="mt-4 flex gap-2 text-xs text-zinc-500">
              <span>{script.body ? "full script" : `${script.scenes?.length || 0} scenes`}</span>
              <span>•</span>
              <span>editable</span>
            </div>
          </CanvasNode>
          <CanvasNode
            className="left-[8%] top-[430px] w-[330px]"
            eyebrow="ASSET LIBRARY"
            title={`${data.entities.length} reusable assets`}
            action="Open assets"
            onClick={() => onTab("characters")}
          >
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(["character", "scene", "prop"] as const).map((kind) => (
                <div key={kind} className="rounded-lg bg-black/30 p-2">
                  <p className="text-lg font-bold text-[#b9f42e]">
                    {data.entities.filter((e) => e.type === kind).length}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                    {kind}s
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {data.entities.slice(0, 4).map((entity) => (
                <span
                  key={entity.id}
                  className="rounded bg-white/5 px-2 py-1 text-[11px] text-zinc-300"
                >
                  {entity.name}
                </span>
              ))}
            </div>
          </CanvasNode>
          <CanvasNode
            className="left-[43%] top-[280px] w-[340px]"
            eyebrow="STORYBOARD"
            title={`${data.shots.length} planned shots`}
            action="Open storyboard"
            onClick={() => onTab("storyboard")}
          >
            <div className="mt-4 grid grid-cols-3 gap-2">
              {data.shots.slice(0, 3).map((shot, index) => (
                <div
                  key={shot.id}
                  className="aspect-[9/11] overflow-hidden rounded-lg bg-gradient-to-br from-[#314656] to-[#161b1c] p-2"
                >
                  <span className="rounded bg-black/40 px-1.5 py-1 text-[10px] font-bold text-[#b9f42e]">
                    {index + 1}
                  </span>
                  <p className="mt-6 line-clamp-2 text-[10px] text-zinc-300">
                    {shot.title}
                  </p>
                </div>
              ))}
              {data.shots.length === 0 && (
                <div className="col-span-3 rounded-lg border border-dashed border-white/15 p-4 text-sm text-zinc-500">
                  Create your first shot from the script.
                </div>
              )}
            </div>
          </CanvasNode>
          <CanvasNode
            className="left-[62%] top-[535px] w-[290px]"
            eyebrow="TIMELINE"
            title={`${total} seconds planned`}
            action="Open timeline"
            onClick={() => onTab("timeline")}
          >
            <div className="mt-4 flex gap-1 overflow-hidden">
              {data.shots.slice(0, 5).map((shot, index) => (
                <div
                  key={shot.id}
                  className="h-12 min-w-12 flex-1 rounded bg-gradient-to-br from-[#625a36] to-[#24231b] p-1 text-[10px]"
                >
                  {index + 1}
                </div>
              )) || (
                <div className="h-12 flex-1 rounded border border-dashed border-white/15" />
              )}
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              Arrange clips in playback order.
            </p>
          </CanvasNode>
        </div>
        <div className="fixed bottom-5 left-5 z-10 flex items-center gap-3 rounded-xl border border-white/10 bg-[#151715]/95 p-2 text-sm shadow-xl">
          <button
            onClick={() => zoomTo(zoom - 0.1)}
            className="px-2 text-zinc-300 hover:text-[#b9f42e]"
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="min-w-11 text-center text-[#b9f42e]">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => zoomTo(zoom + 0.1)}
            className="px-2 text-zinc-300 hover:text-[#b9f42e]"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="border-l border-white/10 pl-3 text-zinc-400 hover:text-white"
          >
            Reset
          </button>
          <span className="border-l border-white/10 pl-3 text-zinc-500">
            Drag to pan · Ctrl/⌘ + scroll to zoom
          </span>
        </div>
      </div>
    </div>
  );
}
function CanvasNode({
  className,
  eyebrow,
  title,
  action,
  onClick,
  children,
}: {
  className: string;
  eyebrow: string;
  title: string;
  action: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`absolute rounded-xl border border-white/10 bg-[#1b1d1c]/95 p-4 shadow-2xl shadow-black/40 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold tracking-[.18em] text-[#b9f42e]">
            {eyebrow}
          </p>
          <h3 className="mt-1 font-bold">{title}</h3>
        </div>
        <button
          onClick={onClick}
          className="rounded-lg bg-white/5 px-2 py-1 text-xs text-zinc-300 hover:bg-[#b9f42e] hover:text-black"
        >
          {action}
        </button>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
function Script({
  episode,
  suggestions,
  save,
  reload,
}: {
  episode: Episode;
  suggestions: Workspace["scriptSuggestions"];
  save: (b: unknown) => Promise<void>;
  reload: () => Promise<void>;
}) {
  const [content, setContent] = useState(() =>
    parseScript(episode.script_content),
  );
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setContent(parseScript(episode.script_content));
  }, [episode.id, episode.script_content]);
  const submit = async () => {
    try {
      setSaving(true);
      await save({ action: "saveScript", episodeId: episode.id, content });
      await reload();
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-5">
      <section className="border border-white/10 bg-[#0b0c0b] p-6 sm:p-9">
        <div className="mb-7 flex items-start justify-between gap-4">
          <p className="text-xs font-bold tracking-[.2em] text-[#b9f42e]">
            PRODUCTION SCRIPT
          </p>
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-xl bg-[#b9f42e] px-4 py-2 text-sm font-bold text-black"
          >
            {saving ? "Saving…" : "Save script"}
          </button>
        </div>
        <input
          value={content.title}
          onChange={(e) => setContent((c) => ({ ...c, title: e.target.value }))}
          placeholder="Project title"
          className="w-full bg-transparent text-3xl font-black tracking-tight text-white outline-none placeholder:text-zinc-600 sm:text-5xl"
        />
        <textarea
          value={content.overview}
          onChange={(e) =>
            setContent((c) => ({ ...c, overview: e.target.value }))
          }
          placeholder="Write a concise story synopsis, creative intent, main references, and continuity rules for the whole production."
          className="mt-7 min-h-36 w-full resize-y bg-transparent text-lg leading-8 text-zinc-300 outline-none placeholder:text-zinc-600"
        />
        <div className="mt-7 border-t border-slate-700/70 pt-7">
          <label className="text-xs font-bold uppercase tracking-wide text-[#b9f42e]">
            Full script
          </label>
          <textarea
            value={content.body}
            onChange={(e) =>
              setContent((c) => ({ ...c, body: e.target.value }))
            }
            placeholder="Paste or write the complete script here with timestamps, action, dialogue, and cliffhanger ending."
            className="mt-3 min-h-[520px] w-full resize-y rounded-xl bg-[#1d1f1e] p-5 font-mono text-sm leading-7 text-zinc-200 outline-none placeholder:text-zinc-600"
          />
        </div>
      </section>
      {suggestions
        .filter((s) => s.status === "pending")
        .map((s) => (
          <section
            key={s.id}
            className="border border-[#b9f42e]/35 bg-[#b9f42e]/5 p-5"
          >
            <p className="font-bold text-[#b9f42e]">
              AI Director draft — review required
            </p>
            <p className="mt-1 text-sm text-zinc-400">{s.summary}</p>
            <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap bg-black/25 p-4 text-xs text-zinc-300">
              {JSON.stringify(s.content, null, 2)}
            </pre>
            <div className="mt-4 flex gap-3">
              <button
                onClick={async () => {
                  await save({
                    action: "reviewSuggestion",
                    suggestionId: s.id,
                    status: "accepted",
                  });
                  await reload();
                }}
                className="rounded-lg bg-[#b9f42e] px-3 py-2 text-sm font-bold text-black"
              >
                Accept update
              </button>
              <button
                onClick={async () => {
                  await save({
                    action: "reviewSuggestion",
                    suggestionId: s.id,
                    status: "dismissed",
                  });
                  await reload();
                }}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm"
              >
                Keep my script
              </button>
            </div>
          </section>
        ))}
    </div>
  );
}
function Assets({
  entities,
  projectId,
  save,
  reload,
  openAdd,
}: {
  entities: Entity[];
  projectId: string;
  save: (b: unknown) => Promise<void>;
  reload: () => Promise<void>;
  openAdd: (t: Entity["type"]) => void;
}) {
  const [selectedAsset, setSelectedAsset] = useState<Entity | null>(null);
  const activeAsset = selectedAsset
    ? entities.find((entity) => entity.id === selectedAsset.id) || selectedAsset
    : null;
  return (
    <div className="space-y-8">
      {(["character", "scene", "prop"] as const).map((type) => (
        <section key={type}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">
                {type === "character"
                  ? "Characters"
                  : type === "scene"
                    ? "Scenes"
                    : "Props"}
              </h2>
              <p className="text-sm text-zinc-500">
                Reusable across every shot in this project.
              </p>
            </div>
            <button
              onClick={() => openAdd(type)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#b9f42e] px-3 py-2 text-sm font-bold text-black"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {entities
              .filter((e) => e.type === type)
              .map((e) => (
                <AssetCard
                  key={e.id}
                  entity={e}
                  projectId={projectId}
                  save={save}
                  reload={reload}
                  openWorkspace={() => setSelectedAsset(e)}
                />
              ))}
            {!entities.some((e) => e.type === type) && (
              <button
                onClick={() => openAdd(type)}
                className="min-h-40 rounded-xl border border-dashed border-white/15 p-6 text-left text-sm text-zinc-500 hover:border-[#b9f42e]/50"
              >
                Add your first {type}. The AI Director can later suggest missing
                assets from your script.
              </button>
            )}
          </div>
        </section>
      ))}
      {activeAsset && (
        <AssetWorkspace
          asset={activeAsset}
          entities={entities}
          projectId={projectId}
          close={() => setSelectedAsset(null)}
          save={save}
          reload={reload}
        />
      )}
    </div>
  );
}
function AssetCard({
  entity,
  projectId,
  save,
  reload,
  openWorkspace,
}: {
  entity: Entity;
  projectId: string;
  save: (b: unknown) => Promise<void>;
  reload: () => Promise<void>;
  openWorkspace: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const imageGenerationStatus = entityImageGenerationStatus(entity);
  return (
    <article className="relative overflow-hidden rounded-xl border border-white/10 bg-[#1b1d1c] transition hover:border-[#b9f42e]/55">
      <button onClick={openWorkspace} className="block w-full text-left">
        <AssetImage src={entity.reference_images?.[0]} />
      </button>
      <div className="p-4">
        <div className="flex justify-between gap-2">
          <button
            onClick={openWorkspace}
            className="font-bold hover:text-[#b9f42e]"
          >
            {entity.name}
          </button>
          <span className="rounded-full bg-[#b9f42e]/10 px-2 py-1 text-[10px] font-bold uppercase text-[#b9f42e]">
            {entity.status}
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-sm text-zinc-500">
          {entity.description || "Add visual direction for consistency."}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-300"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
          <button
            onClick={async () => {
              await save({
                action: "saveAsset",
                asset: { ...entity, status: "redo_requested" },
              });
              reload();
            }}
            className="text-sm font-semibold text-[#b9f42e]"
          >
            Redo
          </button>
        </div>
      </div>
      {imageGenerationStatus === "generating" && (
        <div className="absolute inset-0 grid place-items-center bg-black/65 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 rounded-full border border-[#b9f42e]/35 bg-[#151715] px-3 py-2 text-xs font-bold text-[#d9ff84]">
            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
            Generating reference image…
          </div>
        </div>
      )}
      {imageGenerationStatus === "failed" && (
        <p className="border-t border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-200">Image generation failed. Open this asset to retry.</p>
      )}
      {editing && (
        <AssetModal
          type={entity.type}
          projectId={projectId}
          entity={entity}
          close={() => setEditing(false)}
          save={save}
          reload={reload}
        />
      )}
    </article>
  );
}

function DeleteConfirmModal({
  title = "Delete Item",
  message = "Are you sure you want to delete this item? This action cannot be undone.",
  confirmLabel = "Delete Item",
  onConfirm,
  onClose,
  busy,
}: {
  title?: string;
  message?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/80 p-4 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md rounded-2xl border border-white/15 bg-[#161719] p-6 text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-400">
              <Trash2 className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-white">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-zinc-300">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-bold text-zinc-300 hover:bg-white/10 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-xs font-black text-white hover:bg-red-500 transition shadow-lg disabled:opacity-50"
          >
            {busy ? "Deleting…" : `✓ ${confirmLabel}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModelMenu({
  type,
  value,
  onChange,
  options,
}: {
  type: "image" | "video";
  value: string;
  onChange: (value: string) => void;
  options?: { quality?: "Low" | "Medium" | "High" | "Ultra"; aspectRatio?: string; resolution?: string; durationSeconds?: number };
}) {
  const [open, setOpen] = useState(false);
  const models = type === "image" ? imageGenerationModels : videoGenerationModels;
  const selected = models.find((modelOption) => modelOption.id === value) || models[0];
  const families = type === "image"
    ? [
      { label: "Google AI Studio", icon: Sparkles, models: imageGenerationModels.filter((m) => m.provider === "google") },
      { label: "fal.ai Flux Series", icon: Sparkles, models: imageGenerationModels.filter((m) => m.provider === "fal") },
      { label: "OpenAI Images", icon: Sparkles, models: imageGenerationModels.filter((m) => m.provider === "openai") },
      { label: "Seedream Series (BytePlus)", icon: WandSparkles, models: imageGenerationModels.filter((m) => m.provider === "byteplus") },
    ]
    : [
      { label: "Google AI Studio (Veo 3.1, Omni, Pro)", icon: Sparkles, models: videoGenerationModels.filter((m) => m.provider === "google") },
      { label: "fal.ai Seedance Series", icon: WandSparkles, models: videoGenerationModels.filter((m) => m.id.startsWith("fal-seedance")) },
      { label: "BytePlus Direct Seedance Series", icon: WandSparkles, models: videoGenerationModels.filter((m) => m.id.startsWith("dreamina-")) },
      { label: "Kling AI Series (Kling 3, O3)", icon: WandSparkles, models: videoGenerationModels.filter((m) => m.id.includes("kling")) },
      { label: "MiniMax & Hailuo Series (H3)", icon: WandSparkles, models: videoGenerationModels.filter((m) => m.id.includes("minimax")) },
      { label: "Hunyuan & Luma Series", icon: WandSparkles, models: videoGenerationModels.filter((m) => m.id.includes("hunyuan") || m.id.includes("luma")) },
    ];
  return (
    <div className="relative mt-5">
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">{type === "image" ? "Image model" : "Video model"}</p>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="mt-2 flex w-full items-center justify-between rounded-xl border border-white/10 bg-[#0b0c0b] px-3 py-3 text-left text-sm font-bold text-white outline-none hover:border-[#b9f42e]/50"
      >
        <span className="flex min-w-0 items-center gap-2">
          <WandSparkles className="h-4 w-4 shrink-0 text-[#fff878]" />
          <span className="truncate">{selected.label}</span>
        </span>
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-[#b9f42e]/30 bg-[#b9f42e]/10 px-2 py-0.5 text-xs font-bold text-[#b9f42e]">
            ⚡ {calculateCreditCost(selected.id, type, options?.durationSeconds || 5, options)} Credits
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {open && (
        <div className="absolute bottom-[calc(100%+8px)] left-0 z-[80] w-full min-w-[280px] overflow-hidden rounded-xl border border-white/10 bg-[#18191c] p-2 shadow-2xl">
          {families.map((family) => {
            const Icon = family.icon;
            return (
              <div key={family.label}>
                {family.models.length ? (
                  <details className="group" open={family.models.some((modelOption) => modelOption.id === value)}>
                    <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg px-3 py-3 text-sm font-bold text-zinc-100 hover:bg-white/5">
                      <Icon className="h-5 w-5 text-zinc-200" />
                      <span className="flex-1">{family.label}</span>
                      <ChevronDown className="h-4 w-4 text-zinc-500 transition group-open:rotate-180" />
                    </summary>
                    <div className="pb-1 pl-8">
                      {family.models.map((modelOption) => {
                        const cost = calculateCreditCost(modelOption.id, type, options?.durationSeconds || 5, options);
                        const isSelected = modelOption.id === value;
                        return (
                          <button
                            key={modelOption.id}
                            type="button"
                            onClick={() => {
                              onChange(modelOption.id);
                              setOpen(false);
                            }}
                            className={`mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${isSelected ? "bg-[#fff878] font-bold text-black" : "text-zinc-300 hover:bg-white/5"}`}
                          >
                            <span>{modelOption.label}</span>
                            <span className={`ml-2 text-xs font-semibold ${isSelected ? "text-black" : "text-[#b9f42e]"}`}>
                              ⚡ {cost} Credits
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </details>
                ) : (
                  <button type="button" disabled className="flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-bold text-zinc-500">
                    <Icon className="h-5 w-5" />
                    <span className="flex-1">{family.label}</span>
                    <span className="text-xs font-medium">soon</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BasicSettingsModal({
  data,
  close,
  save,
  reload,
}: {
  data: Workspace;
  close: () => void;
  save: (body: unknown) => Promise<unknown>;
  reload: () => Promise<void>;
}) {
  const metaSettings = (data.project.metadata as Record<string, unknown> | null)?.basic_settings as Record<string, unknown> | undefined;
  const projectMeta = (data.project.metadata as Record<string, unknown> | null) || {};
  const episodeWorkflowMap = (projectMeta.episode_workflows as Record<string, unknown> | undefined) || {};
  const selectedEpisodeWorkflow = typeof episodeWorkflowMap[data.activeEpisode.id] === "string" ? episodeWorkflowMap[data.activeEpisode.id] as string : "";

  const [projectName, setProjectName] = useState<string>(data.project.name || "Untitled production");
  const [canvasSpec, setCanvasSpec] = useState<string>((metaSettings?.canvasSpec as string) || `${data.project.default_aspect || "9:16"} · 2K · 720p`);
  const [storyboardImageModel, setStoryboardImageModel] = useState<string>((metaSettings?.storyboardImageModel as string) || imageGenerationModels[0].id);
  const [characterImageModel, setCharacterImageModel] = useState<string>((metaSettings?.characterImageModel as string) || imageGenerationModels[0].id);
  const [videoModel, setVideoModel] = useState<string>((metaSettings?.videoModel as string) || videoGenerationModels[0].id);
  const [generateAudio, setGenerateAudio] = useState<boolean>(metaSettings?.generateAudio !== false);
  const [workflow, setWorkflow] = useState<string>(selectedEpisodeWorkflow || (projectMeta.default_workflow_id as string) || (metaSettings?.workflow as string) || "keyframe_images_to_video");
  const [workflowApplyMode, setWorkflowApplyMode] = useState<"project_default" | "episode">("project_default");
  const [visualStyle, setVisualStyle] = useState<string>((metaSettings?.visualStyle as string) || (data.project.default_style || "Realistic - 3D CG"));
  const [saving, setSaving] = useState(false);

  const confirmSettings = async () => {
    setSaving(true);
    try {
      const selectedAspect = canvasSpec.split(" · ")[0] || "9:16";
      const selectedResolution = canvasSpec.split(" · ")[2] || "720p";
      await save({
        action: "saveProjectSettings",
        settings: {
          projectName: projectName.trim() || "Untitled production",
          canvasSpec,
          aspectRatio: selectedAspect,
          resolution: selectedResolution,
          storyboardImageModel,
          characterImageModel,
          videoModel,
          generateAudio,
          workflow,
          workflowApplyMode,
          episodeId: data.activeEpisode.id,
          visualStyle,
        },
      });
      await reload();
      close();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  };

  const visualStyles = [
    { id: "Realistic - 3D CG", label: "Realistic - 3D CG", hot: true, img: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=400&q=80" },
    { id: "Anime - Japanese/Korean", label: "Anime - Japanese/Korean", hot: false, img: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400&q=80" },
    { id: "3D - Pixar Cartoon", label: "3D - Pixar Cartoon", hot: false, img: "https://images.unsplash.com/photo-1563089145-599997674d42?w=400&q=80" },
    { id: "Realistic - Photorealistic", label: "Realistic - Photorealistic", hot: true, img: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&q=80" },
    { id: "3D - Chinese Style CG", label: "3D - Chinese Style CG", hot: true, img: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=400&q=80" },
    { id: "Anime - Chibi Cute", label: "Anime - Chibi Cute", hot: false, img: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80" },
    { id: "Anime - Makoto Shinkai", label: "Anime - Makoto Shinkai", hot: false, img: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&q=80" },
    { id: "Anime - Ghibli", label: "Anime - Ghibli", hot: false, img: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&q=80" },
  ];
  const activeWorkflows = (data.directorWorkflows?.length ? data.directorWorkflows : defaultDirectorWorkflows).filter((item) => item.status !== "paused");
  const workflowIcons = [LayoutPanelTop, Share2, Film, Zap];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-2xl border border-white/15 bg-[#141517] p-6 sm:p-8 text-white shadow-2xl my-8">
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
          <h2 className="text-xl font-bold">Basic Settings</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400">Current settings, estimated ⚡ 16/s</span>
            <button onClick={close} className="rounded-xl p-2 text-zinc-400 hover:bg-white/10 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-xs font-bold uppercase text-zinc-400 mb-2">Project Name</label>
            <input
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              maxLength={160}
              className="w-full rounded-xl border border-white/10 bg-[#0b0c0b] p-3 text-sm font-bold text-zinc-200 outline-none focus:border-[#b9f42e]"
              placeholder="Name this production"
            />
          </div>

          {/* Row 1: Canvas Spec, Storyboard Image Model, Character/Scene Image Model */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-zinc-400 mb-1">Canvas Spec</label>
              <p className="text-[11px] text-zinc-500 mb-2">Ratio / Size / Resolution</p>
              <select
                value={canvasSpec}
                onChange={(e) => setCanvasSpec(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#0b0c0b] p-3 text-sm font-bold text-zinc-200 outline-none focus:border-[#b9f42e]"
              >
                <option value="9:16 · 2K · 720p">9:16 · 2K · 720p</option>
                <option value="16:9 · 4K · 1080p">16:9 · 4K · 1080p</option>
                <option value="1:1 · 2K · 720p">1:1 · 2K · 720p</option>
                <option value="2:3 · 2K · 720p">2:3 · 2K · 720p</option>
                <option value="21:9 · 4K · 1080p">21:9 · 4K · 1080p</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-zinc-400 mb-1">Storyboard Image Model</label>
              <p className="text-[11px] text-zinc-500 mb-2">Used for keyframes & shot continuity</p>
              <select
                value={storyboardImageModel}
                onChange={(e) => setStoryboardImageModel(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#0b0c0b] p-3 text-sm font-bold text-zinc-200 outline-none focus:border-[#b9f42e]"
              >
                {imageGenerationModels.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-zinc-400 mb-1">Character/Scene Image Model</label>
              <p className="text-[11px] text-zinc-500 mb-2">Used for character & scene concepts</p>
              <select
                value={characterImageModel}
                onChange={(e) => setCharacterImageModel(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#0b0c0b] p-3 text-sm font-bold text-zinc-200 outline-none focus:border-[#b9f42e]"
              >
                {imageGenerationModels.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Video Model & Generate Audio */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase text-zinc-400 mb-2">Video Model</label>
              <select
                value={videoModel}
                onChange={(e) => setVideoModel(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#0b0c0b] p-3 text-sm font-bold text-zinc-200 outline-none focus:border-[#b9f42e]"
              >
                {videoGenerationModels.map((m) => (
                  <option key={m.id} value={m.id}>{m.label} (⚡ 10s ≈ 160 credits)</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-zinc-400 mb-2">Generate Audio</label>
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0b0c0b] p-3">
                <span className="text-sm font-bold text-zinc-200">{generateAudio ? "Auto" : "Off"}</span>
                <button
                  type="button"
                  onClick={() => setGenerateAudio(!generateAudio)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${generateAudio ? "bg-[#b9f42e]" : "bg-white/20"}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-black shadow transform ring-0 transition duration-200 ease-in-out ${generateAudio ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Row 3: Generation Workflow */}
          <div>
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <label className="block text-xs font-bold uppercase text-zinc-400">Generation Workflow (AI Agent Pipeline)</label>
              <select
                value={workflowApplyMode}
                onChange={(event) => setWorkflowApplyMode(event.target.value === "episode" ? "episode" : "project_default")}
                className="rounded-lg border border-white/10 bg-[#0b0c0b] px-3 py-2 text-xs font-bold text-zinc-300 outline-none focus:border-[#b9f42e]"
              >
                <option value="project_default">Apply to this episode + future/default episodes</option>
                <option value="episode">Apply only to this episode</option>
              </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {activeWorkflows.map((item, index) => {
                const Icon = workflowIcons[index % workflowIcons.length];
                const isSelected = workflow === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setWorkflow(item.id)}
                    className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${isSelected ? "border-[#b9f42e] bg-[#b9f42e]/10" : "border-white/10 bg-white/5 hover:border-white/20"}`}
                  >
                    <div className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${isSelected ? "bg-[#b9f42e] text-black" : "bg-white/10 text-zinc-400"}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className={`text-sm font-bold ${isSelected ? "text-[#b9f42e]" : "text-white"}`}>{item.title}</h4>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-400">{item.description}</p>
                      {item.skill && <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-zinc-500">{item.skill}</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 4: Visual Style Selector */}
          <div>
            <label className="block text-xs font-bold uppercase text-zinc-400 mb-2">Visual Style</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {visualStyles.map((style) => {
                const isSelected = visualStyle === style.id;
                return (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => setVisualStyle(style.id)}
                    className={`group relative overflow-hidden rounded-xl border-2 text-left transition aspect-[4/3] ${isSelected ? "border-[#b9f42e] ring-2 ring-[#b9f42e]/40" : "border-white/10 hover:border-white/30"}`}
                  >
                    <img src={style.img} alt={style.label} className="h-full w-full object-cover transition group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                    {style.hot && (
                      <span className="absolute right-2 top-2 rounded-md bg-red-500/90 px-1.5 py-0.5 text-[9px] font-black uppercase text-white shadow">
                        🔥 Hot
                      </span>
                    )}
                    <span className={`absolute bottom-2 left-2 right-2 truncate text-xs font-bold ${isSelected ? "text-[#b9f42e]" : "text-white"}`}>
                      {style.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="mt-8 flex justify-end gap-3 border-t border-white/10 pt-6">
          <button
            onClick={close}
            disabled={saving}
            className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-bold text-zinc-300 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={confirmSettings}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-[#b9f42e] px-8 py-3 text-sm font-black text-black hover:bg-[#a6de25] transition disabled:opacity-50"
          >
            {saving ? "Saving…" : "✓ Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AssetWorkspace({
  asset,
  entities,
  projectId,
  close,
  save,
  reload,
}: {
  asset: Entity;
  entities: Entity[];
  projectId: string;
  close: () => void;
  save: (b: unknown) => Promise<void>;
  reload: (silent?: boolean) => Promise<void>;
}) {
  const [selected, setSelected] = useState(0);
  const [prompt, setPrompt] = useState(asset.description || "");
  const [model, setModel] = useState<string>(imageGenerationModels[0].id);
  const [aspectRatio, setAspectRatio] = useState<string>("9:16");
  const [quality, setQuality] = useState<"Low" | "Medium" | "High" | "Ultra">("Medium");
  const persistedGenerationStatus = entityImageGenerationStatus(asset);
  const [working, setWorking] = useState(persistedGenerationStatus === "generating");
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (data.user) getUserCredits(data.user.id).then(setCreditBalance);
    });
  }, []);
  const [generationStatus, setGenerationStatus] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [referenceSourcePicker, setReferenceSourcePicker] = useState(false);
  const [libraryImages, setLibraryImages] = useState<string[]>(asset.reference_images || []);
  const [references, setReferences] = useState<string[]>(
    Array.isArray(asset.metadata?.generation_reference_images)
      ? asset.metadata.generation_reference_images.filter((value): value is string => typeof value === "string")
      : []
  );

  useEffect(() => {
    if (persistedGenerationStatus !== "generating") setWorking(false);
    setLibraryImages(asset.reference_images || []);
  }, [asset, persistedGenerationStatus]);

  useEffect(() => {
    if (persistedGenerationStatus !== "generating") return;
    const interval = window.setInterval(() => { void reload(true); }, 3_000);
    return () => window.clearInterval(interval);
  }, [persistedGenerationStatus, reload]);

  const activeImage = libraryImages[selected] || null;
  const chosenImage = libraryImages[0] || null;
  const isCurrentlyChosen = Boolean(activeImage && selected === 0);

  const saveReferences = async (nextReferences: string[]) => {
    setReferences(nextReferences);
    await save({
      action: "saveAsset",
      asset: {
        ...asset,
        reference_images: libraryImages,
        metadata: { ...asset.metadata, generation_reference_images: nextReferences },
      },
    });
  };

  const chooseSelectedImage = async () => {
    if (!activeImage || isCurrentlyChosen) return;
    setWorking(true);
    try {
      const nextLibrary = [activeImage, ...libraryImages.filter((_, idx) => idx !== selected)];
      setLibraryImages(nextLibrary);
      setSelected(0);
      await save({
        action: "saveAsset",
        asset: {
          ...asset,
          reference_images: nextLibrary,
          metadata: asset.metadata,
        },
      });
      setGenerationStatus("Chosen as primary asset concept ✓");
      await reload(true);
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : "Could not set chosen image");
    } finally {
      setWorking(false);
    }
  };

  const [confirmDeleteAssetImage, setConfirmDeleteAssetImage] = useState(false);

  const deleteSelectedImage = () => {
    if (!activeImage) return;
    setConfirmDeleteAssetImage(true);
  };

  const executeDeleteSelectedImage = async () => {
    if (!activeImage) return;
    setWorking(true);
    try {
      const nextLibrary = libraryImages.filter((_, idx) => idx !== selected);
      setLibraryImages(nextLibrary);
      setSelected(0);
      await save({
        action: "saveAsset",
        asset: {
          ...asset,
          reference_images: nextLibrary,
          metadata: asset.metadata,
        },
      });
      setGenerationStatus("Asset image deleted ✓");
      await reload(true);
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setWorking(false);
      setConfirmDeleteAssetImage(false);
    }
  };

  const addActiveAsReference = () => {
    if (!activeImage || references.includes(activeImage)) return;
    void saveReferences([...references, activeImage]);
  };

  const requestGeneration = async () => {
    setWorking(true);
    setGenerationError(null);
    setGenerationStatus("Submitting image generation request…");
    try {
      const mentionedEntityIds = findMentionedEntityIds(prompt, entities);
      const response = await fetch(`/api/studio/projects/${projectId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: "asset",
          targetId: asset.id,
          prompt,
          model,
          referenceImages: references,
          mentionedEntityIds,
          aspectRatio,
          quality,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Image generation failed");
      notifyCreditBalanceChanged(typeof body.creditBalance === "number" ? body.creditBalance : undefined);
      if (typeof body.creditBalance === "number") setCreditBalance(body.creditBalance);
      if (typeof body.path === "string") {
        const nextLibrary = [body.path, ...libraryImages.filter((img) => img !== body.path)];
        setLibraryImages(nextLibrary);
        setSelected(0);
      }
      setGenerationStatus("Asset image generated ✓");
      await reload(true);
    } catch (error) {
      notifyCreditBalanceChanged();
      setGenerationError(error instanceof Error ? error.message : "Image generation failed");
    } finally {
      setWorking(false);
    }
  };

  const uploadImage = async (file: File | undefined, destination: "library" | "reference") => {
    if (!file) return;
    setWorking(true);
    try {
      const userId = (await createClient().auth.getUser()).data.user?.id;
      if (!userId) return;
      const path = `${userId}/${projectId}/asset-${destination}-${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      const { error } = await createClient().storage.from("creator-studio-media").upload(path, file);
      if (error) throw error;
      if (destination === "library") {
        const nextImages = [path, ...libraryImages];
        setLibraryImages(nextImages);
        setSelected(0);
        await save({ action: "saveAsset", asset: { ...asset, reference_images: nextImages, metadata: asset.metadata } });
      } else {
        await saveReferences([...references, path]);
      }
    } finally {
      setWorking(false);
    }
  };

  const currentCreditCost = calculateCreditCost(model, "image", 4, { quality, aspectRatio });

  return (
    <div className="fixed inset-0 z-50 bg-[#080908] text-white">
      <div className="flex h-full">
        {/* Left Side Thumbnail History List */}
        <aside className="w-44 shrink-0 overflow-y-auto border-r border-white/10 bg-[#0b0c0b] p-4">
          <button
            onClick={close}
            className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-zinc-300 hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
          <label className="mb-4 grid aspect-[3/4] cursor-pointer place-items-center rounded-xl border border-dashed border-white/25 text-center text-xs text-zinc-400 hover:border-[#b9f42e] transition">
            +<br />Upload
            <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadImage(e.target.files?.[0], "library")} />
          </label>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-zinc-600">Asset Concept Gallery</p>
          <div className="space-y-2.5">
            {libraryImages.map((image, index) => {
              const isChosen = index === 0;
              const isSel = index === selected;
              return (
                <div key={`${image}-${index}`} className="relative group">
                  <button
                    type="button"
                    onClick={() => setSelected(index)}
                    className={`block w-full overflow-hidden rounded-xl border-2 transition text-left ${
                      isChosen
                        ? "border-[#b9f42e] ring-2 ring-[#b9f42e]/40"
                        : isSel
                        ? "border-white/60"
                        : "border-white/10 hover:border-white/25"
                    }`}
                  >
                    <AssetImage src={image} />
                    {isChosen && (
                      <span className="absolute left-1.5 top-1.5 rounded-md bg-[#b9f42e] px-1.5 py-0.5 text-[9px] font-black uppercase text-black shadow">
                        ✓ CHOSEN
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Top Bar Actions */}
          <header className="flex h-16 items-center gap-3 border-b border-white/10 px-6 bg-[#0b0c0b]">
            {isCurrentlyChosen ? (
              <span className="flex items-center gap-1.5 rounded-lg border border-[#b9f42e]/50 bg-[#b9f42e]/20 px-4 py-2 text-xs font-black text-[#b9f42e]">
                ✓ Chosen Concept
              </span>
            ) : (
              <button
                type="button"
                onClick={chooseSelectedImage}
                disabled={working || !activeImage}
                className="flex items-center gap-1.5 rounded-lg bg-[#b9f42e] px-4 py-2 text-xs font-black text-black hover:bg-[#a6de25] transition shadow-lg disabled:opacity-40"
              >
                ✓ Choose
              </button>
            )}

            {activeImage && (
              <button
                type="button"
                onClick={deleteSelectedImage}
                disabled={working}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/20 transition disabled:opacity-40"
                title="Delete this asset image"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete</span>
              </button>
            )}

            <button
              type="button"
              onClick={addActiveAsReference}
              disabled={!activeImage}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Use as reference
            </button>

            <span className="h-5 border-l border-white/10" />

            <button
              type="button"
              onClick={requestGeneration}
              disabled={working}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/5 disabled:opacity-40"
            >
              ↻ {working ? "Generating…" : "Regenerate"}
            </button>

            <span className="ml-auto text-xs font-bold uppercase tracking-wider text-zinc-500">
              {asset.type} Asset Studio
            </span>
          </header>

          {/* Central Preview Viewport */}
          <div className="grid flex-1 place-items-center overflow-auto bg-black/40 p-4 sm:p-8">
            <div className="flex flex-col items-center overflow-hidden rounded-xl bg-[#151715] shadow-2xl transition-all max-w-4xl w-full">
              {working ? (
                <div className={`grid place-items-center p-8 ${aspectRatio === "9:16" ? "aspect-[9/16] h-[55vh] max-h-[580px]" : "aspect-[16/9] w-full max-w-[640px]"}`}>
                  <div className="flex flex-col items-center gap-4">
                    <svg className="h-12 w-12 animate-spin text-[#b9f42e]" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="opacity-20" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                    <p className="text-sm text-zinc-400">{generationStatus || "Generating asset image…"}</p>
                  </div>
                </div>
              ) : generationError ? (
                <GenerationPreviewError message={generationError} />
              ) : activeImage ? (
                <AssetImage src={activeImage} className="max-h-[60vh] w-auto max-w-full rounded-t-xl object-contain mx-auto" />
              ) : (
                <div className={`grid place-items-center text-center text-zinc-500 p-8 ${aspectRatio === "9:16" ? "aspect-[9/16] h-[55vh] max-h-[580px]" : "aspect-[16/9] w-full max-w-[640px]"}`}>
                  Upload a reference image or click &ldquo;Generate image&rdquo; below.
                </div>
              )}
              {activeImage && (
                <div className="w-full border-t border-white/10 bg-black/60 p-4 rounded-b-xl">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#b9f42e]">
                      PROMPT USED
                    </p>
                    <span className="rounded-md border border-[#b9f42e]/30 bg-[#b9f42e]/10 px-2 py-0.5 text-[11px] font-bold text-[#b9f42e]">
                      Model: {getModelLabel(model)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-200">{prompt || asset.description || "—"}</p>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Right Sidebar Controls */}
        <aside className="flex w-[420px] shrink-0 flex-col border-l border-white/10 bg-[#151715]">
          <div className="flex items-start justify-between p-6 border-b border-white/10">
            <div>
              <p className="text-xs font-bold tracking-[.18em] text-[#b9f42e] uppercase">
                {asset.type}
              </p>
              <h2 className="mt-1 text-2xl font-black">{asset.name}</h2>
            </div>
            <button
              onClick={close}
              className="rounded-xl p-2 text-zinc-400 hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-auto p-6 space-y-6">
            {/* Reference Images Container */}
            <div className="rounded-xl border border-white/10 bg-[#0b0c0b] p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Reference images</p>
                <button type="button" onClick={() => setPicker(true)} className="text-xs font-semibold text-[#b9f42e]">Select assets</button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" aria-label="Add reference image" onClick={() => setReferenceSourcePicker(true)} className="grid h-14 w-14 place-items-center rounded-lg border border-dashed border-white/25 text-lg text-zinc-400 hover:border-[#b9f42e] transition">+</button>
                {references.map((image, index) => (
                  <div key={`${image}-${index}`} className="relative h-14 w-14 overflow-hidden rounded-lg border border-white/10">
                    <AssetImage src={image} />
                    <button type="button" aria-label={`Remove reference image ${index + 1}`} onClick={() => void saveReferences(references.filter((_, itemIndex) => itemIndex !== index))} className="absolute right-1 top-1 rounded bg-black/80 px-1 text-[10px] font-bold text-white hover:bg-red-500 transition">×</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Generation Settings: Aspect Ratio & Quality */}
            <div className="rounded-xl border border-white/10 bg-[#0b0c0b] p-4 space-y-4">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Generation Settings</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-zinc-500 mb-1">Aspect Ratio</label>
                  <select
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-[#141517] p-2.5 text-xs font-bold text-white outline-none focus:border-[#b9f42e]"
                  >
                    <option value="9:16">9:16 (Portrait)</option>
                    <option value="16:9">16:9 (Landscape)</option>
                    <option value="1:1">1:1 (Square)</option>
                    <option value="2:3">2:3 (Photo)</option>
                    <option value="3:2">3:2 (Classic)</option>
                    <option value="21:9">21:9 (Cinematic)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-zinc-500 mb-1">Quality Level</label>
                  <select
                    value={quality}
                    onChange={(e) => setQuality(e.target.value as "Low" | "Medium" | "High" | "Ultra")}
                    className="w-full rounded-lg border border-white/10 bg-[#141517] p-2.5 text-xs font-bold text-white outline-none focus:border-[#b9f42e]"
                  >
                    <option value="Low">⚡ Low (Fast)</option>
                    <option value="Medium">✨ Medium (Balanced)</option>
                    <option value="High">🌟 High (Detailed)</option>
                    <option value="Ultra">💎 Ultra (Max)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Image Prompt */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">
                Visual Prompt
              </label>
              <EntityMentionInput
                value={prompt}
                onChange={setPrompt}
                entities={entities}
                className="h-44 w-full resize-none rounded-xl border border-white/10 bg-[#0b0c0b] p-4 text-sm leading-relaxed text-zinc-200 outline-none focus:border-[#b9f42e]/60"
                placeholder="Describe the image. Type @ to mention a character, scene, or asset…"
                ariaLabel="Asset image prompt"
              />
            </div>

            {/* Model Selection Menu */}
            <ModelMenu type="image" value={model} onChange={setModel} options={{ quality, aspectRatio }} />

            {generationError && (
              <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                {generationError}
              </p>
            )}
          </div>

          {/* Submit Button with Dynamic Credit Display */}
          <div className="border-t border-white/10 p-6 bg-[#0b0c0b]">
            {creditBalance !== null && creditBalance < currentCreditCost ? (
              <div className="space-y-2">
                <button
                  disabled
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-700 px-4 py-3.5 font-black text-zinc-400 cursor-not-allowed shadow-xl"
                >
                  <Sparkles className="h-4 w-4" />
                  Insufficient Credits (⚡ {currentCreditCost} needed)
                </button>
                <p className="flex items-center justify-center gap-1.5 text-xs text-amber-300">
                  <Zap className="h-3.5 w-3.5" />
                  You have {creditBalance} credits. <a href="/studio/credits" className="underline font-bold hover:text-[#b9f42e]">Buy more credits</a>
                </p>
              </div>
            ) : (
              <button
                onClick={requestGeneration}
                disabled={working}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#b9f42e] px-4 py-3.5 font-black text-black hover:bg-[#a6de25] transition disabled:opacity-50 shadow-xl"
              >
                <Sparkles className="h-4 w-4 fill-black" />
                {working ? "Generating…" : `Generate image (⚡ ${currentCreditCost} Credits)`}
              </button>
            )}
          </div>
        </aside>
      </div>
      {referenceSourcePicker && (
        <ReferenceSourcePicker
          close={() => setReferenceSourcePicker(false)}
          onChooseExisting={() => {
            setReferenceSourcePicker(false);
            setPicker(true);
          }}
          onUpload={(file) => uploadImage(file, "reference")}
        />
      )}
      {picker && (
        <ReferencePicker
          entities={entities.filter((e) => e.id !== asset.id)}
          selected={references}
          close={() => setPicker(false)}
          confirm={(items) => {
            void saveReferences(items);
            setPicker(false);
          }}
        />
      )}
      {confirmDeleteAssetImage && (
        <DeleteConfirmModal
          title="Delete Asset Concept"
          message="Are you sure you want to delete this generated asset image? This action cannot be undone."
          confirmLabel="Delete Image"
          onConfirm={executeDeleteSelectedImage}
          onClose={() => setConfirmDeleteAssetImage(false)}
          busy={working}
        />
      )}
    </div>
  );
}
function AssetModal({
  type,
  projectId,
  entity,
  close,
  save,
  reload,
}: {
  type: Entity["type"];
  projectId: string;
  entity?: Entity;
  close: () => void;
  save: (b: unknown) => Promise<void>;
  reload: () => Promise<void>;
}) {
  const [asset, setAsset] = useState<Partial<Entity>>(
    entity || {
      type,
      name: "",
      description: "",
      reference_images: [],
      status: "draft",
      voice_id: "",
    },
  );
  const [busy, setBusy] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    const path = `${(await createClient().auth.getUser()).data.user?.id}/${projectId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const { error } = await createClient()
      .storage.from("creator-studio-media")
      .upload(path, file);
    if (!error)
      setAsset((a) => ({
        ...a,
        reference_images: [...(a.reference_images || []), path],
      }));
    setBusy(false);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!asset.name?.trim()) return;
    setBusy(true);
    try {
      await save({ action: "saveAsset", asset: { ...asset, type } });
      await reload();
      close();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#1b1d1c] p-6 shadow-2xl"
      >
        <div className="flex justify-between">
          <h2 className="text-xl font-bold">
            {entity ? "Edit" : "Add"} {type}
          </h2>
          <button type="button" onClick={close}>
            <X />
          </button>
        </div>
        <label className="mt-5 block text-sm">
          Name
          <input
            required
            value={asset.name || ""}
            onChange={(e) => setAsset((a) => ({ ...a, name: e.target.value }))}
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 p-3 outline-none"
          />
        </label>
        <label className="mt-4 block text-sm">
          Character Classification
          <select
            value={(asset as Record<string, unknown>).character_type as string || "ai_human"}
            onChange={(e) => setAsset((a) => ({ ...a, character_type: e.target.value }))}
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 p-3 text-sm outline-none focus:border-[#b9f42e]"
          >
            <option value="ai_human">✨ AI Fictional Human (Auto-Registers with BytePlus)</option>
            <option value="real_person">👤 Real Person / Actor</option>
            <option value="non_human">🤖 Non-Human / Creature / Anime</option>
            <option value="prop">📦 Prop / Location / Object</option>
          </select>
        </label>
        <label className="mt-4 block text-sm">
          Description / consistency prompt
          <textarea
            value={asset.description || ""}
            onChange={(e) =>
              setAsset((a) => ({ ...a, description: e.target.value }))
            }
            className="mt-2 h-24 w-full rounded-lg border border-white/10 bg-black/20 p-3 outline-none"
          />
        </label>
        {type === "character" && (
          <>
            {/* Reference Images Gallery with Verify */}
            <div className="mt-4">
              <p className="text-sm font-medium">Reference Face Images</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">Upload face images and verify them for Seedance video generation</p>
              {asset.reference_images && asset.reference_images.length > 0 ? (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {asset.reference_images.map((img, idx) => {
                    const currentAssetId = typeof asset.metadata === "object" && asset.metadata !== null ? (asset.metadata as Record<string, unknown>)[`byteplus_asset_${idx}`] as string || "" : "";
                    const globalAssetId = typeof asset.metadata === "object" && asset.metadata !== null ? (asset.metadata as Record<string, unknown>).byteplus_asset_id as string || "" : "";
                    const isVerified = Boolean(currentAssetId) || (idx === 0 && Boolean(globalAssetId));
                    const verifyingKey = `verifying_${idx}`;
                    const isVerifying = typeof asset.metadata === "object" && asset.metadata !== null && Boolean((asset.metadata as Record<string, unknown>)[verifyingKey]);
                    return (
                      <div key={`${img}-${idx}`} className="relative rounded-xl border border-white/10 bg-black/30 overflow-hidden">
                        <div className="aspect-square">
                          <AssetImage src={img} />
                        </div>
                        {/* Status badge */}
                        {isVerified ? (
                          <div className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded-full bg-green-600/90 px-2 py-0.5">
                            <span className="text-[9px] font-bold text-white">✓ Verified</span>
                          </div>
                        ) : isVerifying ? (
                          <div className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded-full bg-yellow-600/90 px-2 py-0.5">
                            <svg className="h-3 w-3 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-20" />
                              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                            </svg>
                            <span className="text-[9px] font-bold text-white">Verifying…</span>
                          </div>
                        ) : null}
                        {/* Verify button */}
                        {!isVerified && !isVerifying && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              setGenerationError(null);
                              setAsset((a) => ({ ...a, metadata: { ...(a.metadata || {}), [verifyingKey]: true } }));
                              try {
                                const entityId = entity?.id;
                                let generatedAssetId = "";
                                if (entityId) {
                                  const response = await fetch(`/api/studio/projects/${projectId}/assets`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ entityId, imageUrl: img, imagePath: img, name: asset.name || "Character" }),
                                  });
                                  const body = await response.json();
                                  if (!response.ok) throw new Error(body.error || "Verification failed");
                                  generatedAssetId = body.assetId;
                                } else {
                                  const cleanName = (asset.name || "character").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 15);
                                  generatedAssetId = `asset-${cleanName}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
                                }
                                setAsset((a) => ({
                                  ...a,
                                  byteplus_asset_id: generatedAssetId,
                                  byteplus_asset_uri: `asset://${generatedAssetId}`,
                                  verification_status: "verified",
                                  metadata: {
                                    ...(a.metadata || {}),
                                    byteplus_asset_id: generatedAssetId,
                                    [`byteplus_asset_${idx}`]: generatedAssetId,
                                    [verifyingKey]: false,
                                  },
                                }));
                              } catch (err) {
                                setGenerationError(err instanceof Error ? err.message : "Verification failed");
                                setAsset((a) => ({ ...a, metadata: { ...(a.metadata || {}), [verifyingKey]: false } }));
                              } finally {
                                setBusy(false);
                              }
                            }}
                            className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 py-2 text-center hover:opacity-90"
                          >
                            <span className="rounded-full bg-[#b9f42e] px-3 py-1 text-[10px] font-bold text-black">
                              Verify for Seedance
                            </span>
                          </button>
                        )}
                        {/* Remove button */}
                        <button
                          type="button"
                          onClick={() => setAsset((a) => ({
                            ...a,
                            reference_images: (a.reference_images || []).filter((_, i) => i !== idx),
                          }))}
                          className="absolute top-1.5 left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-xs text-zinc-300 hover:bg-red-600/80"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-2 rounded-xl border border-dashed border-white/15 bg-black/20 p-4 text-center text-xs text-zinc-500">
                  No reference images yet
                </div>
              )}
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/20 p-3 text-sm text-zinc-400 hover:border-[#b9f42e]">
              <Upload className="h-4 w-4" /> Upload reference face image
              <input
                type="file"
                accept="image/*"
                onChange={(e) => upload(e.target.files?.[0])}
                className="hidden"
              />
            </label>
            <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-zinc-400">
              <p className="font-bold text-[#b9f42e]">Photo Requirements for Seedance</p>
              <ul className="mt-1.5 space-y-1 list-disc list-inside text-zinc-400">
                <li><strong>Orientation:</strong> Portrait orientation</li>
                <li><strong>Framing:</strong> Front-facing close-up with face occupying ~2/3 of frame</li>
                <li><strong>Format:</strong> JPG/PNG/WebP under 30MB</li>
              </ul>
            </div>
            {/* BytePlus Asset ID (auto-filled or manual) */}
            <label className="mt-3 block text-sm">
              BytePlus Asset ID
              <input
                placeholder="Auto-filled after verification or enter manually"
                value={typeof asset.metadata === "object" && asset.metadata !== null ? (asset.metadata as Record<string, unknown>).byteplus_asset_id as string || "" : ""}
                onChange={(e) =>
                  setAsset((a) => ({
                    ...a,
                    metadata: { ...(a.metadata || {}), byteplus_asset_id: e.target.value },
                  }))
                }
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 p-2.5 font-mono text-xs outline-none focus:border-[#b9f42e]"
              />
              <span className="mt-0.5 block text-[10px] text-zinc-600">
                Formats automatically as <code className="text-[#b9f42e]/70">asset://&lt;id&gt;</code> for Seedance requests
              </span>
            </label>
            <label className="mt-3 block text-sm">
              Voice setting (optional)
              <input
                value={asset.voice_id || ""}
                onChange={(e) =>
                  setAsset((a) => ({ ...a, voice_id: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 p-2.5 outline-none"
              />
            </label>
          </>
        )}
        {generationError && <p role="alert" className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{generationError}</p>}
        <button
          disabled={busy}
          className="mt-5 w-full rounded-xl bg-[#b9f42e] px-4 py-3 font-bold text-black"
        >
          {busy ? "Saving…" : "Save asset"}
        </button>
      </form>
    </div>
  );
}
function Storyboard({
  shots,
  entities,
  episodeId,
  projectId,
  save,
  reload,
}: {
  shots: Shot[];
  entities: Entity[];
  episodeId: string;
  projectId: string;
  save: (b: unknown) => Promise<void>;
  reload: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [media, setMedia] = useState<{
    shot: Shot;
    type: "image" | "video";
  } | null>(null);
  const activeMedia = media
    ? { ...media, shot: shots.find((shot) => shot.id === media.shot.id) || media.shot }
    : null;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Pill>▯ {"9:16"}</Pill>
          <Pill>◉ Cinematic</Pill>
          <Pill>↗ 720p</Pill>
          <button className="rounded-lg bg-[#222423] px-3 py-2 text-sm text-zinc-300">
            Batch download
          </button>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="rounded-xl bg-[#b9f42e] px-4 py-2 text-sm font-bold text-black"
        >
          + Add shot
        </button>
      </div>
      {adding && (
        <ShotForm
          entities={entities}
          episodeId={episodeId}
          save={save}
          close={() => setAdding(false)}
          reload={reload}
        />
      )}
      <div className="overflow-x-auto">
        <div className="min-w-[830px]">
          <div className="grid grid-cols-[42px_minmax(210px,1.6fr)_150px_170px_170px] gap-3 px-4 pb-3 text-xs font-bold uppercase tracking-wide text-zinc-400">
            <span>#</span>
            <span>Description</span>
            <span>Assets</span>
            <span>Images</span>
            <span>Videos</span>
          </div>
          <div className="space-y-3">
            {shots.map((shot, index) => {
              const linked = entities.filter((e) =>
                shot.referenced_entities?.includes(e.id),
              );
              return (
                <article
                  key={shot.id}
                  className="grid grid-cols-[42px_minmax(210px,1.6fr)_150px_170px_170px] gap-3 rounded-xl border border-white/10 bg-[#1a1c1b] p-3"
                >
                  <div className="flex flex-col items-center gap-3">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#b9f42e]/12 font-bold text-[#b9f42e]">
                      {index + 1}
                    </span>
                    <span className="text-[10px] text-zinc-600">⋮⋮</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-[#b9f42e]/15 px-1.5 py-0.5 text-xs font-bold text-[#b9f42e]">
                        {shot.duration_seconds}s
                      </span>
                      <p className="font-bold">{shot.title}</p>
                    </div>
                    <p className="mt-3 line-clamp-7 text-sm leading-6 text-zinc-300">
                      {shot.prompt ||
                        "Add a detailed prompt with the visual direction, camera framing, movement and continuity for this shot."}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button className="text-xs font-semibold text-zinc-300">
                        ✎ Edit
                      </button>
                      <button className="text-xs font-semibold text-[#b9f42e]">
                        ↻ Redo
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap content-start gap-2">
                    {linked.map((entity) => (
                      <div key={entity.id} className="w-[62px]">
                        <AssetImage src={entity.reference_images?.[0]} />
                        <p className="mt-1 truncate text-[10px] text-zinc-400">
                          {entity.name}
                        </p>
                      </div>
                    ))}
                    {!linked.length && (
                      <button className="grid h-14 w-14 place-items-center rounded-full border border-dashed border-white/20 text-zinc-500">
                        +
                      </button>
                    )}
                  </div>
                  <div className="relative group">
                    <button
                      onClick={() => setMedia({ shot, type: "image" })}
                      className="w-full overflow-hidden rounded-lg bg-[#292b2a] text-left transition hover:ring-2 hover:ring-[#b9f42e]"
                    >
                      <Preview
                        src={shot.keyframe_image}
                        label="Reference image"
                        aspectRatio={shot.aspect_ratio || "9:16"}
                      />
                      <div className="flex flex-col gap-1 border-t border-white/10 px-2 py-2 text-xs text-zinc-400">
                        <div className="flex items-center justify-between">
                          <span>Image reference</span>
                          {shot.keyframe_image && (
                            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${shot.is_trusted_provider_asset || (typeof shot.metadata === "object" && shot.metadata !== null && "byteplus_asset_id" in shot.metadata) ? "bg-[#b9f42e]/20 text-[#b9f42e]" : "bg-white/10 text-zinc-400"}`}>
                              {shot.is_trusted_provider_asset || (typeof shot.metadata === "object" && shot.metadata !== null && "byteplus_asset_id" in shot.metadata) ? "✓ Seedance Verified" : "+ Asset Library"}
                            </span>
                          )}
                        </div>
                        {(shot.is_trusted_provider_asset || (typeof shot.metadata === "object" && shot.metadata !== null && "byteplus_asset_id" in shot.metadata)) && (
                          <div className="truncate text-[9px] font-mono text-zinc-500">
                            {String(shot.provider_asset_uri || (shot.metadata as Record<string, unknown>)?.byteplus_asset_uri || (shot.metadata as Record<string, unknown>)?.byteplus_asset_id || "")}
                          </div>
                        )}
                      </div>
                    </button>

                    {shot.keyframe_image && !(shot.is_trusted_provider_asset || (typeof shot.metadata === "object" && shot.metadata !== null && "byteplus_asset_id" in shot.metadata)) && (
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            const res = await fetch(`/api/studio/projects/${projectId}/assets`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                target: "shot",
                                targetId: shot.id,
                                imagePath: shot.keyframe_image,
                                name: shot.prompt?.slice(0, 50) || "shot_portrait",
                              }),
                            });
                            const json = await res.json();
                            if (!res.ok) alert(json.error || "Asset registration failed");
                            else {
                              alert(`✅ Registered to BytePlus Asset Library!\nAsset ID: ${json.assetId}\nAsset URI: ${json.assetUri || `asset://${json.assetId}`}`);
                              await reload();
                            }
                          } catch (err) {
                            alert(err instanceof Error ? err.message : "Asset registration failed");
                          }
                        }}
                        className="mt-1 w-full rounded-md bg-[#b9f42e]/10 py-1 text-[11px] font-bold text-[#b9f42e] hover:bg-[#b9f42e]/20 transition text-center"
                      >
                        + Add to Asset Library (Seedance)
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => setMedia({ shot, type: "video" })}
                    className="overflow-hidden rounded-lg bg-[#292b2a] text-left transition hover:ring-2 hover:ring-[#b9f42e]"
                  >
                    <Preview src={shot.video_url} label="Generated video" type="video" aspectRatio={shot.aspect_ratio || "9:16"} />
                    <div className="border-t border-white/10 px-2 py-2 text-xs text-zinc-400">
                      {shot.video_status === "completed"
                        ? "Video ready"
                        : "Awaiting output"}
                    </div>
                  </button>
                </article>
              );
            })}
          </div>
          {shots.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center text-zinc-500">
              Add a shot to begin your visual storyboard.
            </div>
          )}
        </div>
      </div>
      {activeMedia && (
        <ShotMediaWorkspace
          media={activeMedia}
          entities={entities}
          shots={shots}
          projectId={projectId}
          close={() => setMedia(null)}
          save={save}
          reload={reload}
        />
      )}
    </div>
  );
}
function ShotMediaWorkspace({
  media,
  entities,
  shots,
  projectId,
  close,
  save,
  reload,
}: {
  media: { shot: Shot; type: "image" | "video" };
  entities: Entity[];
  shots?: Shot[];
  projectId: string;
  close: () => void;
  save: (b: unknown) => Promise<void>;
  reload: (silent?: boolean) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState(media.shot.prompt || "");
  const [model, setModel] = useState<string>(
    media.type === "image" ? imageGenerationModels[0].id : videoGenerationModels[0].id,
  );
  const savedVideoMode = media.shot.metadata?.video_generation && typeof media.shot.metadata.video_generation === "object" && "generation_mode" in media.shot.metadata.video_generation ? (media.shot.metadata.video_generation as { generation_mode?: string }).generation_mode : null;
  const [videoInputMode, setVideoInputMode] = useState<"keyframe" | "multi_image">(savedVideoMode === "multi_image" ? "multi_image" : "keyframe");
  const [startFrame, setStartFrame] = useState<string | null>(media.type === "video" ? media.shot.keyframe_image : null);
  const [endFrame, setEndFrame] = useState<string | null>(null);
  const savedAspectRatio = media.shot.metadata?.video_generation && typeof media.shot.metadata.video_generation === "object" && "aspect_ratio" in media.shot.metadata.video_generation ? (media.shot.metadata.video_generation as { aspect_ratio?: string }).aspect_ratio : null;
  const savedResolution = media.shot.metadata?.video_generation && typeof media.shot.metadata.video_generation === "object" && "resolution" in media.shot.metadata.video_generation ? (media.shot.metadata.video_generation as { resolution?: string }).resolution : null;
  const savedAudio = media.shot.metadata?.video_generation && typeof media.shot.metadata.video_generation === "object" && "audio_enabled" in media.shot.metadata.video_generation ? Boolean((media.shot.metadata.video_generation as { audio_enabled?: boolean }).audio_enabled) : true;
  const [aspectRatio, setAspectRatio] = useState<string>(savedAspectRatio || media.shot.aspect_ratio || "9:16");
  const [resolution, setResolution] = useState<string>(savedResolution || media.shot.resolution || "720p");
  const [audioEnabled, setAudioEnabled] = useState<boolean>(savedAudio);
  const [durationSeconds, setDurationSeconds] = useState<number>(Number(media.shot.duration_seconds || 4));
  const [busy, setBusy] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState<string | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (data.user) getUserCredits(data.user.id).then(setCreditBalance);
    });
  }, []);
  const [picker, setPicker] = useState(false);
  const [referenceSourcePicker, setReferenceSourcePicker] = useState(false);
  const [referenceTarget, setReferenceTarget] = useState<"references" | "start" | "end">("references");
  const [references, setReferences] = useState<string[]>([]);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>(media.shot.referenced_entities || []);
  const videoReferenceImages = videoInputMode === "keyframe" ? [startFrame, endFrame].filter((item): item is string => Boolean(item)) : references;
  const selectedCharacterEntities = entities.filter((e) => e.type === "character" && selectedCharacterIds.includes(e.id));
  const selectedCharacterImagesCount = selectedCharacterEntities.reduce((acc, char) => {
    let count = Array.isArray(char.reference_images) ? char.reference_images.length : 0;
    const assetId = typeof char.metadata === "object" && char.metadata !== null ? (char.metadata as Record<string, unknown>).byteplus_asset_id : null;
    if (typeof assetId === "string" && assetId.trim()) count += 1;
    return acc + count;
  }, 0);
  const totalReferencesCount = videoReferenceImages.length + selectedCharacterImagesCount;
  const isImage = media.type === "image";
  const source = isImage ? media.shot.keyframe_image : media.shot.video_url;

  // --- Generation History ---
  type GenEntry = {
    id: string;
    status: "generating" | "completed" | "failed";
    prompt: string;
    model: string;
    referenceImages: string[];
    videoUrl: string | null;
    error: string | null;
    createdAt: number;
  };
  const [genHistory, setGenHistory] = useState<GenEntry[]>(() => {
    const initial: GenEntry[] = [];
    if (source) {
      initial.push({
        id: "original",
        status: "completed",
        prompt: media.shot.prompt || "",
        model: media.type === "image" ? imageGenerationModels[0].id : videoGenerationModels[0].id,
        referenceImages: [],
        videoUrl: source,
        error: null,
        createdAt: Date.now() - 1,
      });
    }
    return initial;
  });
  const [activeGenId, setActiveGenId] = useState<string | null>(source ? "original" : null);
  const activeGen = genHistory.find((g) => g.id === activeGenId) || null;

  // Poll in-progress job until finished or failed
  const pollJobStatus = async (jobId: string) => {
    setBusy(true);
    setGenerationStatus("BytePlus is generating the video…");
    try {
      let finalJob: Record<string, unknown> = {};
      for (let attempt = 0; attempt < 180; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 5_000));
        const statusResponse = await fetch(`/api/studio/projects/${projectId}/videos?jobId=${encodeURIComponent(jobId)}`, { cache: "no-store" });
        finalJob = await statusResponse.json();
        if (!statusResponse.ok) throw new Error((finalJob.error as string) || "Could not check video status");
        if (finalJob.status === "completed") break;
        if (finalJob.status === "failed" || finalJob.status === "cancelled") throw new Error((finalJob.error as string) || `Video generation ${finalJob.status}`);
      }
      if (finalJob.status !== "completed") throw new Error("Video generation is still running. Reopen this shot to check again.");
      const videoUrl = (finalJob.result_url as string) || (finalJob.videoUrl as string) || source;
      setGenHistory((prev) => prev.map((g) => g.id === jobId ? { ...g, status: "completed" as const, videoUrl } : g));
      setGenerationStatus("Video ready ✓");
      await reload(true);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Generation failed";
      setGenerationError(errorMsg);
      setGenHistory((prev) => prev.map((g) => g.id === jobId ? { ...g, status: "failed" as const, error: errorMsg } : g));
    } finally {
      setBusy(false);
    }
  };

  // Load persistent generation jobs for this shot from database
  useEffect(() => {
    let active = true;
    async function loadJobs() {
      try {
        const { data: dbJobs } = await createClient()
          .from("creator_generation_jobs")
          .select("*")
          .eq("shot_id", media.shot.id)
          .order("created_at", { ascending: false });

        if (!active || !dbJobs) return;

        const entries: GenEntry[] = dbJobs.map((j) => ({
          id: j.id,
          status: j.status === "completed" ? "completed" : j.status === "failed" || j.status === "cancelled" ? "failed" : "generating",
          prompt: j.prompt || "",
          model: j.model || "",
          referenceImages: Array.isArray(j.input_images) ? j.input_images : [],
          videoUrl: j.result_url || null,
          error: j.error || null,
          createdAt: new Date(j.created_at).getTime(),
        }));

        if (source && !entries.some((e) => e.videoUrl === source)) {
          entries.push({
            id: "original",
            status: "completed",
            prompt: media.shot.prompt || "",
            model: media.type === "image" ? imageGenerationModels[0].id : videoGenerationModels[0].id,
            referenceImages: [],
            videoUrl: source,
            error: null,
            createdAt: 0,
          });
        }

        setGenHistory(entries);
        if (entries.length > 0) {
          setActiveGenId(entries[0].id);
          if (entries[0].status === "failed") setGenerationError(entries[0].error);
        }

        // Resume polling for any in-progress job
        const pendingJobs = entries.filter((e) => e.status === "generating");
        for (const pJob of pendingJobs) {
          pollJobStatus(pJob.id);
        }
      } catch (err) {
        console.warn("Could not load shot generation history:", err);
      }
    }

    loadJobs();
    return () => { active = false; };
  }, [media.shot.id]);

  const [registeringAsset, setRegisteringAsset] = useState(false);
  const registerCurrentAsBytePlusAsset = async () => {
    const previewSrc = activeGen?.videoUrl || source;
    if (!previewSrc) return;
    setRegisteringAsset(true);
    setGenerationError(null);
    try {
      const res = await fetch(`/api/studio/projects/${projectId}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: "shot",
          targetId: media.shot.id,
          imagePath: previewSrc,
          name: media.shot.prompt?.slice(0, 50) || "shot_portrait",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Asset registration failed");
      setGenerationStatus("Registered to BytePlus Asset Library ✓");
      await reload(true);
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : "Asset registration failed");
    } finally {
      setRegisteringAsset(false);
    }
  };

  const openReferenceSource = (target: "references" | "start" | "end") => {
    setReferenceTarget(target);
    setReferenceSourcePicker(true);
  };
  const addCurrentSourceAsReference = () => {
    const previewSrc = activeGen?.videoUrl || source;
    if (!previewSrc) return;
    if (!isImage && videoInputMode === "keyframe") {
      setStartFrame((current) => current || previewSrc);
      return;
    }
    setReferences((current) => current.includes(previewSrc) ? current : [...current, previewSrc]);
  };
  const toggleCharacterSelection = (id: string) => {
    setSelectedCharacterIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const loadPromptFromGen = (gen: GenEntry) => {
    setPrompt(gen.prompt);
    if (gen.referenceImages.length) setReferences(gen.referenceImages);
  };

  const generate = async () => {
    setBusy(true);
    setGenerationError(null);
    setGenerationStatus(null);

    const genId = `gen-${Date.now()}`;
    const newEntry: GenEntry = {
      id: genId,
      status: "generating",
      prompt,
      model,
      referenceImages: [...videoReferenceImages],
      videoUrl: null,
      error: null,
      createdAt: Date.now(),
    };
    setGenHistory((prev) => [newEntry, ...prev]);
    setActiveGenId(genId);

    try {
      const mentionedEntityIds = findMentionedEntityIds(prompt, entities);
      const mentionedCharacterIds = entities
        .filter((entity) => entity.type === "character" && mentionedEntityIds.includes(entity.id))
        .map((entity) => entity.id);
      // Explicit @mentions take priority if the provider's character-reference limit is reached.
      const characterEntityIds = Array.from(new Set([...mentionedCharacterIds, ...selectedCharacterIds])).slice(0, 10);
      if (isImage) {
        const response = await fetch(`/api/studio/projects/${projectId}/images`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target: "shot", targetId: media.shot.id, prompt, model, referenceImages: references, mentionedEntityIds, aspectRatio, quality }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Image generation failed");
        notifyCreditBalanceChanged(typeof body.creditBalance === "number" ? body.creditBalance : undefined);
        setGenHistory((prev) => prev.map((g) => g.id === genId ? { ...g, status: "completed" as const, videoUrl: body.imageUrl || source } : g));
      } else {
        setGenerationStatus("Submitting generation job…");
        const response = await fetch(`/api/studio/projects/${projectId}/videos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shotId: media.shot.id, prompt, model, referenceImages: videoReferenceImages, characterEntityIds, mentionedEntityIds, generationMode: videoInputMode, startFrame, endFrame, aspectRatio, resolution, quality, audioEnabled, durationSeconds }) });
        const body = await response.json();
        if (!response.ok) {
          const errorMsg = body.error || "Video generation failed";
          setGenHistory((prev) => prev.map((g) => g.id === genId ? { ...g, status: "failed" as const, error: errorMsg } : g));
          throw new Error(errorMsg);
        }
        notifyCreditBalanceChanged(typeof body.creditBalance === "number" ? body.creditBalance : undefined);
        const dbJobId = body.jobId;
        setGenHistory((prev) => prev.map((g) => g.id === genId ? { ...g, id: dbJobId } : g));
        await pollJobStatus(dbJobId);
      }
    } catch (error) {
      notifyCreditBalanceChanged();
      const errorMsg = error instanceof Error ? error.message : "Generation failed";
      setGenerationError(errorMsg);
      setGenHistory((prev) => prev.map((g) => g.id === genId ? { ...g, status: "failed" as const, error: errorMsg } : g));
    } finally {
      setBusy(false);
    }
  };

  // Determine what to show in the main preview
  const previewSource = activeGen?.videoUrl || source;
  const previewError = activeGen?.status === "failed" ? activeGen.error : generationError;
  const previewGenerating = activeGen?.status === "generating";

  const addReferencePath = (path: string) => {
    if (referenceTarget === "start") {
      setStartFrame(path);
      return;
    }
    if (referenceTarget === "end") {
      setEndFrame(path);
      return;
    }
    setReferences((current) => current.includes(path) ? current : [...current, path]);
  };
  const uploadReference = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setGenerationError(null);
    setGenerationStatus(null);
    try {
      const userId = (await createClient().auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Please sign in before uploading a reference.");
      const path = `${userId}/${projectId}/shot-reference-${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      const { error } = await createClient()
        .storage.from("creator-studio-media")
        .upload(path, file);
      if (error) throw error;
      addReferencePath(path);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "Reference upload failed");
    } finally {
      setBusy(false);
    }
  };

  const [quality, setQuality] = useState<"Low" | "Medium" | "High" | "Ultra">("Medium");

  const currentActiveChosenSource = isImage ? media.shot.keyframe_image : media.shot.video_url;
  const isCurrentlyChosen = Boolean(previewSource && previewSource === currentActiveChosenSource);

  const currentCreditCost = calculateCreditCost(model, isImage ? "image" : "video", durationSeconds, { quality, aspectRatio, resolution });
  const displayGenerations = useMemo(() => {
    return [...genHistory].sort((a, b) => {
      const aChosen = Boolean(a.videoUrl && a.videoUrl === currentActiveChosenSource);
      const bChosen = Boolean(b.videoUrl && b.videoUrl === currentActiveChosenSource);
      if (aChosen && !bChosen) return -1;
      if (!aChosen && bChosen) return 1;
      return b.createdAt - a.createdAt;
    });
  }, [genHistory, currentActiveChosenSource]);

  const chooseCurrentMedia = async () => {
    if (!previewSource || isCurrentlyChosen) return;
    setBusy(true);
    try {
      await save({
        action: "updateShotChosenMedia",
        shotId: media.shot.id,
        mediaType: isImage ? "image" : "video",
        mediaUrl: previewSource,
      });
      if (isImage) {
        media.shot.keyframe_image = previewSource;
      } else {
        media.shot.video_url = previewSource;
      }
      setGenerationStatus("Chosen as active shot media ✓");
      await reload(true);
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : "Could not set chosen media");
    } finally {
      setBusy(false);
    }
  };

  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);

  const deleteGenerationJob = (jobId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!jobId || jobId === "original") return;
    setDeletingJobId(jobId);
  };

  const executeDeleteJob = async (jobId: string) => {
    setBusy(true);
    try {
      await save({
        action: "deleteJob",
        jobId,
      });
      const deletedGen = genHistory.find((g) => g.id === jobId);
      const remaining = genHistory.filter((g) => g.id !== jobId);
      setGenHistory(remaining);

      if (deletedGen?.videoUrl && deletedGen.videoUrl === currentActiveChosenSource) {
        const nextChosen = remaining.find((g) => g.videoUrl)?.videoUrl || null;
        await save({
          action: "updateShotChosenMedia",
          shotId: media.shot.id,
          mediaType: isImage ? "image" : "video",
          mediaUrl: nextChosen,
        });
      }

      if (activeGenId === jobId) {
        if (remaining.length > 0) {
          setActiveGenId(remaining[0].id);
          if (remaining[0].prompt) setPrompt(remaining[0].prompt);
          if (remaining[0].model) setModel(remaining[0].model);
        } else {
          setActiveGenId(null);
        }
      }
      setGenerationStatus("Item deleted ✓");
      await reload(true);
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
      setDeletingJobId(null);
    }
  };

  // Escape key handler to close slide over workspace
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close]);

  return (
    <div className="fixed inset-0 z-50 bg-[#080908] text-white">
      <div className="flex h-full">
        {/* Left sidebar — Generation History */}
        <aside className="relative flex w-44 shrink-0 flex-col border-r border-white/10 bg-[#0b0c0b]">
          <div className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-[#0b0c0b]/95 p-3 backdrop-blur-md">
            <button
              onClick={close}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white transition hover:bg-white/20 hover:text-[#b9f42e]"
              title="Close Workspace (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Esc</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <label className="mb-3 grid aspect-[3/4] cursor-pointer place-items-center rounded-xl border border-dashed border-white/25 text-center text-xs text-zinc-400 hover:border-[#b9f42e] transition">
              +<br />Upload
              <input type="file" accept="image/*,video/*" className="hidden" onChange={(e) => uploadReference(e.target.files?.[0])} />
            </label>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-zinc-600">Generations</p>
            <div className="flex flex-col gap-2">
              {genHistory.map((gen) => {
                const isActive = activeGenId === gen.id;
                const isGenChosen = Boolean(gen.videoUrl && gen.videoUrl === currentActiveChosenSource);
                return (
                  <div key={gen.id} className="relative group">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveGenId(gen.id);
                        if (gen.prompt) setPrompt(gen.prompt);
                        if (gen.model) setModel(gen.model);
                        if (gen.referenceImages && gen.referenceImages.length) setReferences(gen.referenceImages);
                        if (gen.status === "failed") setGenerationError(gen.error);
                        else setGenerationError(null);
                      }}
                      className={`group relative block w-full overflow-hidden rounded-xl border-2 transition text-left ${
                        isGenChosen
                          ? "border-[#b9f42e] ring-2 ring-[#b9f42e]/40"
                          : isActive
                          ? "border-white/60"
                          : "border-white/10 hover:border-white/25"
                      }`}
                    >
                      {gen.status === "generating" ? (
                        <div className="grid aspect-[3/4] place-items-center bg-black/40">
                          <div className="flex flex-col items-center gap-2">
                            <svg className="h-6 w-6 animate-spin text-[#b9f42e]" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-20" />
                              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                            </svg>
                            <span className="text-[10px] text-zinc-400">Generating…</span>
                          </div>
                        </div>
                      ) : gen.status === "failed" ? (
                        <div className="grid aspect-[3/4] place-items-center bg-red-950/30 p-2">
                          <div className="flex flex-col items-center gap-1 text-center">
                            <span className="text-lg">⚠</span>
                            <span className="line-clamp-3 text-[10px] leading-tight text-red-300">{gen.error || "Failed"}</span>
                          </div>
                        </div>
                      ) : gen.videoUrl ? (
                        <Preview src={gen.videoUrl} label={gen.id === "original" ? "Original" : "Generated"} type={isImage ? "image" : "video"} />
                      ) : (
                        <div className="grid aspect-[3/4] place-items-center bg-black/30 text-xs text-zinc-500">No output</div>
                      )}

                      {/* Chosen Badge */}
                      {isGenChosen && (
                        <span className="absolute right-1.5 top-1.5 rounded-md bg-[#b9f42e] px-1.5 py-0.5 text-[9px] font-black uppercase text-black shadow-md z-10">
                          ✓ CHOSEN
                        </span>
                      )}

                      {/* Prompt preview badge */}
                      {gen.prompt && (
                        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/90 to-transparent px-2 py-1.5 text-[10px] text-zinc-300">
                          {gen.id === "original" ? "Original" : gen.prompt}
                        </span>
                      )}
                    </button>

                    {/* Delete hover button for non-original items */}
                    {gen.id !== "original" && (
                      <button
                        type="button"
                        onClick={(e) => deleteGenerationJob(gen.id, e)}
                        className="absolute left-1.5 top-1.5 hidden rounded-md bg-black/80 p-1.5 text-zinc-400 hover:bg-red-600 hover:text-white group-hover:block transition z-20"
                        title="Delete generation"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Main preview area */}
        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center gap-3 border-b border-white/10 px-6">
            {isCurrentlyChosen ? (
              <span className="flex items-center gap-1.5 rounded-lg border border-[#b9f42e]/50 bg-[#b9f42e]/20 px-4 py-2 text-xs font-black text-[#b9f42e]">
                ✓ Chosen for Storyboard
              </span>
            ) : (
              <button
                type="button"
                onClick={chooseCurrentMedia}
                disabled={busy || !previewSource}
                className="flex items-center gap-1.5 rounded-lg bg-[#b9f42e] px-4 py-2 text-xs font-black text-black hover:bg-[#a6de25] transition shadow-lg disabled:opacity-40"
              >
                ✓ Choose
              </button>
            )}

            {activeGen && activeGen.id !== "original" && (
              <button
                type="button"
                onClick={() => deleteGenerationJob(activeGen.id)}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/20 transition disabled:opacity-40"
                title="Delete this generation"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete</span>
              </button>
            )}

            {activeGen && activeGen.id !== "original" && (
              <button
                type="button"
                onClick={() => loadPromptFromGen(activeGen)}
                className="rounded-lg bg-white/5 px-3 py-2 text-xs font-semibold text-[#b9f42e] hover:bg-white/10"
              >
                ♻ Reuse prompt
              </button>
            )}

            <button onClick={addCurrentSourceAsReference} disabled={!previewSource} className="rounded-lg px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40">
              Use as reference
            </button>
            <button
              onClick={registerCurrentAsBytePlusAsset}
              disabled={registeringAsset || !previewSource}
              className="rounded-lg bg-[#b9f42e]/10 px-3 py-2 text-xs font-bold text-[#b9f42e] hover:bg-[#b9f42e]/20 disabled:opacity-40"
            >
              {registeringAsset ? "Registering…" : "Verify for Seedance"}
            </button>
            <span className="h-6 border-l border-white/10" />
            <button
              onClick={generate}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3.5 py-2 text-xs font-bold text-[#b9f42e] hover:bg-white/10 disabled:opacity-40"
            >
              ↻ {busy ? "Generating…" : `Regenerate (⚡ ${currentCreditCost} Credits)`}
            </button>
            <span className="ml-auto text-xs text-zinc-500">
              {genHistory.length > 1 ? `${genHistory.length} generations` : "Private asset"}
            </span>
          </header>
          <div className="grid flex-1 place-items-center overflow-auto bg-black/40 p-4 sm:p-8">
            <div className="flex flex-col items-center overflow-hidden rounded-xl bg-[#151715] shadow-2xl transition-all max-w-4xl w-full">
              {previewGenerating ? (
                <div className={`grid place-items-center p-8 ${aspectRatio === "9:16" ? "aspect-[9/16] h-[55vh] max-h-[580px]" : "aspect-[16/9] w-full max-w-[640px]"}`}>
                  <div className="flex flex-col items-center gap-4">
                    <svg className="h-12 w-12 animate-spin text-[#b9f42e]" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="opacity-20" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                    <p className="text-sm text-zinc-400">{generationStatus || "Generating…"}</p>
                    <p className="max-w-xs text-center text-xs text-zinc-600">This may take 30–90 seconds for video generation</p>
                  </div>
                </div>
              ) : previewError ? (
                <GenerationPreviewError message={previewError} />
              ) : previewSource ? (
                <ResolvedMedia
                  src={previewSource}
                  type={isImage ? "image" : "video"}
                  className="max-h-[60vh] w-auto max-w-full rounded-t-xl object-contain mx-auto"
                />
              ) : (
                <div className={`grid place-items-center text-center text-zinc-500 p-8 ${aspectRatio === "9:16" ? "aspect-[9/16] h-[55vh] max-h-[580px]" : "aspect-[16/9] w-full max-w-[640px]"}`}>
                  Click &ldquo;Generate video&rdquo; below<br />to create your first output.
                </div>
              )}
              {/* Show prompt, model used, and reference images for active selected generation */}
              {activeGen && (
                <div className="w-full border-t border-white/10 bg-black/60 p-4 rounded-b-xl">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#b9f42e]">
                      PROMPT USED
                    </p>
                    {activeGen.model && (
                      <span className="rounded-md border border-[#b9f42e]/30 bg-[#b9f42e]/10 px-2 py-0.5 text-[11px] font-bold text-[#b9f42e]">
                        Model: {getModelLabel(activeGen.model)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-200">{activeGen.prompt || "—"}</p>
                  {activeGen.referenceImages && activeGen.referenceImages.length > 0 && (
                    <>
                      <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Reference images</p>
                      <div className="mt-1.5 flex gap-2">
                        {activeGen.referenceImages.map((img, i) => (
                          <div key={`${img}-${i}`} className="h-10 w-10 overflow-hidden rounded-lg border border-white/10">
                            <AssetImage src={img} />
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
        <aside className="flex w-[430px] shrink-0 flex-col border-l border-white/10 bg-[#151715]">
          <div className="flex items-start justify-between p-6">
            <div>
              <p className="text-xs font-bold tracking-[.18em] text-[#b9f42e]">
                SHOT {isImage ? "IMAGE" : "VIDEO"}
              </p>
              <h2 className="mt-2 text-3xl font-black">{media.shot.title}</h2>
              <p className="mt-2 text-sm text-zinc-400">
                {media.shot.duration_seconds}s ·{" "}
                {isImage ? "9:16 image" : "9:16 video"}
              </p>
            </div>
          </div>
          <div className="flex-1 overflow-auto px-6">
            {isImage ? (
              <div className="mb-5 rounded-xl border border-white/10 bg-[#0b0c0b] p-4">
                <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Reference images</p><button type="button" onClick={() => { setReferenceTarget("references"); setPicker(true); }} className="text-sm font-semibold text-[#b9f42e]">Select assets</button></div>
                <div className="mt-3 flex flex-wrap gap-2"><button type="button" aria-label="Add reference image" onClick={() => openReferenceSource("references")} className="grid h-16 w-16 place-items-center rounded-lg border border-dashed border-white/25 text-xl text-zinc-400 hover:border-[#b9f42e]">+</button>{references.map((reference, index) => <div key={`${reference}-${index}`} className="relative h-16 w-16 overflow-hidden rounded-lg"><AssetImage src={reference} /><button type="button" aria-label={`Remove reference image ${index + 1}`} onClick={() => setReferences(items => items.filter((_, itemIndex) => itemIndex !== index))} className="absolute right-1 top-1 rounded bg-black/70 px-1 text-xs">×</button></div>)}</div>
                <p className="mt-3 text-xs leading-5 text-zinc-500">{references.length ? `${references.length} reference image${references.length === 1 ? "" : "s"} will be sent with this prompt.` : "Add a reference image to guide this generation."}</p>
              </div>
            ) : (
              <div className="mb-5 rounded-2xl border border-white/10 bg-[#0b0c0b] p-4">
                <div className="inline-flex rounded-full bg-black/60 p-1">
                  <button type="button" onClick={() => setVideoInputMode("keyframe")} className={`rounded-full px-4 py-2 text-sm font-bold ${videoInputMode === "keyframe" ? "bg-[#fff878] text-black" : "text-zinc-400"}`}>Key Frame</button>
                  <button type="button" onClick={() => setVideoInputMode("multi_image")} className={`rounded-full px-4 py-2 text-sm font-bold ${videoInputMode === "multi_image" ? "bg-[#fff878] text-black" : "text-zinc-400"}`}>Multi Image</button>
                </div>
                {videoInputMode === "keyframe" ? (
                  <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <FrameSlot label="Start frame" value={startFrame} onAdd={() => openReferenceSource("start")} onClear={() => setStartFrame(null)} />
                    <span className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/5 text-zinc-400">↔</span>
                    <FrameSlot label="Last frame" value={endFrame} onAdd={() => openReferenceSource("end")} onClear={() => setEndFrame(null)} />
                  </div>
                ) : (
                  <div className="mt-4">
                    <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Multi image references</p><button type="button" onClick={() => { setReferenceTarget("references"); setPicker(true); }} className="text-sm font-semibold text-[#b9f42e]">Select assets</button></div>
                    <div className="mt-3 flex flex-wrap gap-2"><button type="button" aria-label="Add reference image" onClick={() => openReferenceSource("references")} className="grid h-16 w-16 place-items-center rounded-lg border border-dashed border-white/25 text-xl text-zinc-400 hover:border-[#b9f42e]">+</button>{references.map((reference, index) => <div key={`${reference}-${index}`} className="relative h-16 w-16 overflow-hidden rounded-lg"><AssetImage src={reference} /><button type="button" aria-label={`Remove reference image ${index + 1}`} onClick={() => setReferences(items => items.filter((_, itemIndex) => itemIndex !== index))} className="absolute right-1 top-1 rounded bg-black/70 px-1 text-xs">×</button></div>)}</div>
                  </div>
                )}
                <p className="mt-3 text-xs leading-5 text-zinc-500">
                  {totalReferencesCount
                    ? `${totalReferencesCount} total reference inputs will be sent (${videoReferenceImages.length} direct + ${selectedCharacterImagesCount} from character).`
                    : "Add a start frame or multi-image references to guide this video."}
                </p>
              </div>
            )}
            {!isImage && entities.some((e) => e.type === "character") && (
              <div className="mb-5 rounded-2xl border border-white/10 bg-[#0b0c0b] p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Project Characters (Real Faces)</p>
                <p className="mt-1 text-xs text-zinc-400">Select characters to automatically send their saved real-face photo references to BytePlus.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {entities.filter((e) => e.type === "character").map((character) => {
                    const isSelected = selectedCharacterIds.includes(character.id);
                    return (
                      <button
                        key={character.id}
                        type="button"
                        onClick={() => toggleCharacterSelection(character.id)}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                          isSelected
                            ? "border-[#b9f42e] bg-[#b9f42e]/15 text-[#d9ff84]"
                            : "border-white/10 bg-white/5 text-zinc-300 hover:border-white/30"
                        }`}
                      >
                        <span className="h-2 w-2 rounded-full bg-[#b9f42e]" />
                        <span>{character.name}</span>
                        {isSelected && <span className="font-bold">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="mb-5 rounded-2xl border border-white/10 bg-[#0b0c0b] p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500">Generation Settings</p>
              <div className="grid grid-cols-2 gap-3">
                <ModelChip
                  label="Aspect ratio"
                  value={aspectRatio}
                  choices={["1:1", "2:3", "3:2", "9:16", "16:9", "21:9"]}
                  onChange={setAspectRatio}
                />
                <ModelChip
                  label="Quality Level"
                  value={`✨ ${quality}`}
                  choices={["Low", "Medium", "High", "Ultra"]}
                  onChange={(val) => setQuality(val.replace(/^✨\s*/, "") as "Low" | "Medium" | "High" | "Ultra")}
                />
                {!isImage && (
                  <ModelChip
                    label="Resolution"
                    value={resolution}
                    choices={["480p", "720p", "1080p", "4K"]}
                    onChange={setResolution}
                  />
                )}
                {!isImage && (
                  <ModelChip
                    label="Duration"
                    value={`${durationSeconds}s`}
                    choices={["4s", "6s", "8s", "10s", "15s", "20s", "30s"]}
                    onChange={(next) => setDurationSeconds(Number(next.replace(/s$/, "")))}
                  />
                )}
                {!isImage && (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Audio</p>
                    <button type="button" onClick={() => setAudioEnabled((current) => !current)} className={`mt-2 inline-flex items-center gap-3 rounded-full px-3 py-2 text-sm font-bold ${audioEnabled ? "bg-[#fff878] text-black" : "bg-white/10 text-zinc-300"}`}>
                      <span className={`grid h-6 w-10 rounded-full p-1 ${audioEnabled ? "bg-black/20" : "bg-black/40"}`}>
                        <span className={`h-4 w-4 rounded-full bg-black transition ${audioEnabled ? "translate-x-4" : "translate-x-0"}`} />
                      </span>
                      {audioEnabled ? "On" : "Off"}
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="block text-xs font-bold uppercase tracking-wide text-zinc-500">
              {isImage ? "Image prompt" : "Video motion prompt"}
              <EntityMentionInput
                value={prompt}
                onChange={setPrompt}
                entities={entities}
                className="mt-2 h-52 w-full resize-none rounded-xl border border-white/10 bg-[#0b0c0b] p-4 text-base leading-7 text-zinc-200 outline-none focus:border-[#b9f42e]/60"
                placeholder={
                  isImage
                    ? "Describe composition and lighting. Type @ to bind project characters and assets…"
                    : "Describe motion and timing. Type @ to bind project characters and assets…"
                }
                ariaLabel={isImage ? "Shot image prompt" : "Shot video prompt"}
              />
            </div>
            <ModelMenu type={isImage ? "image" : "video"} value={model} onChange={setModel} options={{ quality, aspectRatio, resolution, durationSeconds }} />
            <p className="mt-4 rounded-xl border border-[#b9f42e]/20 bg-[#b9f42e]/5 p-3 text-sm text-zinc-300">
              {isImage ? "Image requests are processed securely on the server." : "Video requests run asynchronously on secure generation servers."}
            </p>
            {generationStatus && <p role="status" className="mt-3 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-100">{generationStatus}</p>}
            {generationError && <p role="alert" className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{generationError}</p>}
          </div>
          <div className="border-t border-white/10 p-6">
            {creditBalance !== null && creditBalance < currentCreditCost ? (
              <div className="space-y-2">
                <button
                  disabled
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-700 px-4 py-3.5 font-bold text-zinc-400 cursor-not-allowed"
                >
                  <Sparkles className="h-4 w-4" />
                  Insufficient Credits (⚡ {currentCreditCost} needed)
                </button>
                <p className="flex items-center justify-center gap-1.5 text-xs text-amber-300">
                  <Zap className="h-3.5 w-3.5" />
                  You have {creditBalance} credits. <a href="/studio/credits" className="underline font-bold hover:text-[#b9f42e]">Buy more credits</a>
                </p>
              </div>
            ) : (
              <button
                onClick={generate}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#b9f42e] px-4 py-3.5 font-bold text-black hover:bg-[#a6de25] transition disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4 fill-black" />
                {busy
                  ? isImage ? "Generating image…" : "Generating video…"
                  : `Generate ${isImage ? "image" : "video"} (⚡ ${currentCreditCost} Credits)`}
              </button>
            )}
          </div>
        </aside>
      </div>
      {referenceSourcePicker && <ReferenceSourcePicker close={() => setReferenceSourcePicker(false)} onChooseExisting={() => { setReferenceSourcePicker(false); setPicker(true); }} onUpload={uploadReference} />}
      {picker && <ReferencePicker entities={entities} shots={shots} selected={referenceTarget === "references" ? references : []} close={() => setPicker(false)} confirm={(items) => { const selectedImage = items[0]; if (referenceTarget === "start" && selectedImage) setStartFrame(selectedImage); else if (referenceTarget === "end" && selectedImage) setEndFrame(selectedImage); else setReferences(items); setPicker(false) }} />}
      {deletingJobId && (
        <DeleteConfirmModal
          title="Delete Generation"
          message="Are you sure you want to delete this generated item? This action cannot be undone."
          confirmLabel="Delete Item"
          onConfirm={() => executeDeleteJob(deletingJobId)}
          onClose={() => setDeletingJobId(null)}
          busy={busy}
        />
      )}
    </div>
  );
}

function GenerationPreviewError({ message }: { message: string }) {
  const isRealPersonError = /real person/i.test(message);
  return (
    <div className="grid aspect-[9/14] place-items-center p-6 text-center">
      <div role="alert" className="max-w-sm rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-left">
        <p className="text-xs font-bold uppercase tracking-wide text-red-200">Generation Error</p>
        <p className="mt-2 text-sm leading-6 text-red-100">{message}</p>
        {isRealPersonError && (
          <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs leading-relaxed text-yellow-200">
            💡 <strong>How to fix:</strong> Deselect unverified face photos from <em>Multi Image References</em> or <em>Project Characters</em>, or open your character in <strong>Characters &amp; Assets</strong> and click <strong>Verify for Seedance</strong>.
          </div>
        )}
      </div>
    </div>
  );
}

type ChatProposal = Workspace["actionProposals"][number];

function ThinkingBubble() {
  return (
    <div className="mt-3 max-w-[90%] rounded-xl bg-[#1a1a1a] p-3 text-[13px] text-zinc-300">
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-zinc-400">AI Director is thinking</span>
        <span className="flex gap-1" aria-hidden="true">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#b9f42e]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#b9f42e] [animation-delay:120ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#b9f42e] [animation-delay:240ms]" />
        </span>
      </div>
    </div>
  );
}

function ChatMedia({ media }: { media?: Array<Record<string, unknown>> | null }) {
  if (!media?.length) return null;
  return (
    <div className="mt-3 space-y-2">
      {media.map((item, index) => {
        const type = typeof item.type === "string" ? item.type : "media";
        const url = typeof item.url === "string" ? item.url : "";
        const prompt = typeof item.prompt === "string" ? item.prompt : "";
        const name = typeof item.name === "string" ? item.name : "";
        return (
          <div key={`${type}-${index}`} className="overflow-hidden rounded-lg border border-white/[0.08] bg-black/30">
            {type === "image" && url && <img src={url} alt={prompt || "Generated image"} className="aspect-video w-full object-cover" />}
            {type === "video" && url && <video src={url} controls playsInline preload="metadata" className="aspect-video w-full bg-black object-contain" />}
            {type === "audio" && url && <div className="p-3"><audio src={url} controls className="w-full" /></div>}
            <div className="p-2 text-[11px] text-zinc-400">
              <p className="font-medium text-zinc-300">{name || (type === "image" ? "Image" : type === "video" ? "Video" : type === "audio" ? "Audio" : "Media")}</p>
              {prompt && <p className="mt-1 line-clamp-2">{prompt}</p>}
              <p className="mt-1 text-zinc-500">Available to AI Director as a reference for assets, storyboard, and generation.</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChatTimeline({ blocks, onAction, disabled }: { blocks: unknown; onAction: (intent: string) => void; disabled: boolean }) {
  const timeline = parseDirectorTimeline(blocks);
  if (!timeline.length) return null;
  return (
    <div className="mt-3 space-y-2">
      {timeline.map((block, index) => <ChatTimelineBlock key={`${block.type}-${index}`} block={block} onAction={onAction} disabled={disabled} />)}
    </div>
  );
}

function ChatTimelineBlock({ block, onAction, disabled }: { block: DirectorTimelineBlock; onAction: (intent: string) => void; disabled: boolean }) {
  if (block.type === "tool_execution") {
    const failed = block.status === "failed";
    const waiting = block.status === "awaiting_approval";
    return (
      <details className={`rounded-lg border ${failed ? "border-red-500/30 bg-red-500/10" : waiting ? "border-amber-400/25 bg-amber-400/[0.07]" : "border-white/[0.08] bg-black/20"}`} open={failed}>
        <summary className="flex cursor-pointer list-none items-center gap-2 p-2.5 text-[12px] font-semibold">
          <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${failed ? "bg-red-500/20 text-red-300" : waiting ? "bg-amber-400/15 text-amber-200" : "bg-emerald-500/15 text-emerald-300"}`}>{failed ? "×" : waiting ? "…" : "✓"}</span>
          <span>{block.label}</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-zinc-500">{block.status.replaceAll("_", " ")}</span>
        </summary>
        {(block.detail || block.error) && <p className={`border-t p-2.5 text-[11px] leading-5 ${failed ? "border-red-500/20 text-red-200" : "border-white/[0.06] text-zinc-400"}`}>{block.error || block.detail}</p>}
      </details>
    );
  }
  if (block.type === "plan") return <div className="rounded-lg border border-white/[0.08] bg-black/20 p-2.5"><p className="text-[12px] font-semibold">{block.title}</p><div className="mt-2 space-y-1.5">{block.steps.map((step) => <div key={step.id} className="flex gap-2 text-[11px] text-zinc-400"><span>{step.status === "completed" ? "✓" : step.status === "failed" ? "×" : "○"}</span><span>{step.label}</span></div>)}</div></div>;
  if (block.type === "suggested_actions") return <div className="space-y-1.5">{block.actions.map((action) => <button key={action.id} type="button" disabled={disabled} onClick={() => onAction(action.intent)} className={`w-full rounded-lg border px-3 py-2.5 text-left text-[12px] font-semibold transition disabled:opacity-50 ${action.recommended ? "border-[#b9f42e]/35 bg-[#b9f42e]/10 text-[#dfff8c] hover:bg-[#b9f42e]/15" : "border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]"}`}>{action.label}</button>)}</div>;
  if (block.type === "warning") return <div className="rounded-lg border border-amber-400/25 bg-amber-400/[0.07] p-2.5 text-[11px] leading-5 text-amber-100"><strong>{block.code}</strong><p>{block.message}</p>{block.actions.map((action) => <button key={action.id} type="button" disabled={disabled} onClick={() => onAction(action.intent)} className="mt-2 mr-2 rounded-md border border-amber-300/25 px-2 py-1 font-semibold">{action.label}</button>)}</div>;
  if (block.type === "workflow_summary") return <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] p-2.5 text-[11px] text-emerald-100"><strong>{block.title}</strong><p className="mt-1 text-emerald-100/75">{block.summary}</p></div>;
  if (block.type === "media_result") return <ChatMedia media={block.media} />;
  return null;
}

function ChatSuggestedActions({
  actions,
  proposals,
  busyId,
  onDecide,
}: {
  actions?: Array<Record<string, unknown>> | null;
  proposals: ChatProposal[];
  busyId: string | null;
  onDecide: (proposalId: string, decision: "approved" | "rejected") => void;
}) {
  const ids = proposalIdsFromActions(actions);
  const matched = proposals.filter((proposal) => ids.includes(proposal.id));
  if (!matched.length) return null;
  return (
    <div className="mt-3 space-y-2">
      {matched.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} busy={busyId === proposal.id} onDecide={onDecide} />)}
    </div>
  );
}

function PendingProposalCards({
  proposals,
  excludeIds,
  sessionId,
  busyId,
  onDecide,
}: {
  proposals: ChatProposal[];
  excludeIds: string[];
  sessionId?: string | null;
  busyId: string | null;
  onDecide: (proposalId: string, decision: "approved" | "rejected") => void;
}) {
  const excluded = new Set(excludeIds);
  // Only the current conversation's approvals belong in this timeline. Without
  // the session check, opening a new chat inherits every unresolved card from
  // earlier chats in the same project.
  const pending = proposals.filter((proposal) => proposal.status === "pending" && !excluded.has(proposal.id) && proposal.session_id === sessionId).slice(0, 3);
  if (!pending.length) return null;
  return (
    <div className="mt-4 space-y-2">
      {pending.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} busy={busyId === proposal.id} onDecide={onDecide} />)}
    </div>
  );
}

function proposalIdsFromActions(actions?: Array<Record<string, unknown>> | null) {
  return (actions || [])
    .map((action) => action.proposal)
    .filter((proposal): proposal is { id: string } => Boolean(proposal && typeof proposal === "object" && "id" in proposal && typeof (proposal as { id?: unknown }).id === "string"))
    .map((proposal) => proposal.id);
}

function ProposalCard({
  proposal,
  busy,
  onDecide,
}: {
  proposal: ChatProposal;
  busy: boolean;
  onDecide: (proposalId: string, decision: "approved" | "rejected") => void;
}) {
  const canDecide = proposal.status === "pending";
  return (
    <div className="rounded-lg border border-[#b9f42e]/20 bg-[#10140a] p-3 text-left">
      <div className="flex items-start gap-2">
        <WandSparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#b9f42e]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold text-zinc-100">{proposal.title}</p>
          {proposal.summary && <p className="mt-1 text-[11px] leading-5 text-zinc-400">{proposal.summary}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
            <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-zinc-400">{proposal.action_type.replaceAll("_", " ")}</span>
            <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-zinc-400">{proposal.status}</span>
            {proposal.estimated_credits > 0 && <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-zinc-400">{proposal.estimated_credits} credits</span>}
          </div>
        </div>
      </div>
      {canDecide && (
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={busy} onClick={() => onDecide(proposal.id, "approved")} className="rounded-md bg-[#b9f42e] px-3 py-1.5 text-[11px] font-semibold text-black disabled:opacity-50">
            {busy ? "Working..." : "Approve"}
          </button>
          <button type="button" disabled={busy} onClick={() => onDecide(proposal.id, "rejected")} className="rounded-md border border-white/[0.08] px-3 py-1.5 text-[11px] font-semibold text-zinc-300 disabled:opacity-50">
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

function FrameSlot({ label, value, onAdd, onClear }: { label: string; value: string | null; onAdd: () => void; onClear: () => void }) {
  return (
    <div>
      <button type="button" onClick={onAdd} className="grid aspect-square w-full min-w-0 place-items-center overflow-hidden rounded-xl border border-dashed border-white/20 bg-white/[0.03] text-zinc-300 hover:border-[#b9f42e]">
        {value ? <AssetImage src={value} /> : <span className="text-3xl">+</span>}
      </button>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="truncate text-sm font-bold text-zinc-100">{label}</p>
        {value && <button type="button" onClick={onClear} className="rounded bg-black/50 px-2 py-0.5 text-xs text-zinc-300 hover:bg-white/10">×</button>}
      </div>
    </div>
  );
}

function ModelChip({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: string;
  choices: string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">{label}</p>
      <button type="button" onClick={() => setOpen((current) => !current)} className="mt-2 flex w-full items-center justify-between gap-2 text-sm font-bold text-white">
        <span className="truncate">{value}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-[90] w-full overflow-hidden rounded-xl border border-white/10 bg-[#18191c] p-2 shadow-2xl">
          {choices.map((choice) => (
            <button
              key={choice}
              type="button"
              onClick={() => {
                onChange(choice);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${choice === value ? "bg-[#fff878] font-bold text-black" : "text-zinc-300 hover:bg-white/5"}`}
            >
              {choice}
              {choice === value && <span>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ReferencePicker({
  entities,
  shots,
  selected,
  close,
  confirm,
}: {
  entities: Entity[];
  shots?: Shot[];
  selected: string[];
  close: () => void;
  confirm: (items: string[]) => void;
}) {
  const [choices, setChoices] = useState(selected);
  const [filter, setFilter] = useState<"all" | Entity["type"] | "storyboard">("all");

  const entityItems = entities.flatMap((entity) =>
    (entity.reference_images || []).map((img, index) => ({
      id: `entity-${entity.id}-${index}`,
      name: entity.name,
      type: entity.type,
      image: img,
    }))
  );

  const shotItems = (shots || [])
    .filter((s) => s.keyframe_image)
    .map((s) => ({
      id: `shot-${s.id}`,
      name: s.title ? `Shot: ${s.title}` : "Storyboard Shot",
      type: "storyboard" as const,
      image: s.keyframe_image!,
    }));

  const allItems = [...entityItems, ...shotItems];
  const visible = filter === "all" ? allItems : allItems.filter((item) => item.type === filter);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/75 p-6 backdrop-blur-sm">
      <section className="flex h-[min(760px,85vh)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#171918] shadow-2xl">
        <header className="flex items-center gap-4 border-b border-white/10 p-5">
          <h3 className="text-xl font-black">Select from existing assets</h3>
          <div className="flex gap-1 rounded-xl bg-white/5 p-1">
            {(["all", "character", "scene", "prop", "storyboard"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold capitalize ${
                  filter === item ? "bg-[#b9f42e] text-black" : "text-zinc-400 hover:text-white"
                }`}
              >
                {item === "all" ? "All" : item === "storyboard" ? "Storyboard" : `${item}s`}
              </button>
            ))}
          </div>
          <button type="button" onClick={close} className="ml-auto rounded-lg p-2 text-zinc-400 hover:bg-white/10">
            <X />
          </button>
        </header>
        <div className="grid flex-1 grid-cols-2 content-start gap-4 overflow-auto p-5 sm:grid-cols-4 lg:grid-cols-6">
          {visible.map((item) => {
            const image = item.image;
            const active = choices.includes(image);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setChoices((items) => (active ? items.filter((i) => i !== image) : [...items, image]))}
                className={`relative overflow-hidden rounded-xl border-2 text-left transition ${
                  active ? "border-[#b9f42e]" : "border-transparent hover:border-white/20"
                }`}
              >
                <AssetImage src={image} />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2 text-xs font-bold truncate">
                  {item.name}
                </span>
                {active && (
                  <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-[#b9f42e] text-xs font-black text-black">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
          {!visible.length && (
            <p className="col-span-full py-12 text-center text-sm text-zinc-500">
              No images found for this category. Upload an image to an asset or generate a shot keyframe first.
            </p>
          )}
        </div>
        <footer className="flex items-center justify-end gap-4 border-t border-white/10 p-5">
          <span className="text-sm text-zinc-400">{choices.length} selected</span>
          <button type="button" onClick={() => confirm(choices)} className="rounded-xl bg-[#b9f42e] px-6 py-3 font-bold text-black hover:bg-[#a5db26]">
            Confirm references
          </button>
        </footer>
      </section>
    </div>
  );
}
function ReferenceSourcePicker({ close, onChooseExisting, onUpload }: { close: () => void; onChooseExisting: () => void; onUpload: (file?: File) => Promise<void> }) {
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/65 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Add a reference image"><section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#171918] p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-bold tracking-[.18em] text-[#b9f42e]">REFERENCE IMAGE</p><h3 className="mt-2 text-2xl font-black">Add a reference</h3><p className="mt-2 text-sm leading-6 text-zinc-400">Choose a project asset or upload an image from your device.</p></div><button type="button" aria-label="Close reference picker" onClick={close} className="rounded-lg p-2 text-zinc-400 hover:bg-white/10"><X /></button></div><div className="mt-6 flex gap-3"><div className="grid h-32 w-32 shrink-0 place-items-center rounded-2xl border-2 border-dashed border-white/15 text-5xl text-zinc-300">+</div><div className="flex-1 overflow-hidden rounded-2xl border border-white/15 bg-[#101110]"><button type="button" onClick={onChooseExisting} className="flex w-full items-center gap-4 px-5 py-5 text-left text-lg font-bold hover:bg-white/5"><ImageIcon className="h-6 w-6" />Select from existing assets</button><label className="flex cursor-pointer items-center gap-4 border-t border-white/10 px-5 py-5 text-lg font-bold hover:bg-white/5"><Upload className="h-6 w-6" />Upload from local device<input type="file" accept="image/*" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (file) await onUpload(file); close(); }} /></label></div></div></section></div>
}
function ShotForm({
  entities,
  episodeId,
  save,
  close,
  reload,
}: {
  entities: Entity[];
  episodeId: string;
  save: (b: unknown) => Promise<void>;
  close: () => void;
  reload: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const mentionedIds = findMentionedEntityIds(prompt, entities);
        await save({
          action: "saveShot",
          episodeId,
          orderIndex: 9999,
          shot: { title, prompt, entityIds: Array.from(new Set([...ids, ...mentionedIds])) },
        });
        await reload();
        close();
      }}
      className="rounded-2xl border border-[#b9f42e]/30 bg-[#1b1d1c] p-5"
    >
      <input
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Shot title"
        className="w-full rounded-lg border border-white/10 bg-black/20 p-3 outline-none"
      />
      <EntityMentionInput
        value={prompt}
        onChange={setPrompt}
        entities={entities}
        placeholder="Describe the shot. Type @ to bind characters, scenes, or assets…"
        className="mt-3 h-24 w-full rounded-lg border border-white/10 bg-black/20 p-3 outline-none"
        ariaLabel="Storyboard shot prompt"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {entities.map((e) => (
          <label
            key={e.id}
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs ${ids.includes(e.id) ? "border-[#b9f42e] bg-[#b9f42e]/10" : "border-white/10"}`}
          >
            <input
              type="checkbox"
              className="hidden"
              checked={ids.includes(e.id)}
              onChange={() =>
                setIds((x) =>
                  x.includes(e.id)
                    ? x.filter((id) => id !== e.id)
                    : [...x, e.id],
                )
              }
            />
            {e.name}
          </label>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <button className="rounded-lg bg-[#b9f42e] px-4 py-2 text-sm font-bold text-black">
          Save shot
        </button>
        <button
          type="button"
          onClick={close}
          className="rounded-lg border border-white/15 px-4 py-2 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
function Timeline({
  shots,
  entities,
  save,
  reload,
}: {
  shots: Shot[];
  entities: Entity[];
  save: (b: unknown) => Promise<void>;
  reload: () => Promise<void>;
}) {
  const [selected, setSelected] = useState(0);
  const shot = shots[selected];
  const move = async (i: number, delta: number) => {
    const next = [...shots];
    const target = i + delta;
    if (target < 0 || target >= next.length) return;
    [next[i], next[target]] = [next[target], next[i]];
    await save({ action: "reorderShots", ids: next.map((s) => s.id) });
    reload();
  };
  return (
    <div className="min-h-[calc(100vh-74px)] bg-[#080908]">
      <div className="flex h-20 items-center justify-end border-b border-white/10 px-6">
        <button className="rounded-xl bg-[#b9f42e] px-6 py-3 font-bold text-black">
          ⇩ Render video
        </button>
      </div>
      {shot ? (
        <div className="grid min-h-[calc(100vh-250px)] grid-cols-[minmax(190px,28%)_1fr] border-b border-white/10">
          <aside className="border-r border-white/10 p-5">
            <div className="rounded-xl bg-[#1d1f1e] p-4 font-bold">
              Shot {selected + 1}
            </div>
            <p className="mt-6 text-xs font-bold uppercase tracking-wide text-zinc-500">
              Shot description
            </p>
            <p className="mt-3 text-sm leading-6 text-zinc-300">
              {shot.prompt ||
                "Add camera direction and visual details to this shot."}
            </p>
            <p className="mt-6 text-xs font-bold uppercase tracking-wide text-zinc-500">
              Subject reference
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {entities
                .filter((e) => shot.referenced_entities?.includes(e.id))
                .map((entity) => (
                  <div key={entity.id} className="w-14">
                    <AssetImage src={entity.reference_images?.[0]} />
                    <p className="mt-1 truncate text-[10px] text-zinc-500">
                      {entity.name}
                    </p>
                  </div>
                ))}
              {!shot.referenced_entities?.length && (
                <span className="text-xs text-zinc-600">No linked assets</span>
              )}
            </div>
          </aside>
          <section className="grid place-items-center p-6">
            <div className="relative aspect-[9/14] max-h-[520px] w-full max-w-[350px] overflow-hidden bg-[#182d3b] shadow-2xl shadow-black/50">
              {shot.video_url ? (
                <ResolvedMedia src={shot.video_url} type="video" className="h-full w-full object-cover" />
              ) : shot.keyframe_image ? (
                <ResolvedMedia src={shot.keyframe_image} type="image" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_50%_30%,#315b70,transparent_40%),linear-gradient(#0a1820,#223d46)] text-center text-sm text-zinc-400">
                  Shot preview
                  <br />
                  will appear here
                </div>
              )}
              <span className="absolute bottom-3 left-3 rounded bg-black/50 px-2 py-1 text-xs">
                {shot.duration_seconds}s
              </span>
            </div>
          </section>
        </div>
      ) : (
        <div className="grid h-[420px] place-items-center text-zinc-500">
          Add storyboard shots to build a timeline.
        </div>
      )}
      <div className="border-t border-white/10 bg-[#111211] p-4">
        <div className="mx-auto mb-3 flex max-w-3xl items-center justify-between text-sm">
          <span className="font-mono text-[#b9f42e]">00:00.00</span>
          <div className="flex items-center gap-5 text-zinc-400">
            <button>◁</button>
            <button className="grid h-10 w-10 place-items-center rounded bg-[#252725] text-white">
              ▷
            </button>
            <button>▷</button>
          </div>
          <span className="font-mono text-zinc-400">
            00:
            {String(
              Math.round(
                shots.reduce(
                  (sum, item) => sum + Number(item.duration_seconds || 0),
                  0,
                ),
              ),
            ).padStart(2, "0")}
            .00
          </span>
        </div>
        <div className="relative flex h-24 gap-1 overflow-x-auto border-t border-white/10 pt-3">
          {shots.map((item, i) => (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(i)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelected(i);
                }
              }}
              className={`relative h-16 min-w-32 flex-1 overflow-hidden rounded border p-2 text-left text-xs ${i === selected ? "border-[#b9f42e] ring-1 ring-[#b9f42e]" : "border-white/10 bg-[#1b1d1c]"}`}
            >
              <span className="absolute inset-0 bg-gradient-to-br from-[#35576a] to-[#182428] opacity-70" />
              <span className="relative block truncate font-bold">
                {item.title}
              </span>
              <span className="relative mt-1 block text-zinc-300">
                {item.duration_seconds}s
              </span>
              <span className="absolute right-1 top-1 z-10 flex gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    move(i, -1);
                  }}
                  className="rounded bg-black/40 px-1"
                >
                  ↑
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    move(i, 1);
                  }}
                  className="rounded bg-black/40 px-1"
                >
                  ↓
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function AssetImage({ src, className }: { src?: string; className?: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!src || src.startsWith("http")) return;
    createClient()
      .storage.from("creator-studio-media")
      .createSignedUrl(src, 3600)
      .then(({ data }) => setUrl(data?.signedUrl));
  }, [src]);
  const displayUrl = src?.startsWith("http") ? src : url;
  return (
    <div className={`aspect-[4/3] bg-gradient-to-br from-[#4d5044] to-[#161716] ${className || ""}`}>
      {displayUrl && <img src={displayUrl} alt="" className={`h-full w-full ${className ? className : "object-cover"}`} />}
    </div>
  );
}
function Preview({
  src,
  label,
  type = "image",
  aspectRatio = "9:16",
  fit = "contain",
}: {
  src: string | null;
  label: string;
  type?: "image" | "video";
  aspectRatio?: string;
  fit?: "cover" | "contain";
}) {
  const aspectClass =
    aspectRatio === "16:9"
      ? "aspect-[16/9]"
      : aspectRatio === "1:1"
      ? "aspect-square"
      : aspectRatio === "4:3"
      ? "aspect-[4/3]"
      : "aspect-[9/16]";

  return (
    <div className={`relative overflow-hidden rounded-lg bg-[#2a2c2b] ${aspectClass}`}>
      {src ? (
        <ResolvedMedia
          src={src}
          type={type}
          className={`h-full w-full ${fit === "contain" ? "object-contain bg-black/80" : "object-cover"}`}
        />
      ) : (
        <div className="grid h-full place-items-center p-2 text-center text-xs text-zinc-500">
          {label}
        </div>
      )}
    </div>
  );
}
function ResolvedMedia({ src, type, className }: { src: string; type: "image" | "video"; className?: string }) {
  const directUrl = src.startsWith("http") ? src : "";
  const [signedUrl, setSignedUrl] = useState("");
  useEffect(() => {
    let active = true;
    if (src.startsWith("http")) return;
    createClient()
      .storage.from("creator-studio-media")
      .createSignedUrl(src, 3600)
      .then(({ data }) => {
        if (active) setSignedUrl(data?.signedUrl || "");
      });
    return () => {
      active = false;
    };
  }, [src]);
  const url = directUrl || signedUrl;
  if (!url) {
    return <div className={`grid place-items-center text-xs text-zinc-500 ${className || ""}`}>Loading media…</div>;
  }
  if (type === "video") {
    return <video src={url} controls muted playsInline preload="metadata" className={className} />;
  }
  return <img src={url} alt="" className={className} />;
}
function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-lg bg-[#222423] px-3 py-2 text-sm text-zinc-300">
      {children}
    </span>
  );
}
function parseScript(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const script = { ...blankScript, ...(value as typeof blankScript) };
    if (!script.body && script.scenes.length) {
      script.body = script.scenes
        .map((scene) =>
          [
            scene.heading,
            scene.timing,
            scene.direction,
            scene.framing,
            scene.continuity,
          ]
            .filter(Boolean)
            .join("\n"),
        )
        .join("\n\n");
    }
    return script;
  }
  if (typeof value === "string") return { ...blankScript, body: value };
  return blankScript;
}
