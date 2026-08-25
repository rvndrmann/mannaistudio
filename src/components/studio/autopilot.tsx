"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Hand, Gauge, Zap, Square } from "lucide-react";
import {
  autopilotModeDescriptions,
  autopilotModeLabels,
  autopilotActionsFrom,
  autopilotModes,
  decideAutopilot,
  defaultAutopilotBudget,
  type AutopilotAction,
  type AutopilotBudget,
  type AutopilotMode,
  usableAutopilotActions,
  type AutopilotProposal,
} from "@/lib/studio/autopilot";

export { autopilotActionsFrom };

/**
 * The mode switch and the loop behind it.
 *
 * The loop does nothing the user could not do by hand: it presses the same
 * next-step button the chat already renders, and approves the same cards. That
 * is deliberate — the pipeline stays the single description of what happens
 * next, and a mode is only an answer to who presses it. Anything the policy
 * will not press is handed straight back with the reason written out.
 *
 * It runs in the browser. Closing the tab stops it, which is the honest
 * behaviour for something spending credits on the user's behalf: nothing keeps
 * running unattended after the window that started it is gone.
 */

const modeIcons: Record<AutopilotMode, typeof Hand> = {
  manual: Hand,
  semi_auto: Gauge,
  full_auto: Zap,
};

/** Statuses a generation job holds while the provider still owes a result. */
const activeJobStatuses = ["queued", "approved", "generating", "processing"];

type ProposalRecord = {
  id: string;
  action_type: string;
  title: string;
  status: string;
  estimated_credits: number;
  payload: Record<string, unknown>;
  session_id?: string | null;
};

/**
 * Whether a card is about an image or a clip, read from its own payload.
 *
 * The two tools that carry media state it differently: submit_generation nests
 * it under the generation request, attach_media_to_shot names it directly. Only
 * reading the first is what let a video attach look like an image.
 */
function proposalGenerationType(proposal: ProposalRecord): string | undefined {
  const payload = proposal.payload as { request?: { type?: unknown }; mediaType?: unknown } | null;
  const requestType = payload?.request?.type;
  if (typeof requestType === "string") return requestType;
  return typeof payload?.mediaType === "string" ? payload.mediaType : undefined;
}

export type AutopilotRunnerInput = {
  mode: AutopilotMode;
  budget: AutopilotBudget;
  /** The newest assistant reply's stored next-step actions. */
  actions: AutopilotAction[];
  /**
   * The id of the reply those actions came from.
   *
   * A stored step describes the production as it was when that reply was
   * written. Approving a card and letting the render land changes the state
   * underneath it, and no new reply is written when that happens — so the same
   * block sat there saying "generate the image for shot 2" after shot 2 was
   * already made. Pressing it again is a second render of a frame that exists.
   * Once a block has been acted on it is spent, and the run asks for the next
   * step instead of replaying it.
   */
  replyId?: string | null;
  proposals: ProposalRecord[];
  activeSessionId?: string | null;
  generationJobs: Array<{ status: string }>;
  creditBalance?: number | null;
  /** A turn is streaming, or the workspace is reloading. */
  busy: boolean;
  chatError: string | null;
  sendDirectorMessage: (intent: string) => Promise<void>;
  approveProposal: (proposalId: string) => Promise<void>;
  /** Pull the workspace again while waiting on a provider job. */
  refresh: () => void;
  /** The user has chosen the mode, sent a message, or pressed a step. */
  engaged: boolean;
  /** Shots as the workspace holds them, for working out the image batch. */
  shots: Array<{ id: string; order_index: number; prompt: string | null; keyframe_image: string | null }>;
  /** Shot ids with an image generation already running. */
  imageJobShotIds: string[];
  onModeChange: (mode: AutopilotMode) => void;
};

export type AutopilotRunnerState = {
  /** The loop has work it is actively taking, or is waiting on a render. */
  active: boolean;
  /** What it is doing right now, for the banner. */
  status: string | null;
  /** Why it handed back, when it did. */
  notice: string | null;
  stepsTaken: number;
  creditsCommitted: number;
  stop: () => void;
  dismissNotice: () => void;
};

/**
 * The same intent coming back this many times in a row means the production is
 * not advancing — the Director keeps being asked for a step it is not taking.
 * Pressing it forever would burn the step cap and, if it ever did generate,
 * credits. Two retries is enough to ride out a transient failure.
 */
const REPEAT_LIMIT = 3;

/** How often to look again while a provider job is still rendering. */
const WAIT_POLL_MS = 6000;

