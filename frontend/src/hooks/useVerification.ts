'use client';

/**
 * =============================================================================
 * `src/hooks/useVerification.ts` — fetch the two sides, recompute in the browser
 * =============================================================================
 *
 * The hook exists to keep one property true: THE CONCLUSION IS COMPUTED HERE, IN
 * THE READER'S BROWSER, from bytes the reader can see. It fetches the preimage and
 * the deal, hands both to `verifyRecord`, and returns the outcome. It does not
 * fetch a conclusion, and there is no endpoint it could fetch one from.
 *
 * WHY THE RECOMPUTATION IS NOT IN THE FETCHER. It would be convenient to compute
 * the outcome inside the polled fetcher and return it as the payload. It is
 * deliberately not: `verifyRecord` is pure and synchronous, and putting it in the
 * fetcher would fold a keccak computation into the request path, so a caller
 * reading this file could no longer tell which parts of the result crossed the
 * network and which were derived locally. Keeping the fetcher to transport and
 * doing the arithmetic in a `useMemo` over the payload means the boundary is
 * visible: everything above the memo came from outside, everything the memo
 * produces was computed here.
 *
 * A MISSING PREIMAGE IS NOT A FAILURE OF THE PANEL. `GET /api/verify/:dealId`
 * 404s for a deal with no stored record, which is most deals for most of their
 * life. That collapses to `preimage: null` and the panel says there is nothing to
 * recompute yet. Any other preimage error propagates — a malformed preimage must
 * not read as an unjudged deal.
 *
 * THE DEAL IS REQUIRED, because the on-chain column comes from it and a
 * comparison without the third source is the two-way comparison this whole screen
 * exists to not be.
 */

import { useMemo } from 'react';

import { usePolling, type PollResult } from '@/hooks/usePolling';
import { verifyRecord, type VerificationOutcome } from '@/lib/verify';
import { getDeal, getVerifyPreimage } from '@/services/api';
import type { ApiResult, EscrowDeal, VerifyPreimageResponse } from '@/types';

/** What crossed the network. Deliberately separate from what was derived. */
export interface VerificationInputs {
  deal: EscrowDeal;
  /** `null` when no record has been stored for this deal yet. */
  preimage: VerifyPreimageResponse | null;
}

export interface VerificationResult extends Omit<PollResult<VerificationInputs>, 'data'> {
  /** The fetched inputs, or `null` before the first successful poll. */
  inputs: VerificationInputs | null;

  /**
   * The comparison, computed in this browser from `inputs`. `null` when there is
   * nothing to compare — no inputs yet, or no stored record for this deal.
   */
  outcome: VerificationOutcome | null;
}

function inputsFetcher(dealId: string) {
  return async (signal: AbortSignal): Promise<ApiResult<VerificationInputs>> => {
    const [dealResult, preimageResult] = await Promise.all([
      getDeal(dealId, signal),
      getVerifyPreimage(dealId, signal),
    ]);

    if (!dealResult.ok) return dealResult;

    if (preimageResult.ok) {
      return { ok: true, data: { deal: dealResult.data, preimage: preimageResult.data } };
    }

    // Expected, and common: no record stored for this deal yet.
    if (preimageResult.error.kind === 'not-found') {
      return { ok: true, data: { deal: dealResult.data, preimage: null } };
    }

    return preimageResult;
  };
}

export function useVerification(dealId: string): VerificationResult {
  const { data, error, isFetching, lastUpdatedAt, refetch } = usePolling(
    inputsFetcher(dealId),
  );

  /**
   * The arithmetic. Memoised on the payload so three keccak computations happen
   * once per successful poll rather than once per render — and so the outcome
   * object is referentially stable, which keeps the rows from remounting under a
   * reader mid-read.
   */
  const outcome = useMemo(
    () =>
      data === null || data.preimage === null
        ? null
        : verifyRecord(data.preimage, data.deal),
    [data],
  );

  return { inputs: data, outcome, error, isFetching, lastUpdatedAt, refetch };
}
