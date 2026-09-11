'use client';

/**
 * =============================================================================
 * `src/hooks/useDealRecord.ts` — one deal and its verdict, polled together
 * =============================================================================
 *
 * TWO REQUESTS, ONE LOOP. `usePolling` drives a single fetcher, so this hook
 * composes both reads into one and lets the loop's guarantees cover the pair:
 * one outstanding request set at a time, no overlap, and a failure that never
 * clears what is already on screen.
 *
 * `Promise.all` rather than sequential awaits, because the two reads are
 * independent — the judgment lookup does not need the deal — and serialising them
 * would double the latency of every tick for no benefit.
 *
 * A MISSING JUDGMENT IS NOT A FAILURE, and this is the decision that shapes the
 * hook. Most deals on a live docket have no verdict: a funded deal awaiting
 * delivery has nothing to judge yet. If a 404 on the judgment propagated as an
 * error, the record screen would show an error panel for the majority of deals,
 * and a reader would reasonably conclude the deployment was broken. So a
 * `not-found` on the judgment collapses to `judgment: null` and the screen says
 * so in words. Every OTHER judgment failure — network, malformed, 500 — does
 * propagate, because those genuinely are failures and hiding them would make a
 * broken backend look like an unjudged deal.
 *
 * A MISSING DEAL IS A FAILURE. The identifier came from a link or from the
 * address bar, and a deal that does not exist is exactly the case the 404 copy
 * was written for.
 *
 * POLLING A TERMINAL RECORD is mildly wasteful and kept anyway. A resolved deal
 * will not change, so the ticks after it settles return identical bytes. Stopping
 * would need a second code path plus a decision about which states are final, and
 * the states this interface considers terminal are the contract's business, not
 * this hook's. One route, one cadence, no special cases — and the reader watching
 * a deal settle in real time gets the transition without a refresh.
 */

import { usePolling, type PollResult } from '@/hooks/usePolling';
import { getDeal, getJudgment } from '@/services/api';
import type { ApiResult, EscrowDeal, JudgmentResponse } from '@/types';

/** What one tick returns: the deal, and the verdict if one has been recorded. */
export interface DealRecord {
  deal: EscrowDeal;
  judgment: JudgmentResponse | null;
}

/**
 * Fetch both, folding a judgment 404 into `null`.
 *
 * Written as a factory over `dealId` so the returned fetcher matches
 * `PollFetcher` exactly — `usePolling` holds the newest fetcher in a ref, so an
 * inline lambda here does not restart the loop.
 */
function recordFetcher(dealId: string) {
  return async (signal: AbortSignal): Promise<ApiResult<DealRecord>> => {
    const [dealResult, judgmentResult] = await Promise.all([
      getDeal(dealId, signal),
      getJudgment(dealId, signal),
    ]);

    // The deal is required. Its error is the screen's error.
    if (!dealResult.ok) return dealResult;

    if (judgmentResult.ok) {
      return { ok: true, data: { deal: dealResult.data, judgment: judgmentResult.data } };
    }

    // The one failure that is expected rather than exceptional.
    if (judgmentResult.error.kind === 'not-found') {
      return { ok: true, data: { deal: dealResult.data, judgment: null } };
    }

    // Everything else is real. A malformed judgment must not read as an unjudged
    // deal — that would present a backend defect as a protocol state.
    return judgmentResult;
  };
}

export function useDealRecord(dealId: string): PollResult<DealRecord> {
  return usePolling(recordFetcher(dealId));
}
