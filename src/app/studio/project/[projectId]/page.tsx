"use client";

import Link from "next/link";
import { FormEvent, Fragment, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Aperture,
  Palette,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Bot,
  ChevronDown,
  Clapperboard,
  Gem,
  GripVertical,
  History,
  FileText,
  AlertTriangle,
  Film,
  ArrowUp,
  Brain,
  Monitor,
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
  Play,
  Pause,
  Scissors,
  SkipBack,
  SkipForward,
  RotateCcw,
  Volume2,
  VolumeX,
  Layers,
  Maximize2,
  Check,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { activeDirectorModels, defaultDirectorModelId, defaultDirectorModels, type DirectorModelConfig } from "@/lib/studio/ai-models";
import { getModelLabel, imageGenerationModels, supportedVideoModel, videoDurationOptions, videoGenerationModels, videoModelMaxDuration } from "@/lib/studio/generation-models";
import { defaultDirectorWorkflows, type DirectorWorkflowConfig } from "@/lib/studio/workflows";
import { abandonedRunSilentAfterMs } from "@/lib/studio/workflow-runs";
import { videoPromptFor } from "@/lib/studio/shot-video-prompt";
import { buildInsertShotDraft } from "@/lib/studio/shot-intent";
import { isVideoReferencePath } from "@/lib/studio/media-reference";
import { calculateCreditCost, getUserCredits } from "@/lib/studio/credits";
import { useAuth } from "@/components/auth/auth-provider";
import { fbTrack } from "@/lib/fbpixel";
import { claimOnce } from "@/lib/track-once";
import { creditsToUsd, estimateProjectCost, projectCostSettings, summarizeSpendByEpisode, type SpendBreakdown } from "@/lib/studio/cost-estimate";
import { VERIFIED_ASSET } from "@/lib/studio/asset-verification";
import {
  BLOCK_CAMERA_DEFAULTS,
  DEFAULT_PROJECT_CAMERA_SETTINGS,
  cameraBlockForEntityType,
  describeCameraSettings,
  isCameraSettings,
  normalizeCameraSettings,
  projectCameraDefaults,
  resolveCameraSettings,
  type CameraSettings,
} from "@/lib/studio/camera-settings";
import { CameraSettingsControl, CameraSettingsPicker } from "@/components/studio/CameraSettingsPicker";
import { StyleDnaPanel } from "@/components/studio/StyleDnaPanel";
import { RevisionNotes } from "@/components/studio/RevisionNotes";
import { describeStyleDna, normalizeStyleDna, projectStyleDna, styleReferenceImagesOf, type StyleDna } from "@/lib/studio/style-dna";
import { notifyCreditBalanceChanged } from "@/lib/credit-balance-events";
import { parseVoiceToolCall, type VoiceToolCall } from "@/lib/studio/voice";
import { createClient } from "@/lib/supabase/client";
import { downloadSignedMedia, getSignedMediaUrl } from "@/lib/studio/signed-media";
import { parseDirectorTimeline, type DirectorTimelineBlock } from "@/lib/studio/timeline";
import { EntityMentionInput } from "@/components/studio/EntityMentionInput";
import ShareProjectDialog from "@/components/studio/ShareProjectDialog";
import ConvertToEnterpriseDialog from "@/components/enterprise/ConvertToEnterpriseDialog";
import ProjectActivityDialog from "@/components/studio/ProjectActivityDialog";
import DrawToEditModal from "@/components/studio/DrawToEditModal";
import { entityPrimaryReference, findMentionedEntityIds, findShotCastEntityIds } from "@/lib/studio/entity-mentions";
import { parseSeedanceRejectedReference } from "@/lib/studio/seedance-reference-error";

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
  primary_reference_image?: string | null;
  metadata: Record<string, unknown>;
  voice_id: string | null;
  status: string;
};

