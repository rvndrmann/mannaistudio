"use client";

import { useEffect, useState } from "react";
import { Loader2, Mail, MessageSquare, Phone, Trash2 } from "lucide-react";
import type { BrandLeadView } from "./types";

export default function BrandLeads({ brandId }: { brandId: string }) {
  const [leads, setLeads] = useState<BrandLeadView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/studio/brands/${brandId}/leads`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load leads.");
        if (active) setLeads(data.leads || []);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load leads.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [brandId]);

  const remove = async (lead: BrandLeadView) => {
    setLeads((current) => current.filter((item) => item.id !== lead.id));
    await fetch(`/api/studio/brands/${brandId}/leads?id=${lead.id}`, { method: "DELETE" });
  };

  const captured = leads.filter((lead) => lead.captured_at);
  const conversations = leads.filter((lead) => !lead.captured_at);

  if (loading) {
    return (
      <div className="grid place-items-center p-8 text-zinc-600">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const card = (lead: BrandLeadView) => (
    <article key={lead.id} className="rounded-xl border border-white/[0.06] bg-[#111211]">
      <button onClick={() => setOpenId(openId === lead.id ? null : lead.id)} className="w-full p-3 text-left">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[13px] font-bold text-zinc-100">{lead.name || "Someone"}</p>
          <span className="shrink-0 text-[10px] text-zinc-500">{new Date(lead.created_at).toLocaleDateString()}</span>
        </div>
        {lead.company && <p className="mt-0.5 truncate text-[11px] text-zinc-500">{lead.company}</p>}
        <div className="mt-1.5 flex flex-wrap gap-2">
          {lead.email && (
            <span className="flex items-center gap-1 text-[11px] text-[#b9f42e]">
              <Mail className="h-3 w-3" />
              {lead.email}
            </span>
          )}
          {lead.phone && (
            <span className="flex items-center gap-1 text-[11px] text-[#b9f42e]">
              <Phone className="h-3 w-3" />
              {lead.phone}
            </span>
          )}
          <span className="flex items-center gap-1 text-[11px] text-zinc-600">
            <MessageSquare className="h-3 w-3" />
            {lead.message_count}
          </span>
        </div>
        {lead.intent && <p className="mt-1.5 line-clamp-2 text-[12px] leading-5 text-zinc-400">{lead.intent}</p>}
      </button>

      {openId === lead.id && (
        <div className="border-t border-white/[0.06] p-3">
          <div className="max-h-64 space-y-1.5 overflow-auto">
            {(lead.transcript || []).map((entry, index) => (
              <p
                key={index}
                className={`whitespace-pre-wrap rounded-lg p-2 text-[12px] leading-5 ${
                  entry.role === "visitor" ? "bg-[#b9f42e]/10 text-zinc-200" : "bg-[#1a1a1a] text-zinc-400"
                }`}
              >
                {entry.content}
              </p>
            ))}
            {!(lead.transcript || []).length && <p className="text-[11px] text-zinc-600">No transcript.</p>}
          </div>
          <button
            onClick={() => remove(lead)}
            className="mt-2 flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[11px] font-semibold text-zinc-400 hover:border-red-500/40 hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      )}
    </article>
  );

  return (
    <div className="space-y-3 p-4">
      <p className="text-[12px] leading-5 text-zinc-500">
        People the website chat talked to. Turn the widget on in the Brand tab to start collecting them.
      </p>
      {error && <p className="text-[12px] font-semibold text-red-400">{error}</p>}

      {captured.length > 0 && (
        <>
          <p className="text-[11px] font-bold tracking-[.16em] text-[#b9f42e]">LEADS ({captured.length})</p>
          <div className="space-y-2">{captured.map(card)}</div>
        </>
      )}

      {conversations.length > 0 && (
        <>
          <p className="pt-2 text-[11px] font-bold tracking-[.16em] text-zinc-500">CONVERSATIONS ({conversations.length})</p>
          {/* Nobody can reply to these, but they are the questions visitors
              actually asked, which is worth reading on its own. */}
          <div className="space-y-2">{conversations.map(card)}</div>
        </>
      )}

      {!leads.length && !error && <p className="text-[12px] text-zinc-600">Nobody has used the website chat yet.</p>}
    </div>
  );
}
