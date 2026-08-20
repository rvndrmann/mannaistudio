"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QuickHistoryItem } from "@/lib/studio/quick-media";

/**
 * Everything this account has generated outside a production.
 *
 * Paged by the timestamp of the last row rather than by an offset: a page
 * fetched while a generation finishes would otherwise repeat or skip a row as
 * the list shifts down by one underneath it.
 */
export function useQuickHistory(options: { type: "image" | "video" | "all"; limit?: number }) {
  const { type, limit = 24 } = options;
  const [items, setItems] = useState<QuickHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Guards against an earlier request landing after a later one and pasting
  // the old filter's rows over the new one's.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const ticket = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/studio/generate/history?type=${type}&limit=${limit}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load your history.");
      if (ticket !== requestId.current) return;
      setItems(Array.isArray(body.items) ? body.items : []);
      setCursor(typeof body.nextCursor === "string" ? body.nextCursor : null);
    } catch (cause) {
      if (ticket !== requestId.current) return;
      setError(cause instanceof Error ? cause.message : "Could not load your history.");
    } finally {
      if (ticket === requestId.current) setLoading(false);
    }
  }, [type, limit]);

  useEffect(() => { void load(); }, [load]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await fetch(
        `/api/studio/generate/history?type=${type}&limit=${limit}&before=${encodeURIComponent(cursor)}`,
        { cache: "no-store" },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load more.");
      const page: QuickHistoryItem[] = Array.isArray(body.items) ? body.items : [];
      // Deduplicated on merge: a row created between the two requests can
      // legitimately appear in both pages.
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...page.filter((item) => !seen.has(item.id))];
      });
      setCursor(typeof body.nextCursor === "string" ? body.nextCursor : null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load more.");
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, type, limit]);

  const remove = useCallback(async (id: string) => {
    const response = await fetch(`/api/studio/generate/history?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Could not delete this generation.");
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  /** Puts a just-finished generation at the front without a round trip. */
  const prepend = useCallback((item: QuickHistoryItem) => {
    setItems((current) => [item, ...current.filter((existing) => existing.id !== item.id)]);
  }, []);

  return { items, loading, loadingMore, error, hasMore: Boolean(cursor), load, loadMore, remove, prepend };
}
