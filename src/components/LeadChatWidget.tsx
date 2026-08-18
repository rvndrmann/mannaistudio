"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Clapperboard, Loader2, MessageCircle, Send, Wallet, X, Zap } from "lucide-react";

type Proposal = {
  projectId: string;
  episodeId: string;
  summary: string;
  balance: number;
  shortfall: number;
  lines: string[];
  estimate: { totalCredits: number; shotCount: number; totalSeconds: number; resolution: string };
};

type OpenedProject = { id: string; name: string };

type Bubble = { role: "visitor" | "agent"; content: string; proposal?: Proposal | null; project?: OpenedProject | null };

const SESSION_KEY = "brand-chat-session";

/**
 * The chat bubble on the marketing site.
 *
 * It renders nothing at all unless a brand has switched its widget on, so the
 * landing page is unchanged for anyone who has not set one up. The session id
 * is kept in localStorage so a visitor who reloads is still talking to the same
 * conversation rather than starting again as a stranger.
 */
export default function LeadChatWidget() {
  const [available, setAvailable] = useState(false);
  const [member, setMember] = useState(false);
  const [greeting, setGreeting] = useState("");
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/chat-widget")
      .then((response) => response.json())
      .then((data) => {
        if (!active || !data?.enabled) return;
        setAvailable(true);
        setMember(Boolean(data.member));
        setGreeting(data.greeting || "");
      })
      .catch(() => {
        // The page must not care that the chat is unreachable.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, sending]);

  // On a phone the panel covers the page, so the page behind it must stop
  // scrolling — otherwise a swipe inside the chat drags the landing page.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const isSmallScreen = window.matchMedia("(max-width: 639px)").matches;
    if (!open || !isSmallScreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const send = async () => {
    const message = draft.trim();
    if (!message || sending) return;
    setDraft("");
    setMessages((current) => [...current, { role: "visitor", content: message }]);
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/chat-widget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          sessionId: window.localStorage.getItem(SESSION_KEY) || undefined,
          sourcePath: window.location.pathname,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
      if (data.sessionId) window.localStorage.setItem(SESSION_KEY, data.sessionId);
      if (data.member) setMember(true);
      setMessages((current) => [...current, { role: "agent", content: data.reply, proposal: data.proposal || null, project: data.project || null }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const approveProduction = async (proposal: Proposal) => {
    if (approving) return;
    setApproving(true);
    setError("");
    try {
      const response = await fetch("/api/chat-widget/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: proposal.projectId,
          episodeId: proposal.episodeId,
          secondsPerShot: Math.max(1, Math.round(proposal.estimate.totalSeconds / Math.max(1, proposal.estimate.shotCount))),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Production approval failed.");
      window.location.assign(data.startUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Production approval failed.");
      setApproving(false);
    }
  };

  if (!available) return null;

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[95] flex flex-col overflow-hidden border-white/10 bg-[#0d0e0d] shadow-2xl sm:inset-auto sm:bottom-24 sm:right-4 sm:h-[min(32rem,72vh)] sm:w-[23rem] sm:rounded-2xl sm:border"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          role="dialog"
          aria-label="Chat"
        >
          <div
            className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] bg-[#0a0a0a] px-4 py-3 sm:px-3 sm:py-2.5"
            style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
          >
            <span className="h-2 w-2 rounded-full bg-[#b9f42e]" />
            <p className="text-[13px] font-bold text-zinc-100 sm:text-[12px]">Chat with us</p>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="-mr-2 ml-auto grid h-11 w-11 place-items-center rounded-full text-zinc-400 hover:text-white sm:h-8 sm:w-8"
            >
              <X className="h-5 w-5 sm:h-4 sm:w-4" />
            </button>
          </div>

          <div ref={scroller} className="min-h-0 flex-1 overflow-auto overscroll-contain p-4 sm:p-3">
            {greeting && (
              <div className="mb-2.5 max-w-[88%] rounded-xl bg-[#181918] p-3 text-[14px] leading-6 text-zinc-200 sm:max-w-[90%] sm:p-2.5 sm:text-[13px]">{greeting}</div>
            )}
            {messages.map((bubble, index) => (
              <div key={index}>
                <div
                  className={`mb-2.5 max-w-[88%] whitespace-pre-wrap rounded-xl p-3 text-[14px] leading-6 sm:max-w-[90%] sm:p-2.5 sm:text-[13px] ${
                    bubble.role === "visitor" ? "ml-auto bg-[#b9f42e] text-black" : "bg-[#181918] text-zinc-200"
                  }`}
                >
                  {bubble.content}
                </div>

                {/* The production exists as soon as the script lands in it, so
                    the link is offered here rather than waiting for the quote —
                    a handoff that succeeded should be reachable even if the
                    step after it did not. */}
                {bubble.project && !bubble.proposal && (
                  <Link
                    href={`/studio/project/${bubble.project.id}`}
                    className="mb-2.5 flex w-fit items-center gap-1.5 rounded-lg border border-[#b9f42e]/30 bg-[#b9f42e]/[0.06] px-3 py-2 text-[12px] font-bold text-[#b9f42e]"
                  >
                    <Clapperboard className="h-3.5 w-3.5" />
                    Open {bubble.project.name}
                  </Link>
                )}

                {/* The approval card. Nothing is charged until the user presses
                    it, and the total beside their balance is what they are
                    agreeing to. */}
                {bubble.proposal && (
                  <div className="mb-2.5 overflow-hidden rounded-xl border border-[#b9f42e]/30 bg-[#b9f42e]/[0.05]">
                    <div className="border-b border-[#b9f42e]/20 px-3 py-2">
                      <p className="text-[10px] font-bold tracking-[.16em] text-[#b9f42e]">PRODUCTION COST</p>
                      {bubble.proposal.summary && <p className="mt-0.5 text-[12px] font-bold text-zinc-100">{bubble.proposal.summary}</p>}
                    </div>
                    <ul className="space-y-1 px-3 py-2.5">
                      {bubble.proposal.lines.map((line, position) => (
                        <li
                          key={position}
                          className={`text-[12px] leading-5 ${
                            position === bubble.proposal!.lines.length - 2
                              ? "font-bold text-[#b9f42e]"
                              : position === bubble.proposal!.lines.length - 1
                                ? bubble.proposal!.shortfall > 0
                                  ? "text-amber-400"
                                  : "text-zinc-400"
                                : "text-zinc-400"
                          }`}
                        >
                          {line}
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-col gap-2 border-t border-[#b9f42e]/20 p-2.5 sm:flex-row sm:flex-wrap">
                      {bubble.proposal.shortfall > 0 ? (
                        <Link
                          href="/studio/credits"
                          className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-[#b9f42e] px-3 text-[13px] font-bold text-black sm:min-h-0 sm:py-2 sm:text-[12px]"
                        >
                          <Wallet className="h-3.5 w-3.5" />
                          Add {bubble.proposal.shortfall} credits
                        </Link>
                      ) : (
                        <button
                          type="button"
                          disabled={approving}
                          onClick={() => approveProduction(bubble.proposal!)}
                          className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-[#b9f42e] px-3 text-[13px] font-bold text-black sm:min-h-0 sm:py-2 sm:text-[12px]"
                        >
                          {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clapperboard className="h-3.5 w-3.5" />}
                          {approving ? "Checking…" : "Approve & start"}
                        </button>
                      )}
                      <Link
                        href={`/studio/project/${bubble.proposal.projectId}`}
                        className="flex min-h-[44px] items-center justify-center rounded-lg border border-white/[0.08] px-3 text-[13px] font-semibold text-zinc-300 hover:border-[#b9f42e]/40 sm:min-h-0 sm:py-2 sm:text-[12px]"
                      >
                        Open the production
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {sending && (
              <div className="mb-2.5 flex w-fit items-center gap-2 rounded-xl bg-[#181918] p-2.5 text-[12px] text-zinc-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Typing…
              </div>
            )}
            {error && <p className="text-[12px] font-semibold text-red-400">{error}</p>}

            {/* Anonymous visitors can talk, but the pipeline needs an account:
                projects, assets, and credits all belong to somebody. */}
            {!member && messages.length > 0 && (
              <Link
                href="/login"
                className="mt-1 flex w-fit items-center gap-1.5 rounded-lg border border-[#b9f42e]/30 bg-[#b9f42e]/[0.06] px-2.5 py-1.5 text-[11px] font-bold text-[#b9f42e]"
              >
                <Zap className="h-3.5 w-3.5" />
                Sign in and I&apos;ll build it with you
              </Link>
            )}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
            className="flex shrink-0 items-end gap-2 border-t border-white/[0.06] p-3 sm:p-2.5"
          >
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder="Ask us anything…"
              // 16px on phones: anything smaller makes iOS Safari zoom the page
              // on focus, and it never zooms back out.
              className="min-h-[44px] w-full resize-none rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2.5 text-[16px] text-white outline-none placeholder:text-zinc-600 focus:border-[#b9f42e]/40 sm:min-h-[40px] sm:text-[13px]"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              aria-label="Send message"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#b9f42e] text-black disabled:opacity-40 sm:h-10 sm:w-10"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? "Close chat" : "Chat with us"}
        className={`fixed bottom-5 right-4 z-[90] h-14 w-14 items-center justify-center rounded-full bg-[#b9f42e] text-black shadow-[0_10px_30px_-6px_rgba(185,244,46,0.5)] transition-transform active:scale-95 ${open ? "hidden sm:flex" : "flex"}`}
        style={{ bottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </>
  );
}