export function useAutopilotRunner(input: AutopilotRunnerInput): AutopilotRunnerState {
  const [stepsTaken, setStepsTaken] = useState(0);
  const [creditsCommitted, setCreditsCommitted] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stopRequested, setStopRequested] = useState(false);
  // The reply whose step has already been taken.
  const [consumedReplyId, setConsumedReplyId] = useState<string | null>(null);

  // The tick reads live values through a ref so the effect can depend on the
  // few things that should retrigger it, rather than on every callback the
  // page happens to recreate each render.
  const latest = useRef(input);
  latest.current = input;
  const ticking = useRef(false);
  // Approving is not idempotent from here: a second call on the same card while
  // the first is still in flight submits the generation twice.
  const approved = useRef(new Set<string>());
  const lastIntent = useRef<{ intent: string; count: number }>({ intent: "", count: 0 });

  const { mode, busy, chatError, activeSessionId, replyId } = input;
  // Spent blocks are not steps. Falling back to none is what turns the next
  // tick into "ask the Director where we are", which re-reads live state.
  const usableActions = useMemo(
    () => usableAutopilotActions(input.actions, replyId, consumedReplyId),
    [replyId, consumedReplyId, input.actions],
  );
  // The pending cards this session owes an answer on, and what they cost.
  const pendingProposals = useMemo<AutopilotProposal[]>(() => input.proposals
    .filter((proposal) => proposal.status === "pending"
      && (!activeSessionId || !proposal.session_id || proposal.session_id === activeSessionId)
      && !approved.current.has(proposal.id))
    .map((proposal) => ({
      id: proposal.id,
      actionType: proposal.action_type,
      title: proposal.title,
      estimatedCredits: Number(proposal.estimated_credits) || 0,
      generationType: proposalGenerationType(proposal),
    })), [input.proposals, activeSessionId]);
  // Every generation is charged, so this list decides what the user pays for.
  // A shot is only in it if it has a prompt to render, has no image already,
  // and has nothing rendering for it right now.
  const shotsAwaitingImage = useMemo(() => {
    const running = new Set(input.imageJobShotIds);
    return input.shots
      .filter((shot) => shot.prompt && !shot.keyframe_image && !running.has(shot.id))
      .map((shot) => shot.order_index + 1)
      .sort((a, b) => a - b);
  }, [input.shots, input.imageJobShotIds]);
  const inFlight = useMemo(
    () => input.generationJobs.filter((job) => activeJobStatuses.includes(String(job.status))).length,
    [input.generationJobs],
  );

  const stop = useCallback(() => {
    setStopRequested(true);
    setStatus(null);
    // The switch is the run. Stopping puts it back to manual rather than
    // leaving an auto mode selected that is quietly not running — a control
    // that says "Full auto" while nothing advances is the worse failure.
    latest.current.onModeChange("manual");
  }, []);

  const dismissNotice = useCallback(() => setNotice(null), []);

  // A new reply is real progress, so the "same step over and over" guard starts
  // again. Without this a run that legitimately asks for the next step once per
  // shot would trip its own guard after three shots and stop halfway.
  useEffect(() => {
    lastIntent.current = { intent: "", count: 0 };
  }, [replyId]);

  // A new mode is a new run: the caps are per run, and carrying a spent budget
  // into the next one would stop it before it started.
  useEffect(() => {
    setStepsTaken(0);
    setCreditsCommitted(0);
    setStopRequested(false);
    setStatus(null);
    setNotice(null);
    setConsumedReplyId(null);
    approved.current = new Set();
    lastIntent.current = { intent: "", count: 0 };
  }, [mode, activeSessionId]);

  const decision = useMemo(() => decideAutopilot({
    mode,
    actions: usableActions,
    pendingProposals,
    inFlight,
    stepsTaken,
    creditsCommitted,
    budget: input.budget,
    stopRequested,
    busy,
    engaged: input.engaged,
    lastError: chatError,
    creditBalance: input.creditBalance,
    shotsAwaitingImage,
  }), [mode, usableActions, pendingProposals, inFlight, stepsTaken, creditsCommitted, input.budget, stopRequested, busy, chatError, input.creditBalance, input.engaged, shotsAwaitingImage]);

  useEffect(() => {
    if (mode === "manual" || ticking.current) return;

    if (decision.action === "stop") {
      setStatus(null);
      if (decision.notice) setNotice(decision.notice);
      return;
    }
    if (decision.action === "wait") {
      if (decision.reason === "busy") return;
      setStatus(inFlight > 0
        ? `Waiting on ${inFlight} ${inFlight === 1 ? "render" : "renders"}…`
        : "Waiting for the last step to land…");
      // Realtime already pulls the workspace when a job changes, but a dropped
      // socket would otherwise leave the run stalled with nothing to wake it.
      const timer = setTimeout(() => latest.current.refresh(), WAIT_POLL_MS);
      return () => clearTimeout(timer);
    }

    let cancelled = false;
    const run = async () => {
      ticking.current = true;
      try {
        if (decision.action === "approve") {
          const cards = pendingProposals.filter((proposal) => decision.proposalIds.includes(proposal.id));
          const cost = cards.reduce((total, card) => total + card.estimatedCredits, 0);
          setStatus(`Approving ${cards.length} prepared ${cards.length === 1 ? "change" : "changes"}…`);
          for (const card of cards) {
            if (cancelled || latest.current.mode === "manual") return;
            approved.current.add(card.id);
            await latest.current.approveProposal(card.id);
          }
          setCreditsCommitted((current) => current + cost);
          // The approval changes the state the stored step was written against.
          setConsumedReplyId(replyId ?? null);
          return;
        }
        // Same step, again and again, means the turn is not moving the
        // production. Handing back beats pressing it until the cap.
        const repeat = lastIntent.current.intent === decision.intent ? lastIntent.current.count + 1 : 1;
        lastIntent.current = { intent: decision.intent, count: repeat };
        if (repeat > REPEAT_LIMIT) {
          setStatus(null);
          setNotice(`Stopped: the production is not moving past "${decision.label}". Take a look before starting it again.`);
          latest.current.onModeChange("manual");
          return;
        }
        setStatus(`${decision.label}…`);
        setStepsTaken((current) => current + 1);
        setConsumedReplyId(replyId ?? null);
        await latest.current.sendDirectorMessage(decision.intent);
      } finally {
        ticking.current = false;
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [decision, mode, inFlight, pendingProposals, replyId]);

  return {
    active: mode !== "manual" && (decision.action === "run" || decision.action === "approve" || decision.action === "wait"),
    status,
    notice,
    stepsTaken,
    creditsCommitted,
    stop,
    dismissNotice,
  };
}

/** The three-way switch, sitting with the composer's other run settings. */
export function AutopilotModeControl({ mode, onChange, disabled }: {
  mode: AutopilotMode;
  onChange: (mode: AutopilotMode) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const Icon = modeIcons[mode];
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Run mode: ${autopilotModeLabels[mode]}. Change how much the Director runs on its own.`}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium outline-none transition disabled:opacity-50 ${
          mode === "manual"
            ? "border-white/[0.06] bg-[#141414] text-zinc-300 hover:border-[#b9f42e]/40"
            : "border-[#b9f42e]/50 bg-[#b9f42e]/10 text-[#d9ff84]"
        }`}
      >
        <Icon className="h-3 w-3" />
        {autopilotModeLabels[mode]}
      </button>
      {open && (
        <>
          <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute bottom-[calc(100%+8px)] left-0 z-50 w-[19rem] overflow-hidden rounded-xl border border-white/10 bg-[#18191c] p-1.5 shadow-2xl">
            <p className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Run mode</p>
            {autopilotModes.map((option) => {
              const OptionIcon = modeIcons[option];
              const selected = option === mode;
              return (
                <button
                  key={option}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => { onChange(option); setOpen(false); }}
                  className={`flex w-full gap-2.5 rounded-lg p-2.5 text-left transition ${selected ? "bg-[#b9f42e]/10" : "hover:bg-white/[0.06]"}`}
                >
                  <OptionIcon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${selected ? "text-[#b9f42e]" : "text-zinc-500"}`} />
                  <span>
                    <span className={`block text-[12px] font-bold ${selected ? "text-[#b9f42e]" : "text-zinc-200"}`}>
                      {autopilotModeLabels[option]}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-zinc-500">{autopilotModeDescriptions[option]}</span>
                  </span>
                </button>
              );
            })}
            <p className="border-t border-white/[0.06] px-2.5 py-2 text-[10px] leading-4 text-zinc-600">
              An auto run stops on anything that deletes or rewrites your work, and at {defaultAutopilotBudget.maxCredits} credits. It only runs while this tab is open.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/** What the run is doing, with the way out of it. */
export function AutopilotBanner({ mode, state }: { mode: AutopilotMode; state: AutopilotRunnerState }) {
  if (state.notice) {
    return (
      <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-[13px] text-amber-100">
        <p>{state.notice}</p>
        <button
          type="button"
          onClick={state.dismissNotice}
          className="mt-2 rounded-full border border-amber-300/40 px-3 py-1 text-[12px] font-semibold text-amber-100 transition hover:bg-amber-400/20"
        >
          Got it
        </button>
      </div>
    );
  }
  if (mode === "manual" || !state.active) return null;
  return (
    <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-[#b9f42e]/25 bg-[#b9f42e]/[0.06] p-3">
      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#b9f42e]" />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-bold text-[#b9f42e]">
          {autopilotModeLabels[mode]} · {state.status || "Working…"}
        </p>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          {state.stepsTaken} {state.stepsTaken === 1 ? "step" : "steps"}
          {state.creditsCommitted > 0 ? ` · about ${state.creditsCommitted} credits committed` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={state.stop}
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-[12px] font-bold text-zinc-100 transition hover:border-red-400/60 hover:bg-red-500/15 hover:text-red-100 active:scale-[0.98]"
      >
        <Square className="h-3 w-3 fill-current" />
        Stop
      </button>
    </div>
  );
}

/**
 * The loop and its banner as one element the workspace can drop into the chat.
 *
 * The hook lives in here rather than in the page because the page returns early
 * while the workspace is loading, and a hook cannot be called on one render and
 * skipped on the next. The mode itself stays owned by the page, since the
 * switch that sets it sits down in the composer.
 */
export function AutopilotRunner(props: AutopilotRunnerInput) {
  const state = useAutopilotRunner(props);
  return <AutopilotBanner mode={props.mode} state={state} />;
}
