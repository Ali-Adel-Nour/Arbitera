'use client';

/**
 * =============================================================================
 * `src/hooks/useAgents.ts` — the agent list, with each score computed here
 * =============================================================================
 *
 * NOT POLLED, and that is the deliberate difference from `useEscrows`. A deal
 * moves through six states in under a minute, so the docket has to poll. An
 * agent's reputation changes when a deal resolves — minutes apart at best — and
 * polling it would multiply requests by the number of agents for a figure that
 * did not move. So this loads once, exposes `reload`, and says when it loaded.
 *
 * ONE REQUEST PER AGENT, AND WHY THAT IS ACCEPTABLE HERE. `GET /api/agents`
 * returns identifiers and `totalJudged` but not the judgment history, and the
 * trust score is a function of the history — so a score cannot be computed from
 * the list alone. The list is two agents against the fixtures and would be a
 * short list against any real deployment of this protocol, and the requests go
 * out in parallel. The alternative is showing a list with no scores, which makes
 * the screen an index rather than a trust explorer.
 *
 * That said, the N+1 IS A REAL SHAPE and it is the list route's fault, not this
 * hook's. `AgentListEntry` in `types.ts` names what the backend would have to add
 * to remove it. If the agent count ever grows past a screenful, that route needs
 * to carry the history counts and this hook collapses to one request.
 *
 * A FAILED REPUTATION LOOKUP DROPS ONE ROW, NOT THE SCREEN. `Promise.all` would
 * reject the whole batch on one failure, so the results are collected
 * individually and the successful ones render. An agent whose reputation could
 * not be read is reported in its own count rather than silently vanishing —
 * disappearing rows on a trust surface is how a reader ends up trusting a list
 * that is quietly incomplete.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { badgeTier, recencyWeightedReliability, trustScore } from '@/lib/derive';
import { getAgents, getReputation, isAborted } from '@/services/api';
import type { AgentListEntry, ApiError, BadgeTier, ReputationSummary } from '@/types';

/** One row: the protocol's fields, plus the three figures computed here. */
export interface AgentSummaryRow extends AgentListEntry {
  /** @derived — `lib/derive.ts` over the reputation history. */
  score: number;
  tier: BadgeTier;
  reliability: number;
  /** The full record, so the detail screen and the drill-down can reuse it. */
  summary: ReputationSummary;
}

export interface AgentsResult {
  rows: AgentSummaryRow[];

  /**
   * How many agents were listed but whose reputation could not be read. Rendered
   * as a sentence rather than swallowed — see the note above.
   */
  unreadable: number;

  /** The list request's own failure. Non-null means there are no rows at all. */
  error: ApiError | null;

  isLoading: boolean;
  loadedAt: number | null;
  reload: () => void;
}

export function useAgents(): AgentsResult {
  const [rows, setRows] = useState<AgentSummaryRow[]>([]);
  const [unreadable, setUnreadable] = useState(0);
  const [error, setError] = useState<ApiError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  const cancelled = useRef(false);
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    setIsLoading(true);

    const listed = await getAgents(controller.signal);
    if (cancelled.current || isAborted(listed)) return;

    if (!listed.ok) {
      setError(listed.error);
      setIsLoading(false);
      return;
    }

    // Individually, not Promise.all: one failed lookup must not take the batch.
    const settled = await Promise.all(
      listed.data.agents.map(async (entry) => {
        const result = await getReputation(entry.agent, controller.signal);
        return result.ok ? { entry, summary: result.data } : null;
      }),
    );
    if (cancelled.current) return;

    const now = Date.now();
    const built = settled.flatMap((item) => {
      if (item === null) return [];

      // `nowMs` passed explicitly and once, so every row in a single load is
      // scored against the same instant. Letting each call default to
      // `Date.now()` would score the last row microseconds later than the
      // first — invisible here, but it makes the figures non-reproducible for
      // no reason.
      const score = trustScore(item.summary, now);

      return [
        {
          ...item.entry,
          score,
          tier: badgeTier(score, item.summary.totalJudged),
          reliability: recencyWeightedReliability(item.summary.history, now),
          summary: item.summary,
        },
      ];
    });

    setRows(built);
    setUnreadable(listed.data.agents.length - built.length);
    setError(null);
    setIsLoading(false);
    setLoadedAt(now);
  }, []);

  useEffect(() => {
    cancelled.current = false;
    void load();

    return () => {
      cancelled.current = true;
      inFlight.current?.abort();
      inFlight.current = null;
    };
  }, [load]);

  const reload = useCallback(() => void load(), [load]);

  return { rows, unreadable, error, isLoading, loadedAt, reload };
}