function entityImageGenerationStatus(entity: Entity): "generating" | "completed" | "failed" | null {
  const generation = entity.metadata?.image_generation
  if (!generation || typeof generation !== "object") return null
  const record = generation as Record<string, unknown>
  const status = record.status
  // A synchronous image request can be interrupted by a deployment, browser
  // disconnect, or server timeout before its catch block persists "failed".
  // Never leave the entity card polling and spinning forever in that case.
  if (status === "generating") {
    const requestedAt = typeof record.requested_at === "string" ? Date.parse(record.requested_at) : Number.NaN
    if (!Number.isFinite(requestedAt) || Date.now() - requestedAt > 15 * 60 * 1_000) return "failed"
  }
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
  chatMessages: { id: string; workflow_run_id?: string | null; role: string; content: string | null; created_at?: string | null; media?: Array<Record<string, unknown>> | null; suggested_actions?: Array<Record<string, unknown>> | null; timeline_blocks?: unknown; referenced_entity_ids?: string[] | null }[];
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
    workflow_run_id?: string | null;
    tool_execution_id?: string | null;
  }[];
  directorWorkflows?: DirectorWorkflowConfig[];
  features?: Record<string, boolean>;
  production?: {
    series: Array<Record<string, unknown>>;
    scenes: Array<Record<string, unknown>>;
    referenceAssets: Array<Record<string, unknown>>;
    continuityIssues: Array<Record<string, unknown>>;
    revisions: Array<Record<string, unknown>>;
    generationJobs: Array<{ id: string; workflow_run_id?: string | null; shot_id?: string | null; type?: string; status: string; model?: string | null; prompt?: string | null; input_images?: string[] | null; result_url?: string | null; error?: string | null; settings?: Record<string, unknown> | null; target_snapshot?: Record<string, unknown>; verification?: Record<string, unknown>; estimated_credits?: number | null; credits_used?: number | null; credits_refunded?: number | null; created_at?: string; completed_at?: string | null }>;
    creditAccount: { balance: number; reserved: number } | null;
    /** Every job this project ever ran, netted of refunds and split by episode. */
    spend?: SpendBreakdown;
    workflowRuns?: Array<{ id: string; session_id?: string | null; status: string; completed_at?: string | null; started_at?: string | null; updated_at?: string | null; objective?: string | null; summary?: Record<string, unknown>; error?: Record<string, unknown> | null }>;
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

// The Director model is a per-user preference rather than project data, so it
// is stored once instead of per project.
const directorModelStorageKey = "studio_director_model";

const DIRECTOR_OPENED_KEY = "adh:director-opened-tracked";

export default function WorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const { user } = useAuth();
  const [data, setData] = useState<Workspace | null>(null);
  const [tab, setTabState] = useState<string>("canvas");
  // Below xl the chat cannot sit beside the canvas, so it becomes a sheet the
  // user raises over it. Hiding it outright — which is what this layout used to
  // do — removes the Director from the product on every phone.
  const [chatSheetOpen, setChatSheetOpen] = useState(false);

  // DirectorOpened: this person has a project open in the studio. The workspace
  // re-renders constantly and this effect re-runs whenever auth resolves, so the
  // ledger is what holds the event to once per person per project.
  useEffect(() => {
    if (!claimOnce(DIRECTOR_OPENED_KEY, `${user?.id || "anon"}:${projectId}`)) return;
    fbTrack("DirectorOpened", { content_type: "project", content_ids: [projectId] });
  }, [projectId, user?.id]);

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

  // Restored before the first fetch, so the workspace loads the episode the user
  // left open rather than loading the first one and swapping it out underneath
  // them. The URL wins over the stored value: a shared link names its episode.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("episode");
    const saved = fromUrl || localStorage.getItem(`studio_episode_${projectId}`);
    if (saved) {
      setEpisodeId(saved);
      if (!fromUrl) {
        url.searchParams.set("episode", saved);
        window.history.replaceState(null, "", url.toString());
      }
    }
    setEpisodeRestored(true);
  }, [projectId]);

  const selectEpisode = (nextEpisodeId: string) => {
    setEpisodeId(nextEpisodeId);
    if (typeof window !== "undefined") {
      localStorage.setItem(`studio_episode_${projectId}`, nextEpisodeId);
      const url = new URL(window.location.href);
      url.searchParams.set("episode", nextEpisodeId);
      window.history.replaceState(null, "", url.toString());
    }
  };

  // Where the back arrow goes. Tab changes rewrite the URL in place rather than
  // pushing history, so "back" from the Timeline had nothing to step back to
  // and threw the user out to the project list mid-edit. The arrow returns to
  // the tab they came from, and only leaves the project once it is out of tabs.
  const [previousTab, setPreviousTab] = useState<string | null>(null);

  const setTab = (nextTab: string) => {
    setPreviousTab((current) => (nextTab === tab ? current : tab));
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
  // A storyboard action can hand the composer a half-written instruction — the
  // "+" between two rows knows exactly which shots it sits between, and typing
  // that out by hand is the part the user should not have to do. The chip names
  // what the draft is about so the message cannot be sent at the wrong shot by
  // accident, and clearing it clears the draft with it.
  const [composerChip, setComposerChip] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const composeDirectorMessage = useCallback((draft: string, chip: string) => {
    setMessage(draft);
    setComposerChip(chip);
    // The draft is a prompt to keep typing, so the caret goes where the user
    // will continue rather than at the start of what was written for them.
    window.requestAnimationFrame(() => {
      const field = composerRef.current;
      if (!field) return;
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
    });
  }, []);
  const [chatSending, setChatSending] = useState(false);
  const [streamingReply, setStreamingReply] = useState<{
    content: string;
    status: string | null;
    steps: Array<{ label: string; state: "running" | "done" | "failed" }>;
    startedAt: number;
  } | null>(null);
  const [resumedRun, setResumedRun] = useState(false);
  // Shots whose generation was just approved. The jobs exist server-side before
  // the next workspace load returns them, and the storyboard should say so the
  // moment the button is pressed rather than after a round trip.
  const [justSubmitted, setJustSubmitted] = useState<{ image: string[]; video: string[] }>({ image: [], video: [] });
  const [chatError, setChatError] = useState<string | null>(null);
  const [proposalBusy, setProposalBusy] = useState<string | null>(null);
  const [chatUploading, setChatUploading] = useState(false);
  const [directorModel, setDirectorModel] = useState<string>(defaultDirectorModelId);
  const [directorModels, setDirectorModels] = useState<DirectorModelConfig[]>(defaultDirectorModels.map((model) => ({ ...model })).filter((model) => model.status === "active"));
  const [voiceState, setVoiceState] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const isUserScrolledUpRef = useRef(false);
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);
  const voiceConnectionRef = useRef<RTCPeerConnection | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const hasLoadedRef = useRef(false);
  const loadRef = useRef<(silent?: boolean) => Promise<void>>(async () => {});

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior,
      });
    } else {
      chatEndRef.current?.scrollIntoView({ behavior, block: "end" });
    }
    isUserScrolledUpRef.current = false;
    setShowScrollToBottom(false);
  }, []);

  const handleChatScroll = useCallback(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const scrolledUp = distanceToBottom > 80;
    isUserScrolledUpRef.current = scrolledUp;
    setShowScrollToBottom(scrolledUp);
  }, []);

  useEffect(() => {
    if (isUserScrolledUpRef.current) return;
    scrollToBottom("auto");
    const t1 = setTimeout(() => scrollToBottom("auto"), 50);
    const t2 = setTimeout(() => scrollToBottom("smooth"), 250);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [
    data?.chatMessages.length,
    data?.activeSessionId,
    chatSending,
    chatError,
    voiceState,
    streamingReply?.status,
    streamingReply?.content.length,
    streamingReply?.steps.length,
    scrollToBottom,
  ]);
  useEffect(() => () => {
    voiceConnectionRef.current?.close();
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);
  useEffect(() => {
    // The chat model is a user preference, so a reload keeps the last choice
    // instead of snapping back to the catalog default.
    const stored = localStorage.getItem(directorModelStorageKey);
    const applyPreference = (models: DirectorModelConfig[]) => {
      if (!models.length) return;
      setDirectorModel((current) => {
        if (stored && models.some((model) => model.id === stored)) return stored;
        if (models.some((model) => model.id === current)) return current;
        return models[0].id;
      });
    };
    applyPreference(defaultDirectorModels.filter((model) => model.status === "active"));
    createClient()
      .from("site_settings")
      .select("value")
      .eq("key", "ai_director_models")
      .maybeSingle()
      .then(({ data: settings }) => {
        const nextModels = activeDirectorModels(settings?.value);
        if (!nextModels.length) return;
        setDirectorModels(nextModels);
        applyPreference(nextModels);
      }, () => { /* the default catalog already applied above */ });
  }, []);
  const [assetType, setAssetType] = useState<Entity["type"] | null>(null);
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  // The open episode outlives a reload, the same way the open tab does. Without
  // this the workspace came back on whichever episode the server lists first,
  // which is never the one the user was working in.
  const [episodeRestored, setEpisodeRestored] = useState(false);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [episodeMenu, setEpisodeMenu] = useState(false);
  const [chatSessionMenu, setChatSessionMenu] = useState(false);
  const [showBasicSettings, setShowBasicSettings] = useState(false);
  const openedInitialSettingsRef = useRef(false);
  const [projectMenu, setProjectMenu] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [enterpriseOpen, setEnterpriseOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  // Generation runs on the server after approval and writes its result onto the
  // shot, so the storyboard only looks empty because nothing refetched. Poll
  // while any job is still in flight, and nudge video jobs through their
  // provider status check, which is what actually completes them.
  const jobsInFlight = useMemo(
    () => (data?.production?.generationJobs || []).filter((job) => !["completed", "failed", "cancelled"].includes(job.status)),
    [data?.production?.generationJobs],
  );

  const pendingShotJobs = useMemo(() => {
    const image = new Set<string>(justSubmitted.image);
    const video = new Set<string>(justSubmitted.video);
    for (const job of jobsInFlight) {
      if (!job.shot_id) continue;
      (job.type === "video" ? video : image).add(job.shot_id);
    }
    return { image, video };
  }, [jobsInFlight, justSubmitted]);

  // Once a shot's job reaches a terminal state, the optimistic mark has done its
  // job and must not outlive it.
  useEffect(() => {
    const settled = new Set((data?.production?.generationJobs || [])
      .filter((job) => ["completed", "failed", "cancelled"].includes(job.status) && job.shot_id)
      .map((job) => job.shot_id as string));
    if (!settled.size) return;
    setJustSubmitted((current) => {
      const image = current.image.filter((id) => !settled.has(id));
      const video = current.video.filter((id) => !settled.has(id));
      return image.length === current.image.length && video.length === current.video.length ? current : { image, video };
    });
  }, [data?.production?.generationJobs]);

  useEffect(() => {
    if (!jobsInFlight.length) return;
    let cancelled = false;
    const tick = async () => {
      await Promise.all(jobsInFlight
        .filter((job) => job.type === "video")
        .map((job) => fetch(`/api/studio/projects/${projectId}/videos?jobId=${encodeURIComponent(job.id)}`, { cache: "no-store" }).catch(() => null)));
      if (!cancelled) await loadRef.current(true);
    };
    const timer = setInterval(() => { void tick(); }, 5000);
    return () => { cancelled = true; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobsInFlight.map((job) => job.id).join(","), projectId]);

  // A Director run is server-side work tracked in creator_workflow_runs, so it
  // outlives the page that started it. After a reload the browser has no
  // stream to read, but the run is still going and will persist its reply — so
  // rejoin it by polling until it finishes instead of pretending it stopped.
  const latestSessionRun = useMemo(
    () => (data?.production?.workflowRuns || []).find((run) => run.session_id === data?.activeSessionId) || null,
    [data?.production?.workflowRuns, data?.activeSessionId],
  );
  const repliedRunIds = useMemo(
    () => new Set((data?.chatMessages || []).filter((message) => message.role === "assistant" && message.workflow_run_id).map((message) => message.workflow_run_id as string)),
    [data?.chatMessages],
  );

  const activeRun = useMemo(() => {
    const latest = latestSessionRun;
    if (!latest || repliedRunIds.has(latest.id)) return null;
    if (latest.completed_at || !latest.started_at) return null;
    if (latest.status !== "planning" && latest.status !== "running") return null;
    // A run whose server died never gets completed_at. The workspace read closes
    // those out, and the same rule is applied here so the chat stops waiting at
    // the moment the run stops writing rather than on a guess about how long a
    // run ought to take.
    const lastWrite = new Date(latest.updated_at || latest.started_at).getTime();
    return lastWrite > Date.now() - abandonedRunSilentAfterMs ? latest : null;
  }, [latestSessionRun, repliedRunIds]);

  // A rejoined run has no stream to show progress from, and these runs can
  // legitimately take several minutes. Saying how long it has been going is the
  // difference between a wait and an apparent hang.
  const rejoinedRunMinutes = useMemo(() => {
    if (!activeRun?.started_at) return 0;
    return Math.floor((Date.now() - new Date(activeRun.started_at).getTime()) / 60_000);
    // Recomputed as the rejoin poll refreshes the workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRun?.started_at, data]);

  // A run that stopped without replying. Nothing else in the chat records the
  // turn, so without this the message the user sent sits there answered by
  // silence — which is what the thinking bubble ends up hiding.
  const unansweredRun = useMemo(() => {
    if (chatSending) return null;
    const latest = latestSessionRun;
    if (!latest || repliedRunIds.has(latest.id)) return null;
    if (!latest.completed_at || !["failed", "cancelled", "partially_completed"].includes(latest.status)) return null;
    const reason = typeof latest.error?.message === "string" ? latest.error.message : null;
    return { id: latest.id, objective: latest.objective || "", reason };
  }, [chatSending, latestSessionRun, repliedRunIds]);

  useEffect(() => {
    if (!activeRun || chatSending) {
      setResumedRun(false);
      return;
    }
    setResumedRun(true);
    const timer = setInterval(() => { void loadRef.current(true); }, 3000);
    return () => clearInterval(timer);
    // the run id is what should restart this poll; loadRef keeps it current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRun?.id, chatSending]);

  // The run persists its reply before it is marked complete, so a poll shows
  // the Director's answer while the run still reads as in flight. Past that
  // point the placeholder is stale: it sat under the finished text still
  // bouncing, as though nothing had arrived.
  const resumedRunAwaitingReply = useMemo(() => {
    if (!resumedRun || !activeRun) return false;
    if (!activeRun.started_at) return true;
    const startedAt = new Date(activeRun.started_at).getTime();
    return !(data?.chatMessages || []).some((item) => item.role === "assistant"
      && item.created_at
      && new Date(item.created_at).getTime() >= startedAt);
  }, [resumedRun, activeRun, data?.chatMessages]);

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
  // The background polls below outlive the render that started them, and their
  // effects deliberately do not restart when the episode changes. Calling the
  // captured `load` meant a poll kept fetching the episode that was open when
  // the interval was created — creating an episode switched to it, then the
  // next tick pulled the previous one back over the top of it.
  loadRef.current = load;
  useEffect(() => {
    // Waiting on the restore keeps the first fetch from asking for the wrong
    // episode and then immediately asking again for the right one.
    if (!episodeRestored) return;
    // Only the first load may blank the workspace. Switching chat session or
    // episode swaps data in place, so the full-screen loader would read as an
    // unexpected page reload.
    load(hasLoadedRef.current);
    hasLoadedRef.current = true;
  }, [projectId, episodeId, chatSessionId, episodeRestored]);
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
          <p className="mt-1 text-sm text-zinc-500">The workspace could not be loaded. Nothing has been lost.</p>
          {/* One dropped request used to end the session here, with a link away
              from the project as the only way out. */}
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => void load()}
              className="shrink-0 whitespace-nowrap rounded-lg bg-[#b9f42e] px-3.5 py-2 text-[12px] font-bold text-black transition duration-press ease-out active:scale-[0.97] lg:px-4 lg:text-sm"
            >
              Try again
            </button>
            <Link href="/studio" className="text-sm text-[#b9f42e]">
              Back to Studio
            </Link>
          </div>
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
    selectEpisode(created.id);
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
    setComposerChip(null);
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
        body: JSON.stringify({ episodeId: episode.id, sessionId: data.activeSessionId || chatSessionId || undefined, message: outgoing, mentionedEntityIds, model: directorModel, idempotencyKey: crypto.randomUUID(), stream: true }),
      });
      if (!response.ok || !response.body) {
        const failed = await response.json().catch(() => ({}));
        throw new Error(failed.error || "AI Director could not respond");
      }

      // The run answers as it goes: assistant text arrives as deltas and each
      // tool reports when it starts and finishes, so the chat shows progress
      // instead of sitting silent until the whole loop is done.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let json: Record<string, unknown> = {};
      let streamError = "";
      setStreamingReply({ content: "", status: null, steps: [], startedAt: Date.now() });

      const handleEvent = (event: Record<string, unknown>) => {
        if (event.type === "text" && typeof event.delta === "string") {
          setStreamingReply((current) => ({
            steps: current?.steps || [],
            startedAt: current?.startedAt || Date.now(),
            status: null,
            content: (current?.content || "") + (event.delta as string),
          }));
        } else if (event.type === "tool") {
          const label = String(event.label || "Working");
          const state: "running" | "done" | "failed" =
            event.status === "running" ? "running" : event.status === "failed" ? "failed" : "done";
          setStreamingReply((current) => {
            const steps = [...(current?.steps || [])];
            // A tool reports twice, once starting and once finishing. The second
            // report settles the line the first one added rather than adding a
            // duplicate beneath it.
            const open = steps.findIndex((step) => step.label === label && step.state === "running");
            if (state === "running") {
              if (open === -1) steps.push({ label, state });
            } else if (open !== -1) {
              steps[open] = { label, state };
            } else {
              steps.push({ label, state });
            }
            return {
              content: current?.content || "",
              startedAt: current?.startedAt || Date.now(),
              status: state === "running" ? `${label}…` : current?.status || null,
              steps,
            };
          });
        } else if (event.type === "proposal") {
          // Pull the card into view immediately rather than at the end of the run.
          void load(true);
        } else if (event.type === "error") {
          streamError = String(event.error || "AI Director could not respond");
        } else if (event.type === "done") {
          json = event;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";
        for (const frame of frames) {
          const line = frame.split("\n").find((entry) => entry.startsWith("data:"));
          if (!line) continue;
          try { handleEvent(JSON.parse(line.slice(5).trim())); } catch { /* ignore a partial frame */ }
        }
      }
      setStreamingReply(null);
      if (streamError) throw new Error(streamError);
      notifyCreditBalanceChanged(typeof json.creditBalance === "number" ? json.creditBalance : undefined);
      if (json.sessionId) setChatSessionId(json.sessionId as string);
      setData((current) => current && json.assistantMessage ? {
        ...current,
        activeSessionId: (json.sessionId as string) || current.activeSessionId,
        chatMessages: [
          ...current.chatMessages,
          json.assistantMessage as Workspace["chatMessages"][number],
        ],
      } : current);
      await load(true);
    } catch (error) {
      setStreamingReply(null);
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
  const decideProposal = async (proposalId: string, decision: "approved" | "rejected", overrides?: Record<string, unknown>) => {
    setProposalBusy(proposalId);
    setChatError(null);
    if (decision === "approved") {
      const proposal = data?.actionProposals.find((item) => item.id === proposalId);
      const request = (overrides?.request || (proposal?.payload as { request?: GenerationProposalRequest } | undefined)?.request) as GenerationProposalRequest | undefined;
      // A proposal built from shot numbers carries no ids, which is the usual
      // shape for "generate shot 8, 9, 10". Without resolving them, none of the
      // batch showed as generating until a poll caught up with the real jobs.
      const shotIds = request?.shotIds?.length
        ? request.shotIds
        : (request?.shotNumbers || [])
          .map((number) => (data?.shots || []).find((shot) => shot.order_index + 1 === number)?.id)
          .filter((id): id is string => Boolean(id));
      if (shotIds.length) {
        setJustSubmitted((current) => request?.type === "video"
          ? { ...current, video: Array.from(new Set([...current.video, ...shotIds])) }
          : { ...current, image: Array.from(new Set([...current.image, ...shotIds])) });
      }
    }
    try {
      const response = await fetch(`/api/studio/projects/${projectId}/director/proposals/${proposalId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overrides ? { decision, overrides } : { decision }),
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
        // Only mirror voice activity into the chat timeline if an action proposal was created or failed,
        // preventing read-only background queries from polluting the chat thread.
        if (chatSession && (proposalId || status === "failed" || status === "awaiting_approval")) {
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
    <main className="studio-dense flex h-[100dvh] flex-col overflow-hidden bg-black text-[#e8e6df]">
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
      <header className="relative z-50 flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-white/[0.06] bg-[#0a0a0a] px-3 sm:h-12 sm:flex-nowrap">
        {(projectMenu || episodeMenu) && (
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => {
              setProjectMenu(false);
              setEpisodeMenu(false);
            }}
          />
        )}
        {previousTab ? (
          <button
            type="button"
            onClick={() => { setTab(previousTab); setPreviousTab(null); }}
            title={`Back to ${visibleTabs.find(([id]) => id === previousTab)?.[1] || "the previous tab"}`}
            aria-label={`Back to ${visibleTabs.find(([id]) => id === previousTab)?.[1] || "the previous tab"}`}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : (
          <Link
            href="/studio"
            title="Back to all projects"
            aria-label="Back to all projects"
            className="rounded-md p-1.5 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        )}
        <Clapperboard className="hidden h-4 w-4 text-[#b9f42e] sm:block" />
        <p className="max-w-[34vw] truncate text-[13px] font-semibold text-zinc-100 sm:max-w-none">{data.project.name}</p>
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
                      selectEpisode(item.id);
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
        <div className="order-last flex w-full min-w-0 shrink flex-wrap items-center gap-1.5 border-t border-white/[0.06] px-1 pb-2 pt-2 sm:order-none sm:ml-auto sm:w-auto sm:flex-nowrap sm:overflow-x-auto sm:border-t-0 sm:p-0">
          {visibleTabs.map(([id, label, Icon], index) => (
            <div key={id} className="flex items-center gap-1.5">
              <button
                onClick={() => setTab(id)}
                className={`flex min-h-[38px] items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-bold transition duration-press ease-out active:scale-[0.97] sm:min-h-0 sm:px-2.5 sm:py-1.5 ${tab === id ? "bg-[#b9f42e] text-black" : "bg-[#141414] text-zinc-300 hover:bg-[#1e1e1e]"}`}
              >
                <Icon className="h-3 w-3" />
                <span>{label}</span>
              </button>
              {index < visibleTabs.length - 1 && (
                <span className="hidden text-[10px] text-zinc-700 sm:inline">·</span>
              )}
            </div>
          ))}

          <span className="mx-0.5 hidden h-4 border-l border-white/[0.06] sm:block" />

          {/* Hand the project to the AI Director Hub production team */}
          {data.project.enterprise_status ? (
            <span className="hidden items-center gap-1 rounded-full border border-[#b9f42e]/30 bg-[#b9f42e]/10 px-2.5 py-1.5 text-[11px] font-bold text-[#b9f42e] sm:flex" title="This project is with the AI Director Hub production team">
              <BadgeCheck className="h-3 w-3" />
              <span>{data.project.enterprise_status === "delivered" ? "Delivered" : data.project.enterprise_status === "active" ? "Enterprise" : "Enterprise requested"}</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setEnterpriseOpen(true)}
              className="hidden items-center gap-1 rounded-full border border-[#b9f42e]/25 bg-[#b9f42e]/[0.07] px-2.5 py-1.5 text-[11px] font-bold text-[#b9f42e] transition hover:bg-[#b9f42e]/15 sm:flex"
              title="Hire the AI Director Hub team to finish this project"
            >
              <BadgeCheck className="h-3 w-3" />
              <span>Hire our team</span>
            </button>
          )}

          {/* Team */}
          <Link href="/studio/team" className="hidden items-center gap-1 rounded-full bg-[#141414] px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 hover:bg-[#1e1e1e] hover:text-white transition sm:flex" title="Add and manage team members">
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
      {!chatSheetOpen && (
        <button
          type="button"
          onClick={() => setChatSheetOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex h-14 min-h-[44px] items-center gap-2 rounded-full bg-[#b9f42e] px-5 text-[13px] font-semibold text-black shadow-[0_10px_30px_-6px_rgba(185,244,46,0.5)] transition-transform duration-press ease-out active:scale-95 xl:hidden"
        >
          <Sparkles className="h-4 w-4" />
          Director
        </button>
      )}
      <div className="flex min-h-0 flex-1">
        <section className="min-w-0 flex-1 overflow-auto border-r border-white/[0.06]">
          <div
            className={`${tab === "timeline" ? "max-w-none p-0" : "mx-auto max-w-6xl p-4 lg:p-6"}`}
          >
            {/* Compact settings bar — visible on storyboard */}
            {tab === "storyboard" && (
              <div className="no-scrollbar mb-3 flex items-center gap-1.5 overflow-x-auto pb-1 [&>*]:shrink-0 [&>*]:whitespace-nowrap lg:mb-4 lg:flex-wrap lg:overflow-x-visible lg:pb-0 lg:[&>*]:whitespace-normal">
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
                  {/* The same resolved setting the cost bar prices, so the chip
                      can never name a model the estimate is not quoting. */}
                  {getModelLabel(projectCostSettings(data.project).videoModel)}
                </span>
                <span className="text-[10px] text-zinc-700">•</span>
                <span className="rounded-full border border-white/[0.06] bg-[#141414] px-2.5 py-1 text-[11px] font-medium text-zinc-300">
                  {projectCostSettings(data.project).resolution}
                </span>
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
                <CostBar data={data} />
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
                cameraDefaults={projectCameraDefaults(data.project)}
                projectStyleDnaValue={projectStyleDna(data.project)}
                episodeId={episode.id}
                generationJobs={data.production?.generationJobs || []}
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
                cameraDefaults={projectCameraDefaults(data.project)}
                projectStyleDnaValue={projectStyleDna(data.project)}
                save={save}
                reload={load}
                pendingJobs={pendingShotJobs}
                generationJobs={data.production?.generationJobs || []}
                onGenerationStarted={(shotId, type) => setJustSubmitted((current) => ({ ...current, [type]: Array.from(new Set([...current[type], shotId])) }))}
                onCompose={composeDirectorMessage}
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
        {chatSheetOpen && (
          <div
            className="fixed inset-0 z-[55] bg-black/60 backdrop-blur-[2px] xl:hidden"
            onClick={() => setChatSheetOpen(false)}
            aria-hidden="true"
          />
        )}
        <aside
          className={`${chatSheetOpen
            ? "fixed inset-x-0 bottom-0 z-[60] flex h-[85dvh] rounded-t-xl border-t border-white/10 shadow-[0_-24px_60px_-12px_rgba(0,0,0,0.8)]"
            : "hidden"} w-full min-w-0 flex-col bg-[#0d0d0d] xl:static xl:z-auto xl:flex xl:h-auto xl:w-[40%] xl:min-w-[360px] xl:max-w-[520px] xl:rounded-none xl:border-t-0 xl:shadow-none`}
        >
          {/* The grab handle only means anything while this is a sheet. The
              row is tall enough to hold the 44px close button: when it was not,
              the button hung past the bottom edge and the chat header — which
              comes later in the DOM — painted straight over it. */}
          <div className="relative flex h-12 shrink-0 items-center justify-center border-b border-white/[0.06] xl:hidden">
            <span className="h-1 w-10 rounded-full bg-white/25" aria-hidden="true" />
            <button
              type="button"
              onClick={() => setChatSheetOpen(false)}
              aria-label="Close the Director"
              className="absolute right-2 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-zinc-300 transition-transform duration-press ease-out active:scale-90"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
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
          <div className="relative flex-1 overflow-auto p-4" ref={chatContainerRef} onScroll={handleChatScroll}>
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
                {item.role === "assistant" && item.workflow_run_id && <ChatRunStatus run={(data.production?.workflowRuns || []).find((run) => run.id === item.workflow_run_id)} />}
                <ChatTimeline blocks={item.timeline_blocks} proposals={data.actionProposals} messageProposalIds={proposalIdsFromActions(item.suggested_actions)} onAction={sendDirectorMessage} disabled={chatSending} />
                <ChatMedia media={item.media} />
                <ChatSuggestedActions actions={item.suggested_actions} proposals={data.actionProposals} entities={data.entities} shots={data.shots} projectId={projectId} busyId={proposalBusy} onDecide={decideProposal} onAction={sendDirectorMessage} onOpenTab={setTab} />
              </div>
            ))}
            {(chatSending || resumedRunAwaitingReply) && <ThinkingBubble reply={chatSending ? streamingReply : { content: "", status: `Picking up where the Director left off${rejoinedRunMinutes ? ` · ${rejoinedRunMinutes}m` : ""}` }} />}
            {!resumedRunAwaitingReply && unansweredRun && (
              <div className="mt-3 max-w-[90%] rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-[13px] text-amber-100">
                <p>{unansweredRun.reason || "That run stopped before the Director could reply."}</p>
                {unansweredRun.objective && (
                  <button
                    type="button"
                    onClick={() => sendDirectorMessage(unansweredRun.objective)}
                    className="mt-2 rounded-full border border-amber-300/40 px-3 py-1 text-[12px] font-semibold text-amber-100 hover:bg-amber-400/20"
                  >
                    Send it again
                  </button>
                )}
              </div>
            )}
            <PendingProposalCards
              proposals={data.actionProposals}
              excludeIds={data.chatMessages.flatMap((item) => proposalIdsFromActions(item.suggested_actions))}
              sessionId={data.activeSessionId}
              latestRunId={(data.production?.workflowRuns || []).find((run) => run.session_id === data.activeSessionId)?.id || null}
              entities={data.entities}
              shots={data.shots}
              projectId={projectId}
              busyId={proposalBusy}
              onDecide={decideProposal}
              onAction={sendDirectorMessage}
              onOpenTab={setTab}
            />
            {/* Last thing in the stream, under the media and the approval cards
                the run produced: a step only reads as the next step once the
                user can see everything it follows. */}
            <ChatNextStep
              messages={data.chatMessages}
              proposals={data.actionProposals}
              shots={data.shots}
              sessionId={data.activeSessionId}
              busy={chatSending || resumedRunAwaitingReply}
              onAction={sendDirectorMessage}
            />
            {chatError && <p role="alert" className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-[12px] text-red-200">{chatError}</p>}
            {voiceState !== "idle" && <p className={`mt-3 rounded-lg border p-2.5 text-[12px] ${voiceState === "connected" ? "border-[#b9f42e]/30 bg-[#b9f42e]/10 text-[#d9ff84]" : "border-white/[0.06] bg-white/[0.03] text-zinc-300"}`}>{voiceState === "connecting" ? "Connecting your AI Voice Director…" : voiceState === "connected" ? "AI Voice Director is listening. You can speak naturally." : voiceError}</p>}
            <div ref={chatEndRef} />

            {/* Floating button with down arrow when user is scrolled up */}
            {showScrollToBottom && (
              <button
                type="button"
                onClick={() => scrollToBottom("smooth")}
                className="sticky bottom-3 float-right z-30 flex items-center gap-1.5 rounded-full border border-[#b9f42e]/50 bg-[#141514]/95 px-3 py-1.5 text-xs font-extrabold text-[#b9f42e] shadow-2xl backdrop-blur-md transition hover:bg-[#b9f42e] hover:text-black active:scale-[0.98]"
                aria-label="Scroll to bottom of chat"
              >
                <ArrowDown className="h-3.5 w-3.5" />
                <span>Scroll to bottom</span>
              </button>
            )}
          </div>
          <form
            onSubmit={sendChat}
            className="border-t border-white/[0.06] bg-[#111111] p-3"
          >
            {composerChip && (
              <div className="mb-2 flex">
                <span className="relative flex items-center gap-1.5 rounded-lg bg-[#1e1f1e] py-1.5 pl-2.5 pr-7 text-[11px] font-bold text-zinc-200">
                  <Clapperboard className="h-3 w-3 text-zinc-400" />
                  <span>{composerChip}</span>
                  <button
                    type="button"
                    onClick={() => { setComposerChip(null); setMessage(""); }}
                    aria-label={`Discard the draft for ${composerChip}`}
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-zinc-500 hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              </div>
            )}
            <EntityMentionInput
              value={message}
              onChange={(value) => {
                setMessage(value);
                // The chip describes a draft. Empty the field and it describes
                // nothing, so it goes rather than mislabelling the next message.
                if (!value.trim()) setComposerChip(null);
              }}
              textareaRef={composerRef}
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
                  onChange={(event) => {
                    setDirectorModel(event.target.value);
                    localStorage.setItem(directorModelStorageKey, event.target.value);
                  }}
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
          {cards.map(([label, value]) => <div key={label} className="rounded-xl bg-white/[.04] p-4"><p className="text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-zinc-500">{label}</p></div>)}
        </div>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardPanel title="Creative brief">
          {Object.keys(data.project.creative_brief || {}).length ? <dl className="space-y-3">{Object.entries(data.project.creative_brief || {}).filter(([key]) => key !== "confirmedFields").map(([key, value]) => <div key={key}><dt className="text-xs text-zinc-500">{key.replace(/([A-Z])/g, " $1")}</dt><dd className="mt-1 text-sm text-zinc-200">{value === null || value === "" ? "Not confirmed" : String(value)}</dd></div>)}</dl> : <EmptyState>Start a conversation with the AI Director to build an editable brief.</EmptyState>}
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
          {production.revisions.length ? <div className="space-y-2">{production.revisions.slice(0, 6).map((revision) => <div key={String(revision.id)} className="rounded-lg bg-white/[.04] p-3"><p className="text-sm text-zinc-200">{String(revision.instruction)}</p><p className="mt-1 text-xs text-zinc-500">{String(revision.status)}</p></div>)}</div> : <EmptyState>No project revisions have been proposed.</EmptyState>}
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
                  <p className="text-[10px] text-zinc-500">
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
    <div className="space-y-4 lg:space-y-5">
      <section className="border border-white/10 bg-[#0b0c0b] p-6 sm:p-9">
        <div className="mb-7 flex items-start justify-between gap-4">
          <p className="text-xs font-bold tracking-[.2em] text-[#b9f42e]">
            PRODUCTION SCRIPT
          </p>
          <button
            onClick={submit}
            disabled={saving}
            className="shrink-0 whitespace-nowrap rounded-lg bg-[#b9f42e] px-3.5 py-2 text-[12px] font-bold text-black transition duration-press ease-out active:scale-[0.97] lg:px-4 lg:text-sm"
          >
            {saving ? "Saving…" : "Save script"}
          </button>
        </div>
        <input
          value={content.title}
          onChange={(e) => setContent((c) => ({ ...c, title: e.target.value }))}
          placeholder="Project title"
          className="w-full bg-transparent text-3xl font-semibold tracking-tight text-white outline-none placeholder:text-zinc-600 sm:text-5xl"
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
          <label className="t-caption text-[#b9f42e]">
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
  cameraDefaults,
  projectStyleDnaValue,
  episodeId,
  generationJobs,
  save,
  reload,
  openAdd,
}: {
  entities: Entity[];
  projectId: string;
  // The project camera package, or null while nobody has chosen one. Null is
  // what lets a character sit on its own portrait preset instead of inheriting
  // a package that was never set.
  cameraDefaults: CameraSettings | null;
  // The look read off the project's reference images, or null while none is set.
  projectStyleDnaValue: StyleDna | null;
  // Character and asset art is billed to the episode it was requested from;
  // a shot names its own episode, but an entity belongs to the whole project.
  episodeId: string;
  generationJobs: NonNullable<Workspace["production"]>["generationJobs"];
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
          cameraDefaults={cameraDefaults}
          projectStyleDnaValue={projectStyleDnaValue}
          episodeId={episodeId}
          generationJobs={generationJobs}
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
          <span className="rounded-full bg-[#b9f42e]/10 px-2 py-1 text-[10px] font-bold text-[#b9f42e]">
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
            className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-red-500 transition shadow-lg disabled:opacity-50"
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
  inline,
}: {
  type: "image" | "video";
  value: string;
  onChange: (value: string) => void;
  options?: { quality?: "Low" | "Medium" | "High" | "Ultra"; aspectRatio?: string; resolution?: string; durationSeconds?: number };
  inline?: boolean;
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
    ];
  return (
    <div className={`relative ${inline ? "" : "mt-5"}`}>
      {!inline && <p className="t-caption text-zinc-500">{type === "image" ? "Image model" : "Video model"}</p>}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={
          inline
            ? "flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white transition outline-none"
            : "mt-2 flex w-full items-center justify-between rounded-xl border border-white/10 bg-[#0b0c0b] px-3 py-3 text-left text-sm font-bold text-white outline-none hover:border-[#b9f42e]/50"
        }
      >
        {inline ? (
          <>
            <Brain className="h-3.5 w-3.5" />
            <span>{selected.label}</span>
            <ChevronDown className="h-3 w-3 opacity-50" />
          </>
        ) : (
          <>
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
          </>
        )}
      </button>
      {open && (
        <div className={`absolute z-[80] overflow-hidden rounded-xl border border-white/10 bg-[#18191c] p-2 shadow-2xl ${inline ? "bottom-full left-0 mb-2 w-max min-w-[240px]" : "bottom-[calc(100%+8px)] left-0 w-full min-w-[280px]"}`}>
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

/**
 * What the episode will cost, and what it has already cost.
 *
 * The bar used to read `shots × 10`, a rate no model charges: the same twelve
 * shots are 240 credits on Seedance 2.0 Mini and several thousand on 2.5 at
 * 1080p, and nothing on screen said so. Both numbers here are the arithmetic
 * the generation routes bill with, and the spent figure is net of the refunds a
 * failed generation returns, so it matches the credits ledger.
 */
function CostBar({ data }: { data: Workspace }) {
  const [open, setOpen] = useState(false);
  const settings = useMemo(() => projectCostSettings(data.project), [data.project]);
  const estimate = useMemo(() => estimateProjectCost(data.shots || [], settings), [data.shots, settings]);
  // The server aggregates every job the project ever ran, split by episode. The
  // job list it also sends is capped at fifty, so it is only the fallback for
  // an older response.
  const breakdown = useMemo<SpendBreakdown>(
    () => data.production?.spend
      || summarizeSpendByEpisode(data.production?.generationJobs || [], data.activeEpisode?.id),
    [data.production?.spend, data.production?.generationJobs, data.activeEpisode?.id],
  );
  // The estimate is built from this episode's shots, so the spend beside it has
  // to be this episode's too, or a multi-episode project reads as though one
  // episode cost several times its own estimate.
  const spend = breakdown.episode;
  const money = (credits: number) => `$${creditsToUsd(credits).toFixed(2)}`;
  const row = "flex items-center justify-between gap-6 py-1.5";
  const cell = "text-[11px] text-zinc-400";

  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-1.5 rounded-full border border-[#b9f42e]/20 bg-[#b9f42e]/[0.06] px-2.5 py-1 text-[11px] font-bold text-[#b9f42e] transition hover:border-[#b9f42e]/50"
        title="Estimated and actual credit cost for this episode"
      >
        <Zap className="h-3 w-3" />
        <span>Est. {estimate.remainingCredits.toLocaleString()}</span>
        <span className="text-zinc-600">·</span>
        <span className="text-zinc-300">Spent {spend.net.toLocaleString()}</span>
        {spend.awaitingRefundCredits > 0 && (
          <span className="text-amber-400" title={`${spend.awaitingRefundCredits} credits from failed jobs not yet refunded`}>
            <AlertTriangle className="h-3 w-3" />
          </span>
        )}
        <ChevronDown className={`h-2.5 w-2.5 text-zinc-600 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <span className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-8 z-50 w-[22rem] rounded-xl border border-white/10 bg-[#141517] p-4 text-left shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <p className="t-caption text-zinc-300">Estimated cost</p>
              <p className="text-[11px] text-zinc-500">{estimate.shotCount} shot{estimate.shotCount === 1 ? "" : "s"}</p>
            </div>

            <div className="border-b border-white/10 py-2">
              <div className={row}>
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-200">
                  <ImageIcon className="h-3 w-3 text-zinc-500" />
                  Keyframe images
                </span>
                <span className="text-[11px] font-bold text-zinc-100">⚡ {estimate.image.credits.toLocaleString()}</span>
              </div>
              <p className={cell}>
                {estimate.image.label} · {settings.imageQuality} · {estimate.image.unitCredits} credits {estimate.image.unit}
              </p>
              {/* A leg reads ⚡ 0 once every shot has its keyframe. Say why,
                  rather than leaving a zero that looks like a broken price. */}
              <p className="text-[11px] text-zinc-600">
                {estimate.image.pendingShots
                  ? `${estimate.image.pendingShots} of ${estimate.shotCount} shots still need one`
                  : `All ${estimate.shotCount} generated — nothing left to charge`}
              </p>
            </div>

            <div className="border-b border-white/10 py-2">
              <div className={row}>
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-200">
                  <Film className="h-3 w-3 text-zinc-500" />
                  Video renders
                </span>
                <span className="text-[11px] font-bold text-zinc-100">⚡ {estimate.video.credits.toLocaleString()}</span>
              </div>
              <p className={cell}>
                {estimate.video.label} · {settings.resolution} · {estimate.video.unitCredits} credits {estimate.video.unit}
              </p>
              <p className="text-[11px] text-zinc-600">
                {estimate.video.pendingShots
                  ? `${estimate.video.pendingSeconds}s to render of ${estimate.video.totalSeconds}s total runtime`
                  : `All ${estimate.shotCount} rendered — nothing left to charge`}
              </p>
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="text-xs font-bold text-zinc-200">Remaining</span>
              <span className="text-sm font-bold text-[#b9f42e]">⚡ {estimate.remainingCredits.toLocaleString()} <span className="text-[11px] font-medium text-zinc-500">≈ {money(estimate.remainingCredits)}</span></span>
            </div>
            <p className="text-[11px] text-zinc-600">Whole episode from scratch: ⚡ {estimate.totalCredits.toLocaleString()}</p>

            <div className="mt-3 border-t border-white/10 pt-3">
              <div className="flex items-center justify-between">
                <p className="t-caption text-zinc-300">Actual cost</p>
                <p className="text-[11px] text-zinc-500">this episode</p>
              </div>
              <div className={row}>
                <span className={cell}>Charged · {spend.jobs} job{spend.jobs === 1 ? "" : "s"}</span>
                <span className="text-[11px] font-bold text-zinc-100">⚡ {spend.charged.toLocaleString()}</span>
              </div>
              <div className={row}>
                <span className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                  <RotateCcw className="h-3 w-3 text-zinc-500" />
                  Refunded · {spend.failedJobs} failed
                </span>
                <span className="text-[11px] font-bold text-emerald-400">− ⚡ {spend.refunded.toLocaleString()}</span>
              </div>
              <div className={`${row} border-t border-white/10`}>
                <span className="text-xs font-bold text-zinc-200">Spent</span>
                <span className="text-sm font-bold text-zinc-100">⚡ {spend.net.toLocaleString()} <span className="text-[11px] font-medium text-zinc-500">≈ {money(spend.net)}</span></span>
              </div>
              <p className="text-[11px] text-zinc-600">
                Images ⚡ {spend.image.net.toLocaleString()} · Video ⚡ {spend.video.net.toLocaleString()}
              </p>
              {/* How much of one clean pass this episode has been paid for.
                  Anything above 1× is retries, and it is the number that
                  explains a bill several times the estimate.

                  Only when the episode's spend is complete. With jobs missing
                  from it the ratio is not merely imprecise, it is wrong in a
                  way that reads as precise — an episode with every video job
                  unattributed showed "0.0× the from-scratch cost" beside
                  sixteen rendered shots. */}
              {spend.net > 0 && estimate.totalCredits > 0 && breakdown.unattributedJobs === 0 && (
                <p className="text-[11px] text-zinc-600">
                  {(spend.net / estimate.totalCredits).toFixed(1)}× the from-scratch cost
                  {estimate.video.totalSeconds > 0 && spend.video.net > 0
                    ? ` · ${Math.round(spend.video.net / Math.max(1, estimate.video.unitCredits))}s of video billed against ${estimate.video.totalSeconds}s of runtime`
                    : ""}
                </p>
              )}
              {breakdown.project.net !== spend.net && (
                <p className="mt-1 text-[11px] text-zinc-600">
                  Whole project, all episodes: ⚡ {breakdown.project.net.toLocaleString()} across {breakdown.project.jobs} job{breakdown.project.jobs === 1 ? "" : "s"}
                </p>
              )}
              {/* Jobs predating per-episode attribution cannot be assigned to
                  one, so say so rather than under-report the episode. */}
              {breakdown.unattributedJobs > 0 && (
                <p className="text-[11px] text-zinc-600">
                  ⚡ {breakdown.unattributedCredits.toLocaleString()} from {breakdown.unattributedJobs} earlier job{breakdown.unattributedJobs === 1 ? "" : "s"} predates per-episode tracking and counts only in the project total.
                </p>
              )}
              {spend.awaitingRefundCredits > 0 && (
                <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-2 text-[11px] text-amber-300">
                  <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                  <span>⚡ {spend.awaitingRefundCredits.toLocaleString()} from {spend.awaitingRefund} failed job{spend.awaitingRefund === 1 ? "" : "s"} has not been refunded yet.</span>
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </span>
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
  const [aspectRatio, setAspectRatio] = useState<string>((metaSettings?.aspectRatio as string) || data.project.default_aspect || "9:16");
  const [resolution, setResolution] = useState<string>((metaSettings?.resolution as string) || "720p");
  const [storyboardImageModel, setStoryboardImageModel] = useState<string>((metaSettings?.storyboardImageModel as string) || imageGenerationModels[0].id);
  const [characterImageModel, setCharacterImageModel] = useState<string>((metaSettings?.characterImageModel as string) || imageGenerationModels[0].id);
  // One quality for the whole project: chat keyframes, character and asset art,
  // and the storyboard's own generate button all read this.
  const [imageQuality, setImageQuality] = useState<string>((metaSettings?.imageQuality as string) || "Medium");
  const [videoModel, setVideoModel] = useState<string>(supportedVideoModel(metaSettings?.videoModel));
  const [generateAudio, setGenerateAudio] = useState<boolean>(metaSettings?.generateAudio !== false);
  const [workflow, setWorkflow] = useState<string>(selectedEpisodeWorkflow || (projectMeta.default_workflow_id as string) || (metaSettings?.workflow as string) || "keyframe_images_to_video");
  const [workflowApplyMode, setWorkflowApplyMode] = useState<"project_default" | "episode">("project_default");
  const [visualStyle, setVisualStyle] = useState<string>((metaSettings?.visualStyle as string) || (data.project.default_style || "Realistic - 3D CG"));
  // One camera package for the whole project. Left unset, each block keeps the
  // preset its own job calls for — a portrait length for characters, a sharp
  // standard for asset plates. Set it and every block inherits it instead.
  const storedCameraDefaults = projectCameraDefaults(data.project);
  const [cameraDefaultsEnabled, setCameraDefaultsEnabled] = useState(Boolean(storedCameraDefaults));
  const [cameraDefaults, setCameraDefaults] = useState<CameraSettings>(storedCameraDefaults || DEFAULT_PROJECT_CAMERA_SETTINGS);
  // The look read off the project's reference images. Held here and written with
  // the rest of the settings, so a bad reading of a mood board never becomes the
  // look every image inherits without the user seeing and confirming it first.
  const [styleDna, setStyleDna] = useState<StyleDna | null>(projectStyleDna(data.project));
  const [saving, setSaving] = useState(false);

  // The header quoted a fixed "⚡ 16/s" whatever was selected below it. Price
  // the selections the dialog is currently showing instead, so changing model,
  // quality, or resolution moves the number the user is agreeing to.
  const liveEstimate = useMemo(
    () => estimateProjectCost(data.shots || [], {
      imageModel: storyboardImageModel,
      videoModel,
      imageQuality: (["Low", "Medium", "High", "Ultra"].includes(imageQuality) ? imageQuality : "Medium") as "Low" | "Medium" | "High" | "Ultra",
      resolution,
      aspectRatio,
    }),
    [data.shots, storyboardImageModel, videoModel, imageQuality, resolution, aspectRatio],
  );
  const perShotEstimate = liveEstimate.shotCount ? Math.round(liveEstimate.totalCredits / liveEstimate.shotCount) : 0;

  const confirmSettings = async () => {
    setSaving(true);
    try {
      await save({
        action: "saveProjectSettings",
        settings: {
          projectName: projectName.trim() || "Untitled production",
          aspectRatio,
          resolution,
          storyboardImageModel,
          characterImageModel,
          imageQuality,
          videoModel,
          generateAudio,
          workflow,
          workflowApplyMode,
          episodeId: data.activeEpisode.id,
          visualStyle,
          // Null rather than omitted: clearing the package has to reach the
          // stored settings, or turning it off would silently keep the old one.
          cameraDefaults: cameraDefaultsEnabled ? cameraDefaults : null,
          // Null rather than omitted, for the same reason as the camera package:
          // clearing the look has to reach the stored settings.
          styleDna,
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
            <span className="text-xs text-zinc-400" title={`${liveEstimate.image.label} at ${imageQuality} + ${liveEstimate.video.label} at ${resolution}`}>
              {liveEstimate.shotCount
                ? <>These settings: ⚡ {perShotEstimate.toLocaleString()}/shot · ⚡ {liveEstimate.totalCredits.toLocaleString()} for {liveEstimate.shotCount} shot{liveEstimate.shotCount === 1 ? "" : "s"}</>
                : <>These settings: ⚡ {liveEstimate.image.unitCredits} per image · ⚡ {liveEstimate.video.unitCredits} {liveEstimate.video.unit}</>}
            </span>
            <button onClick={close} className="rounded-xl p-2 text-zinc-400 hover:bg-white/10 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-2">Project Name</label>
            <input
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              maxLength={160}
              className="w-full rounded-xl border border-white/10 bg-[#0b0c0b] p-3 text-sm font-bold text-zinc-200 outline-none focus:border-[#b9f42e]"
              placeholder="Name this production"
            />
          </div>

          {/* Row 1: Aspect Ratio, Resolution, Storyboard Image Model */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1">Aspect Ratio</label>
              <p className="text-[11px] text-zinc-500 mb-2">Video framing</p>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#0b0c0b] p-3 text-sm font-bold text-zinc-200 outline-none focus:border-[#b9f42e]"
              >
                <option value="9:16">9:16 (Vertical)</option>
                <option value="16:9">16:9 (Horizontal)</option>
                <option value="1:1">1:1 (Square)</option>
                <option value="2:3">2:3 (Portrait)</option>
                <option value="21:9">21:9 (Cinematic)</option>
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1">Resolution</label>
              <p className="text-[11px] text-zinc-500 mb-2">Output video quality</p>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#0b0c0b] p-3 text-sm font-bold text-zinc-200 outline-none focus:border-[#b9f42e]"
              >
                <option value="720p">720p (HD)</option>
                <option value="1080p">1080p (FHD)</option>
                <option value="2K">2K (QHD)</option>
                <option value="4K">4K (UHD)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1">Storyboard Image Model</label>
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
          </div>

          {/* Row 2: Character/Scene Image Model, Video Generation Model */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1">Character/Scene Image Model</label>
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

            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1">Image Quality</label>
              <p className="text-[11px] text-zinc-500 mb-2">Applies to every image this project generates</p>
              <select
                value={imageQuality}
                onChange={(e) => setImageQuality(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#0b0c0b] p-3 text-sm font-bold text-zinc-200 outline-none focus:border-[#b9f42e]"
              >
                <option value="Low">Low (⚡ fastest, cheapest)</option>
                <option value="Medium">Medium (balanced)</option>
                <option value="High">High (⚡ slowest, most credits)</option>
              </select>
            </div>
          </div>

          {/* Row 2: Video Model & Generate Audio */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-zinc-400 mb-2">Video Model</label>
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
              <label className="block text-xs font-bold text-zinc-400 mb-2">Generate Audio</label>
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
              <label className="block text-xs font-bold text-zinc-400">Generation Workflow (AI Agent Pipeline)</label>
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

          {/* Row 3b: Project Camera Package */}
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <label className="block text-xs font-bold text-zinc-400">Camera Package</label>
                <p className="text-[11px] text-zinc-500">
                  The optics every character, asset, and shot image inherits. Shots can override it; character and asset art stays locked to it.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-zinc-300">
                <input
                  type="checkbox"
                  checked={cameraDefaultsEnabled}
                  onChange={(event) => setCameraDefaultsEnabled(event.target.checked)}
                  className="h-3.5 w-3.5 accent-[#b9f42e]"
                />
                Set one for this project
              </label>
            </div>
            {cameraDefaultsEnabled ? (
              <CameraSettingsPicker value={cameraDefaults} onChange={setCameraDefaults} size="full" />
            ) : (
              <p className="rounded-xl border border-dashed border-white/15 p-4 text-xs text-zinc-500">
                Unset. Characters shoot on {describeCameraSettings(BLOCK_CAMERA_DEFAULTS.character)}, assets on {describeCameraSettings(BLOCK_CAMERA_DEFAULTS.asset)}, and shots on {describeCameraSettings(BLOCK_CAMERA_DEFAULTS.shot)}.
              </p>
            )}
          </div>

          {/* Row 3c: Look & Feel reference */}
          <StyleDnaPanel projectId={data.project.id} value={styleDna} onChange={setStyleDna} />

          {/* Row 4: Visual Style Selector */}
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-2">Visual Style</label>
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
                    <img src={style.img} alt={style.label} className="h-full w-full object-cover transition group-active:scale-[0.98]" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                    {style.hot && (
                      <span className="absolute right-2 top-2 rounded-md bg-red-500/90 px-1.5 py-0.5 t-caption text-white shadow">
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
            className="flex items-center gap-2 rounded-xl bg-[#b9f42e] px-8 py-3 text-sm font-semibold text-black hover:bg-[#a6de25] transition disabled:opacity-50"
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
  cameraDefaults,
  projectStyleDnaValue,
  episodeId,
  generationJobs,
  close,
  save,
  reload,
}: {
  asset: Entity;
  entities: Entity[];
  projectId: string;
  cameraDefaults: CameraSettings | null;
  projectStyleDnaValue: StyleDna | null;
  episodeId: string;
  generationJobs: NonNullable<Workspace["production"]>["generationJobs"];
  close: () => void;
  save: (b: unknown) => Promise<void>;
  reload: (silent?: boolean) => Promise<void>;
}) {
  type AssetGenerationAttempt = {
    id: string;
    status: "generating" | "failed";
    prompt: string;
    model: string;
    error: string | null;
    referenceImages: string[];
    createdAt: number;
  };
  const [selected, setSelected] = useState(0);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(asset.description || "");
  const [model, setModel] = useState<string>(imageGenerationModels[0].id);
  const [aspectRatio, setAspectRatio] = useState<string>("9:16");
  const [quality, setQuality] = useState<"Low" | "Medium" | "High" | "Ultra">("Medium");
  // The camera package is opt-in. Off, the prompt is sent exactly as written —
  // no optics, no "professional photography, 8K" tail — because a user who has
  // not asked to shoot on a particular camera has not asked for their prompt to
  // be rewritten either. A project package only decides what the switch starts
  // on and which four values it opens with.
  const cameraBlock = cameraBlockForEntityType(asset.type);
  const storedCameraOverride = asset.metadata?.camera_override;
  const [cameraEnabled, setCameraEnabled] = useState(isCameraSettings(storedCameraOverride) || Boolean(cameraDefaults));
  const [cameraSettings, setCameraSettings] = useState<CameraSettings>(() => resolveCameraSettings({
    block: cameraBlock,
    override: storedCameraOverride,
    projectDefaults: cameraDefaults,
  }));
  // The look follows the same lock as the camera package, for the same reason:
  // a library whose references were each shot under a different look is worth
  // less than one whose references match, so lifting it is a per-image act.
  const storedStyleOverride = normalizeStyleDna(asset.metadata?.style_dna_override);
  const [styleOverrideEnabled, setStyleOverrideEnabled] = useState(Boolean(storedStyleOverride));
  const [styleOverride, setStyleOverride] = useState<StyleDna | null>(storedStyleOverride ?? projectStyleDnaValue);
  const persistedGenerationStatus = entityImageGenerationStatus(asset);
  const [working, setWorking] = useState(persistedGenerationStatus === "generating");
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  useEffect(() => {
    // getUser touches the auth lock, which supabase may steal from a stalled
    // refresh; an unhandled rejection here would crash the workspace.
    createClient().auth.getUser().then(({ data }) => {
      if (data.user) getUserCredits(data.user.id).then(setCreditBalance).catch(() => {});
    }).catch(() => {});
  }, []);
  const [generationStatus, setGenerationStatus] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [referenceSourcePicker, setReferenceSourcePicker] = useState(false);
  const [libraryImages, setLibraryImages] = useState<string[]>(asset.reference_images || []);
  const [assetAttempts, setAssetAttempts] = useState<AssetGenerationAttempt[]>([]);
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
    const snapshotAttempts = (generationJobs || [])
      .filter((job) => {
        const settings = job.settings && typeof job.settings === "object" ? job.settings : null;
        return job.type === "image"
          && (settings?.target === "asset" || settings?.target === "entity")
          && settings?.entityId === asset.id
          && (job.status !== "completed" || !job.result_url);
      })
      .map((job): AssetGenerationAttempt => ({
        id: job.id,
        status: job.status === "failed" || job.status === "cancelled" ? "failed" : "generating",
        prompt: job.prompt || asset.description || "",
        model: job.model || imageGenerationModels[0].id,
        error: job.error || (job.status === "cancelled" ? "Generation cancelled" : null),
        referenceImages: Array.isArray(job.input_images) ? job.input_images : [],
        createdAt: new Date(job.created_at || 0).getTime(),
      }));
    setAssetAttempts((current) => {
      const merged = new Map<string, AssetGenerationAttempt>();
      for (const attempt of current) merged.set(attempt.id, attempt);
      for (const attempt of snapshotAttempts) merged.set(attempt.id, attempt);
      return Array.from(merged.values())
        .filter((attempt) => attempt.id.startsWith("asset-gen-") || snapshotAttempts.some((item) => item.id === attempt.id))
        .sort((a, b) => b.createdAt - a.createdAt);
    });
  }, [asset.description, asset.id, generationJobs]);

  useEffect(() => {
    if (persistedGenerationStatus !== "generating") return;
    const interval = window.setInterval(() => { void reload(true); }, 3_000);
    return () => window.clearInterval(interval);
  }, [persistedGenerationStatus, reload]);

  // What produced each saved concept, so selecting one brings back the prompt
  // and references that made it. Without this the panel offered a description
  // and an empty reference strip, and every regeneration started from scratch.
  const recipeByImage = useMemo(() => {
    const recipes = new Map<string, { prompt: string; model: string; references: string[]; camera: CameraSettings | null; styleDna: StyleDna | null; styleReferences: string[] }>();
    for (const job of generationJobs || []) {
      const settings = job.settings && typeof job.settings === "object" ? job.settings as Record<string, unknown> : null;
      if (job.type !== "image" || settings?.entityId !== asset.id) continue;
      if (typeof job.result_url !== "string" || !job.result_url) continue;
      if (recipes.has(job.result_url)) continue;
      const cameraUsed = settings && isCameraSettings(settings.cameraSettingsUsed) ? settings.cameraSettingsUsed : null;
      recipes.set(job.result_url, {
        prompt: job.prompt || "",
        model: job.model || imageGenerationModels[0].id,
        references: Array.isArray(job.input_images) ? job.input_images as string[] : [],
        camera: cameraUsed,
        styleDna: normalizeStyleDna(settings?.styleDnaUsed),
        styleReferences: Array.isArray(settings?.styleReferenceImages)
          ? (settings.styleReferenceImages as unknown[]).filter((item): item is string => typeof item === "string")
          : [],
      });
    }
    return recipes;
  }, [generationJobs, asset.id]);

  // Selecting a concept loads what made it, ready to run again or to edit.
  const activeImagePath = libraryImages[selected] || null;
  useEffect(() => {
    if (!activeImagePath) return;
    const recipe = recipeByImage.get(activeImagePath);
    if (!recipe) return;
    if (recipe.prompt.trim()) setPrompt(recipe.prompt);
    if (recipe.model) setModel(recipe.model);
    if (recipe.references.length) setReferences(recipe.references);
    // Keyed on the selection alone: reacting to the recipe map would overwrite
    // an edit in progress every time the workspace refreshed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeImagePath]);

  const activeAttempt = selectedAttemptId ? assetAttempts.find((attempt) => attempt.id === selectedAttemptId) || null : null;
  const activeImage = activeAttempt ? null : libraryImages[selected] || null;
  useEffect(() => {
    if (!activeAttempt) return;
    if (activeAttempt.prompt.trim()) setPrompt(activeAttempt.prompt);
    if (activeAttempt.model) setModel(activeAttempt.model);
    if (activeAttempt.referenceImages.length) setReferences(activeAttempt.referenceImages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAttemptId]);
  const chosenImage = libraryImages[0] || null;
  const isCurrentlyChosen = Boolean(activeImage && (asset.primary_reference_image ? activeImage === asset.primary_reference_image : selected === 0));

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
      // Recorded explicitly as well as re-ordered: generation sends one image
      // per entity, and which one that is should not depend on array position.
      await save({
        action: "saveAsset",
        asset: {
          ...asset,
          reference_images: nextLibrary,
          primary_reference_image: activeImage,
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
  const [drawing, setDrawing] = useState(false);

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
    const localAttemptId = `asset-gen-${Date.now()}`;
    const localAttempt: AssetGenerationAttempt = {
      id: localAttemptId,
      status: "generating",
      prompt,
      model,
      error: null,
      referenceImages: [...references],
      createdAt: Date.now(),
    };
    setAssetAttempts((current) => [localAttempt, ...current]);
    setSelectedAttemptId(localAttemptId);
    try {
      const mentionedEntityIds = findMentionedEntityIds(prompt, entities);
      const response = await fetch(`/api/studio/projects/${projectId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: "asset",
          targetId: asset.id,
          episodeId,
          prompt,
          model,
          referenceImages: references,
          mentionedEntityIds,
          aspectRatio,
          quality,
          // Sent as an override only when the user took this image off the
          // project package; otherwise the server resolves it, so the two
          // never disagree about what "locked" means.
          // Sent only when the switch is on. Omitted means the server leaves
          // the prompt alone rather than resolving a package of its own.
          ...(cameraEnabled ? { cameraSettings } : {}),
          ...(styleOverrideEnabled ? { styleDna: styleOverride } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        const savedJobId = typeof body.jobId === "string" ? body.jobId : null;
        const errorMessage = body.error || "Image generation failed";
        setAssetAttempts((current) => current.map((attempt) => attempt.id === localAttemptId ? {
          ...attempt,
          id: savedJobId || attempt.id,
          status: "failed",
          error: errorMessage,
        } : attempt));
        if (savedJobId) setSelectedAttemptId(savedJobId);
        throw new Error(errorMessage);
      }
      notifyCreditBalanceChanged(typeof body.creditBalance === "number" ? body.creditBalance : undefined);
      if (typeof body.creditBalance === "number") setCreditBalance(body.creditBalance);
      if (typeof body.path === "string") {
        const nextLibrary = [body.path, ...libraryImages.filter((img) => img !== body.path)];
        setLibraryImages(nextLibrary);
        setSelected(0);
        setSelectedAttemptId(null);
      }
      const savedJobId = typeof body.jobId === "string" ? body.jobId : null;
      setAssetAttempts((current) => current.filter((attempt) => attempt.id !== localAttemptId && (!savedJobId || attempt.id !== savedJobId)));
      setGenerationStatus("Asset image generated ✓");
      await reload(true);
    } catch (error) {
      notifyCreditBalanceChanged();
      const errorMessage = error instanceof Error ? error.message : "Image generation failed";
      setGenerationError(errorMessage);
      setAssetAttempts((current) => current.map((attempt) => attempt.id === localAttemptId ? {
        ...attempt,
        status: "failed",
        error: errorMessage,
      } : attempt));
      // The API normally records this itself. This client-side fallback covers
      // a dropped request where the server disappears after persisting the
      // generating flag but before its error handler can run.
      try {
        await save({
          action: "saveAsset",
          asset: {
            ...asset,
            reference_images: libraryImages,
            metadata: {
              ...asset.metadata,
              image_generation: {
                ...(asset.metadata?.image_generation && typeof asset.metadata.image_generation === "object" ? asset.metadata.image_generation : {}),
                status: "failed",
                error: errorMessage,
                completed_at: new Date().toISOString(),
              },
            },
          },
        });
        await reload(true);
      } catch {
        // Preserve the original generation error in the UI even if recovery
        // persistence is temporarily unavailable.
      }
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
      <div className="flex h-full flex-col overflow-y-auto overscroll-contain lg:flex-row lg:overflow-hidden">
        {/* Left Side Thumbnail History List */}
        <aside className="no-scrollbar flex max-h-44 w-full shrink-0 gap-3 overflow-x-auto border-b border-white/10 lg:max-h-none bg-[#0b0c0b] p-3 lg:block lg:w-44 lg:overflow-y-auto lg:overflow-x-visible lg:border-b-0 lg:border-r lg:p-4">
          <button
            onClick={close}
            className="touch-target flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-zinc-300 hover:bg-white/10 lg:mb-4 lg:h-10 lg:w-10"
          >
            <X className="h-5 w-5" />
          </button>
          <label className="grid aspect-[3/4] w-[72px] shrink-0 cursor-pointer place-items-center rounded-xl border border-dashed border-white/25 text-center text-[11px] text-zinc-400 transition hover:border-[#b9f42e] lg:mb-4 lg:w-auto lg:text-xs">
            +<br />Upload
            <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadImage(e.target.files?.[0], "library")} />
          </label>
          <p className="mb-2 hidden text-[10px] font-bold text-zinc-600 lg:block">Asset Concept Gallery</p>
          <div className="flex gap-2.5 lg:block lg:space-y-2.5">
            {assetAttempts.map((attempt) => {
              const isSel = selectedAttemptId === attempt.id;
              return (
                <button
                  key={attempt.id}
                  type="button"
                  onClick={() => {
                    setSelectedAttemptId(attempt.id);
                    setPrompt(attempt.prompt);
                    if (attempt.model) setModel(attempt.model);
                    if (attempt.referenceImages.length) setReferences(attempt.referenceImages);
                    setGenerationError(attempt.status === "failed" ? attempt.error : null);
                  }}
                  className={`block w-[72px] shrink-0 overflow-hidden rounded-xl border-2 transition text-left lg:w-full ${
                    isSel ? "border-white/60" : "border-white/10 hover:border-white/25"
                  }`}
                >
                  {attempt.status === "generating" ? (
                    <div className="grid aspect-[3/4] place-items-center bg-black/40">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-6 w-6 animate-spin text-[#b9f42e]" />
                        <span className="text-[10px] text-zinc-400">Generating…</span>
                      </div>
                    </div>
                  ) : (
                    <div className="grid aspect-[3/4] place-items-center bg-red-950/30 p-2">
                      <div className="flex flex-col items-center gap-1 text-center">
                        <span className="text-lg">⚠</span>
                        <span className="line-clamp-3 text-[10px] leading-tight text-red-300">{attempt.error || "Image generation failed"}</span>
                      </div>
                    </div>
                  )}
                  <span className="block truncate bg-black/80 px-2 py-1.5 text-[10px] text-zinc-300">
                    {attempt.prompt || "Generation attempt"}
                  </span>
                </button>
              );
            })}
            {libraryImages.map((image, index) => {
              const isChosen = asset.primary_reference_image
                ? image === asset.primary_reference_image
                : index === 0;
              const isSel = index === selected;
              return (
                <div key={`${image}-${index}`} className="relative group">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAttemptId(null);
                      setSelected(index);
                      setGenerationError(null);
                    }}
                    className={`block w-[72px] shrink-0 overflow-hidden rounded-xl border-2 transition text-left lg:w-full ${
                      isChosen
                        ? "border-[#b9f42e] ring-2 ring-[#b9f42e]/40"
                        : isSel
                        ? "border-white/60"
                        : "border-white/10 hover:border-white/25"
                    }`}
                  >
                    <AssetImage src={image} />
                    {isChosen && (
                      <span className="absolute left-1 top-1 rounded-md bg-[#b9f42e] px-1 py-0.5 text-[10px] font-bold leading-none text-black shadow lg:left-1.5 lg:top-1.5 lg:px-1.5">
                        ✓<span className="hidden lg:inline"> CHOSEN</span>
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
              <span className="flex items-center gap-1.5 rounded-lg border border-[#b9f42e]/50 bg-[#b9f42e]/20 px-4 py-2 text-xs font-semibold text-[#b9f42e]">
                ✓ Chosen Concept
              </span>
            ) : (
              <button
                type="button"
                onClick={chooseSelectedImage}
                disabled={working || !activeImage}
                className="flex items-center gap-1.5 rounded-lg bg-[#b9f42e] px-4 py-2 text-xs font-semibold text-black hover:bg-[#a6de25] transition shadow-lg disabled:opacity-40"
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

            {activeImage && (
              <button
                type="button"
                onClick={() => downloadSignedMedia(activeImage, `${asset.name.replace(/[^a-zA-Z0-9._-]/g, "-")}.png`).catch(() => {})}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/5"
                title="Download asset image"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </button>
            )}

            {activeImage && (
              <button
                type="button"
                onClick={() => setDrawing(true)}
                disabled={working}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-zinc-200 hover:border-[#b9f42e]/40 hover:text-[#b9f42e] transition disabled:opacity-40"
                title="Draw on this image and describe the edit"
              >
                <Pencil className="h-3.5 w-3.5" />
                Draw
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

            <span className="ml-auto t-caption text-zinc-500">
              {asset.type} Asset Studio
            </span>
          </header>

          {/* Central Preview Viewport */}
          <div className="grid flex-1 place-items-center overflow-auto bg-black/40 p-4 sm:p-8">
            <div className="flex flex-col items-center overflow-hidden rounded-xl bg-[#151715] shadow-2xl transition max-w-4xl w-full">
              {activeAttempt?.status === "generating" || (working && !activeImage) ? (
                <div className={`grid place-items-center p-8 ${aspectRatio === "9:16" ? "aspect-[9/16] h-[55vh] max-h-[580px]" : "aspect-[16/9] w-full max-w-[640px]"}`}>
                  <div className="flex flex-col items-center gap-4">
                    <svg className="h-12 w-12 animate-spin text-[#b9f42e]" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="opacity-20" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                    <p className="text-sm text-zinc-400">{generationStatus || "Generating asset image…"}</p>
                  </div>
                </div>
              ) : activeAttempt?.status === "failed" ? (
                <GenerationPreviewError message={activeAttempt.error || "Image generation failed"} />
              ) : generationError ? (
                <GenerationPreviewError message={generationError} />
              ) : activeImage ? (
                <AssetImage src={activeImage} className="max-h-[60vh] w-auto max-w-full rounded-t-xl object-contain mx-auto" />
              ) : (
                <div className={`grid place-items-center text-center text-zinc-500 p-8 ${aspectRatio === "9:16" ? "aspect-[9/16] h-[55vh] max-h-[580px]" : "aspect-[16/9] w-full max-w-[640px]"}`}>
                  Upload a reference image or click &ldquo;Generate image&rdquo; below.
                </div>
              )}
              {(activeImage || activeAttempt) && (
                <div className="w-full border-t border-white/10 bg-black/60 p-4 rounded-b-xl">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] font-bold text-[#b9f42e]">
                      PROMPT USED
                    </p>
                    <span className="flex flex-wrap items-center gap-2">
                      {activeImage && recipeByImage.get(activeImage)?.camera && (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold text-zinc-300"
                          title="The camera package this image was generated with"
                        >
                          <Aperture className="h-3 w-3 text-[#b9f42e]" />
                          {describeCameraSettings(recipeByImage.get(activeImage)!.camera!)}
                        </span>
                      )}
                      {activeImage && (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold text-zinc-300"
                          title={recipeByImage.get(activeImage)?.styleDna
                            ? `This image copied a look reference. ${recipeByImage.get(activeImage)!.styleDna!.overrideProjectStyle ? "The reference decided the medium." : "The Visual Style setting decided the medium; the reference supplied palette, light and texture."}`
                            : "No look reference was applied. This image followed the Visual Style setting alone."}
                        >
                          <Palette className={`h-3 w-3 ${recipeByImage.get(activeImage)?.styleDna ? "text-[#b9f42e]" : "text-zinc-600"}`} />
                          {describeStyleDna(recipeByImage.get(activeImage)?.styleDna, recipeByImage.get(activeImage)?.styleReferences.length || 0)}
                        </span>
                      )}
                      <span className="rounded-md border border-[#b9f42e]/30 bg-[#b9f42e]/10 px-2 py-0.5 text-[11px] font-bold text-[#b9f42e]">
                        Model: {getModelLabel(activeAttempt?.model || model)}
                      </span>
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-200">{activeAttempt?.prompt || prompt || asset.description || "—"}</p>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Right Sidebar Controls */}
        {/* The asset is what the screen is for, so it stays on top; this is
            the way down to the controls without scrolling past it. Mirrors the
            Director button on the workspace so the two behave alike. */}
        <button
          type="button"
          onClick={() => document.getElementById("asset-generate-controls")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="fixed bottom-5 right-5 z-[60] flex h-14 min-h-[44px] items-center gap-2 rounded-full bg-[#b9f42e] px-5 text-[13px] font-semibold text-black shadow-[0_10px_30px_-6px_rgba(185,244,46,0.5)] transition-transform duration-press ease-out active:scale-95 lg:hidden"
        >
          <WandSparkles className="h-4 w-4" />
          Generate
        </button>
        <aside id="asset-generate-controls" className="flex w-full shrink-0 scroll-mt-4 flex-col border-t border-white/10 bg-[#151715] lg:w-[420px] lg:border-l lg:border-t-0">
          <div className="flex items-start justify-between p-6 border-b border-white/10">
            <div>
              <p className="text-xs font-bold tracking-[.18em] text-[#b9f42e]">
                {asset.type}
              </p>
              <h2 className="mt-1 text-2xl font-semibold">{asset.name}</h2>
            </div>
            <button
              onClick={close}
              className="rounded-xl p-2 text-zinc-400 hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="flex flex-col rounded-[24px] bg-[#1c1c1c] p-4 shadow-xl">
              {/* Reference Images Row */}
              <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
                <button
                  type="button"
                  aria-label="Add reference image"
                  onClick={() => setReferenceSourcePicker(true)}
                  className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-2xl bg-white/[0.05] text-xl font-light text-white/50 transition hover:bg-white/[0.08]"
                >
                  +
                </button>
                {references.map((image, index) => (
                  <div key={`${image}-${index}`} className="group relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-2xl bg-black">
                    <AssetImage src={image} className="h-full w-full object-cover opacity-90 transition group-hover:opacity-100" />
                    <button
                      type="button"
                      aria-label={`Remove reference image ${index + 1}`}
                      onClick={() => void saveReferences(references.filter((_, i) => i !== index))}
                      className="absolute inset-0 grid place-items-center bg-black/60 opacity-0 transition group-hover:opacity-100"
                    >
                      <Trash2 className="h-4 w-4 text-white" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Textarea */}
              <div className="relative mb-4">
                <EntityMentionInput
                  value={prompt}
                  onChange={setPrompt}
                  entities={entities}
                  className="min-h-[140px] w-full resize-none bg-transparent text-[13px] leading-relaxed text-zinc-200 outline-none placeholder:text-zinc-600"
                  placeholder="Describe the image. Type @ to mention a character, scene, or asset…"
                  ariaLabel="Asset image prompt"
                  menuPlacement="top"
                />
              </div>

              <div className="mb-4">
                <CameraSettingsControl
                  value={cameraSettings}
                  onChange={setCameraSettings}
                  enabled={cameraEnabled}
                  onEnabledChange={setCameraEnabled}
                  projectSummary={cameraDefaults ? describeCameraSettings(cameraDefaults) : undefined}
                />
              </div>

              <div className="mb-4">
                <StyleDnaPanel
                  projectId={projectId}
                  value={styleOverride}
                  onChange={setStyleOverride}
                  lockable
                  overrideEnabled={styleOverrideEnabled}
                  onOverrideChange={setStyleOverrideEnabled}
                  projectSummary={projectStyleDnaValue?.summary || null}
                  heading="Look &amp; Feel"
                  blurb="Drop a reference whose look this asset alone should copy."
                />
              </div>

              <div className="mb-4">
                <RevisionNotes projectId={projectId} target={{ type: "entity", id: asset.id }} defaultOpen={false} />
              </div>

              {/* Inline Toolbar */}
              <div className="flex items-center justify-between border-t border-white/10 pt-3">
                <div className="flex flex-wrap items-center gap-4">
                  <ModelMenu type="image" value={model} onChange={setModel} options={{ quality, aspectRatio }} inline />
                  
                  <div className="relative flex items-center gap-1.5 text-xs font-semibold text-zinc-400 transition hover:text-white group">
                    <Monitor className="h-3.5 w-3.5" />
                    <select
                      value={aspectRatio}
                      onChange={(e) => setAspectRatio(e.target.value)}
                      className="appearance-none bg-transparent outline-none cursor-pointer pr-4"
                    >
                      <option className="bg-[#1c1c1c]" value="9:16">9:16</option>
                      <option className="bg-[#1c1c1c]" value="16:9">16:9</option>
                      <option className="bg-[#1c1c1c]" value="1:1">1:1</option>
                      <option className="bg-[#1c1c1c]" value="2:3">2:3</option>
                      <option className="bg-[#1c1c1c]" value="3:2">3:2</option>
                      <option className="bg-[#1c1c1c]" value="21:9">21:9</option>
                    </select>
                    <ChevronDown className="absolute right-0 h-3 w-3 opacity-50 pointer-events-none" />
                  </div>

                  <div className="relative flex items-center gap-1.5 text-xs font-semibold text-zinc-400 transition hover:text-white group">
                    <Sparkles className="h-3.5 w-3.5" />
                    <select
                      value={quality}
                      onChange={(e) => setQuality(e.target.value as any)}
                      className="appearance-none bg-transparent outline-none cursor-pointer pr-4"
                    >
                      <option className="bg-[#1c1c1c]" value="Low">Low</option>
                      <option className="bg-[#1c1c1c]" value="Medium">Medium</option>
                      <option className="bg-[#1c1c1c]" value="High">High</option>
                      <option className="bg-[#1c1c1c]" value="Ultra">Ultra</option>
                    </select>
                    <ChevronDown className="absolute right-0 h-3 w-3 opacity-50 pointer-events-none" />
                  </div>
                </div>

                <div className="flex items-center gap-3 pl-2">
                  <span className="text-xs font-semibold text-zinc-400">
                    <Sparkles className="mb-0.5 inline h-3 w-3" /> {currentCreditCost}
                  </span>
                  {creditBalance !== null && creditBalance < currentCreditCost ? (
                    <button
                      disabled
                      className="grid h-8 w-8 place-items-center rounded-full bg-zinc-700 text-zinc-400 opacity-50"
                      title="Insufficient credits"
                    >
                      <Zap className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      onClick={requestGeneration}
                      disabled={working}
                      className="grid h-8 w-8 place-items-center rounded-full bg-[#dfff8c] text-black shadow-lg transition hover:bg-[#c9f658] disabled:opacity-50"
                      title="Generate image"
                    >
                      {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4 stroke-[3]" />}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {generationError && (
              <p role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                {generationError}
              </p>
            )}
            
            {creditBalance !== null && creditBalance < currentCreditCost && (
              <p className="mt-4 text-center text-xs text-amber-300">
                Insufficient credits (⚡ {currentCreditCost} needed). <a href="/studio/credits" className="font-bold underline hover:text-[#b9f42e]">Buy more</a>
              </p>
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
      {drawing && activeImage && (
        <DrawToEditModal
          projectId={projectId}
          sourcePath={activeImage}
          blockType={asset.type === "character" ? "character" : "asset"}
          target="asset"
          targetId={asset.id}
          episodeId={episodeId}
          model={model}
          quality={quality}
          title={asset.name}
          close={() => setDrawing(false)}
          onEdited={({ path }) => {
            // A new version, in front of the one it was drawn on — which stays
            // in the gallery, because an edit that walked back is exactly what
            // storyboarding needs.
            setLibraryImages((current) => [path, ...current.filter((image) => image !== path)]);
            setSelected(0);
            setSelectedAttemptId(null);
            setGenerationStatus("Edited image saved as a new version ✓");
            notifyCreditBalanceChanged();
            void reload(true);
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
                                  verification_status: VERIFIED_ASSET.verification_status,
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
// Renders @mentions in a shot prompt as chips that preview the entity's chosen
// reference on hover, so it is obvious which art a shot will actually be built
// from without opening the asset library.
function MentionedPrompt({ text, entities }: { text: string; entities: Entity[] }) {
  const byName = useMemo(() => {
    const index = new Map<string, Entity>();
    for (const entity of entities) index.set(entity.name.trim().toLowerCase(), entity);
    return index;
  }, [entities]);

  // Longest names first so "@Old Picture Frame" is not cut short by "@Old".
  const pattern = useMemo(() => {
    const names = entities
      .map((entity) => entity.name.trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return names.length ? new RegExp(`@(${names.join("|")})`, "gi") : null;
  }, [entities]);

  if (!pattern) return <>{text}</>;
  const parts: Array<string | Entity> = [];
  let cursor = 0;
  for (const match of Array.from(text.matchAll(pattern))) {
    const index = match.index ?? 0;
    const entity = byName.get(match[1].trim().toLowerCase());
    if (!entity) continue;
    if (index > cursor) parts.push(text.slice(cursor, index));
    parts.push(entity);
    cursor = index + match[0].length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));

  return (
    <>
      {parts.map((part, index) => {
        if (typeof part === "string") return <span key={index}>{part}</span>;
        const image = entityPrimaryReference(part);
        return (
          <span key={index} className="group/mention relative inline-block">
            <span className="rounded bg-[#b9f42e]/15 px-1 font-semibold text-[#b9f42e]">@{part.name}</span>
            <span className="pointer-events-none absolute bottom-full left-0 z-30 mb-1 hidden w-40 overflow-hidden rounded-lg border border-white/15 bg-[#1c1c1c] shadow-xl group-hover/mention:block">
              {image
                ? <AssetThumb src={image} />
                : <span className="block px-2 py-3 text-[11px] text-zinc-500">No reference image yet</span>}
              <span className="block truncate px-2 py-1 text-[11px] text-zinc-300">{part.name}</span>
            </span>
          </span>
        );
      })}
    </>
  );
}

/**
 * The gap between two shots, as somewhere to add one.
 *
 * A storyboard is an order, and the thing a writer wants at the point they
 * notice a beat is missing is a shot *there* — not one appended to the end and
 * then dragged fifteen rows up. The button stays out of the way until the gap
 * is hovered, and says which two shots it sits between so the click is never
 * ambiguous.
 */
function InsertShotDivider({ afterNumber, total, persistent, onAskDirector, onWriteMyself }: {
  afterNumber: number;
  total: number;
  /**
   * Always visible, rather than appearing on hover.
   *
   * A gap between two rows is somewhere the eye already goes, so revealing the
   * button there keeps the list quiet. After the last shot there is no gap —
   * only a twelve-pixel strip below the final row — so a hover-only control
   * reads as no control at all, and appending is the most ordinary thing
   * anyone does to a storyboard.
   */
  persistent?: boolean;
  onAskDirector: () => void;
  onWriteMyself: () => void;
}) {
  const [open, setOpen] = useState(false);
  const label = afterNumber === 0
    ? "Add a new shot before shot 1"
    : afterNumber >= total
      ? `Add a new shot after shot ${afterNumber}`
      : `Add a new shot between shot ${afterNumber} and shot ${afterNumber + 1}`;
  const shown = open || persistent;
  return (
    <div className={`group relative flex items-center justify-center ${persistent ? "h-11" : "h-3"}`}>
      <span className={`absolute inset-x-0 h-px transition ${shown ? "bg-[#b9f42e]/40" : "bg-[#b9f42e]/0 group-hover:bg-[#b9f42e]/40"}`} />
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        title={label}
        aria-label={label}
        aria-expanded={open}
        className={persistent
          ? "relative flex items-center gap-1.5 rounded-full border border-[#b9f42e]/30 bg-[#1a1c1b] px-3 py-1.5 text-[11px] font-bold text-[#b9f42e] transition hover:border-[#b9f42e]/70 hover:bg-[#b9f42e]/[0.08]"
          : `relative grid h-6 w-6 place-items-center rounded-full border bg-[#1a1c1b] transition focus-visible:opacity-100 ${open ? "border-[#b9f42e]/50 text-[#b9f42e] opacity-100" : "border-white/10 text-zinc-500 opacity-0 group-hover:border-[#b9f42e]/50 group-hover:text-[#b9f42e] group-hover:opacity-100"}`}
      >
        <Plus className="h-3 w-3" />
        {persistent && <span>Add shot at the end</span>}
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          {/* Two ways to fill a gap, because a beat you can already picture is
              faster to type than to describe, and one you cannot is faster to
              hand to the Director. */}
          <div className="absolute top-7 z-40 w-56 rounded-xl border border-white/10 bg-[#1a1c1b] p-1 shadow-2xl">
            <p className="px-2.5 py-1.5 text-[10px] font-bold text-zinc-500">{label}</p>
            <button
              type="button"
              onClick={() => { setOpen(false); onWriteMyself(); }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-bold text-zinc-200 transition hover:bg-white/[0.06]"
            >
              <Pencil className="h-3.5 w-3.5 text-zinc-400" />
              Write it myself
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); onAskDirector(); }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-bold text-zinc-200 transition hover:bg-white/[0.06]"
            >
              <Bot className="h-3.5 w-3.5 text-[#b9f42e]" />
              Ask the Director
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Storyboard({
  shots,
  entities,
  episodeId,
  projectId,
  cameraDefaults,
  projectStyleDnaValue,
  save,
  reload,
  pendingJobs,
  generationJobs,
  onGenerationStarted,
  onCompose,
}: {
  shots: Shot[];
  entities: Entity[];
  episodeId: string;
  projectId: string;
  cameraDefaults: CameraSettings | null;
  projectStyleDnaValue: StyleDna | null;
  save: (b: unknown) => Promise<void>;
  // Silent when true: swaps the data in place instead of blanking the whole
  // workspace to the first-load spinner, which reads as an unexpected page
  // reload — and, if that refetch then fails, leaves nothing behind at all.
  reload: (silent?: boolean) => Promise<void>;
  // Shots with generation still running, so a cell can say so instead of
  // showing the same empty placeholder it shows when nothing was ever asked for.
  pendingJobs?: { image: Set<string>; video: Set<string> };
  generationJobs: NonNullable<Workspace["production"]>["generationJobs"];
  // A generation started from inside the shot panel — the "Generate" button, not
  // an approved chat proposal — has no proposal to mark pending from. Without
  // this the row only picked up the shimmer once a background poll happened to
  // notice the new job, which for a fast image call could be after it had
  // already finished.
  onGenerationStarted?: (shotId: string, type: "image" | "video") => void;
  // Writes a half-finished instruction into the Director composer. The "+"
  // between two rows knows which shots it sits between; the user should only
  // have to type the scene, not work out how to describe the position.
  onCompose?: (draft: string, chip: string) => void;
}) {
  // The gap a hand-written shot goes into, as a 1-based "after this shot"
  // number. Null when the form is closed.
  const [adding, setAdding] = useState<number | null>(null);
  // Reordering is a drag, but the row is full of text to select, so the row is
  // only draggable while the handle is held.
  const [dragArmedId, setDragArmedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [rowMenu, setRowMenu] = useState<string | null>(null);
  const [busyShot, setBusyShot] = useState<string | null>(null);
  const [shotError, setShotError] = useState<string | null>(null);
  // The order as dragged, held only until the server's copy arrives. Waiting
  // for the round trip made the row snap back under the cursor before landing
  // in its new place.
  const [localOrder, setLocalOrder] = useState<Shot[] | null>(null);
  const [media, setMedia] = useState<{
    shot: Shot;
    type: "image" | "video";
  } | null>(null);
  const [expandedShots, setExpandedShots] = useState<Set<string>>(new Set());
  // The Edit button had no handler at all, so a prompt could only be changed
  // from the media workspace. Editing here uses the same mention autocomplete
  // as Director chat, and the mentions decide the shot's cast on save.
  const [editingShot, setEditingShot] = useState<string | null>(null);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [savingShot, setSavingShot] = useState(false);

  const [castPicker, setCastPicker] = useState<string | null>(null);
  const [castQuery, setCastQuery] = useState("");

  // Picking assets by hand marks the shot curated, so the prompt-derived list
  // never silently replaces the choice on the next render.
  const toggleShotEntity = async (shot: Shot, currentIds: string[], entityId: string) => {
    const next = currentIds.includes(entityId)
      ? currentIds.filter((id) => id !== entityId)
      : [...currentIds, entityId];
    await save({
      action: "saveShot",
      episodeId,
      shot: {
        id: shot.id,
        title: shot.title,
        prompt: shot.prompt,
        duration_seconds: shot.duration_seconds,
        aspect_ratio: shot.aspect_ratio,
        resolution: shot.resolution,
        entityIds: next,
        metadata: { ...(shot.metadata || {}), cast_curated: true },
      },
    });
    await reload(true);
  };

  const saveShotPrompt = async (shot: Shot) => {
    setSavingShot(true);
    try {
      await save({
        action: "saveShot",
        episodeId,
        shot: {
          id: shot.id,
          title: shot.title,
          prompt: draftPrompt,
          duration_seconds: shot.duration_seconds,
          aspect_ratio: shot.aspect_ratio,
          resolution: shot.resolution,
          entityIds: findMentionedEntityIds(draftPrompt, entities),
        },
      });
      setEditingShot(null);
      await reload(true);
    } finally {
      setSavingShot(false);
    }
  };
  // The dragged order stands in for the server's until the server catches up.
  // Derived rather than cleared in an effect: once the saved order matches, the
  // optimistic copy is simply no longer the one that differs, so nothing has to
  // remember to throw it away.
  const order = useMemo(() => {
    const serverKey = shots.map((shot) => shot.id).join(",");
    if (!localOrder || localOrder.length !== shots.length) return shots;
    const localKey = localOrder.map((shot) => shot.id).join(",");
    if (localKey === serverKey) return shots;
    // Only while it holds the same shots — an added or deleted shot makes the
    // dragged order stale, and the server's is the truth.
    const sameShots = localOrder.every((shot) => shots.some((item) => item.id === shot.id));
    return sameShots ? localOrder : shots;
  }, [localOrder, shots]);

  /**
   * Put a shot at a given position and renumber everything around it.
   *
   * The new order is shown immediately and the refetch is silent. Reloading
   * the workspace the loud way unmounts it to the first-load spinner — which
   * looks exactly like the page reloading — and if that refetch fails it
   * clears the workspace entirely, so one dropped request took the storyboard
   * down and nothing brought it back.
   */
  const moveShotTo = async (shotId: string, targetIndex: number) => {
    const ids = order.map((item) => item.id);
    const from = ids.indexOf(shotId);
    if (from < 0 || from === targetIndex || targetIndex < 0 || targetIndex >= ids.length) return;
    const next = ids.filter((id) => id !== shotId);
    next.splice(targetIndex, 0, shotId);
    const reordered = next
      .map((id) => order.find((item) => item.id === id))
      .filter((item): item is Shot => Boolean(item))
      .map((item, index) => ({ ...item, order_index: index }));
    setLocalOrder(reordered);
    setShotError(null);
    setBusyShot(shotId);
    try {
      await save({ action: "reorderShots", ids: next });
      await reload(true);
    } catch (error) {
      // Put the rows back where they were rather than leaving the screen
      // showing an order the database does not have.
      setLocalOrder(null);
      setShotError(error instanceof Error ? error.message : "Could not reorder the shots.");
    } finally {
      setBusyShot(null);
    }
  };

  const removeShot = async (shot: Shot, number: number) => {
    // Deleting a shot throws away its keyframe and its rendered clip, both of
    // which were paid for, and there is no undo.
    if (!window.confirm(`Delete shot ${number} — "${shot.title}"? Its keyframe and video are deleted with it and cannot be recovered.`)) return;
    setRowMenu(null);
    setShotError(null);
    setBusyShot(shot.id);
    try {
      await save({ action: "deleteShot", shotId: shot.id, episodeId });
      setLocalOrder(null);
      await reload(true);
    } catch (error) {
      setShotError(error instanceof Error ? error.message : "Could not delete the shot.");
    } finally {
      setBusyShot(null);
    }
  };

  // The instruction the Director needs, written from the gap that was clicked.
  // The wording comes from the same module that parses it back, so the button
  // cannot produce a sentence the Director does not understand.
  const composeInsert = (afterNumber: number) => {
    onCompose?.(buildInsertShotDraft(afterNumber, order.length), `New Shot ${afterNumber + 1}`);
  };

  const activeMedia = media
    ? { ...media, shot: shots.find((shot) => shot.id === media.shot.id) || media.shot }
    : null;
  return (
    <div className="space-y-4 lg:space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 lg:gap-3">
        <div className="no-scrollbar flex gap-2 overflow-x-auto [&>*]:shrink-0 [&>*]:whitespace-nowrap lg:flex-wrap lg:overflow-x-visible lg:[&>*]:whitespace-normal">
          <Pill>▯ {"9:16"}</Pill>
          <Pill>◉ Cinematic</Pill>
          <Pill>↗ 720p</Pill>
          <button className="shrink-0 whitespace-nowrap rounded-lg bg-[#222423] px-2.5 py-1.5 text-[12px] text-zinc-300 lg:px-3 lg:py-2 lg:text-sm">
            Batch download
          </button>
        </div>
        <button
          onClick={() => setAdding(order.length)}
          className="shrink-0 whitespace-nowrap rounded-lg bg-[#b9f42e] px-3.5 py-2 text-[12px] font-bold text-black transition duration-press ease-out active:scale-[0.97] lg:px-4 lg:text-sm"
        >
          + Add shot
        </button>
      </div>
      {adding !== null && (
        <ShotForm
          entities={entities}
          episodeId={episodeId}
          afterNumber={adding}
          total={order.length}
          save={save}
          close={() => setAdding(null)}
          reload={reload}
        />
      )}
      {shotError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/[0.07] p-3 text-sm text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{shotError}</span>
          <button type="button" onClick={() => setShotError(null)} aria-label="Dismiss error" className="rounded p-0.5 text-red-300/70 hover:text-red-200">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div className="lg:overflow-x-auto">
        <div className="lg:min-w-[830px]">
          <div className="hidden grid-cols-[42px_minmax(210px,1.6fr)_150px_170px_170px] gap-3 px-4 pb-3 t-caption text-zinc-400 lg:grid">
            <span>#</span>
            <span>Description</span>
            <span>Assets</span>
            <span>Images</span>
            <span>Videos</span>
          </div>
          <div className="space-y-3">
            {order.map((shot, index) => {
              // A cast the user set by hand is the truth and is never
              // second-guessed. Otherwise it is read from the shot's own prompt,
              // the same rule generation follows, which also corrects shots
              // stored before that rule existed with the whole project in them.
              const curated = Boolean((shot.metadata as { cast_curated?: boolean } | undefined)?.cast_curated);
              const castIds = curated
                ? (shot.referenced_entities || [])
                : findShotCastEntityIds(shot.prompt || "", entities, shot.referenced_entities || []);
              const linked = castIds.length
                ? castIds.map((id) => entities.find((entity) => entity.id === id)).filter((entity): entity is Entity => Boolean(entity))
                : entities.filter((e) => shot.referenced_entities?.includes(e.id));
              const isExpanded = expandedShots.has(shot.id);
              const toggleExpanded = () => {
                setExpandedShots((prev) => {
                  const next = new Set(prev);
                  if (next.has(shot.id)) next.delete(shot.id);
                  else next.add(shot.id);
                  return next;
                });
              };
              // A render running for this shot, of either kind. The cell that
              // holds the output says so, but the row is what the eye follows
              // down a fifteen-shot storyboard, so the row has to say it too.
              const renderingImage = Boolean(pendingJobs?.image.has(shot.id));
              const renderingVideo = Boolean(pendingJobs?.video.has(shot.id));
              const rendering = renderingImage || renderingVideo;
              return (
                <Fragment key={shot.id}>
                <InsertShotDivider afterNumber={index} total={order.length} onAskDirector={() => composeInsert(index)} onWriteMyself={() => setAdding(index)} />
                <article
                  aria-busy={rendering || undefined}
                  draggable={dragArmedId === shot.id}
                  onDragStart={(event) => {
                    setDraggingId(shot.id);
                    event.dataTransfer.effectAllowed = "move";
                    // Firefox will not start a drag without payload.
                    event.dataTransfer.setData("text/plain", shot.id);
                  }}
                  onDragEnd={() => { setDraggingId(null); setDropIndex(null); setDragArmedId(null); }}
                  onDragOver={(event) => {
                    if (!draggingId || draggingId === shot.id) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    // dragover fires continuously while the cursor is held over
                    // a row, so this must not re-render on every event.
                    setDropIndex((current) => current === index ? current : index);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const moved = draggingId || event.dataTransfer.getData("text/plain");
                    setDropIndex(null);
                    setDraggingId(null);
                    setDragArmedId(null);
                    if (moved) void moveShotTo(moved, index);
                  }}
                  className={`relative grid grid-cols-[34px_minmax(0,1fr)_minmax(0,1fr)] items-start gap-2 rounded-xl border bg-[#1a1c1b] p-2.5 transition lg:gap-3 lg:p-3 lg:grid-cols-[42px_minmax(210px,1.6fr)_150px_170px_170px] ${rendering ? "border-[#b9f42e]/40 ring-1 ring-[#b9f42e]/20" : dropIndex === index ? "border-[#b9f42e] ring-1 ring-[#b9f42e]/40" : "border-white/10"} ${draggingId === shot.id ? "opacity-40" : ""} ${busyShot === shot.id ? "pointer-events-none opacity-60" : ""}`}
                >
                  {rendering && (
                    <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden rounded-t-xl">
                      <span className="block h-full w-full -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-[#b9f42e] to-transparent" />
                    </span>
                  )}
                  <div className="flex flex-col items-center gap-3">
                    <span className={`grid h-8 w-8 place-items-center rounded-lg font-bold text-[#b9f42e] ${rendering ? "bg-[#b9f42e]/25" : "bg-[#b9f42e]/12"}`}>
                      {index + 1}
                    </span>
                    {rendering ? (
                      <span className="flex flex-col items-center gap-1 text-[#b9f42e]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span className="text-[8px] font-bold">
                          {renderingImage && renderingVideo ? "Both" : renderingImage ? "Image" : "Video"}
                        </span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        title="Drag to reorder"
                        aria-label={`Reorder shot ${index + 1}. Press the up or down arrow key to move it.`}
                        onMouseDown={() => setDragArmedId(shot.id)}
                        onMouseUp={() => setDragArmedId(null)}
                        onBlur={() => setDragArmedId(null)}
                        // Reordering by keyboard, so the storyboard is not
                        // rearrangeable only with a mouse.
                        onKeyDown={(event) => {
                          if (event.key === "ArrowUp" && index > 0) {
                            event.preventDefault();
                            void moveShotTo(shot.id, index - 1);
                          }
                          if (event.key === "ArrowDown" && index < order.length - 1) {
                            event.preventDefault();
                            void moveShotTo(shot.id, index + 1);
                          }
                        }}
                        className="cursor-grab rounded p-1 text-zinc-600 transition hover:bg-white/[0.06] hover:text-zinc-300 active:cursor-grabbing"
                      >
                        <GripVertical className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <div className="relative mt-auto">
                      <button
                        type="button"
                        onClick={() => setRowMenu((current) => current === shot.id ? null : shot.id)}
                        aria-label={`More actions for shot ${index + 1}`}
                        aria-expanded={rowMenu === shot.id}
                        className="rounded p-1 text-zinc-600 transition hover:bg-white/[0.06] hover:text-zinc-300"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                      {rowMenu === shot.id && (
                        <>
                          <span className="fixed inset-0 z-30" onClick={() => setRowMenu(null)} />
                          <div className="absolute left-6 top-0 z-40 w-36 rounded-xl border border-white/10 bg-[#1a1c1b] p-1 shadow-2xl">
                            <button
                              type="button"
                              onClick={() => void removeShot(shot, index + 1)}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-bold text-red-400 transition hover:bg-red-500/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2 lg:col-span-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-[#b9f42e]/15 px-1.5 py-0.5 text-xs font-bold text-[#b9f42e]">
                        {shot.duration_seconds}s
                      </span>
                      <p className="text-[13px] font-bold leading-tight lg:text-base">{shot.title}</p>
                    </div>
                    {editingShot === shot.id ? (
                      <div className="mt-3 space-y-2">
                        <EntityMentionInput
                          value={draftPrompt}
                          onChange={setDraftPrompt}
                          entities={entities}
                          ariaLabel={`Prompt for ${shot.title}`}
                          placeholder="Describe the shot. Type @ to reference a character, scene, or prop."
                          className="min-h-[140px] w-full rounded-lg border border-white/10 bg-black/30 p-2.5 text-sm leading-6 text-zinc-200 outline-none focus:border-[#b9f42e]/40"
                        />
                        <p className="text-[11px] text-zinc-500">Mentioned assets become this shot&apos;s references.</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={savingShot}
                            onClick={() => saveShotPrompt(shot)}
                            className="rounded bg-[#b9f42e] px-3 py-1.5 text-[11px] font-bold text-black hover:bg-[#a6de25] disabled:opacity-50"
                          >
                            {savingShot ? "Saving…" : "Save prompt"}
                          </button>
                          <button
                            type="button"
                            disabled={savingShot}
                            onClick={() => setEditingShot(null)}
                            className="rounded border border-white/10 px-3 py-1.5 text-[11px] font-medium text-zinc-400 hover:bg-white/5 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="mt-2 text-[12.5px] leading-5 text-zinc-300 lg:mt-3 lg:text-sm lg:leading-6">
                          {/* A div, not a p: the mention chips carry a hover
                              preview containing block elements, which is
                              invalid inside a paragraph and breaks hydration. */}
                          <div className={isExpanded ? "" : "line-clamp-3"}>
                            {shot.prompt
                              ? <MentionedPrompt text={shot.prompt} entities={entities} />
                              : "Add a detailed prompt with the visual direction, camera framing, movement and continuity for this shot."}
                          </div>
                          {shot.prompt && shot.prompt.length > 130 && (
                            <button
                              onClick={toggleExpanded}
                              className="mt-1 text-[11px] font-bold text-[#b9f42e] hover:underline"
                            >
                              {isExpanded ? "Show less" : "Read more"}
                            </button>
                          )}
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => { setDraftPrompt(shot.prompt || ""); setEditingShot(shot.id); }}
                            className="text-xs font-semibold text-zinc-300 hover:text-white"
                          >
                            ✎ Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setMedia({ shot, type: "image" })}
                            className="text-xs font-semibold text-[#b9f42e] hover:underline"
                          >
                            ↻ Redo
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="col-start-2 col-span-2 flex flex-wrap content-start gap-2 lg:col-auto lg:col-span-1 lg:col-start-auto">
                    {linked.map((entity) => (
                      <div key={entity.id} className="group/asset relative w-[62px]">
                        <AssetImage src={entityPrimaryReference(entity)} />
                        <button
                          type="button"
                          onClick={() => toggleShotEntity(shot, castIds, entity.id)}
                          className="absolute right-0.5 top-0.5 hidden rounded bg-black/75 px-1 text-[10px] text-white group-hover/asset:block"
                          aria-label={`Remove ${entity.name} from this shot`}
                        >
                          ×
                        </button>
                        <p className="mt-1 truncate text-[10px] text-zinc-400">
                          {entity.name}
                        </p>
                      </div>
                    ))}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => { setCastPicker(castPicker === shot.id ? null : shot.id); setCastQuery(""); }}
                        className="grid h-14 w-14 place-items-center rounded-full border border-dashed border-white/20 text-zinc-500 hover:border-[#b9f42e] hover:text-[#b9f42e]"
                        aria-label="Add an asset to this shot"
                      >
                        +
                      </button>
                      {castPicker === shot.id && (
                        <div className="absolute left-0 top-16 z-40 w-64 rounded-xl border border-white/10 bg-[#1c1c1c] p-2 shadow-2xl">
                          <input
                            value={castQuery}
                            onChange={(event) => setCastQuery(event.target.value)}
                            placeholder="Search subjects"
                            autoFocus
                            className="mb-2 w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-[12px] text-zinc-200 outline-none focus:border-[#b9f42e]/40"
                          />
                          <div className="max-h-64 space-y-0.5 overflow-y-auto">
                            {entities
                              .filter((entity) => !castQuery.trim() || entity.name.toLowerCase().includes(castQuery.trim().toLowerCase()))
                              .map((entity) => {
                                const active = castIds.includes(entity.id);
                                return (
                                  <button
                                    key={entity.id}
                                    type="button"
                                    onClick={() => toggleShotEntity(shot, castIds, entity.id)}
                                    className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-white/5"
                                  >
                                    <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] font-semibold ${active ? "border-[#b9f42e] bg-[#b9f42e] text-black" : "border-white/25 text-transparent"}`}>✓</span>
                                    <span className="block h-8 w-8 shrink-0 overflow-hidden rounded">
                                      <AssetThumb src={entityPrimaryReference(entity)} className="block h-full w-full object-cover" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-[12px] text-zinc-200">{entity.name}</span>
                                      <span className="block text-[10px] capitalize text-zinc-500">{entity.type}</span>
                                    </span>
                                  </button>
                                );
                              })}
                            {!entities.length && <p className="px-2 py-3 text-[11px] text-zinc-500">No assets in this project yet.</p>}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="relative group col-start-2 lg:col-start-auto">
                    <button
                      onClick={() => setMedia({ shot, type: "image" })}
                      className="w-full overflow-hidden rounded-lg bg-[#292b2a] text-left transition hover:ring-2 hover:ring-[#b9f42e]"
                    >
                      <Preview
                        src={shot.keyframe_image}
                        label={renderingImage ? "Generating image…" : "Reference image"}
                        busy={renderingImage}
                        aspectRatio={shot.aspect_ratio || "9:16"}
                      />
                      <div className={`flex flex-col gap-1 border-t border-white/10 px-2 py-2 text-xs ${renderingImage ? "text-[#b9f42e]" : "text-zinc-400"}`}>
                        <div className="flex items-center justify-between">
                          <span>{renderingImage ? "Generating…" : "Image reference"}</span>
                          {shot.keyframe_image && (
                            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold  ${shot.is_trusted_provider_asset || (typeof shot.metadata === "object" && shot.metadata !== null && "byteplus_asset_id" in shot.metadata) ? "bg-[#b9f42e]/20 text-[#b9f42e]" : "bg-white/10 text-zinc-400"}`}>
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
                              await reload(true);
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
                    className="col-start-3 overflow-hidden rounded-lg bg-[#292b2a] text-left transition hover:ring-2 hover:ring-[#b9f42e] lg:col-start-auto"
                  >
                    <Preview src={shot.video_url} label={renderingVideo ? "Generating video…" : "Generated video"} busy={renderingVideo} type="video" aspectRatio={shot.aspect_ratio || "9:16"} />
                    <div className={`border-t border-white/10 px-1.5 py-1.5 text-[11px] lg:px-2 lg:py-2 lg:text-xs ${renderingVideo ? "text-[#b9f42e]" : "text-zinc-400"}`}>
                      {renderingVideo
                        ? "Generating…"
                        : shot.video_status === "completed"
                        ? "Video ready"
                        : "Awaiting output"}
                    </div>
                  </button>
                </article>
                </Fragment>
              );
            })}
            {/* The gap after the last shot, so appending reads as the same
                gesture as inserting rather than a different button elsewhere. */}
            {order.length > 0 && (
              <InsertShotDivider afterNumber={order.length} total={order.length} persistent onAskDirector={() => composeInsert(order.length)} onWriteMyself={() => setAdding(order.length)} />
            )}
          </div>
          {order.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center text-zinc-500">
              Add a shot to begin your visual storyboard.
            </div>
          )}

          {/* The whole-cut thread, under the board rather than inside a shot:
              pacing, music, and running time are notes about the edit, and
              filing them against whichever shot happened to be open is where
              nobody looks for them afterwards. */}
          <div className="mt-6">
            <RevisionNotes projectId={projectId} target={{ type: "project" }} title="Project revision notes" defaultOpen={false} />
          </div>
        </div>
      </div>
      {activeMedia && (
        <ShotMediaWorkspace
          media={activeMedia}
          entities={entities}
          shots={shots}
          cameraDefaults={cameraDefaults}
          projectStyleDnaValue={projectStyleDnaValue}
          generationJobs={generationJobs}
          projectId={projectId}
          close={() => setMedia(null)}
          save={save}
          reload={reload}
          onGenerationStarted={onGenerationStarted}
        />
      )}
    </div>
  );
}
function ShotMediaWorkspace({
  media,
  entities,
  shots,
  cameraDefaults,
  projectStyleDnaValue,
  generationJobs,
  projectId,
  close,
  save,
  reload,
  onGenerationStarted,
}: {
  media: { shot: Shot; type: "image" | "video" };
  entities: Entity[];
  shots?: Shot[];
  cameraDefaults: CameraSettings | null;
  projectStyleDnaValue: StyleDna | null;
  generationJobs: NonNullable<Workspace["production"]>["generationJobs"];
  projectId: string;
  close: () => void;
  save: (b: unknown) => Promise<void>;
  reload: (silent?: boolean) => Promise<void>;
  onGenerationStarted?: (shotId: string, type: "image" | "video") => void;
}) {
  const shotIndex = (shots || []).findIndex((s) => s.id === media.shot.id);
  const shotNumber = shotIndex >= 0 ? shotIndex + 1 : 1;

  // The video panel is filming, not framing: it starts from the shot's video
  // prompt when there is one. Seeding both panels from the image paragraph is
  // why the video box still showed the old still-frame text after the beats
  // were written — and why regenerating from it filmed the old prompt.
  const [prompt, setPrompt] = useState(
    media.type === "video" ? videoPromptFor(media.shot) : media.shot.prompt || "",
  );
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [model, setModel] = useState<string>(
    media.type === "image" ? imageGenerationModels[0].id : videoGenerationModels[0].id,
  );
  const savedVideoMode = media.shot.metadata?.video_generation && typeof media.shot.metadata.video_generation === "object" && "generation_mode" in media.shot.metadata.video_generation ? (media.shot.metadata.video_generation as { generation_mode?: string }).generation_mode : null;
  const [videoInputMode, setVideoInputMode] = useState<"keyframe" | "multi_image">(savedVideoMode === "multi_image" ? "multi_image" : "keyframe");
  const [startFrame, setStartFrame] = useState<string | null>(media.type === "video" ? media.shot.keyframe_image : null);
  const [endFrame, setEndFrame] = useState<string | null>(null);
  // The finished clip of the shot before this one, which Seedance can continue
  // from so motion and lighting carry across the cut.
  const previousShotClip = useMemo(() => {
    if (media.type !== "video" || shotIndex <= 0) return null;
    for (let index = shotIndex - 1; index >= 0; index -= 1) {
      const candidate = (shots || [])[index];
      if (candidate?.video_url) return { path: candidate.video_url, number: index + 1 };
    }
    return null;
  }, [media.type, shotIndex, shots]);
  // Pre-filled from the previous clip so a manual render continues by default,
  // and removable so a hard cut does not have to inherit the shot before it.
  const [videoReferencePaths, setVideoReferencePaths] = useState<string[]>(
    media.type === "video" && previousShotClip ? [previousShotClip.path] : [],
  );
  const savedAspectRatio = media.shot.metadata?.video_generation && typeof media.shot.metadata.video_generation === "object" && "aspect_ratio" in media.shot.metadata.video_generation ? (media.shot.metadata.video_generation as { aspect_ratio?: string }).aspect_ratio : null;
  const savedResolution = media.shot.metadata?.video_generation && typeof media.shot.metadata.video_generation === "object" && "resolution" in media.shot.metadata.video_generation ? (media.shot.metadata.video_generation as { resolution?: string }).resolution : null;
  const savedAudio = media.shot.metadata?.video_generation && typeof media.shot.metadata.video_generation === "object" && "audio_enabled" in media.shot.metadata.video_generation ? Boolean((media.shot.metadata.video_generation as { audio_enabled?: boolean }).audio_enabled) : true;
  const [aspectRatio, setAspectRatio] = useState<string>(savedAspectRatio || media.shot.aspect_ratio || "9:16");
  const [resolution, setResolution] = useState<string>(savedResolution || media.shot.resolution || "720p");
  const [audioEnabled, setAudioEnabled] = useState<boolean>(savedAudio);
  const [durationSeconds, setDurationSeconds] = useState<number>(Number(media.shot.duration_seconds || 4));
  // Switching to a model with a shorter ceiling must pull the duration down.
  // The provider would otherwise truncate the clip while the user is charged
  // for the length they picked.
  useEffect(() => {
    const max = videoModelMaxDuration(model);
    setDurationSeconds((current) => (current > max ? max : current));
  }, [model]);
  const [busy, setBusy] = useState(false);
  // Opt-in here too, and for the same reason as the entity panels: off, the
  // shot prompt reaches the model exactly as written. On, the dial is freely
  // editable — a shot is where the director actually wants the choice — and
  // the package is remembered per shot once one has been generated with it.
  const storedShotCamera = media.shot.metadata?.camera_override;
  const [cameraEnabled, setCameraEnabled] = useState(isCameraSettings(storedShotCamera) || Boolean(cameraDefaults));
  const [cameraSettings, setCameraSettings] = useState<CameraSettings>(() => resolveCameraSettings({
    block: "shot",
    override: storedShotCamera,
    projectDefaults: cameraDefaults,
  }));
  // A shot can be shot under its own look — a flashback, a dream, one sequence
  // graded apart from the rest. Off, it follows the project, so the episode
  // stays consistent unless someone deliberately breaks it for one frame.
  const storedShotStyleOverride = normalizeStyleDna(media.shot.metadata?.style_dna_override);
  const [styleOverrideEnabled, setStyleOverrideEnabled] = useState(Boolean(storedShotStyleOverride));
  const [styleOverride, setStyleOverride] = useState<StyleDna | null>(storedShotStyleOverride ?? projectStyleDnaValue);
  const effectiveShotStyleDna = styleOverrideEnabled ? styleOverride : projectStyleDnaValue;

  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState<string | null>(null);
  const [verifyingReferencePath, setVerifyingReferencePath] = useState<string | null>(null);
  const [verifiedReferencePaths, setVerifiedReferencePaths] = useState<Set<string>>(() => new Set());
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  useEffect(() => {
    // getUser touches the auth lock, which supabase may steal from a stalled
    // refresh; an unhandled rejection here would crash the workspace.
    createClient().auth.getUser().then(({ data }) => {
      if (data.user) getUserCredits(data.user.id).then(setCreditBalance).catch(() => {});
    }).catch(() => {});
  }, []);
  const [picker, setPicker] = useState(false);
  const [referenceSourcePicker, setReferenceSourcePicker] = useState(false);
  const [referenceTarget, setReferenceTarget] = useState<"references" | "start" | "end" | "motion">("references");
  const [references, setReferences] = useState<string[]>(() => {
    if (media.shot.referenced_entities && media.shot.referenced_entities.length > 0) {
      // One image per entity — its chosen reference. Seeding every image an
      // entity owns filled the eight-reference budget with several angles of
      // one character and pushed the rest of the shot's cast out.
      return entities
        .filter((e) => media.shot.referenced_entities!.includes(e.id))
        .map((e) => entityPrimaryReference(e))
        .filter((url): url is string => typeof url === "string" && url.length > 0);
    }
    return [];
  });
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>(media.shot.referenced_entities || []);
  // "Reference 2" says nothing; "@Lena" is what the user actually needs to
  // tell one square thumbnail from the next. The @mention hover preview in the
  // prompt text already resolves a reference this way — this labels the
  // strip's own thumbnails the same way instead of a generic ordinal.
  const referenceLabel = (path: string) => {
    const entity = entities.find((item) => entityPrimaryReference(item) === path);
    return entity ? `@${entity.name}` : "Reference image";
  };
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
    type: string;
    status: "generating" | "completed" | "failed";
    prompt: string;
    model: string;
    referenceImages: string[];
    videoUrl: string | null;
    error: string | null;
    createdAt: number;
    completedAt: string | null;
    // How this generation was actually configured. Without it the panel opened
    // on its own defaults — Key Frame, start frame = the shot's keyframe — and
    // described a different setup from the one that produced what is on screen.
    generationMode: "keyframe" | "multi_image" | null;
    startFrame: string | null;
    endFrame: string | null;
    recordedFrames: boolean;
    videoReferencePaths: string[];
    cameraSettingsUsed: CameraSettings | null;
    styleDnaUsed: StyleDna | null;
    styleReferenceImages: string[];
  };
  const [genHistory, setGenHistory] = useState<GenEntry[]>(() => {
    const initial: GenEntry[] = [];
    if (source) {
      initial.push({
        id: "original",
        type: media.type,
        status: "completed",
        prompt: media.shot.prompt || "",
        model: media.type === "image" ? imageGenerationModels[0].id : videoGenerationModels[0].id,
        referenceImages: [],
        videoUrl: source,
        error: null,
        createdAt: Date.now() - 1,
        completedAt: null,
        generationMode: null,
        startFrame: null,
        endFrame: null,
        recordedFrames: false,
        videoReferencePaths: [],
        cameraSettingsUsed: null,
        styleDnaUsed: null,
        styleReferenceImages: [],
      });
    }
    return initial;
  });
  const [activeGenId, setActiveGenId] = useState<string | null>(source ? "original" : null);
  const activeGen = genHistory.find((g) => g.id === activeGenId) || null;

  // Selecting a generation shows what produced it. The panel holds the settings
  // for the next render, so without this it kept describing a different
  // generation than the one on screen — and the reference strip showed images
  // that had nothing to do with the picture being viewed.
  useEffect(() => {
    setPromptExpanded(false);
    if (!activeGen) return;
    if (activeGen.prompt?.trim()) setPrompt(activeGen.prompt);
    if (activeGen.referenceImages?.length) setReferences(activeGen.referenceImages);
    // The clip it continued from, so a regeneration keeps the continuity — or
    // drops it deliberately, rather than by not knowing it was there.
    if (activeGen.videoReferencePaths) setVideoReferencePaths(activeGen.videoReferencePaths);
    if (activeGen.model?.trim()) setModel(activeGen.model);
    // A chat-driven run stores its configuration on the job, not on the shot, so
    // this is the only place the panel can learn that the clip was a multi-image
    // continuation rather than the keyframe render it defaults to.
    if (activeGen.generationMode) setVideoInputMode(activeGen.generationMode);
    if (activeGen.generationMode === "keyframe" && activeGen.recordedFrames) {
      setStartFrame(activeGen.startFrame ?? null);
      setEndFrame(activeGen.endFrame ?? null);
    }
    // Keyed on the selection alone: re-running when the entry's own fields
    // settle would fight the user's edits mid-typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGenId]);

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
        // The project snapshot is intentionally capped, so it can contain only
        // the newest job for an older shot. Always fetch this shot's complete
        // history and merge the snapshot as a fallback for brief RLS/session
        // refresh races. keyframe_image/video_url remains only the active pointer.
        const serverJobs = (generationJobs || []).filter((job) => job.shot_id === media.shot.id && job.type === media.type);
        const { data: freshJobs, error: historyError } = await createClient()
          .from("creator_generation_jobs")
          .select("*")
          .eq("shot_id", media.shot.id)
          .eq("type", media.type)
          .order("created_at", { ascending: false });

        if (historyError && serverJobs.length === 0) throw historyError;
        if (!active) return;
        const jobsById = new Map<string, (typeof serverJobs)[number]>();
        for (const job of [...serverJobs, ...((freshJobs || []) as typeof serverJobs)]) jobsById.set(job.id, job);
        const dbJobs = Array.from(jobsById.values()).sort((a, b) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );

        const entityAssetMap = new Map<string, string>();
        for (const entity of entities) {
          const meta = entity.metadata && typeof entity.metadata === "object" ? entity.metadata as Record<string, unknown> : {};
          const assetId = typeof meta.byteplus_asset_id === "string" ? meta.byteplus_asset_id.trim() : null;
          const primaryRef = entityPrimaryReference(entity);
          if (assetId && primaryRef) {
            const clean = assetId.replace(/^asset:\/\//i, "").trim();
            entityAssetMap.set(clean, primaryRef);
            entityAssetMap.set(`asset://${clean}`, primaryRef);
          }
        }

        const entries: GenEntry[] = dbJobs.map((job) => {
          const settingsObj = job.settings && typeof job.settings === "object" ? job.settings as Record<string, unknown> : {};
          const rawRefs = Array.isArray(settingsObj.resolvedReferencePaths) && (settingsObj.resolvedReferencePaths as string[]).length
            ? (settingsObj.resolvedReferencePaths as string[])
            : Array.isArray(settingsObj.referenceImages) && (settingsObj.referenceImages as string[]).length
              ? (settingsObj.referenceImages as string[])
              : Array.isArray(job.input_images) ? (job.input_images as string[]) : [];

          const resolvedRefs = rawRefs.map((ref) => {
            if (!ref) return ref;
            const clean = ref.replace(/^asset:\/\//i, "").trim();
            return entityAssetMap.get(clean) || entityAssetMap.get(ref) || ref;
          }).filter((ref) => !/^asset:\/\//i.test(ref) && !/^asset-[a-z0-9-]+$/i.test(ref));

          return {
            id: job.id,
            type: job.type || media.type,
            status: (job.status === "completed" ? "completed" : job.status === "failed" || job.status === "cancelled" ? "failed" : "generating") as "generating" | "completed" | "failed",
            prompt: job.prompt || "",
            model: job.model || "",
            referenceImages: resolvedRefs,
            videoUrl: job.result_url || null,
            error: job.error || null,
            createdAt: new Date(job.created_at || 0).getTime(),
            completedAt: job.completed_at || null,
            ...readGenerationSettings(job.settings),
          };
        });

        if (source && !entries.some((e) => e.videoUrl === source)) {
          entries.push({
            id: "original",
            type: media.type,
            status: "completed",
            prompt: media.shot.prompt || "",
            model: media.type === "image" ? imageGenerationModels[0].id : videoGenerationModels[0].id,
            referenceImages: [],
            videoUrl: source,
            error: null,
            createdAt: 0,
            completedAt: null,
            generationMode: null,
            startFrame: null,
            endFrame: null,
            recordedFrames: false,
            videoReferencePaths: [],
            cameraSettingsUsed: null,
            styleDnaUsed: null,
            styleReferenceImages: [],
          });
        }

        setGenHistory(entries);
        if (entries.length > 0) {
          const chosenEntry = entries.find((g) => g.videoUrl && g.videoUrl === currentActiveChosenSource);
          const firstCompleted = entries.find((g) => g.status === "completed");
          const defaultTarget = chosenEntry || firstCompleted || entries[0];

          setActiveGenId((current) => {
            if (current && entries.some((g) => g.id === current)) return current;
            return defaultTarget.id;
          });

          if (defaultTarget.status === "failed" && !chosenEntry) {
            setGenerationError(defaultTarget.error);
          } else {
            setGenerationError(null);
          }
        }

        // Resume polling for any in-progress job
        const pendingJobs = entries.filter((e) => e.status === "generating");
        for (const pJob of pendingJobs) {
          if (pJob.type === "video") {
            pollJobStatus(pJob.id);
          }
        }
      } catch (err) {
        console.warn("Could not load shot generation history:", err);
      }
    }

    loadJobs();
    return () => { active = false; };
  }, [media.shot.id, media.type, generationJobs]);

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
    setGenerationError(null);
    setGenerationStatus(null);
    // Marks the storyboard row busy the moment the button is pressed rather
    // than after the request round-trips — an approved chat proposal gets this
    // for free from the proposal handler, and a manual generate had no
    // equivalent until now, so the shimmer only ever caught up after the fact,
    // sometimes after a fast image call had already finished.
    onGenerationStarted?.(media.shot.id, media.type);

    const genId = `gen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newEntry: GenEntry = {
      id: genId,
      type: media.type,
      status: "generating",
      prompt,
      model,
      referenceImages: [...videoReferenceImages],
      generationMode: media.type === "video" ? videoInputMode : null,
      startFrame,
      endFrame,
      recordedFrames: media.type === "video",
      videoReferencePaths: [...videoReferencePaths],
      cameraSettingsUsed: media.type === "image" && cameraEnabled ? cameraSettings : null,
      styleDnaUsed: media.type === "image" ? effectiveShotStyleDna : null,
      styleReferenceImages: media.type === "image" ? styleReferenceImagesOf(effectiveShotStyleDna) : [],
      videoUrl: null,
      error: null,
      createdAt: Date.now(),
      completedAt: null,
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
        setGenerationStatus("Submitting image generation job…");
        const response = await fetch(`/api/studio/projects/${projectId}/images`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target: "shot", targetId: media.shot.id, prompt, model, referenceImages: references, mentionedEntityIds, aspectRatio, quality, ...(cameraEnabled ? { cameraSettings } : {}), ...(styleOverrideEnabled ? { styleDna: styleOverride } : {}) }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Image generation failed");
        notifyCreditBalanceChanged(typeof body.creditBalance === "number" ? body.creditBalance : undefined);
        const outputPath = typeof body.path === "string" ? body.path : typeof body.imageUrl === "string" ? body.imageUrl : null;
        if (!outputPath) throw new Error("Image generation completed without a saved output path");
        const savedJobId = typeof body.jobId === "string" ? body.jobId : genId;
        setGenHistory((prev) => prev.map((g) => g.id === genId ? {
          ...g,
          id: savedJobId,
          status: "completed" as const,
          videoUrl: outputPath,
          completedAt: new Date().toISOString(),
        } : g));
        setActiveGenId(savedJobId);
        media.shot.keyframe_image = outputPath;
        setGenerationStatus("Image ready ✓");
        await reload(true);
      } else {
        setGenerationStatus("Submitting video generation job…");
        const response = await fetch(`/api/studio/projects/${projectId}/videos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shotId: media.shot.id, prompt, model, referenceImages: videoReferenceImages, referenceVideos: videoReferencePaths, characterEntityIds, mentionedEntityIds, generationMode: videoInputMode, startFrame, endFrame, aspectRatio, resolution, quality, audioEnabled, durationSeconds }) });
        const body = await response.json();
        if (!response.ok) {
          const errorMsg = body.error || "Video generation failed";
          setGenHistory((prev) => prev.map((g) => g.id === genId ? {
            ...g,
            status: "failed" as const,
            error: errorMsg,
            referenceImages: Array.isArray(body.inputImages) ? body.inputImages : g.referenceImages,
          } : g));
          throw new Error(errorMsg);
        }
        notifyCreditBalanceChanged(typeof body.creditBalance === "number" ? body.creditBalance : undefined);
        const dbJobId = body.jobId;
        setGenHistory((prev) => prev.map((g) => g.id === genId ? { ...g, id: dbJobId } : g));
        setActiveGenId((current) => current === genId ? dbJobId : current);
        await pollJobStatus(dbJobId);
      }
    } catch (error) {
      notifyCreditBalanceChanged();
      const errorMsg = error instanceof Error ? error.message : "Generation failed";
      setGenerationError(errorMsg);
      setGenHistory((prev) => prev.map((g) => g.id === genId ? { ...g, status: "failed" as const, error: errorMsg } : g));
    }
  };

  // Determine what to show in the main preview
  const previewSource = activeGen?.videoUrl || source;
  const previewError = activeGen?.status === "failed" ? activeGen.error : generationError;
  const previewGenerating = activeGen?.status === "generating";
  const rejectedReference = useMemo(() => {
    if (!previewError) return null;
    const parsed = parseSeedanceRejectedReference(previewError);
    if (!parsed) return null;
    const path = activeGen?.referenceImages?.[parsed.referenceIndex];
    if (!path || /^asset:\/\//i.test(path) || /^asset-[a-z0-9-]+$/i.test(path)) return null;
    const entity = entities.find((item) => entityPrimaryReference(item) === path || item.reference_images?.includes(path));
    const isShotKeyframe = path === media.shot.keyframe_image;
    return {
      ...parsed,
      path,
      entity,
      label: entity?.name || (isShotKeyframe ? `Scene ${shotNumber} keyframe` : `Reference image ${parsed.contentIndex}`),
      isShotKeyframe,
    };
  }, [activeGen?.referenceImages, entities, media.shot.keyframe_image, previewError, shotNumber]);

  const verifyRejectedReference = async () => {
    if (!rejectedReference) return;
    setVerifyingReferencePath(rejectedReference.path);
    setGenerationError(null);
    setGenerationStatus(null);
    try {
      const body = rejectedReference.entity
        ? { entityId: rejectedReference.entity.id, imagePath: rejectedReference.path, name: rejectedReference.entity.name }
        : rejectedReference.isShotKeyframe
          ? { target: "shot", targetId: media.shot.id, imagePath: rejectedReference.path, name: `Scene ${shotNumber} keyframe` }
          : { target: "reference", targetId: media.shot.id, imagePath: rejectedReference.path, name: `Scene ${shotNumber} reference ${rejectedReference.contentIndex}` };
      const response = await fetch(`/api/studio/projects/${projectId}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Seedance verification failed");
      setVerifiedReferencePaths((current) => new Set(current).add(rejectedReference.path));
      setGenerationStatus(`${rejectedReference.label} verified for Seedance ✓ You can regenerate now.`);
      await reload(true);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "Seedance verification failed");
    } finally {
      setVerifyingReferencePath(null);
    }
  };

  const addReferencePath = (path: string) => {
    if (referenceTarget === "start") {
      setStartFrame(path);
      return;
    }
    if (referenceTarget === "end") {
      setEndFrame(path);
      return;
    }
    if (referenceTarget === "motion") {
      setVideoReferencePaths((current) => current.includes(path) ? current : [...current, path]);
      return;
    }
    setReferences((current) => current.includes(path) ? current : [...current, path]);
  };
  // A clip dropped where images go was sent for image registration and failed
  // on "Unsupported media format" — the same mistake the render path could make
  // with an agent-attached clip, just made by hand here instead. The file's own
  // extension decides which strip it belongs in, so the upload can never end up
  // in the wrong one regardless of which "+" the user clicked to add it.
  const uploadReference = async (file?: File, target: "reference" | "motion" = "reference") => {
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
      if (target === "motion" || isVideoReferencePath(path)) {
        setVideoReferencePaths((current) => current.includes(path) ? current : [...current, path]);
      } else {
        addReferencePath(path);
      }
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
  const [drawing, setDrawing] = useState(false);

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
      <div className="flex h-full flex-col overflow-y-auto overscroll-contain lg:flex-row lg:overflow-hidden">
        {/* Left sidebar — Generation History */}
        <aside className="relative flex max-h-44 w-full shrink-0 flex-row border-b border-white/10 bg-[#0b0c0b] lg:max-h-none lg:w-44 lg:flex-col lg:border-b-0 lg:border-r">
          <div className="sticky top-0 left-0 z-20 flex shrink-0 flex-col items-center justify-start gap-1 border-r border-white/10 bg-[#0b0c0b]/95 p-3 backdrop-blur-md lg:flex-row lg:justify-between lg:border-b lg:border-r-0">
            <button
              onClick={close}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white transition hover:bg-white/20 hover:text-[#b9f42e]"
              title="Close Workspace (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
            <span className="text-[10px] font-bold text-zinc-500">Esc</span>
          </div>
          <div className="no-scrollbar flex flex-1 gap-3 overflow-x-auto p-3 lg:block lg:overflow-x-visible lg:overflow-y-auto">
            <label className="grid aspect-[3/4] w-16 shrink-0 cursor-pointer place-items-center rounded-xl border border-dashed border-white/25 text-center text-xs text-zinc-400 transition hover:border-[#b9f42e] lg:mb-3 lg:w-auto">
              +<br />Upload
              <input type="file" accept="image/*,video/*" className="hidden" onChange={(e) => uploadReference(e.target.files?.[0])} />
            </label>
            <p className="mb-2 hidden text-[10px] font-bold text-zinc-600 lg:block">Generations</p>
            <div className="flex gap-2 lg:flex-col">
              {displayGenerations.map((gen) => {
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
                      className={`group relative block w-[72px] shrink-0 overflow-hidden rounded-xl border-2 transition text-left lg:w-full ${
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
                        <span className="absolute right-1 top-1 z-10 rounded-md bg-[#b9f42e] px-1 py-0.5 text-[10px] font-bold leading-none text-black shadow-md lg:right-1.5 lg:top-1.5 lg:px-1.5">
                          ✓<span className="hidden lg:inline"> CHOSEN</span>
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
              <span className="flex items-center gap-1.5 rounded-lg border border-[#b9f42e]/50 bg-[#b9f42e]/20 px-4 py-2 text-xs font-semibold text-[#b9f42e]">
                ✓ Chosen for Storyboard
              </span>
            ) : (
              <button
                type="button"
                onClick={chooseCurrentMedia}
                disabled={busy || !previewSource}
                className="flex items-center gap-1.5 rounded-lg bg-[#b9f42e] px-4 py-2 text-xs font-semibold text-black hover:bg-[#a6de25] transition shadow-lg disabled:opacity-40"
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

            {previewSource && (
              <button
                type="button"
                onClick={() => downloadSignedMedia(previewSource, `shot-${shotNumber}-${isImage ? "keyframe.png" : "video.mp4"}`).catch((error) => setGenerationError(error instanceof Error ? error.message : "Download failed"))}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/5"
                title={`Download ${isImage ? "image" : "video"}`}
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </button>
            )}

            {isImage && previewSource && (
              <button
                type="button"
                onClick={() => setDrawing(true)}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-zinc-200 hover:border-[#b9f42e]/40 hover:text-[#b9f42e] transition disabled:opacity-40"
                title="Draw on this frame and describe the edit"
              >
                <Pencil className="h-3.5 w-3.5" />
                Draw
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
              type="button"
              onClick={generate}
              className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3.5 py-2 text-xs font-bold text-[#b9f42e] hover:bg-white/10 transition shadow-sm hover:scale-[1.02] active:scale-[0.98]"
            >
              ↻ Regenerate (⚡ {currentCreditCost} Credits)
            </button>
            <span className="ml-auto text-xs text-zinc-500">
              {genHistory.length > 1 ? `${genHistory.length} generations` : "Private asset"}
            </span>
          </header>
          <div className="grid flex-1 place-items-center overflow-auto bg-black/40 p-4 sm:p-8">
            <div className="flex flex-col items-center overflow-hidden rounded-xl bg-[#151715] shadow-2xl transition max-w-4xl w-full">
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
                <GenerationPreviewError
                  message={previewError}
                  rejectedReference={rejectedReference ? {
                    path: rejectedReference.path,
                    label: rejectedReference.label,
                    contentIndex: rejectedReference.contentIndex,
                  } : null}
                  verifying={Boolean(rejectedReference && verifyingReferencePath === rejectedReference.path)}
                  verified={Boolean(rejectedReference && verifiedReferencePaths.has(rejectedReference.path))}
                  onVerify={verifyRejectedReference}
                />
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
                    <p className="text-[10px] font-bold text-[#b9f42e]">
                      PROMPT USED
                    </p>
                    <span className="flex flex-wrap items-center gap-2">
                      {activeGen.cameraSettingsUsed && (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold text-zinc-300"
                          title="The camera package this image was generated with"
                        >
                          <Aperture className="h-3 w-3 text-[#b9f42e]" />
                          {describeCameraSettings(activeGen.cameraSettingsUsed)}
                        </span>
                      )}
                      {activeGen.type === "image" && (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold text-zinc-300"
                          title={activeGen.styleDnaUsed
                            ? `This image copied a look reference. ${activeGen.styleDnaUsed.overrideProjectStyle ? "The reference decided the medium." : "The Visual Style setting decided the medium; the reference supplied palette, light and texture."}`
                            : "No look reference was applied. This image followed the Visual Style setting alone."}
                        >
                          <Palette className={`h-3 w-3 ${activeGen.styleDnaUsed ? "text-[#b9f42e]" : "text-zinc-600"}`} />
                          {describeStyleDna(activeGen.styleDnaUsed, activeGen.styleReferenceImages.length)}
                        </span>
                      )}
                      {activeGen.model && (
                        <span className="rounded-md border border-[#b9f42e]/30 bg-[#b9f42e]/10 px-2 py-0.5 text-[11px] font-bold text-[#b9f42e]">
                          Model: {getModelLabel(activeGen.model)}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="mt-1.5 text-sm leading-relaxed text-zinc-200">
                    <p className={promptExpanded ? "" : "line-clamp-3"}>
                      {activeGen.prompt || "—"}
                    </p>
                    {activeGen.prompt && activeGen.prompt.length > 130 && (
                      <button
                        onClick={() => setPromptExpanded(!promptExpanded)}
                        className="mt-1 text-[11px] font-bold text-[#b9f42e] hover:underline"
                      >
                        {promptExpanded ? "Show less" : "Read more"}
                      </button>
                    )}
                  </div>
                  {activeGen.referenceImages && activeGen.referenceImages.length > 0 && (
                    <>
                      <p className="mt-3 text-[10px] font-bold text-zinc-500">Reference images</p>
                      <div className="mt-1.5 flex gap-2">
                        {activeGen.referenceImages.map((img, i) => (
                          <HoverPreviewTile key={`${img}-${i}`} className="group relative h-10 w-10 shrink-0" src={img} kind={isVideoReferencePath(img) ? "video" : "image"} label={referenceLabel(img)}>
                            <div className="h-full w-full overflow-hidden rounded-lg border border-white/10">
                              {isVideoReferencePath(img) ? <AssetVideo src={img} /> : <AssetImage src={img} />}
                            </div>
                          </HoverPreviewTile>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
        {/* The asset is what the screen is for, so it stays on top; this is
            the way down to the controls without scrolling past it. Mirrors the
            Director button on the workspace so the two behave alike. */}
        <button
          type="button"
          onClick={() => document.getElementById("shot-generate-controls")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="fixed bottom-5 right-5 z-[60] flex h-14 min-h-[44px] items-center gap-2 rounded-full bg-[#b9f42e] px-5 text-[13px] font-semibold text-black shadow-[0_10px_30px_-6px_rgba(185,244,46,0.5)] transition-transform duration-press ease-out active:scale-95 lg:hidden"
        >
          <WandSparkles className="h-4 w-4" />
          Generate
        </button>
        <aside id="shot-generate-controls" className="flex w-full shrink-0 scroll-mt-4 flex-col border-t border-white/10 bg-[#151715] lg:w-[430px] lg:border-l lg:border-t-0">
          <div className="flex items-start justify-between p-6">
            <div>
              <h2 className="text-3xl font-semibold text-white">Scene {shotNumber}</h2>
              <p className="mt-2 text-sm text-zinc-400">
                {media.shot.duration_seconds}s ·{" "}
                {isImage ? "9:16 image" : "9:16 video"}
              </p>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="flex flex-col rounded-[24px] bg-[#1c1c1c] p-4 shadow-xl">
              {/* Image/Video Reference Input */}
              {isImage ? (
                <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
                  <button
                    type="button"
                    aria-label="Add reference image"
                    onClick={() => {
                      setReferenceTarget("references");
                      setReferenceSourcePicker(true);
                    }}
                    className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-2xl bg-white/[0.05] text-xl font-light text-white/50 transition hover:bg-white/[0.08]"
                  >
                    +
                  </button>
                  {references.map((image, index) => (
                    // overflow-hidden moved to an inner wrapper: it rounds the
                    // thumbnail's corners, but left on this outer tile it also
                    // clipped the hover popup silently, since the popup renders
                    // as an absolutely positioned child of the very box that
                    // clips it.
                    <HoverPreviewTile key={`${image}-${index}`} className="group relative h-[72px] w-[72px] shrink-0" src={image} kind="image" label={referenceLabel(image)}>
                      <div className="h-full w-full overflow-hidden rounded-2xl bg-black">
                        <AssetImage src={image} className="h-full w-full object-cover opacity-90 transition group-hover:opacity-100" />
                        <button
                          type="button"
                          aria-label={`Remove reference image ${index + 1}`}
                          onClick={() => setReferences(references.filter((_, i) => i !== index))}
                          className="absolute inset-0 grid place-items-center bg-black/60 opacity-0 transition group-hover:opacity-100"
                        >
                          <Trash2 className="h-4 w-4 text-white" />
                        </button>
                      </div>
                    </HoverPreviewTile>
                  ))}
                </div>
              ) : (
                <div className="mb-4 flex flex-col gap-4 border-b border-white/5 pb-4">
                  <div className="inline-flex self-start rounded-full bg-black/40 p-1">
                    <button type="button" onClick={() => setVideoInputMode("keyframe")} className={`rounded-full px-4 py-2 text-xs font-bold transition-colors ${videoInputMode === "keyframe" ? "bg-[#b9f42e] text-black" : "text-zinc-400 hover:text-white"}`}>Key Frame</button>
                    <button type="button" onClick={() => setVideoInputMode("multi_image")} className={`rounded-full px-4 py-2 text-xs font-bold transition-colors ${videoInputMode === "multi_image" ? "bg-[#b9f42e] text-black" : "text-zinc-400 hover:text-white"}`}>Multi Image</button>
                  </div>
                  {videoInputMode === "keyframe" ? (
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      <FrameSlot label="Start frame" value={startFrame} onAdd={() => openReferenceSource("start")} onClear={() => setStartFrame(null)} />
                      <span className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/5 text-zinc-400">↔</span>
                      <FrameSlot label="Last frame" value={endFrame} onAdd={() => openReferenceSource("end")} onClear={() => setEndFrame(null)} />
                    </div>
                  ) : (
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      <button
                        type="button"
                        aria-label="Add reference image"
                        onClick={() => {
                          setReferenceTarget("references");
                          openReferenceSource("references");
                        }}
                        className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-2xl bg-white/[0.05] text-xl font-light text-white/50 transition hover:bg-white/[0.08]"
                      >
                        +
                      </button>
                      {references.map((image, index) => (
                        <HoverPreviewTile key={`${image}-${index}`} className="group relative h-[72px] w-[72px] shrink-0" src={image} kind="image" label={referenceLabel(image)}>
                          <div className="h-full w-full overflow-hidden rounded-2xl bg-black">
                            <AssetImage src={image} className="h-full w-full object-cover opacity-90 transition group-hover:opacity-100" />
                            <button
                              type="button"
                              aria-label={`Remove reference image ${index + 1}`}
                              onClick={() => setReferences(items => items.filter((_, i) => i !== index))}
                              className="absolute inset-0 grid place-items-center bg-black/60 opacity-0 transition group-hover:opacity-100"
                            >
                              <Trash2 className="h-4 w-4 text-white" />
                            </button>
                          </div>
                        </HoverPreviewTile>
                      ))}
                    </div>
                  )}
                  {/* The continuity clip, which had no slot of its own: the panel
                      described a reference the user could neither see nor drop,
                      and a hard cut had no way to say so. */}
                  {media.type === "video" ? (
                    <div className="mt-2 rounded-2xl border border-[#c084fc]/25 bg-[#c084fc]/[0.06] p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Film className="h-3.5 w-3.5 shrink-0 text-[#c084fc]" />
                          <p className="text-[11px] font-bold text-[#c084fc]">Motion reference</p>
                        </div>
                        {/* A video dropped on the composition uploader above was
                            registered as an image and failed generation outright.
                            These are the two ways a clip is actually correct to
                            add here, for a user who wants one other than the
                            previous shot's — their own footage, or an earlier
                            shot further back in this storyboard. */}
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => { setReferenceTarget("motion"); setPicker(true); }}
                            className="rounded-lg border border-[#c084fc]/40 px-2 py-1 text-[10px] font-bold text-[#c084fc] hover:bg-[#c084fc]/10"
                          >
                            Select storyboard clip
                          </button>
                          <label className="cursor-pointer rounded-lg border border-[#c084fc]/40 px-2 py-1 text-[10px] font-bold text-[#c084fc] hover:bg-[#c084fc]/10">
                            + Upload video
                            <input type="file" accept="video/*" className="hidden" onChange={(e) => { setReferenceTarget("motion"); uploadReference(e.target.files?.[0], "motion"); e.target.value = ""; }} />
                          </label>
                        </div>
                      </div>
                      {videoReferencePaths.length ? (
                        <>
                          <div className="mt-2 flex gap-2 overflow-x-auto">
                            {videoReferencePaths.map((path, index) => {
                              // Named by the shot it came from where that shot is
                              // still in this storyboard — "shot 12's video" is
                              // what the user actually needs to tell two similar
                              // clips apart, not just a bigger picture of one.
                              const sourceShot = (shots || []).find((shot) => shot.video_url === path);
                              const label = sourceShot ? `Shot ${sourceShot.order_index + 1} video` : "Motion reference";
                              return (
                              <HoverPreviewTile key={`${path}-${index}`} className="group relative h-[72px] w-[72px] shrink-0" src={path} kind="video" label={label}>
                                <div className="h-full w-full overflow-hidden rounded-2xl bg-black">
                                  <ResolvedMedia src={path} type="video" className="h-full w-full object-cover opacity-90" />
                                  <button
                                    type="button"
                                    aria-label={`Remove motion reference ${index + 1}`}
                                    onClick={() => setVideoReferencePaths((items) => items.filter((_, i) => i !== index))}
                                    className="absolute inset-0 grid place-items-center bg-black/60 opacity-0 transition group-hover:opacity-100"
                                  >
                                    <Trash2 className="h-4 w-4 text-white" />
                                  </button>
                                </div>
                              </HoverPreviewTile>
                              );
                            })}
                          </div>
                          <p className="mt-2 text-[11px] text-zinc-400">
                            The clip{videoReferencePaths.length > 1 ? "s" : ""} this shot continues from. Remove {videoReferencePaths.length > 1 ? "them" : "it"} for a hard cut, then regenerate.
                          </p>
                        </>
                      ) : (
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <p className="text-[11px] text-zinc-400">No motion reference — this shot renders on its own.</p>
                          {previousShotClip && (
                            <button
                              type="button"
                              onClick={() => setVideoReferencePaths([previousShotClip.path])}
                              className="shrink-0 rounded-lg border border-[#c084fc]/40 px-2.5 py-1 text-[11px] font-bold text-[#c084fc] hover:bg-[#c084fc]/10"
                            >
                              Continue from shot {previousShotClip.number}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ) : null}
                  {entities.some((e) => e.type === "character") && (
                    <div className="mt-2 rounded-2xl bg-white/[0.02] p-3 border border-white/5">
                      <p className="text-[10px] font-bold text-zinc-500">Project Characters</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {entities.filter((e) => e.type === "character").map((character) => {
                          const isSelected = selectedCharacterIds.includes(character.id);
                          return (
                            <button
                              key={character.id}
                              type="button"
                              onClick={() => toggleCharacterSelection(character.id)}
                              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-semibold transition ${
                                isSelected
                                  ? "border-[#b9f42e]/50 bg-[#b9f42e]/10 text-[#d9ff84]"
                                  : "border-white/5 bg-black/20 text-zinc-400 hover:border-white/20"
                              }`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-[#b9f42e]" : "bg-white/20"}`} />
                              <span>{character.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Textarea */}
              <div className="relative mb-4">
                <EntityMentionInput
                  value={prompt}
                  onChange={setPrompt}
                  entities={entities}
                  className="min-h-[140px] w-full resize-none bg-transparent text-[13px] leading-relaxed text-zinc-200 outline-none placeholder:text-zinc-600"
                  placeholder={isImage ? "Describe the image. Type @ to mention a character, scene, or asset…" : "Describe motion and timing. Type @ to mention a character, scene, or asset…"}
                  ariaLabel={isImage ? "Shot image prompt" : "Shot video prompt"}
                  menuPlacement="top"
                />
              </div>

              {/* The dial frames a still. The video panel films an existing
                  keyframe, so it inherits that frame's optics rather than
                  offering a second, contradictory camera package. */}
              {isImage && (
                <div className="mb-4 space-y-3">
                  <CameraSettingsControl
                    value={cameraSettings}
                    onChange={setCameraSettings}
                    enabled={cameraEnabled}
                    onEnabledChange={setCameraEnabled}
                    projectSummary={cameraDefaults ? describeCameraSettings(cameraDefaults) : undefined}
                  />
                  <StyleDnaPanel
                    projectId={projectId}
                    value={styleOverride}
                    onChange={setStyleOverride}
                    lockable
                    overrideEnabled={styleOverrideEnabled}
                    onOverrideChange={setStyleOverrideEnabled}
                    projectSummary={projectStyleDnaValue?.summary || null}
                    heading="Look &amp; Feel"
                    blurb="Drop a reference whose look this shot alone should copy."
                  />
                </div>
              )}

              {/* Revision notes live with the shot they are about, not in a
                  project-wide inbox where nobody can tell which one is meant —
                  and the still and the clip keep separate threads, because a
                  keyframe that landed can still produce a clip that did not. */}
              <div className="mb-4">
                <RevisionNotes
                  projectId={projectId}
                  target={{ type: "shot", id: media.shot.id, track: isImage ? "image" : "video" }}
                  title={isImage ? "Revision notes · Image" : "Revision notes · Video"}
                  defaultOpen={false}
                />
              </div>

              {/* Inline Toolbar */}
              <div className="flex flex-col gap-3 border-t border-white/10 pt-3">
                <div className="flex flex-wrap items-center gap-4">
                  <ModelMenu type={isImage ? "image" : "video"} value={model} onChange={setModel} options={{ quality, aspectRatio, resolution, durationSeconds }} inline />
                  
                  <div className="relative flex items-center gap-1.5 text-xs font-semibold text-zinc-400 transition hover:text-white group">
                    <Monitor className="h-3.5 w-3.5" />
                    <select
                      value={aspectRatio}
                      onChange={(e) => setAspectRatio(e.target.value)}
                      className="appearance-none bg-transparent outline-none cursor-pointer pr-4"
                    >
                      <option className="bg-[#1c1c1c]" value="9:16">9:16</option>
                      <option className="bg-[#1c1c1c]" value="16:9">16:9</option>
                      <option className="bg-[#1c1c1c]" value="1:1">1:1</option>
                      <option className="bg-[#1c1c1c]" value="2:3">2:3</option>
                      <option className="bg-[#1c1c1c]" value="3:2">3:2</option>
                      <option className="bg-[#1c1c1c]" value="21:9">21:9</option>
                    </select>
                    <ChevronDown className="absolute right-0 h-3 w-3 opacity-50 pointer-events-none" />
                  </div>

                  <div className="relative flex items-center gap-1.5 text-xs font-semibold text-zinc-400 transition hover:text-white group">
                    <Sparkles className="h-3.5 w-3.5" />
                    <select
                      value={quality}
                      onChange={(e) => setQuality(e.target.value as any)}
                      className="appearance-none bg-transparent outline-none cursor-pointer pr-4"
                    >
                      <option className="bg-[#1c1c1c]" value="Low">Low</option>
                      <option className="bg-[#1c1c1c]" value="Medium">Medium</option>
                      <option className="bg-[#1c1c1c]" value="High">High</option>
                      <option className="bg-[#1c1c1c]" value="Ultra">Ultra</option>
                    </select>
                    <ChevronDown className="absolute right-0 h-3 w-3 opacity-50 pointer-events-none" />
                  </div>
                  
                  {!isImage && (
                    <>
                      <div className="relative flex items-center gap-1.5 text-xs font-semibold text-zinc-400 transition hover:text-white group">
                        <span className="font-mono text-[10px]">HD</span>
                        <select value={resolution} onChange={(e) => setResolution(e.target.value)} className="appearance-none bg-transparent outline-none cursor-pointer pr-4">
                          <option className="bg-[#1c1c1c]" value="480p">480p</option>
                          <option className="bg-[#1c1c1c]" value="720p">720p</option>
                          <option className="bg-[#1c1c1c]" value="1080p">1080p</option>
                          <option className="bg-[#1c1c1c]" value="4K">4K</option>
                        </select>
                        <ChevronDown className="absolute right-0 h-3 w-3 opacity-50 pointer-events-none" />
                      </div>
                      <div className="relative flex items-center gap-1.5 text-xs font-semibold text-zinc-400 transition hover:text-white group">
                        <span className="font-mono text-[10px]">⏱</span>
                        <select value={`${durationSeconds}s`} onChange={(e) => setDurationSeconds(Number(e.target.value.replace(/s$/, "")))} className="appearance-none bg-transparent outline-none cursor-pointer pr-4">
                          {videoDurationOptions(model).map((seconds) => (
                            <option key={seconds} className="bg-[#1c1c1c]" value={`${seconds}s`}>{seconds}s</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-0 h-3 w-3 opacity-50 pointer-events-none" />
                      </div>
                      <button type="button" onClick={() => setAudioEnabled((current) => !current)} className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold transition-colors ${audioEnabled ? "bg-[#b9f42e]/20 text-[#b9f42e]" : "bg-white/5 text-zinc-500 hover:text-zinc-300"}`}>
                        <span className={`grid h-3 w-5 rounded-full p-0.5 ${audioEnabled ? "bg-[#b9f42e]" : "bg-zinc-600"}`}>
                          <span className={`h-2 w-2 rounded-full bg-black transition-transform ${audioEnabled ? "translate-x-2" : "translate-x-0"}`} />
                        </span>
                        {audioEnabled ? "Audio On" : "Audio Off"}
                      </button>
                    </>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-white/5 pt-3">
                  <span className="text-xs font-semibold text-zinc-400">
                    <Sparkles className="mb-0.5 inline h-3 w-3" /> {currentCreditCost}
                  </span>
                  {creditBalance !== null && creditBalance < currentCreditCost ? (
                    <button
                      disabled
                      className="grid h-8 w-8 place-items-center rounded-full bg-zinc-700 text-zinc-400 opacity-50"
                      title="Insufficient credits"
                    >
                      <Zap className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={generate}
                      disabled={busy}
                      title={busy ? "Generating..." : `Generate (${currentCreditCost} credits)`}
                      className={`group relative grid h-8 w-8 place-items-center rounded-full transition ${
                        busy
                          ? "bg-zinc-700 text-zinc-400"
                          : "bg-[#b9f42e] text-black active:scale-[0.98] hover:bg-[#a6de25] hover:shadow-[0_0_15px_rgba(185,244,46,0.4)]"
                      }`}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4 text-black" />}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {generationStatus && <p role="status" className="mt-4 rounded-[16px] border border-sky-500/30 bg-sky-500/10 p-4 text-sm text-sky-100">{generationStatus}</p>}
            {generationError && <p role="alert" className="mt-4 rounded-[16px] border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{generationError}</p>}
          </div>
        </aside>
      </div>
      {referenceSourcePicker && <ReferenceSourcePicker close={() => setReferenceSourcePicker(false)} onChooseExisting={() => { setReferenceSourcePicker(false); setPicker(true); }} onUpload={uploadReference} />}
      {picker && (
        <ReferencePicker
          entities={entities}
          shots={shots}
          selected={referenceTarget === "references" ? references : referenceTarget === "motion" ? videoReferencePaths : []}
          // A keyframe cannot be a motion reference — Seedance takes a clip
          // there, not a still — so picking for this target shows only the
          // storyboard's rendered videos, not every keyframe beside them.
          onlyKind={referenceTarget === "motion" ? "video" : undefined}
          close={() => setPicker(false)}
          confirm={(items) => {
            const selectedImage = items[0];
            if (referenceTarget === "start" && selectedImage) setStartFrame(selectedImage);
            else if (referenceTarget === "end" && selectedImage) setEndFrame(selectedImage);
            else if (referenceTarget === "motion") setVideoReferencePaths((current) => Array.from(new Set([...current, ...items])));
            else setReferences(items);
            setPicker(false);
          }}
        />
      )}
      {drawing && isImage && previewSource && (
        <DrawToEditModal
          projectId={projectId}
          sourcePath={previewSource}
          blockType="shot"
          target="shot"
          targetId={media.shot.id}
          model={model}
          quality={quality}
          title={`Scene ${shotNumber}${media.shot.title ? ` — ${media.shot.title}` : ""}`}
          close={() => setDrawing(false)}
          onEdited={({ path, jobId, prompt: editPrompt }) => {
            // Lands in the generation strip like any other render, so the frame
            // it was drawn on is still one click away.
            const entryId = jobId || `draw-${Date.now()}`;
            setGenHistory((current) => [{
              id: entryId,
              type: "image",
              status: "completed" as const,
              prompt: editPrompt,
              model,
              referenceImages: [],
              // A draw-to-edit render is not shot on a camera package — the
              // clause is deliberately withheld for it — so there is none to
              // report back in the strip.
              cameraSettingsUsed: null,
              styleDnaUsed: null,
              styleReferenceImages: [],
              videoUrl: path,
              error: null,
              createdAt: Date.now(),
              completedAt: new Date().toISOString(),
              generationMode: null,
              startFrame: null,
              endFrame: null,
              recordedFrames: false,
              videoReferencePaths: [],
            }, ...current]);
            setActiveGenId(entryId);
            media.shot.keyframe_image = path;
            setGenerationStatus("Edited frame saved as a new version ✓");
            notifyCreditBalanceChanged();
            void reload(true);
          }}
        />
      )}
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

function GenerationPreviewError({
  message,
  rejectedReference,
  verifying,
  verified,
  onVerify,
}: {
  message: string;
  rejectedReference?: { path: string; label: string; contentIndex: number } | null;
  verifying?: boolean;
  verified?: boolean;
  onVerify?: () => void;
}) {
  const isRealPersonError = /real person/i.test(message);
  return (
    <div className="grid aspect-[9/14] place-items-center p-6 text-center">
      <div role="alert" className="max-w-sm rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-left">
        <p className="t-caption text-red-200">Generation Error</p>
        <p className="mt-2 text-sm leading-6 text-red-100">{message}</p>
        {isRealPersonError && (
          <>
            {rejectedReference ? (
              <div className="mt-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-yellow-100">
                <p className="text-[10px] font-bold text-yellow-300">Reference needing verification</p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-yellow-200/20 bg-black/30">
                    <AssetImage src={rejectedReference.path} className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{rejectedReference.label}</p>
                    <p className="mt-1 text-[11px] leading-4 text-yellow-100/70">BytePlus rejected input image content[{rejectedReference.contentIndex}]. Add this exact image to the Seedance Asset Library before retrying.</p>
                    <button
                      type="button"
                      onClick={onVerify}
                      disabled={verifying || verified}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#b9f42e] px-3 py-2 text-xs font-semibold text-black hover:bg-[#a6de25] disabled:cursor-default disabled:opacity-70"
                    >
                      {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : verified ? <BadgeCheck className="h-3.5 w-3.5" /> : <BadgeCheck className="h-3.5 w-3.5" />}
                      {verifying ? "Verifying…" : verified ? "Verified for Seedance" : "Verify for Seedance"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs leading-relaxed text-yellow-200">
                <strong>How to fix:</strong> Deselect unverified face photos, or verify the relevant character image in Characters &amp; Assets before retrying.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The generation settings a job was run with, in the shape the media panel uses.
 *
 * A job created from chat stores its request here — `generationMode`,
 * `videoReferencePaths`, the composition frames — while the shot's own
 * `metadata.video_generation` is only written by the direct panel. Reading the
 * job is therefore the only way the panel can show what actually ran.
 */
function readGenerationSettings(value: unknown) {
  const settings = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const mode = settings.generationMode;
  const paths = Array.isArray(settings.videoReferencePaths)
    ? (settings.videoReferencePaths as unknown[]).filter((item): item is string => typeof item === "string")
    : [];
  return {
    generationMode: (mode === "multi_image" || mode === "keyframe" ? mode : null) as "keyframe" | "multi_image" | null,
    startFrame: typeof settings.startFrame === "string" ? settings.startFrame : null,
    endFrame: typeof settings.endFrame === "string" ? settings.endFrame : null,
    // Whether this job recorded frame slots at all. A chat-submitted job passes
    // composition references instead, and blanking the panel's start frame on
    // the strength of a key it never wrote would arm the next render with less
    // than the user is looking at.
    recordedFrames: "startFrame" in settings || "endFrame" in settings,
    videoReferencePaths: paths,
    // What this image was actually shot on. Read from the job rather than from
    // the panel: the panel holds the settings for the *next* render, so it
    // cannot answer "which package made the picture I am looking at".
    cameraSettingsUsed: isCameraSettings(settings.cameraSettingsUsed) ? settings.cameraSettingsUsed : null,
    // Same reason as the camera package: which look made the picture already on
    // screen is not a question the panel's own state can answer.
    styleDnaUsed: normalizeStyleDna(settings.styleDnaUsed),
    styleReferenceImages: Array.isArray(settings.styleReferenceImages)
      ? (settings.styleReferenceImages as unknown[]).filter((item): item is string => typeof item === "string")
      : [],
  };
}

type ChatProposal = Workspace["actionProposals"][number];
type ChatWorkflowRun = NonNullable<NonNullable<Workspace["production"]>["workflowRuns"]>[number];

function ChatRunStatus({ run }: { run?: ChatWorkflowRun }) {
  if (!run) return null;
  const verified = typeof run.summary?.verified === "number" ? run.summary.verified : 0;
  const labels: Record<string, string> = {
    planning: "Planning",
    running: "Working",
    awaiting_approval: "Waiting for approval",
    retrying: "Retrying",
    blocked: "Needs attention",
    completed: verified ? `Completed · ${verified} output${verified === 1 ? "" : "s"} verified` : "Completed",
    partially_completed: "Partially completed",
    cancelled: "Cancelled",
    failed: "Failed",
  };
  const alert = run.status === "failed" || run.status === "partially_completed" || run.status === "blocked";
  return <p className={`mt-2 t-caption ${alert ? "text-amber-300" : "text-emerald-300/80"}`}>{labels[run.status] || run.status.replaceAll("_", " ")}</p>;
}

/**
 * What the Director is doing while it is doing it.
 *
 * A run can take minutes, and for most of that the model is working through
 * tools with nothing to say. Reporting only the newest step — which is what
 * this did — left a single short line that changed every so often and never
 * moved, and a line that does not move reads as a hang. The steps accumulate
 * instead, so the panel grows as work happens and the chat scrolls with it.
 */
function ThinkingBubble({ reply }: { reply?: { content: string; status: string | null; steps?: Array<{ label: string; state: "running" | "done" | "failed" }>; startedAt?: number } | null }) {
  const [elapsed, setElapsed] = useState(0);
  const startedAt = reply?.startedAt;

  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const steps = reply?.steps || [];
  // Before the first tool reports there is nothing concrete to show, so the
  // header carries the waiting and the dots carry the liveness.
  const label = reply?.status || (steps.length ? "Working" : "AI Director is thinking");

  return (
    <div className="mt-3 max-w-[90%] rounded-xl bg-[#1a1a1a] p-3 text-[13px] text-zinc-300">
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-zinc-400">{label}</span>
        <span className="flex gap-1" aria-hidden="true">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#b9f42e]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#b9f42e] [animation-delay:120ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#b9f42e] [animation-delay:240ms]" />
        </span>
        {/* A counter that keeps moving is the cheapest proof the run is alive
            even during the long stretches when no tool reports anything. */}
        {startedAt ? (
          <span className="ml-auto font-mono text-[11px] tabular-nums text-zinc-600">
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
          </span>
        ) : null}
      </div>

      {steps.length ? (
        <ul className="mt-2.5 space-y-1.5" aria-live="polite">
          {steps.map((step, index) => (
            <li key={`${step.label}-${index}`} className="flex items-start gap-2 text-[12px] leading-5">
              <span className="mt-0.5 shrink-0" aria-hidden="true">
                {step.state === "running" ? (
                  <Loader2 className="h-3 w-3 animate-spin text-[#b9f42e]" />
                ) : step.state === "failed" ? (
                  <AlertTriangle className="h-3 w-3 text-red-400" />
                ) : (
                  <Check className="h-3 w-3 text-[#b9f42e]" />
                )}
              </span>
              <span className={step.state === "running" ? "text-zinc-200" : step.state === "failed" ? "text-red-300" : "text-zinc-500"}>
                {step.label}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {reply?.content ? (
        <p className="mt-2 whitespace-pre-wrap leading-relaxed">
          {reply.content}
          <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-[#b9f42e] align-middle" aria-hidden="true" />
        </p>
      ) : null}
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

function ChatTimeline({ blocks, proposals, messageProposalIds, onAction, disabled }: { blocks: unknown; proposals: ChatProposal[]; messageProposalIds?: string[]; onAction: (intent: string) => void; disabled: boolean }) {
  const timeline = parseDirectorTimeline(blocks);
  if (!timeline.length) return null;
  // "Waiting for your approval" is written when the run ends and never rewritten,
  // so it sat over an approval the user had already given and a generation
  // already under way. The live proposals say whether that is still true.
  const stillPending = (messageProposalIds || []).some((id) => proposals.some((proposal) => proposal.id === id && proposal.status === "pending"));
  return (
    <div className="mt-3 space-y-2">
      {timeline.map((block, index) => <ChatTimelineBlock key={`${block.type}-${index}`} block={block} proposals={proposals} awaitingApproval={stillPending} onAction={onAction} disabled={disabled} />)}
    </div>
  );
}

function ChatTimelineBlock({ block, proposals, awaitingApproval, onAction, disabled }: { block: DirectorTimelineBlock; proposals: ChatProposal[]; awaitingApproval?: boolean; onAction: (intent: string) => void; disabled: boolean }) {
  if (block.type === "tool_execution") {
    let failed = block.status === "failed";
    let waiting = block.status === "awaiting_approval";
    
    if (block.executionId) {
      const proposal = proposals.find((p) => p.tool_execution_id === block.executionId);
      if (proposal && (proposal.status === "executed" || proposal.status === "rejected")) {
        waiting = false;
        failed = proposal.status === "rejected";
      }
    }

    // Only render tool executions if they failed or require approval, keeping routine read calls hidden.
    if (!failed && !waiting) return null;
    return (
      <details className={`rounded-lg border ${failed ? "border-red-500/30 bg-red-500/10" : "border-amber-400/25 bg-amber-400/[0.07]"}`} open={failed}>
        <summary className="flex cursor-pointer list-none items-center gap-2 p-2.5 text-[12px] font-semibold">
          <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${failed ? "bg-red-500/20 text-red-300" : "bg-amber-400/15 text-amber-200"}`}>{failed ? "×" : "…"}</span>
          <span className="min-w-0">
            {block.agent && <span className="mr-1.5 rounded-full border border-[#b9f42e]/30 bg-[#b9f42e]/10 px-1.5 py-0.5 text-[9px] font-bold text-[#b9f42e]">{block.agent}</span>}
            {block.label}
          </span>
          <span className="ml-auto shrink-0 text-[9px] text-zinc-500">{block.status.replaceAll("_", " ")}</span>
        </summary>
        {(block.detail || block.error) && <p className={`border-t p-2.5 text-[11px] leading-5 ${failed ? "border-red-500/20 text-red-200" : "border-white/[0.06] text-zinc-400"}`}>{block.error || block.detail}</p>}
      </details>
    );
  }
  if (block.type === "plan") return <div className="rounded-lg border border-white/[0.08] bg-black/20 p-2.5"><p className="text-[12px] font-semibold">{block.title}</p><div className="mt-2 space-y-1.5">{block.steps.map((step) => <div key={step.id} className="flex gap-2 text-[11px] text-zinc-400"><span>{step.status === "completed" ? "✓" : step.status === "failed" ? "×" : "○"}</span><span>{step.label}</span></div>)}</div></div>;
  // The next step is not part of the run's timeline; ChatNextStep renders it at
  // the end of the whole conversation instead.
  if (block.type === "suggested_actions") return null;
  if (block.type === "warning") return <div className="rounded-lg border border-amber-400/25 bg-amber-400/[0.07] p-2.5 text-[11px] leading-5 text-amber-100"><strong>{block.code}</strong><p>{block.message}</p>{block.actions.map((action) => <button key={action.id} type="button" disabled={disabled} onClick={() => onAction(action.intent)} className="mt-2 mr-2 rounded-md border border-amber-300/25 px-2 py-1 font-semibold">{action.label}</button>)}</div>;
  if (block.type === "workflow_summary") {
    if (block.summary === "Workflow completed.") return null;
    // The approval it was waiting for has since been given or rejected, so the
    // note is stale — the proposal card below already shows what happened.
    if (block.summary === "Workflow is waiting for your approval." && !awaitingApproval) return null;
    return <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] p-2.5 text-[11px] text-emerald-100"><strong>{block.title}</strong><p className="mt-1 text-emerald-100/75">{block.summary}</p></div>;
  }
  if (block.type === "media_result") return <ChatMedia media={block.media} />;
  return null;
}

/**
 * The one step the production is waiting on, pinned to the end of the chat.
 *
 * It belongs to the newest reply, not to the message it was stored on: an older
 * message's step was already answered by everything below it. It stays hidden
 * while a run is in flight, and while an approval card is pending — the card is
 * itself the next step, and two competing calls to action read as a fork.
 */
function ChatNextStep({ messages, proposals, shots, sessionId, busy, onAction }: {
  messages: Workspace["chatMessages"];
  proposals: ChatProposal[];
  shots?: Shot[];
  sessionId?: string | null;
  busy: boolean;
  onAction: (intent: string) => void;
}) {
  if (busy) return null;
  const latest = messages.filter((item) => item.role === "assistant").at(-1);
  if (!latest) return null;
  const latestProposalIds = proposalIdsFromActions(latest.suggested_actions);
  // Only the newest reply's own approval blocks the step, not any card left
  // unanswered earlier in the session. Suppressing on those meant one abandoned
  // proposal removed the next step from every reply that followed it.
  const awaitingThisReply = latestProposalIds
    .some((id) => proposals.some((proposal) => proposal.id === id && proposal.status === "pending" && proposal.session_id === sessionId));
  if (awaitingThisReply) return null;
  const block = parseDirectorTimeline(latest.timeline_blocks).filter((item) => item.type === "suggested_actions").at(-1);
  if (!block || block.type !== "suggested_actions") return null;
  // The button text was written into this message before its own proposal was
  // approved, so approving it does not refresh the wording — pressing "Generate
  // the video for shot 3" is what put shot 3 into the state that made offering
  // it again wrong. Any suggested action still naming a shot this reply's own
  // approved proposal just covered is the same stale offer and is dropped
  // rather than shown a second time.
  const justCoveredShotNumbers = latestProposalIds.flatMap((id) => {
    const proposal = proposals.find((item) => item.id === id);
    if (!proposal || (proposal.status !== "approved" && proposal.status !== "executed")) return [];
    const request = generationProposalRequest(proposal);
    if (!request) return [];
    if (request.shotNumbers?.length) return request.shotNumbers;
    return (shots || [])
      .filter((shot) => request.shotIds?.includes(shot.id))
      .map((shot) => shot.order_index + 1);
  });
  const actions = justCoveredShotNumbers.length
    ? block.actions.filter((action) => !actionNamesAnyShot(action.intent, justCoveredShotNumbers))
    : block.actions;
  if (!actions.length) return null;
  return (
    <div className="mt-3 rounded-xl border border-[#b9f42e]/25 bg-[#b9f42e]/[0.06] p-3">
      <p className="text-[10px] font-bold text-[#b9f42e]">Next step</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => onAction(action.intent)}
            className={`rounded-lg px-3 py-1.5 text-[12px] font-bold transition ${action.recommended ? "bg-[#b9f42e] text-black hover:bg-[#a8e526]" : "border border-white/[0.12] text-zinc-200 hover:border-[#b9f42e]/40"}`}
          >
            {action.label}
            {action.risk === "costly" && <span className="ml-1.5 font-medium opacity-70">· uses credits</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatSuggestedActions({
  actions,
  proposals,
  entities,
  shots,
  projectId,
  busyId,
  onDecide,
  onAction,
  onOpenTab,
}: {
  actions?: Array<Record<string, unknown>> | null;
  proposals: ChatProposal[];
  entities: Entity[];
  shots: Shot[];
  projectId: string;
  busyId: string | null;
  onDecide: (proposalId: string, decision: "approved" | "rejected", overrides?: Record<string, unknown>) => void;
  onAction: (intent: string) => void;
  onOpenTab: (tab: string) => void;
}) {
  const ids = proposalIdsFromActions(actions);
  const matched = proposals.filter((proposal) => ids.includes(proposal.id));
  if (!matched.length) return null;
  return (
    <div className="mt-3 space-y-2">
      {matched.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} entities={entities} shots={shots} projectId={projectId} busy={busyId === proposal.id} onDecide={onDecide} onAction={onAction} onOpenTab={onOpenTab} />)}
    </div>
  );
}

function PendingProposalCards({
  proposals,
  excludeIds,
  sessionId,
  latestRunId,
  entities,
  shots,
  projectId,
  busyId,
  onDecide,
  onAction,
  onOpenTab,
}: {
  proposals: ChatProposal[];
  excludeIds: string[];
  sessionId?: string | null;
  latestRunId?: string | null;
  entities: Entity[];
  shots: Shot[];
  projectId: string;
  busyId: string | null;
  onDecide: (proposalId: string, decision: "approved" | "rejected", overrides?: Record<string, unknown>) => void;
  onAction: (intent: string) => void;
  onOpenTab: (tab: string) => void;
}) {
  const excluded = new Set(excludeIds);
  // Only the current conversation's approvals belong in this timeline. Without
  // the session check, opening a new chat inherits every unresolved card from
  // earlier chats in the same project.
  const pending = proposals.filter((proposal) => proposal.status === "pending"
    && !excluded.has(proposal.id)
    && proposal.session_id === sessionId
    && (!latestRunId || proposal.workflow_run_id === latestRunId)).slice(0, 3);
  if (!pending.length) return null;
  return (
    <div className="mt-4 flex flex-col">
      <div className="space-y-2 mb-2">
        {pending.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} entities={entities} shots={shots} projectId={projectId} busy={busyId === proposal.id} onDecide={onDecide} onAction={onAction} onOpenTab={onOpenTab} />)}
      </div>
      <div className="border-l-2 border-y border-[#fff878]/50 border-r-0 py-2.5 pl-3 mt-2 mb-1 rounded-l-md bg-gradient-to-r from-[#fff878]/10 to-transparent">
        <p className="text-[11px] font-medium text-zinc-300">Please handle the pending confirmations above before sending a new message</p>
      </div>
    </div>
  );
}

/** Every shot number an action's intent sentence names, e.g. "Generate the video for shot 3". */
function actionNamesAnyShot(intent: string, numbers: number[]) {
  const named = Array.from(intent.matchAll(/\bshots?\s+(?:#\s*)?(\d+)\b/gi)).map((match) => Number(match[1]));
  return named.some((number) => numbers.includes(number));
}

function proposalIdsFromActions(actions?: Array<Record<string, unknown>> | null) {
  return (actions || [])
    .map((action) => action.proposal)
    .filter((proposal): proposal is { id: string } => Boolean(proposal && typeof proposal === "object" && "id" in proposal && typeof (proposal as { id?: unknown }).id === "string"))
    .map((proposal) => proposal.id);
}

type GenerationProposalRequest = {
  type?: string;
  shotIds?: string[];
  shotNumbers?: number[];
  mentionedEntityIds?: string[];
  durationSeconds?: number;
  aspectRatio?: string;
  resolution?: string;
  model?: string;
  audioEnabled?: boolean;
  generationMode?: "keyframe" | "multi_image";
  referencePaths?: string[];
  videoReferencePaths?: string[];
  videoReferenceShotNumbers?: number[];
};

function generationProposalRequest(proposal: ChatProposal): GenerationProposalRequest | null {
  if (proposal.action_type !== "submit_generation") return null;
  const payload = proposal.payload as { request?: GenerationProposalRequest } | null;
  const request = payload?.request;
  return request && typeof request === "object" ? request : null;
}

/** "Shot 8" for a prompt key, whether the payload keyed it by number or by id. */
function promptKeyLabel(key: string, shots: Shot[]) {
  if (/^\d+$/.test(key)) return `Shot ${key}`;
  const shot = shots.find((item) => item.id === key);
  return shot ? `Shot ${shot.order_index + 1}` : "Shot";
}

/**
 * Every prompt in the proposal, keyed the way the payload keys them — by shot
 * number from the fast paths, by shot id from the agent.
 *
 * A batch carries one prompt per shot. Reading only the first and sending it
 * back for all of them rendered shot 8's scene three times over.
 */
function generationProposalPrompts(proposal: ChatProposal): Record<string, string> {
  const payload = proposal.payload as { prompts?: Record<string, string> } | null;
  const prompts = payload?.prompts;
  if (!prompts || typeof prompts !== "object") return {};
  return Object.fromEntries(Object.entries(prompts).filter(([, value]) => typeof value === "string"));
}

// The prompt carries @mentions as [@Name]. Any that no longer match a project
// entity is ignored by the provider, so the card warns before credits are spent
// rather than after the shot comes back without the character.
function unresolvedMentions(prompt: string, entities: Entity[]) {
  const names = new Set(entities.map((entity) => entity.name.toLowerCase().replace(/\s+/g, "-")));
  // Continuation prompts use these two media aliases to explain which inputs
  // control motion and composition. They are not project entities and should
  // not produce a false missing-character warning.
  const mediaAliases = new Set(["previous", "storyboard"]);
  const found = prompt.match(/\[@([^\]]+)\]|@([A-Za-z0-9_-]{2,})/g) || [];
  return Array.from(new Set(
    found
      .map((token) => token.replace(/^\[?@/, "").replace(/\]$/, "").trim())
      .filter((name) => name && !mediaAliases.has(name.toLowerCase()) && !names.has(name.toLowerCase().replace(/\s+/g, "-"))),
  )).slice(0, 6);
}

function VideoGenerationProposalBlock({
  proposal,
  request,
  entities,
  shots,
  projectId,
  busy,
  onDecide,
  onAction,
}: {
  proposal: ChatProposal;
  request: GenerationProposalRequest;
  entities: Entity[];
  shots: Shot[];
  projectId: string;
  busy: boolean;
  onDecide: (proposalId: string, decision: "approved" | "rejected", overrides?: Record<string, unknown>) => void;
  onAction: (intent: string) => void;
}) {
  const isVideo = request.type !== "image";
  // AI Director jobs are executed by the BytePlus background worker. Other
  // providers remain available in the standalone video generator, but showing
  // them here allowed an approval card to overwrite a valid BytePlus request
  // with an unsupported fal model.
  const proposalVideoModels = useMemo(() => videoGenerationModels.filter((option) => option.provider === "byteplus"), []);
  const [prompts, setPrompts] = useState(() => generationProposalPrompts(proposal));
  const promptKeys = useMemo(() => Object.keys(prompts), [prompts]);
  const [activePromptKey, setActivePromptKey] = useState(() => Object.keys(generationProposalPrompts(proposal))[0] || "");
  const activeKey = promptKeys.includes(activePromptKey) ? activePromptKey : promptKeys[0] || "";
  const prompt = prompts[activeKey] || "";
  const setPrompt = (value: string) => setPrompts((current) => ({ ...current, [activeKey]: value }));
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [model, setModel] = useState(() => {
    if (!isVideo) return request.model || imageGenerationModels[0].id;
    return proposalVideoModels.some((option) => option.id === request.model)
      ? request.model!
      : proposalVideoModels[0].id;
  });
  const [mode, setMode] = useState<"keyframe" | "multi_image">(request.generationMode === "multi_image" ? "multi_image" : "keyframe");
  const [aspectRatio, setAspectRatio] = useState(request.aspectRatio || "16:9");
  const [resolution, setResolution] = useState(request.resolution || "720p");
  const [durationSeconds, setDurationSeconds] = useState(Number(request.durationSeconds || 5));
  const [audioEnabled, setAudioEnabled] = useState(request.audioEnabled !== false);
  const [references, setReferences] = useState<string[]>(request.referencePaths || []);
  const [videoReferences, setVideoReferences] = useState<string[]>(request.videoReferencePaths || []);
  // Entity tiles are derived from the prompt, so removing one has to be
  // remembered here — and sent explicitly, or the server would derive it back.
  const [removedEntityIds, setRemovedEntityIds] = useState<string[]>([]);
  const [addMenu, setAddMenu] = useState(false);
  const [assetPicker, setAssetPicker] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // A rejected proposal is not re-approvable, so "modify and regenerate"
  // reopens the controls locally and asks the Director for a fresh proposal
  // carrying the adjusted settings.
  const [reopened, setReopened] = useState(false);
  // Withdrawn because the user answered it with a message instead of a button.
  // It is not a rejection — they redirected — but it is just as finished.
  const wasCancelled = (proposal.status === "rejected" || proposal.status === "expired") && !reopened;
  const canDecide = proposal.status === "pending" || reopened;
  // The badge used to read "Shot 1" for every single-shot proposal, which made
  // a request for shot 2 look like it had targeted the wrong shot.
  const resolvedShotNumbers = useMemo(() => {
    if (request.shotNumbers?.length) return request.shotNumbers;
    const ids = request.shotIds || [];
    return shots
      .filter((shot) => ids.includes(shot.id))
      .map((shot) => shot.order_index + 1)
      .sort((a, b) => a - b);
  }, [request.shotNumbers, request.shotIds, shots]);
  const shotNumbers = resolvedShotNumbers.length ? resolvedShotNumbers : null;
  const shotLabelText = shotNumbers
    ? (shotNumbers.length === 1 ? `Shot ${shotNumbers[0]}` : `Shots ${shotNumbers.join(", ")}`)
    : `${request.shotIds?.length || 1} shot${(request.shotIds?.length || 1) === 1 ? "" : "s"}`;
  const shotLabel = shotNumbers ? `shot ${shotNumbers.join(", ")}` : "this shot";
  const shotCount = request.shotIds?.length || request.shotNumbers?.length || 1;
  const credits = calculateCreditCost(model, isVideo ? "video" : "image", durationSeconds, { aspectRatio, resolution }) * shotCount;
  const missing = useMemo(() => unresolvedMentions(prompt, entities), [prompt, entities]);
  // The entities this prompt names are resolved into references at generation
  // time, so the card must show them too. Without this it displayed only the
  // composition keyframe and looked like the cast was being ignored.
  const entityReferences = useMemo(() => {
    // The shots this request covers, so the card can fall back to their saved
    // cast exactly as generation does. A prompt that describes its characters
    // in prose rather than with @mentions still references them, and showing
    // nothing made the card look like it would generate with no likeness lock.
    const targetShots = shots.filter((shot) =>
      (request.shotIds || []).includes(shot.id)
      || (request.shotNumbers || []).includes(shot.order_index + 1));
    const shotCast = Array.from(new Set(targetShots.flatMap((shot) => shot.referenced_entities || [])));
    const declared = Array.from(new Set([...(request.mentionedEntityIds || []), ...shotCast]));
    const ids = findShotCastEntityIds(prompt, entities, declared);
    const resolved = ids.length ? ids : shotCast;
    return resolved
      .map((id) => entities.find((entity) => entity.id === id))
      .filter((entity): entity is Entity => Boolean(entity))
      .filter((entity) => !removedEntityIds.includes(entity.id))
      .map((entity) => ({ entity, image: entityPrimaryReference(entity) }))
      .filter((item): item is { entity: Entity; image: string } => Boolean(item.image));
  }, [prompt, entities, shots, removedEntityIds, request.mentionedEntityIds, request.shotIds, request.shotNumbers]);

  const referenceShotNumberByVideo = useMemo(() => {
    const entries = (request.videoReferenceShotNumbers || []).map((number) => {
      const shot = shots.find((item) => item.order_index + 1 === number);
      return shot?.video_url ? [shot.video_url, number] as const : null;
    }).filter((entry): entry is readonly [string, number] => Boolean(entry));
    return new Map(entries);
  }, [request.videoReferenceShotNumbers, shots]);

  const targetShotNumberByImage = useMemo(() => new Map(
    shots
      .filter((shot) => shot.keyframe_image && resolvedShotNumbers.includes(shot.order_index + 1))
      .map((shot) => [shot.keyframe_image as string, shot.order_index + 1]),
  ), [shots, resolvedShotNumbers]);


  const uploadReference = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const userId = (await createClient().auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Please sign in before uploading a reference.");
      const path = `${userId}/${projectId}/shot-reference-${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      const { error } = await createClient().storage.from("creator-studio-media").upload(path, file);
      if (error) throw error;
      setReferences((current) => Array.from(new Set([...current, path])).slice(0, 8));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Reference upload failed");
    } finally {
      setUploading(false);
    }
  };

  const confirm = () => {
    if (reopened) {
      onAction(`Regenerate ${shotLabel} ${isVideo ? "video" : "image"} with these settings: model ${model}, aspect ratio ${aspectRatio}, resolution ${resolution}${isVideo ? `, duration ${durationSeconds}s, audio ${audioEnabled ? "on" : "off"}, ${mode === "multi_image" ? "multi image" : "key frame"} mode` : ""}. Use this exact prompt:\n\n${prompt.trim()}`);
      setReopened(false);
      return;
    }
    const shotIds = request.shotIds || [];
    onDecide(proposal.id, "approved", {
      request: {
        ...request,
        model,
        aspectRatio,
        resolution,
        durationSeconds,
        audioEnabled,
        generationMode: mode,
        // Entity images are resolved from the prompt server-side, so sending
        // them again here would spend two reference slots on one subject.
        referencePaths: references.filter((path) => !entityReferences.some((item) => item.image === path)),
        // Sent whenever the strip was edited, so a removal is honoured instead
        // of being derived back from the prompt that still names the entity.
        ...(removedEntityIds.length ? { entityReferenceIds: entityReferences.map((item) => item.entity.id) } : {}),
        videoReferencePaths: videoReferences,
      },
      // Each shot keeps its own prompt, under the key the proposal used. Sending
      // the visible one for every shot in the batch generated the first shot's
      // scene under all of their numbers.
      ...(promptKeys.length
        ? { prompts: Object.fromEntries(promptKeys.map((key) => [key, (prompts[key] || "").trim()]).filter(([, value]) => value)) }
        : {}),
    });
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#161616] text-left">
      <div className="flex items-center justify-between border-b border-white/5 bg-black/20 p-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#c084fc]/20 bg-[#c084fc]/10">
            {isVideo ? <Film className="h-3.5 w-3.5 text-[#c084fc]" /> : <ImageIcon className="h-3.5 w-3.5 text-[#c084fc]" />}
          </div>
          <p className="truncate text-[13px] font-bold text-zinc-100">{isVideo ? "Video Production" : "Image Production"}</p>
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-400">
            {shotLabelText}
          </span>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold capitalize ${proposal.status === "rejected" || proposal.status === "expired" ? "border-white/15 text-zinc-400" : "border-[#fff878]/30 text-[#fff878]"}`}>
          {proposal.status === "pending" ? "Pending confirmation" : proposal.status === "rejected" ? "Cancelled" : proposal.status === "expired" ? "Withdrawn — you replied instead" : proposal.status}
        </span>
      </div>

      {missing.length > 0 && canDecide && (
        <div className="flex items-start gap-2 border-b border-white/5 bg-red-500/10 p-3">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-300" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-[11px] leading-relaxed text-red-200">
              References not found and will be ignored: {missing.map((name) => `[@${name}]`).join(", ")} — create them, add reference images manually, or adjust the prompt
            </p>
            {/* A missing reference is usually a real asset the production still
                needs, so the fix is offered here instead of leaving the user to
                describe it again in chat. */}
            <div className="flex flex-wrap gap-1.5">
              {missing.map((name) => (
                <button
                  key={name}
                  type="button"
                  disabled={busy}
                  onClick={() => onAction(
                    `Create the missing production asset "${name}" for this project, then generate its reference image so it can be used as a visual reference.`
                    + (entities.length ? ` Match the established look of the existing assets (${entities.slice(0, 6).map((entity) => `@${entity.name}`).join(", ")}) and use them as visual reference where relevant.` : "")
                    + ` Afterwards, re-propose the ${isVideo ? "video" : "image"} generation for ${shotLabel} with @${name} attached.`,
                  )}
                  className="rounded-full border border-red-300/40 bg-red-500/15 px-2.5 py-1 text-[11px] font-semibold text-red-100 transition hover:bg-red-500/25 disabled:opacity-50"
                >
                  + Create @{name}
                </button>
              ))}
              {missing.length > 1 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onAction(
                    `Create all of these missing production assets: ${missing.map((name) => `"${name}"`).join(", ")}. Generate one reference image per asset, matching the established look of the existing assets, then re-propose the ${isVideo ? "video" : "image"} generation for ${shotLabel} with them attached.`,
                  )}
                  className="rounded-full border border-red-300/40 px-2.5 py-1 text-[11px] font-semibold text-red-100 transition hover:bg-red-500/20 disabled:opacity-50"
                >
                  Create all
                </button>
              )}
              <button
                type="button"
                onClick={() => setAssetPicker(true)}
                className="rounded-full border border-white/20 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 transition hover:bg-white/5"
              >
                Use an existing asset instead
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {entityReferences.map(({ entity, image }) => (
            <div key={`entity-${entity.id}`} className="group/ref relative h-14 w-14 overflow-hidden rounded-lg border border-[#b9f42e]/50" title={`${entity.name} — referenced because the prompt names it`}>
              <AssetImage src={image} />
              {canDecide && (
                <button
                  type="button"
                  onClick={() => setRemovedEntityIds((current) => [...current, entity.id])}
                  className="absolute right-0.5 top-0.5 hidden rounded bg-black/75 px-1 text-[10px] text-white group-hover/ref:block"
                  aria-label={`Remove ${entity.name} from this generation`}
                >
                  ×
                </button>
              )}
              <span className="absolute inset-x-0 bottom-0 truncate bg-black/75 px-1 text-center text-[9px] font-bold text-[#b9f42e]">
                {entity.name}
              </span>
            </div>
          ))}
          {videoReferences.map((path) => {
            const referenceShotNumber = referenceShotNumberByVideo.get(path);
            return (
              <div key={path} className="group relative h-14 w-14 overflow-hidden rounded-lg border border-[#c084fc]/50" title={referenceShotNumber ? `Shot ${referenceShotNumber} video — continuity reference` : "Video continuity reference"}>
                <AssetVideo src={path} />
                <span className="absolute bottom-0 inset-x-0 bg-black/75 text-center text-[9px] font-bold text-[#c084fc]">{referenceShotNumber ? `SHOT ${referenceShotNumber} VIDEO` : "VIDEO REF"}</span>
                {canDecide && (
                  <button
                    type="button"
                    onClick={() => setVideoReferences((current) => current.filter((item) => item !== path))}
                    className="absolute right-0.5 top-0.5 hidden rounded bg-black/70 px-1 text-[10px] text-white group-hover:block"
                    aria-label="Remove video reference"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
          {/* An entity image the Director also listed explicitly is already
              shown above as an entity reference; showing it twice makes the
              card look like it will send the same picture twice. */}
          {references.filter((path) => !entityReferences.some((item) => item.image === path)).map((path) => {
            const targetShotNumber = targetShotNumberByImage.get(path);
            return (
              <div key={path} className="group relative h-14 w-14 overflow-hidden rounded-lg border border-white/10" title={targetShotNumber ? `Storyboard shot ${targetShotNumber} image — composition reference` : "Image reference"}>
                <AssetImage src={path} />
                {targetShotNumber && <span className="absolute bottom-0 inset-x-0 bg-black/75 text-center text-[8px] font-bold text-[#fff878]">SHOT {targetShotNumber} IMAGE</span>}
                {canDecide && (
                  <button
                    type="button"
                    onClick={() => setReferences((current) => current.filter((item) => item !== path))}
                    className="absolute right-0.5 top-0.5 hidden rounded bg-black/70 px-1 text-[10px] text-white group-hover:block"
                    aria-label="Remove reference"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
          {canDecide && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setAddMenu((open) => !open)}
                disabled={uploading || references.length >= 8}
                className="grid h-14 w-14 place-items-center rounded-lg border border-dashed border-white/20 text-zinc-400 hover:border-[#b9f42e] hover:text-[#b9f42e] disabled:opacity-40"
                aria-label="Add reference image"
              >
                <Plus className="h-4 w-4" />
              </button>
              {addMenu && (
                <div className="absolute left-0 top-16 z-20 w-48 rounded-lg border border-white/10 bg-[#1c1c1c] p-1 shadow-xl">
                  <button
                    type="button"
                    onClick={() => { setAddMenu(false); fileInputRef.current?.click(); }}
                    className="block w-full rounded px-2 py-1.5 text-left text-[11px] text-zinc-300 hover:bg-white/5"
                  >
                    Upload from device
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAddMenu(false); setAssetPicker(true); }}
                    className="block w-full rounded px-2 py-1.5 text-left text-[11px] text-zinc-300 hover:bg-white/5"
                  >
                    Choose existing asset
                  </button>
                </div>
              )}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(event) => { uploadReference(event.target.files?.[0]); event.target.value = ""; }}
          />
          {isVideo && canDecide && (
            <div className="ml-auto flex rounded-full border border-white/10 p-0.5">
              {(["keyframe", "multi_image"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${mode === option ? "bg-[#fff878] text-black" : "text-zinc-400 hover:text-zinc-200"}`}
                >
                  {option === "keyframe" ? "Key Frame" : "Multi Image"}
                </button>
              ))}
            </div>
          )}
        </div>

        {assetPicker && (
          <ReferencePicker
            entities={entities}
            shots={shots}
            selected={[...references, ...videoReferences]}
            close={() => setAssetPicker(false)}
            confirm={(items) => {
              // A picked scene video is a motion reference, not an image one,
              // so the two are routed to different provider inputs.
              const videoPaths = new Set(shots.map((shot) => shot.video_url).filter(Boolean) as string[]);
              setReferences(items.filter((item) => !videoPaths.has(item)).slice(0, 8));
              setVideoReferences(items.filter((item) => videoPaths.has(item)).slice(0, 10));
              setAssetPicker(false);
            }}
          />
        )}

        {entityReferences.length > 0 && (
          <p className="text-[11px] text-zinc-500">
            {entityReferences.length} entity reference{entityReferences.length === 1 ? "" : "s"} come from the prompt&apos;s @mentions. Edit the prompt to change them.
          </p>
        )}
        {uploadError && <p className="text-[11px] text-red-300">{uploadError}</p>}

        {promptKeys.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {promptKeys.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setActivePromptKey(key)}
                className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${key === activeKey ? "bg-[#b9f42e] text-black" : "border border-white/10 text-zinc-400 hover:text-zinc-200"}`}
              >
                {promptKeyLabel(key, shots)}
              </button>
            ))}
            <span className="self-center text-[11px] text-zinc-500">
              {promptKeys.length} prompts, one per shot
            </span>
          </div>
        )}
        {canDecide ? (
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={promptExpanded ? 12 : 5}
            className="w-full resize-none rounded-lg border border-white/10 bg-black/30 p-2.5 text-[12px] leading-relaxed text-zinc-200 outline-none focus:border-[#b9f42e]/40"
          />
        ) : (
          <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-300">{prompt}</p>
        )}
        {canDecide && prompt.length > 320 && (
          <button type="button" onClick={() => setPromptExpanded((open) => !open)} className="text-[11px] text-zinc-500 hover:text-zinc-300">
            {promptExpanded ? "Show less" : "Show more"}
          </button>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-white/5 pt-3 text-[11px]">
          <select
            value={model}
            onChange={(event) => setModel(event.target.value)}
            disabled={!canDecide}
            className="rounded-md border border-white/10 bg-[#141414] px-2 py-1 text-zinc-300 outline-none disabled:opacity-60"
          >
            {(isVideo ? proposalVideoModels : imageGenerationModels).map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
          <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)} disabled={!canDecide} className="rounded-md border border-white/10 bg-[#141414] px-2 py-1 text-zinc-300 outline-none disabled:opacity-60">
            {["16:9", "9:16", "1:1", "4:3", "21:9"].map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <select value={resolution} onChange={(event) => setResolution(event.target.value)} disabled={!canDecide} className="rounded-md border border-white/10 bg-[#141414] px-2 py-1 text-zinc-300 outline-none disabled:opacity-60">
            {["480p", "720p", "1080p"].map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          {isVideo && (
            <>
              <select value={durationSeconds} onChange={(event) => setDurationSeconds(Number(event.target.value))} disabled={!canDecide} className="rounded-md border border-white/10 bg-[#141414] px-2 py-1 text-zinc-300 outline-none disabled:opacity-60">
                {videoDurationOptions(model).map((option) => <option key={option} value={option}>{option}s</option>)}
              </select>
              <button
                type="button"
                onClick={() => canDecide && setAudioEnabled((value) => !value)}
                className="flex items-center gap-1.5 text-zinc-400"
              >
                Audio
                <span className={`h-4 w-7 rounded-full p-0.5 transition ${audioEnabled ? "bg-[#b9f42e]" : "bg-white/15"}`}>
                  <span className={`block h-3 w-3 rounded-full bg-black transition ${audioEnabled ? "translate-x-3" : ""}`} />
                </span>
              </button>
            </>
          )}
          <span className="ml-auto flex items-center gap-1 font-semibold text-[#fff878]">
            <Sparkles className="h-3 w-3" /> {credits}
          </span>
        </div>

        {canDecide && (
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => (reopened ? setReopened(false) : onDecide(proposal.id, "rejected"))}
              className="rounded border border-white/10 px-3 py-1.5 text-[11px] font-medium text-zinc-400 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || uploading}
              onClick={confirm}
              className="flex items-center gap-1.5 rounded bg-[#fff878] px-3 py-1.5 text-[11px] font-bold text-black transition hover:bg-[#fff878]/90 disabled:opacity-50"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              {busy ? "Working..." : reopened ? "Send new request" : `Generate (${credits})`}
            </button>
          </div>
        )}

        {wasCancelled && (
          <div className="space-y-2 border-t border-white/5 pt-3">
            <p className="text-[12px] text-zinc-300">
              {proposal.status === "expired"
                ? `${shotNumbers ? `Shot ${shotNumbers.join(", ")}` : "This"} ${isVideo ? "video" : "image"} generation was withdrawn when you replied instead of approving it. Nothing was generated and no credits were spent.`
                : `${shotNumbers ? `Shot ${shotNumbers.join(", ")}` : "This"} ${isVideo ? "video" : "image"} generation was cancelled. What would you like to do next?`}
            </p>
            <button
              type="button"
              onClick={() => setReopened(true)}
              className="w-full rounded-lg border border-[#fff878]/40 bg-[#fff878]/10 px-3 py-2.5 text-[12px] font-bold text-[#fff878] transition hover:bg-[#fff878]/15"
            >
              Modify parameters and regenerate
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction(`Skip ${shotLabel} and continue with the rest of the production.`)}
              className="w-full rounded-lg border border-white/10 px-3 py-2.5 text-[12px] font-medium text-zinc-300 transition hover:bg-white/5 disabled:opacity-50"
            >
              Skip this shot
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction("Stop generating. Do not submit any further generation jobs until I ask.")}
              className="w-full rounded-lg border border-white/10 px-3 py-2.5 text-[12px] font-medium text-zinc-300 transition hover:bg-white/5 disabled:opacity-50"
            >
              Stop generating
            </button>
            <p className="pt-1 text-[11px] text-zinc-500">Not satisfied? Just type your thoughts in the input box below</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Where an executed proposal's result actually lands, so "view" can go there
// instead of being a label on the approve button.
function proposalDestination(actionType: string): { tab: string; label: string } | null {
  if (actionType.includes("entit") || actionType.includes("asset")) return { tab: "characters", label: "View in Characters & Assets" }
  if (actionType.includes("shot") || actionType.includes("storyboard") || actionType === "submit_generation") return { tab: "storyboard", label: "View in Storyboard" }
  if (actionType.includes("script")) return { tab: "script", label: "View in Script" }
  if (actionType.includes("series") || actionType.includes("brief")) return { tab: "canvas", label: "View in Canvas" }
  return null
}

function ProposalCard({
  proposal,
  entities,
  shots,
  projectId,
  busy,
  onDecide,
  onAction,
  onOpenTab,
}: {
  proposal: ChatProposal;
  entities: Entity[];
  shots: Shot[];
  projectId: string;
  busy: boolean;
  onDecide: (proposalId: string, decision: "approved" | "rejected", overrides?: Record<string, unknown>) => void;
  onAction: (intent: string) => void;
  onOpenTab: (tab: string) => void;
}) {
  const canDecide = proposal.status === "pending";
  const isVideo = proposal.action_type.includes("video");
  const isImage = proposal.action_type.includes("image");
  const generationRequest = generationProposalRequest(proposal);
  const destination = proposalDestination(proposal.action_type);
  // Which shot the card is about is the first thing worth knowing, and "Update
  // storyboard shot" does not say it. The proposal already carries the shot it
  // targets — either the ids a generation names or the single id an edit
  // patches — so the number is resolved from the storyboard already loaded
  // here. A card that names the wrong shot is the whole reason this matters:
  // without the number there is nothing on it to catch the mistake against.
  const targetShotNumbers = (() => {
    if (generationRequest?.shotNumbers?.length) return generationRequest.shotNumbers;
    const ids = generationRequest?.shotIds?.length
      ? generationRequest.shotIds
      : typeof proposal.payload?.shotId === "string" ? [proposal.payload.shotId as string] : [];
    if (!ids.length) return [];
    return (shots || [])
      .filter((shot) => ids.includes(shot.id))
      .map((shot) => shot.order_index + 1)
      .sort((a, b) => a - b);
  })();
  const shotLabel = targetShotNumbers.length
    ? `Shot ${targetShotNumbers.join(", ")}`
    : null;

  if (generationRequest) {
    return (
      <VideoGenerationProposalBlock
        proposal={proposal}
        request={generationRequest}
        entities={entities}
        shots={shots}
        projectId={projectId}
        busy={busy}
        onDecide={onDecide}
        onAction={onAction}
      />
    );
  }

  return (
    <div className="flex flex-col rounded-xl border border-white/10 bg-[#161616] text-left overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/5 bg-black/20 p-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#c084fc]/10 border border-[#c084fc]/20">
            {isVideo ? (
              <Film className="h-3.5 w-3.5 text-[#c084fc]" />
            ) : isImage ? (
              <ImageIcon className="h-3.5 w-3.5 text-[#c084fc]" />
            ) : (
              <WandSparkles className="h-3.5 w-3.5 text-[#c084fc]" />
            )}
          </div>
          <p className="truncate text-[13px] font-bold text-zinc-100">
            {proposal.title || proposal.action_type.replaceAll("_", " ")}
          </p>
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-400 capitalize">
            {proposal.action_type.split("_").pop()}
          </span>
          {shotLabel ? (
            <span className="shrink-0 rounded bg-[#b9f42e]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#b9f42e]">
              {shotLabel}
            </span>
          ) : null}
        </div>
        <span className="shrink-0 rounded-full border border-[#fff878]/30 px-2 py-0.5 text-[10px] font-bold text-[#fff878]">
          {proposal.status === "pending" ? "Pending confirmation" : proposal.status}
        </span>
      </div>
      
      <div className="p-3">
        <p className="text-[12px] font-semibold text-[#fff878]">
          {proposal.summary || `1 ${proposal.action_type.replaceAll("_", " ")} task is pending confirmation`}
        </p>
        
        {canDecide ? (
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onDecide(proposal.id, "rejected")}
              className="rounded border border-white/10 px-3 py-1.5 text-[11px] font-medium text-zinc-400 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
            >
              Reject
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onDecide(proposal.id, "approved")}
              className="flex items-center gap-1.5 rounded bg-[#fff878] px-3 py-1.5 text-[11px] font-bold text-black transition hover:bg-[#fff878]/90 disabled:opacity-50"
            >
              {busy ? "Working..." : "Approve"}
            </button>
          </div>
        ) : proposal.status === "executed" && destination ? (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => onOpenTab(destination.tab)}
              className="flex items-center gap-1.5 rounded border border-white/20 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-white/10"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              {destination.label}
            </button>
          </div>
        ) : null}
      </div>
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
      <p className="t-caption text-zinc-500">{label}</p>
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
  onlyKind,
}: {
  entities: Entity[];
  shots?: Shot[];
  selected: string[];
  close: () => void;
  confirm: (items: string[]) => void;
  /** Restricts the picker to one media kind — a motion reference wants a clip, never a still. */
  onlyKind?: "image" | "video";
}) {
  const [choices, setChoices] = useState(selected);
  const [filter, setFilter] = useState<"all" | Entity["type"] | "storyboard">(onlyKind === "video" ? "storyboard" : "all");

  // One tile per entity: its chosen reference. The others are alternates the
  // user decided against, and listing them invites picking a version of a
  // character that is not the one the production locked in.
  const entityItems = entities
    .map((entity) => ({
      id: `entity-${entity.id}`,
      name: entity.name,
      type: entity.type,
      image: entityPrimaryReference(entity),
      kind: "image" as const,
      number: null as number | null,
    }))
    .filter((item): item is typeof item & { image: string } => Boolean(item.image));

  // Scene tiles are numbered by storyboard position so they can be matched to
  // the shot list at a glance, and each scene contributes its keyframe and its
  // generated video as separate pickable references.
  const shotItems = (shots || [])
    .slice()
    .sort((a, b) => a.order_index - b.order_index)
    .flatMap((shot) => {
      // Same rule the Director and submit_generation use, so a number shown
      // here always means the same shot everywhere.
      const number = shot.order_index + 1;
      const suffix = shot.title ? ` — ${shot.title}` : "";
      const items: Array<{ id: string; name: string; type: "storyboard"; image: string; kind: "image" | "video"; number: number }> = [];
      if (shot.keyframe_image) {
        items.push({ id: `shot-${shot.id}`, name: `Scene ${number}${suffix}`, type: "storyboard", image: shot.keyframe_image, kind: "image", number });
      }
      if (shot.video_url) {
        items.push({ id: `shot-video-${shot.id}`, name: `Scene ${number} video${suffix}`, type: "storyboard", image: shot.video_url, kind: "video", number });
      }
      return items;
    });

  const kindItems = onlyKind ? [...entityItems, ...shotItems].filter((item) => item.kind === onlyKind) : [...entityItems, ...shotItems];
  const allItems = kindItems;
  const visible = filter === "all" ? allItems : allItems.filter((item) => item.type === filter);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/75 p-6 backdrop-blur-sm">
      <section className="flex h-[min(760px,85vh)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#171918] shadow-2xl">
        <header className="flex items-center gap-4 border-b border-white/10 p-5">
          <h3 className="text-xl font-semibold">{onlyKind === "video" ? "Select a storyboard video" : "Select from existing assets"}</h3>
          {!onlyKind && (
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
          )}
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
                {item.kind === "video" ? <div className="aspect-[4/3]"><AssetVideo src={image} /></div> : <AssetImage src={image} />}
                {item.number !== null && (
                  <span className="absolute left-2 top-2 grid h-5 min-w-5 place-items-center rounded-full bg-black/80 px-1.5 text-[11px] font-semibold text-[#b9f42e]">
                    {item.number}
                  </span>
                )}
                {item.kind === "video" && (
                  <span className="absolute left-2 bottom-8 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-bold text-zinc-200">
                    VIDEO
                  </span>
                )}
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2 text-xs font-bold truncate">
                  {item.name}
                </span>
                {active && (
                  <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-[#b9f42e] text-xs font-semibold text-black">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
          {!visible.length && (
            <p className="col-span-full py-12 text-center text-sm text-zinc-500">
              {onlyKind === "video"
                ? "No storyboard videos yet. Generate and approve a shot's video first, then it can be used as a motion reference here."
                : "No images found for this category. Upload an image to an asset or generate a shot keyframe first."}
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
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/65 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Add a reference image"><section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#171918] p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-bold tracking-[.18em] text-[#b9f42e]">REFERENCE IMAGE</p><h3 className="mt-2 text-2xl font-semibold">Add a reference</h3><p className="mt-2 text-sm leading-6 text-zinc-400">Choose a project asset or upload an image from your device.</p></div><button type="button" aria-label="Close reference picker" onClick={close} className="rounded-lg p-2 text-zinc-400 hover:bg-white/10"><X /></button></div><div className="mt-6 flex gap-3"><div className="grid h-32 w-32 shrink-0 place-items-center rounded-2xl border-2 border-dashed border-white/15 text-5xl text-zinc-300">+</div><div className="flex-1 overflow-hidden rounded-2xl border border-white/15 bg-[#101110]"><button type="button" onClick={onChooseExisting} className="flex w-full items-center gap-4 px-5 py-5 text-left text-lg font-bold hover:bg-white/5"><ImageIcon className="h-6 w-6" />Select from existing assets</button><label className="flex cursor-pointer items-center gap-4 border-t border-white/10 px-5 py-5 text-lg font-bold hover:bg-white/5"><Upload className="h-6 w-6" />Upload from local device<input type="file" accept="image/*" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (file) await onUpload(file); close(); }} /></label></div></div></section></div>
}
function ShotForm({
  entities,
  episodeId,
  afterNumber,
  total,
  save,
  close,
  reload,
}: {
  entities: Entity[];
  episodeId: string;
  /** The gap this shot goes into, as a 1-based "after this shot" number. */
  afterNumber: number;
  total: number;
  save: (b: unknown) => Promise<void>;
  close: () => void;
  reload: (silent?: boolean) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const position = afterNumber >= total
    ? `Adds as shot ${total + 1}, at the end`
    : `Adds as shot ${afterNumber + 1}. Shot ${afterNumber + 1}${total > afterNumber + 1 ? ` and everything after it` : ""} moves down one.`;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (saving) return;
        const mentionedIds = findMentionedEntityIds(prompt, entities);
        setSaving(true);
        setError(null);
        try {
          // insertShot, not saveShot: a hand-written shot goes where the user
          // put it, and saveShot's fixed 9999 index put every one of them at
          // the end, tied with each other.
          await save({
            action: "insertShot",
            episodeId,
            afterNumber,
            shot: { title, prompt, entityIds: Array.from(new Set([...ids, ...mentionedIds])) },
          });
          await reload(true);
          close();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not add the shot.");
        } finally {
          setSaving(false);
        }
      }}
      className="rounded-2xl border border-[#b9f42e]/30 bg-[#1b1d1c] p-5"
    >
      <p className="mb-3 text-[11px] font-bold text-[#b9f42e]">{position}</p>
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
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
        <button disabled={saving} className="rounded-lg bg-[#b9f42e] px-4 py-2 text-sm font-bold text-black disabled:opacity-60">
          {saving ? "Adding…" : "Save shot"}
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

function getShotTrimStart(shot: Shot): number {
  const trim = (shot.metadata?.trim as { start?: number; end?: number } | undefined);
  return typeof trim?.start === "number" && Number.isFinite(trim.start) && trim.start >= 0 ? trim.start : 0;
}

function getShotTrimEnd(shot: Shot): number {
  const trim = (shot.metadata?.trim as { start?: number; end?: number } | undefined);
  const duration = Number(shot.duration_seconds || 5);
  if (typeof trim?.end === "number" && Number.isFinite(trim.end) && trim.end > 0) {
    return Math.min(trim.end, duration > 0 ? duration : trim.end);
  }
  return duration > 0 ? duration : 5;
}

function getShotCutDuration(shot: Shot): number {
  const start = getShotTrimStart(shot);
  const end = getShotTrimEnd(shot);
  return Math.max(0.1, end - start);
}

function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00.00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
}

function RenderExportModal({
  shots,
  close,
}: {
  shots: Shot[];
  close: () => void;
}) {
  const [tab, setTab] = useState<"all" | "parts">("all");
  const [resolution, setResolution] = useState<"1080p" | "720p" | "480p">("720p");
  const [format, setFormat] = useState<"mp4" | "webm">("mp4");
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [downloadingPartId, setDownloadingPartId] = useState<string | null>(null);

  const startFullRender = async () => {
    if (!shots.length) return;
    setRendering(true);
    setProgress(0);
    setStatusMsg("Preparing video & audio assets...");

    try {
      const dimensions = resolution === "1080p" ? { w: 1080, h: 1920 } : resolution === "720p" ? { w: 720, h: 1280 } : { w: 480, h: 854 };
      const canvas = document.createElement("canvas");
      canvas.width = dimensions.w;
      canvas.height = dimensions.h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not create canvas context");

      // Resolve signed URLs for all shots with video
      const resolvedShots: Array<{ shot: Shot; videoUrl: string; trimStart: number; trimEnd: number; duration: number }> = [];
      for (let i = 0; i < shots.length; i++) {
        const s = shots[i];
        setStatusMsg(`Signing video asset ${i + 1}/${shots.length}...`);
        setProgress(Math.round(((i + 1) / (shots.length * 2)) * 100));
        let url = s.video_url || "";
        if (url && !url.startsWith("http")) {
          const signed = await getSignedMediaUrl(url);
          if (signed) url = signed;
        }
        resolvedShots.push({
          shot: s,
          videoUrl: url,
          trimStart: getShotTrimStart(s),
          trimEnd: getShotTrimEnd(s),
          duration: getShotCutDuration(s),
        });
      }

      // Reusable video element with Web Audio API binding
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = false; // Unmuted to capture audio track
      video.playsInline = true;

      // Setup Web Audio Context for audio mixing
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtxClass();
      const audioDest = audioCtx.createMediaStreamDestination();
      let audioConnected = false;

      try {
        const audioSource = audioCtx.createMediaElementSource(video);
        audioSource.connect(audioDest);
        audioConnected = true;
      } catch (e) {
        console.warn("WebAudio connection notice:", e);
      }

      const canvasStream = canvas.captureStream(30);
      const combinedTracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];

      if (audioConnected && audioDest.stream.getAudioTracks().length > 0) {
        combinedTracks.push(...audioDest.stream.getAudioTracks());
      }

      const combinedStream = new MediaStream(combinedTracks);

      const mimeType = format === "mp4"
        ? (MediaRecorder.isTypeSupported("video/mp4;codecs=avc1,mp4a.40.2")
            ? "video/mp4;codecs=avc1,mp4a.40.2"
            : MediaRecorder.isTypeSupported("video/mp4")
            ? "video/mp4"
            : "video/webm")
        : (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
            ? "video/webm;codecs=vp9,opus"
            : "video/webm");

      const recorder = new MediaRecorder(combinedStream, { mimeType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      const renderPromise = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: format === "mp4" ? "video/mp4" : "video/webm" }));
      });

      recorder.start();

      const totalCutTime = resolvedShots.reduce((acc, item) => acc + item.duration, 0);
      let renderedTime = 0;

      for (let i = 0; i < resolvedShots.length; i++) {
        const item = resolvedShots[i];
        setStatusMsg(`Rendering Shot ${i + 1} of ${resolvedShots.length}: ${item.shot.title}...`);

        if (item.videoUrl) {
          video.src = item.videoUrl;
          await new Promise<void>((res) => {
            video.onloadeddata = () => res();
            video.onerror = () => res();
          });
          video.currentTime = item.trimStart;
          try { await video.play(); } catch { /* ignore autoplay restrictions */ }

          const shotEndTime = item.trimEnd;
          while (!video.paused && !video.ended && video.currentTime < shotEndTime) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            renderedTime += 0.033;
            const pct = Math.min(99, Math.round(50 + (renderedTime / totalCutTime) * 50));
            setProgress(pct);
            await new Promise((res) => setTimeout(res, 33));
          }
          video.pause();
        } else {
          // Fallback image / title card frame rendering
          ctx.fillStyle = "#121413";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "#b9f42e";
          ctx.font = "bold 24px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(`Scene ${i + 1}: ${item.shot.title}`, canvas.width / 2, canvas.height / 2);
          const steps = Math.round(item.duration * 30);
          for (let step = 0; step < steps; step++) {
            renderedTime += 0.033;
            const pct = Math.min(99, Math.round(50 + (renderedTime / totalCutTime) * 50));
            setProgress(pct);
            await new Promise((res) => setTimeout(res, 33));
          }
        }
      }

      recorder.stop();
      setStatusMsg("Finalizing MP4 video file...");
      const finalBlob = await renderPromise;
      setProgress(100);

      // Trigger automatic MP4 download
      const a = document.createElement("a");
      a.href = URL.createObjectURL(finalBlob);
      a.download = `project_final_render_${resolution}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setStatusMsg(`Export complete! Downloaded ${format.toUpperCase()} video file.`);
    } catch (err) {
      console.error(err);
      setStatusMsg("Export error. Please check browser permissions.");
    } finally {
      setRendering(false);
    }
  };

  const downloadPart = async (shot: Shot, index: number) => {
    if (!shot.video_url) return;
    setDownloadingPartId(shot.id);
    try {
      let url = shot.video_url;
      if (!url.startsWith("http")) {
        const signed = await getSignedMediaUrl(url);
        if (signed) url = signed;
      }
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Scene_${index + 1}_${shot.title.replaceAll(" ", "_")}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("Part download failed", err);
    } finally {
      setDownloadingPartId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-6 backdrop-blur-md">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[#161817] shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/10 p-5">
          <div className="flex items-center gap-2">
            <Film className="h-5 w-5 text-[#b9f42e]" />
            <h3 className="text-lg font-semibold text-white">Export Video Timeline</h3>
          </div>
          <button type="button" onClick={close} className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="border-b border-white/10 bg-black/30 p-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab("all")}
              className={`flex-1 rounded-lg py-2.5 text-xs font-bold transition ${tab === "all" ? "bg-[#b9f42e] text-black" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}
            >
              Export Combined Video (All Shots)
            </button>
            <button
              type="button"
              onClick={() => setTab("parts")}
              className={`flex-1 rounded-lg py-2.5 text-xs font-bold transition ${tab === "parts" ? "bg-[#b9f42e] text-black" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}
            >
              Export Clips in Parts ({shots.length})
            </button>
          </div>
        </div>

        <div className="p-6">
          {tab === "all" ? (
            <div className="space-y-4 lg:space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="t-caption text-zinc-400">Quality</label>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {(["1080p", "720p", "480p"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setResolution(r)}
                        className={`rounded-xl border p-2.5 text-center text-xs font-bold transition ${resolution === r ? "border-[#b9f42e] bg-[#b9f42e]/10 text-[#b9f42e]" : "border-white/10 bg-white/5 text-zinc-300 hover:border-white/20"}`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="t-caption text-zinc-400">Format</label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(["mp4", "webm"] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFormat(f)}
                        className={`rounded-xl border p-2.5 text-center text-xs font-bold  transition ${format === f ? "border-[#b9f42e] bg-[#b9f42e]/10 text-[#b9f42e]" : "border-white/10 bg-white/5 text-zinc-300 hover:border-white/20"}`}
                      >
                        .{f}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {rendering && (
                <div className="space-y-2 rounded-xl border border-white/10 bg-black/40 p-4">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-[#b9f42e]">{statusMsg}</span>
                    <span className="text-white">{progress}%</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full bg-gradient-to-r from-[#b9f42e] to-[#60a5fa] transition duration-state ease-out" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={rendering}
                onClick={startFullRender}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#b9f42e] py-3.5 text-sm font-bold text-black shadow-lg shadow-[#b9f42e]/10 transition hover:bg-[#a4dc24] disabled:opacity-50"
              >
                {rendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {rendering ? "Rendering MP4 video..." : `Render & Download .${format.toUpperCase()} Video`}
              </button>
            </div>
          ) : (
            <div className="max-h-[350px] space-y-3 overflow-y-auto pr-1">
              {shots.map((s, idx) => {
                const start = getShotTrimStart(s);
                const end = getShotTrimEnd(s);
                const dur = getShotCutDuration(s);
                return (
                  <div key={s.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
                    <div className="min-w-0 flex-1 pr-3">
                      <p className="truncate font-bold text-white">Scene {idx + 1}: {s.title}</p>
                      <p className="mt-1 text-[11px] text-zinc-400">
                        Trim: {formatTimecode(start)} - {formatTimecode(end)} ({dur.toFixed(1)}s)
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!s.video_url || downloadingPartId === s.id}
                      onClick={() => downloadPart(s, idx)}
                      className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 font-bold text-zinc-200 transition hover:bg-[#b9f42e] hover:text-black disabled:opacity-40"
                    >
                      {downloadingPartId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      Download Part
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TimelineVideoPlayer({
  src,
  isPlaying,
  isMuted = false,
  inShotTime,
  className,
}: {
  src: string;
  isPlaying: boolean;
  isMuted?: boolean;
  inShotTime: number;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [signedUrl, setSignedUrl] = useState<string>("");

  useEffect(() => {
    let active = true;
    if (src.startsWith("http")) {
      setSignedUrl(src);
      return;
    }
    getSignedMediaUrl(src).then((url) => {
      if (active && url) setSignedUrl(url);
    });
    return () => {
      active = false;
    };
  }, [src]);

  // Handle play / pause programmatically
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => console.log("Autoplay playback:", err));
      }
    } else {
      video.pause();
    }
  }, [isPlaying, signedUrl]);

  // Sync mute state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = isMuted;
  }, [isMuted]);

  // Sync seek position
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (Math.abs(video.currentTime - inShotTime) > 0.25) {
      video.currentTime = inShotTime;
    }
  }, [inShotTime]);

  if (!signedUrl) {
    return <div className={`grid place-items-center bg-black/60 text-xs text-zinc-400 ${className || ""}`}>Loading clip…</div>;
  }

  return (
    <video
      ref={videoRef}
      src={signedUrl}
      muted={isMuted}
      playsInline
      preload="auto"
      className={className}
    />
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [globalTime, setGlobalTime] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [showMorePrompt, setShowMorePrompt] = useState(false);

  const lastAnimTimeRef = useRef<number | null>(null);

  const currentShot = shots[selected] || null;

  // Trim map state to reflect immediate edits before reload
  const [localTrims, setLocalTrims] = useState<Record<string, { start: number; end: number }>>({});

  const getShotStart = useCallback((s: Shot) => {
    if (localTrims[s.id]?.start !== undefined) return localTrims[s.id].start;
    return getShotTrimStart(s);
  }, [localTrims]);

  const getShotEnd = useCallback((s: Shot) => {
    if (localTrims[s.id]?.end !== undefined) return localTrims[s.id].end;
    return getShotTrimEnd(s);
  }, [localTrims]);

  const getShotDuration = useCallback((s: Shot) => {
    const start = getShotStart(s);
    const end = getShotEnd(s);
    return Math.max(0.1, end - start);
  }, [getShotStart, getShotEnd]);

  const shotDurations = useMemo(() => shots.map(getShotDuration), [shots, getShotDuration]);

  const totalProjectDuration = useMemo(() => {
    return shotDurations.reduce((acc, d) => acc + d, 0);
  }, [shotDurations]);

  const cumulativeOffsets = useMemo(() => {
    const offsets: number[] = [];
    let current = 0;
    for (let i = 0; i < shots.length; i++) {
      offsets.push(current);
      current += shotDurations[i];
    }
    return offsets;
  }, [shots, shotDurations]);

  // Determine active shot based on global playhead time
  const activeShotIndex = useMemo(() => {
    if (!shots.length) return 0;
    for (let i = shots.length - 1; i >= 0; i--) {
      if (globalTime >= cumulativeOffsets[i] - 0.05) {
        return i;
      }
    }
    return 0;
  }, [globalTime, cumulativeOffsets, shots.length]);

  const activeShot = shots[activeShotIndex] || currentShot;
  const activeOffset = cumulativeOffsets[activeShotIndex] || 0;
  // An episode whose storyboard has not been built yet has no clip under the
  // playhead. Everything else here already reads the active shot as optional;
  // this asked it for a trim point and took the whole workspace down with it.
  const inShotTime = activeShot ? getShotStart(activeShot) + Math.max(0, globalTime - activeOffset) : 0;

  // Synchronize player selection with active playhead index during playback
  useEffect(() => {
    if (isPlaying && activeShotIndex !== selected) {
      setSelected(activeShotIndex);
    }
  }, [activeShotIndex, isPlaying, selected]);

  // Animation frame loop for continuous multi-clip playback
  useEffect(() => {
    if (!isPlaying) {
      lastAnimTimeRef.current = null;
      return;
    }

    let animationFrameId: number;

    const tick = (timestamp: number) => {
      if (lastAnimTimeRef.current !== null) {
        const delta = (timestamp - lastAnimTimeRef.current) / 1000;
        setGlobalTime((prev) => {
          const next = prev + delta;
          if (next >= totalProjectDuration && totalProjectDuration > 0) {
            if (isLooping) return 0;
            setIsPlaying(false);
            return totalProjectDuration;
          }
          return next;
        });
      }
      lastAnimTimeRef.current = timestamp;
      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, totalProjectDuration, isLooping]);

  const moveShot = async (i: number, delta: number) => {
    const next = [...shots];
    const target = i + delta;
    if (target < 0 || target >= next.length) return;
    [next[i], next[target]] = [next[target], next[i]];
    await save({ action: "reorderShots", ids: next.map((s) => s.id) });
    reload();
  };

  const handleUpdateTrim = async (s: Shot, newStart: number, newEnd: number) => {
    const duration = s.duration_seconds || 5;
    const clampedStart = Math.max(0, Math.min(newStart, duration - 0.1));
    const clampedEnd = Math.max(clampedStart + 0.1, Math.min(newEnd, duration));

    setLocalTrims((prev) => ({ ...prev, [s.id]: { start: clampedStart, end: clampedEnd } }));

    await save({
      action: "saveShot",
      shot: {
        id: s.id,
        title: s.title,
        prompt: s.prompt,
        duration_seconds: s.duration_seconds,
        aspect_ratio: s.aspect_ratio,
        resolution: s.resolution,
        entityIds: s.referenced_entities || [],
        metadata: { ...(s.metadata || {}), trim: { start: clampedStart, end: clampedEnd } },
      },
    });
  };

  const handleSplitClip = async () => {
    if (!currentShot) return;
    const trimStart = getShotStart(currentShot);
    const trimEnd = getShotEnd(currentShot);
    const splitPoint = inShotTime;

    if (splitPoint <= trimStart + 0.3 || splitPoint >= trimEnd - 0.3) {
      alert("Please position the playhead inside the clip to cut/split it.");
      return;
    }

    setSplitting(true);
    try {
      // 1. Update original shot trim end to split point
      await save({
        action: "saveShot",
        shot: {
          id: currentShot.id,
          title: currentShot.title,
          prompt: currentShot.prompt,
          duration_seconds: currentShot.duration_seconds,
          aspect_ratio: currentShot.aspect_ratio,
          resolution: currentShot.resolution,
          entityIds: currentShot.referenced_entities || [],
          metadata: { ...(currentShot.metadata || {}), trim: { start: trimStart, end: splitPoint } },
        },
      });

      // 2. Create second part as new shot
      await save({
        action: "saveShot",
        orderIndex: currentShot.order_index + 1,
        shot: {
          title: `${currentShot.title} (Part 2)`,
          prompt: currentShot.prompt,
          duration_seconds: currentShot.duration_seconds,
          aspect_ratio: currentShot.aspect_ratio,
          resolution: currentShot.resolution,
          entityIds: currentShot.referenced_entities || [],
          video_url: currentShot.video_url,
          keyframe_image: currentShot.keyframe_image,
          metadata: { ...(currentShot.metadata || {}), trim: { start: splitPoint, end: trimEnd } },
        },
      });

      await reload();
    } finally {
      setSplitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-74px)] bg-[#0c0d0c] text-white">
      {/* Editor Header Toolbar */}
      <header className="flex h-16 items-center justify-between border-b border-white/10 bg-[#111211] px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#b9f42e]/10 border border-[#b9f42e]/30">
            <Film className="h-5 w-5 text-[#b9f42e]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-wide text-zinc-100">VIDEO TIMELINE STUDIO</h2>
            <p className="text-[11px] font-mono text-zinc-400">
              {shots.length} Shot Clips • Sequence Total: <span className="text-[#b9f42e] font-bold">{formatTimecode(totalProjectDuration)}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSplitClip}
            disabled={splitting || !currentShot}
            className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold text-zinc-200 transition hover:bg-white/10 disabled:opacity-50"
          >
            {splitting ? <Loader2 className="h-4 w-4 animate-spin text-[#b9f42e]" /> : <Scissors className="h-4 w-4 text-[#b9f42e]" />}
            Split Clip at Playhead
          </button>

          <button
            type="button"
            onClick={() => setExportModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#b9f42e] to-[#a4dc24] px-5 py-2.5 text-xs font-semibold text-black shadow-lg shadow-[#b9f42e]/20 transition hover:opacity-90"
          >
            <Download className="h-4 w-4" />
            Render & Export Video
          </button>
        </div>
      </header>

      {/* Main Studio Editor Workspace */}
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_340px] border-b border-white/10 overflow-hidden">
        {/* Preview Player Area */}
        <main className="flex flex-col items-center justify-center bg-[#070807] p-6 relative">
          <div className="relative aspect-[9/16] max-h-[480px] w-full max-w-[320px] overflow-hidden rounded-2xl border border-white/15 bg-black shadow-2xl shadow-black/80">
            {activeShot?.video_url ? (
              <TimelineVideoPlayer
                src={activeShot.video_url}
                isPlaying={isPlaying}
                isMuted={isMuted}
                inShotTime={inShotTime}
                className="h-full w-full object-cover"
              />
            ) : activeShot?.keyframe_image ? (
              <ResolvedMedia src={activeShot.keyframe_image} type="image" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full place-items-center bg-gradient-to-b from-[#182a35] to-[#0a1218] p-6 text-center text-xs text-zinc-400">
                <Film className="h-10 w-10 text-zinc-600 mb-2" />
                Select or generate shots in Storyboard to preview timeline.
              </div>
            )}

            {/* Timecode Badge Overlay */}
            <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-lg border border-black/50 bg-black/70 px-2.5 py-1 text-[11px] font-mono text-[#b9f42e] backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-[#b9f42e] animate-pulse" />
              {formatTimecode(globalTime)}
            </div>

            {/* Active Shot Badge Overlay */}
            {activeShot && (
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between rounded-lg border border-white/10 bg-black/75 px-3 py-1.5 text-[11px] backdrop-blur-md">
                <span className="truncate font-bold text-zinc-200">Scene {activeShotIndex + 1}: {activeShot.title}</span>
                <span className="font-mono text-zinc-400">{getShotDuration(activeShot).toFixed(1)}s</span>
              </div>
            )}
          </div>

          {/* Transport Controls Bar */}
          <div className="mt-6 flex items-center gap-6 rounded-2xl border border-white/10 bg-[#141615] px-6 py-3 shadow-xl">
            <button
              type="button"
              onClick={() => setGlobalTime(0)}
              className="text-zinc-400 transition hover:text-white"
              title="Jump to Start"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setGlobalTime((t) => Math.max(0, t - 3))}
              className="text-zinc-400 transition hover:text-white"
              title="Skip Back 3s"
            >
              <SkipBack className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() => {
                if (!isPlaying && globalTime >= totalProjectDuration && totalProjectDuration > 0) {
                  setGlobalTime(0);
                }
                setIsPlaying((p) => !p);
              }}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-[#b9f42e] text-black shadow-lg shadow-[#b9f42e]/20 transition active:scale-[0.98]"
            >
              {isPlaying ? <Pause className="h-6 w-6 fill-current" /> : <Play className="h-6 w-6 fill-current translate-x-0.5" />}
            </button>

            <button
              type="button"
              onClick={() => setGlobalTime((t) => Math.min(totalProjectDuration, t + 3))}
              className="text-zinc-400 transition hover:text-white"
              title="Skip Forward 3s"
            >
              <SkipForward className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() => setIsLooping((l) => !l)}
              className={`rounded-lg p-1.5 transition ${isLooping ? "bg-[#b9f42e]/20 text-[#b9f42e]" : "text-zinc-400 hover:text-white"}`}
              title="Toggle Loop"
            >
              <Layers className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setIsMuted((m) => !m)}
              className={`rounded-lg p-1.5 transition ${isMuted ? "bg-red-500/20 text-red-400" : "text-zinc-400 hover:text-white"}`}
              title={isMuted ? "Unmute Audio" : "Mute Audio"}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4 text-[#b9f42e]" />}
            </button>
          </div>
        </main>

        {/* Selected Clip Inspector Sidebar */}
        <aside className="border-l border-white/10 bg-[#121312] p-5 overflow-y-auto">
          {currentShot ? (
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between">
                  <span className="rounded-md border border-[#b9f42e]/30 bg-[#b9f42e]/10 px-2 py-0.5 text-[10px] font-bold text-[#b9f42e]">
                    Scene {selected + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={selected === 0}
                      onClick={() => moveShot(selected, -1)}
                      className="rounded border border-white/10 p-1 text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-30"
                      title="Move Left"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={selected === shots.length - 1}
                      onClick={() => moveShot(selected, 1)}
                      className="rounded border border-white/10 p-1 text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-30"
                      title="Move Right"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <h3 className="mt-2 text-base font-bold text-white">{currentShot.title}</h3>
              </div>

              {/* Clip Trimming Editor Controls */}
              <div className="space-y-4 rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-center justify-between">
                  <p className="t-caption text-zinc-400">Clip Trimming (Cut Range)</p>
                  <Scissors className="h-4 w-4 text-[#b9f42e]" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-zinc-400">Trim Start (s)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max={getShotEnd(currentShot) - 0.1}
                      value={getShotStart(currentShot)}
                      onChange={(e) => handleUpdateTrim(currentShot, parseFloat(e.target.value) || 0, getShotEnd(currentShot))}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs font-mono font-bold text-[#b9f42e] outline-none focus:border-[#b9f42e]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-400">Trim End (s)</label>
                    <input
                      type="number"
                      step="0.1"
                      min={getShotStart(currentShot) + 0.1}
                      max={currentShot.duration_seconds || 60}
                      value={getShotEnd(currentShot)}
                      onChange={(e) => handleUpdateTrim(currentShot, getShotStart(currentShot), parseFloat(e.target.value) || 1)}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs font-mono font-bold text-[#b9f42e] outline-none focus:border-[#b9f42e]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="text-zinc-400">Active Cut Duration:</span>
                  <span className="font-mono font-bold text-white">{getShotDuration(currentShot).toFixed(1)}s</span>
                </div>
              </div>

              {/* Prompt Description */}
              <div>
                <div className="flex items-center justify-between">
                  <p className="t-caption text-zinc-400">Prompt / Visual Details</p>
                  {currentShot.prompt && currentShot.prompt.length > 80 && (
                    <button
                      type="button"
                      onClick={() => setShowMorePrompt((open) => !open)}
                      className="text-[11px] font-semibold text-[#b9f42e] hover:underline"
                    >
                      {showMorePrompt ? "Show less" : "Show more"}
                    </button>
                  )}
                </div>
                <p className={`mt-2 text-xs leading-relaxed text-zinc-300 ${!showMorePrompt ? "line-clamp-3" : ""}`}>
                  {currentShot.prompt || "No prompt details provided for this scene."}
                </p>
              </div>

              {/* Subject References */}
              <div>
                <p className="t-caption text-zinc-400">Linked Assets</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {entities
                    .filter((e) => currentShot.referenced_entities?.includes(e.id))
                    .map((entity) => (
                      <div key={entity.id} className="w-16">
                        <AssetImage src={entity.reference_images?.[0]} />
                        <p className="mt-1 truncate text-[10px] text-zinc-400">{entity.name}</p>
                      </div>
                    ))}
                  {!entities.some((e) => currentShot.referenced_entities?.includes(e.id)) && (
                    <span className="text-xs text-zinc-500">No linked character assets</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-zinc-500">No scene selected.</div>
          )}
        </aside>
      </div>

      {/* Multi-Track Timeline & Playhead Scrubber */}
      <div className="border-t border-white/10 bg-[#0f100f] p-4">
        {/* Scrubber Time Bar & Zoom Controls */}
        <div className="mb-3 flex items-center justify-between text-xs font-mono">
          <span className="text-[#b9f42e] font-bold">{formatTimecode(globalTime)}</span>

          <div className="flex items-center gap-3 text-zinc-400">
            <ZoomOut className="h-4 w-4 cursor-pointer hover:text-white" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} />
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.25"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-24 accent-[#b9f42e]"
            />
            <ZoomIn className="h-4 w-4 cursor-pointer hover:text-white" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} />
          </div>

          <span className="text-zinc-400">{formatTimecode(totalProjectDuration)}</span>
        </div>

        {/* Timeline Tracks Box */}
        <div
          className="relative min-h-[96px] overflow-x-auto rounded-xl border border-white/10 bg-[#141514] p-3 cursor-pointer"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const pct = Math.max(0, Math.min(1, clickX / rect.width));
            setGlobalTime(pct * totalProjectDuration);
          }}
        >
          {/* Draggable Playhead Scrubber Red Line */}
          <div
            className="absolute top-0 bottom-0 z-30 w-0.5 bg-red-500 shadow-[0_0_8px_#ef4444] pointer-events-none transition duration-75"
            style={{ left: `${totalProjectDuration > 0 ? (globalTime / totalProjectDuration) * 100 : 0}%` }}
          >
            <div className="h-3 w-3 -translate-x-[5px] -translate-y-1.5 rotate-45 bg-red-500" />
          </div>

          {/* Shot Sequence Clips Track */}
          <div className="flex gap-2" style={{ transform: `scaleX(${zoom})`, transformOrigin: "left center" }}>
            {shots.map((s, idx) => {
              const dur = getShotDuration(s);
              const isSel = idx === selected;
              const isAct = idx === activeShotIndex;

              return (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(idx);
                    setGlobalTime(cumulativeOffsets[idx] || 0);
                  }}
                  className={`group relative flex h-20 min-w-[120px] flex-col justify-between overflow-hidden rounded-xl border p-2 text-left transition ${isSel ? "border-[#b9f42e] bg-[#b9f42e]/10 ring-2 ring-[#b9f42e]/30" : isAct ? "border-white/30 bg-white/10" : "border-white/10 bg-[#1b1c1b] hover:border-white/20"}`}
                  style={{ flex: dur }}
                >
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className="truncate text-zinc-200">Scene {idx + 1}</span>
                    <span className="font-mono text-[10px] text-[#b9f42e]">{dur.toFixed(1)}s</span>
                  </div>

                  <p className="truncate text-[10px] text-zinc-400">{s.title}</p>

                  {/* Cut Handle Trim Indicators */}
                  <div className="flex justify-between border-t border-white/5 pt-1 text-[9px] font-mono text-zinc-500">
                    <span>{formatTimecode(getShotStart(s))}</span>
                    <span>{formatTimecode(getShotEnd(s))}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Video Export Dialog Modal */}
      {exportModalOpen && (
        <RenderExportModal
          shots={shots}
          close={() => setExportModalOpen(false)}
        />
      )}
    </div>
  );
}
/**
 * The enlarged look at a reference thumbnail, shown on hover.
 *
 * A reference strip is a row of 72px squares — enough to tell a face from a
 * doorway, not enough to tell which shot's clip is sitting in Motion
 * Reference, or which of two similar keyframes got picked. This is placed as a
 * sibling inside the thumbnail's own `group relative` wrapper, so it needs no
 * hover state of its own: the surrounding tile's existing `group-hover:` is
 * what reveals it, the same trigger that already reveals that tile's remove
 * button.
 */
/**
 * The enlarged look at a reference thumbnail, shown on hover.
 *
 * A CSS-only `group-hover` popup, positioned `absolute` off the tile, is
 * clipped by any scrollable ancestor between it and the page — and every one
 * of these thumbnail strips scrolls horizontally, which forces the browser to
 * also clip vertically per the CSS overflow spec's own fixup rule, whether or
 * not the strip's own `overflow-hidden` was worked around. The popup escaped
 * the tile and was still invisible, clipped one level up. Portaling it to
 * `document.body` and positioning it from the tile's real screen coordinates
 * is what actually gets it out from under every ancestor's clip at once.
 */
function HoverPreviewTile({ src, kind, label, className, children }: {
  src: string;
  kind: "image" | "video";
  label?: string;
  className: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (src.startsWith("http")) { setUrl(src); return; }
    let active = true;
    getSignedMediaUrl(src).then((signed) => { if (active && signed) setUrl(signed); });
    return () => { active = false; };
  }, [src]);
  const show = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setAnchor({ left: rect.left + rect.width / 2, top: rect.top });
  };
  return (
    <div ref={ref} className={className} onMouseEnter={show} onMouseLeave={() => setAnchor(null)}>
      {children}
      {anchor && typeof document !== "undefined" && createPortal(
        <div
          className="pointer-events-none fixed z-[999] w-52 -translate-x-1/2 -translate-y-full overflow-hidden rounded-xl border border-white/15 bg-black shadow-2xl"
          style={{ left: anchor.left, top: anchor.top - 8 }}
        >
          {url ? (
            kind === "video"
              // Autoplaying here, unlike the small tile's static first frame,
              // is the whole point: it is how the user tells which clip this
              // is without opening it.
              ? <video src={url} className="block aspect-video w-full bg-black object-contain" autoPlay loop muted playsInline />
              : <img src={url} alt="" className="block aspect-video w-full bg-black object-contain" />
          ) : (
            <div className="grid aspect-video place-items-center text-[10px] text-zinc-500">Loading…</div>
          )}
          {label && <p className="truncate bg-black/85 px-2 py-1 text-[10px] font-semibold text-zinc-200">{label}</p>}
        </div>,
        document.body,
      )}
    </div>
  );
}
function AssetImage({ src, className }: { src?: string; className?: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!src || src.startsWith("http")) return;
    let active = true;
    // Batched and cached: a grid of thumbnails resolves in one signing request
    // instead of one per tile fighting over the auth token.
    getSignedMediaUrl(src).then((signed) => { if (active && signed) setUrl(signed); });
    return () => { active = false; };
  }, [src]);
  const displayUrl = src?.startsWith("http") ? src : url;
  return (
    <div className={`aspect-[4/3] bg-gradient-to-br from-[#4d5044] to-[#161716] ${className || ""}`}>
      {displayUrl && <img src={displayUrl} alt="" className={`h-full w-full ${className ? className : "object-cover"}`} />}
    </div>
  );
}
// AssetImage wraps its <img> in a div, which is invalid inside a <span> and
// breaks hydration. Mention chips are inline, so they need a bare image.
function AssetThumb({ src, className }: { src?: string; className?: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!src) return;
    let active = true;
    getSignedMediaUrl(src).then((signed) => { if (active && signed) setUrl(signed); });
    return () => { active = false; };
  }, [src]);
  if (!url) return null;
  return <img src={url} alt="" className={className || "block h-24 w-full object-cover"} />;
}

function AssetVideo({ src }: { src?: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!src || src.startsWith("http")) return;
    let active = true;
    // Batched and cached: a grid of thumbnails resolves in one signing request
    // instead of one per tile fighting over the auth token.
    getSignedMediaUrl(src).then((signed) => { if (active && signed) setUrl(signed); });
    return () => { active = false; };
  }, [src]);
  const displayUrl = src?.startsWith("http") ? src : url;
  // Metadata-only preload with a first-frame fragment keeps the grid light
  // while still showing what the clip actually looks like.
  return displayUrl
    ? <video src={`${displayUrl}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
    : <div className="h-full w-full bg-gradient-to-br from-[#4d5044] to-[#161716]" />;
}
function Preview({
  src,
  label,
  type = "image",
  aspectRatio = "9:16",
  fit = "contain",
  busy = false,
}: {
  src: string | null;
  label: string;
  type?: "image" | "video";
  aspectRatio?: string;
  fit?: "cover" | "contain";
  /**
   * A render is running for this slot. The work happens on a server over
   * minutes, so without a sign of life the cell reads as an empty frame that
   * nothing is being done about — and on a redo, as the old frame unchanged.
   */
  busy?: boolean;
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
    <div className={`relative overflow-hidden rounded-lg bg-[#2a2c2b] ${aspectClass}`} aria-busy={busy || undefined}>
      {src ? (
        <ResolvedMedia
          src={src}
          type={type}
          className={`h-full w-full transition ${busy ? "opacity-30" : ""} ${fit === "contain" ? "object-contain bg-black/80" : "object-cover"}`}
        />
      ) : !busy ? (
        <div className="grid h-full place-items-center p-2 text-center text-xs text-zinc-500">
          {label}
        </div>
      ) : null}
      {busy && (
        <>
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-[#b9f42e]/20 to-transparent" />
          <div className="absolute inset-0 grid place-items-center p-2">
            <span className="flex flex-col items-center gap-1.5 text-center">
              <Loader2 className="h-4 w-4 animate-spin text-[#b9f42e]" />
              <span className="text-[10px] font-semibold leading-tight text-[#b9f42e]">{label}</span>
            </span>
          </div>
        </>
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
    getSignedMediaUrl(src).then((signed) => { if (active) setSignedUrl(signed || ""); });
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
