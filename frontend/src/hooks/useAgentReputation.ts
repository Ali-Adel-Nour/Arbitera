'use client';

/**
 * =============================================================================
 * `src/hooks/useAgentReputation.ts` — one agent, and every figure derived from it
 * =============================================================================
 *
 * Shared by the detail screen and the resolutions drill-down, which is the reason
 * it exists as its own hook: those two screens must not be able to disagree about
 * an agent's score. The drill-down's whole job is to show the arithmetic behind
 * the figure the detail screen displayed, and if each computed its own the pair
 * could differ by a rounding step and the drill-down would be explaining a number
 * that was never shown.
 *
 * ONE `nowMs` FOR THE WHOLE DERIVATION. Recency weighting is a function of time,
 * so `trustScore` and `recencyWeightedReliability` called without an argument
 * would each read their own `Date.now()`. Captured once per load and passed
 * explicitly, so every figure on the screen describes the same instant — and so
 * the figures are reproducible from the record plus the timestamp shown.
 *
 * NOT POLLED, for the reason in `useAgents.ts`: reputation moves when a deal
 * resolves, not every 2.5 seconds.
 *
 * THE SHIPPED ROUTE ANSWERS AN UNKNOWN AGENT WITH ZEROES, not a 404. So an agent
 * nobody has judged is `totalJudged === 0` with an empty history — a legitimate
 * record describing a real state, not a missing one. The screens read that as the
 * empty case and say what would populate it; treating it as an error would tell a
 * reviewer the deployment was broken when it was answering correctly.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  badgeTier,
  disputeRateByCategory,
  recencyWeightedReliability,
  scoreCeiling,
  trustScore,
} from '@/lib/derive';
import { getReputation, isAborted } from '@/services/api';
import type {
  ApiError,
  BadgeTier,
  DisputeRateByCategory,
  ReputationSummary,
} from '@/types';

/** Everything the two screens need, derived once. */
export interface AgentReputation {
  summary: ReputationSummary;

  /** @derived — 0 to 100. */
  score: number;
  tier: BadgeTier;

  /** The highest score this volume of judgments can reach. */
  ceiling: number;

  /** @derived — recency-weighted, 30-day half weight. */
  reliability: number;

  /** @derived — failures over total, per category, with both counts. */
  disputes: DisputeRateByCategory;

  /** The instant every figure above was computed against. */
  computedAt: number;
}

export interface AgentReputationResult {
  data: AgentReputation | null;
  error: ApiError | null;
  isLoading: boolean;
  reload: () => void;
}

export function useAgentReputation(agent: string): AgentReputationResult {
  const [data, setData] = useState<AgentReputation | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const cancelled = useRef(false);
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    setIsLoading(true);

    const result = await getReputation(agent, controller.signal);
    if (cancelled.current || isAborted(result)) return;

    if (!result.ok) {
      setError(result.error);
      setIsLoading(false);
      return;
    }

    const summary = result.data;
    const now = Date.now();
    const score = trustScore(summary, now);

    setData({
      summary,
      score,
      tier: badgeTier(score, summary.totalJudged),
      ceiling: scoreCeiling(summary.totalJudged),
      reliability: recencyWeightedReliability(summary.history, now),
      disputes: disputeRateByCategory(summary.history),
      computedAt: now,
    });
    setError(null);
    setIsLoading(false);
  }, [agent]);

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

  return { data, error, isLoading, reload };
}
