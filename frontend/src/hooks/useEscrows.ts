'use client';

/**
 * =============================================================================
 * `src/hooks/useEscrows.ts` — the docket's data
 * =============================================================================
 *
 * A thin composition over `usePolling` and `getDeals`. Thin on purpose: the
 * polling mechanics, the "a failure never clears prior data" rule, and the
 * single-outstanding-request guarantee all live in `usePolling`, and duplicating
 * any of that here would give the docket a second copy to drift from.
 *
 * WHAT THIS HOOK ADDS is the grouping, memoised on the payload. Two reasons that
 * belongs here rather than in the component:
 *
 *   The sort allocates. Seven filtered arrays plus a `bigint` comparator on every
 *   render, at a 2.5-second cadence, for a list that changed only when `data`
 *   changed. `useMemo` keyed on `data` means the work happens once per successful
 *   poll rather than once per render.
 *
 *   Referential stability keeps rows still. New group arrays every render would
 *   defeat any downstream memoisation and would remount rows that did not change,
 *   which on a polled surface shows up as a visible flicker in the middle of
 *   reading.
 *
 * JUDGMENTS ARE NOT FETCHED HERE, and the limitation this creates is worth
 * stating precisely rather than glossing.
 *
 * Resolving condition 3 of the state derivation — has a judgment landed? — for
 * every deal would mean one request per row per tick against a route that answers
 * one deal at a time. That is a request storm to populate a group the backend
 * could mark directly, so the docket passes a resolver that always answers
 * `null`.
 *
 * The consequence: condition 3 is always satisfied, and `Deliberating` therefore
 * rests entirely on `judgeRequestedAt` being present ONLY WHILE A JUDGE CALL IS
 * ACTUALLY IN FLIGHT. The fixture timelines hold that — the flag is set on one
 * step and cleared on the next, which is why the group fills and empties across
 * the cycle. A backend that instead treats the field as a permanent record of
 * when a request was first made would leave every judged deal reading as
 * `Deliberating` until the oracle settles it, which would be wrong.
 *
 * So the field's contract is "in flight now", not "was requested once", and
 * `EscrowDeal.judgeRequestedAt` says so. If a backend cannot offer that reading,
 * the correct fix is for the deals payload to carry judgment presence per deal —
 * not for this hook to fan out requests.
 */

import { useMemo } from 'react';

import { groupDeals, stateDeals, type DocketGroup } from '@/lib/group';
import { getDeals } from '@/services/api';
import { usePolling, type PollResult } from '@/hooks/usePolling';
import type { EscrowDeal, JudgmentRef } from '@/types';

/**
 * The resolver the docket uses today: no judgment is known for any deal.
 *
 * Declared at module scope rather than inline so it is referentially stable
 * across renders, and named rather than anonymous so its role is legible at the
 * call site. When the backend supplies judgment presence, this is the one
 * function that changes.
 */
const noJudgmentKnown = (_dealId: string): JudgmentRef | null => null;

export interface EscrowsResult extends Omit<PollResult<{ deals: EscrowDeal[] }>, 'data'> {
  /** All deals from the last successful poll, ungrouped. `[]` before the first. */
  deals: EscrowDeal[];

  /** All seven groups, in lifecycle order. Always seven, populated or not. */
  groups: DocketGroup[];

  /** `true` until the first poll settles, so the docket can distinguish
   *  "nothing has loaded yet" from "the protocol has no deals". Those are
   *  different facts and an empty group must not claim the second while the
   *  first is true. */
  isInitialLoad: boolean;
}

export function useEscrows(): EscrowsResult {
  const { data, error, isFetching, lastUpdatedAt, refetch } = usePolling(getDeals);

  const deals = data?.deals ?? [];

  const groups = useMemo(
    () => groupDeals(stateDeals(data?.deals ?? [], noJudgmentKnown)),
    [data],
  );

  return {
    deals,
    groups,
    error,
    isFetching,
    lastUpdatedAt,
    refetch,
    // Keyed on `lastUpdatedAt` rather than on `data`, because a first poll that
    // legitimately returns zero deals has settled — and `data` would be a
    // non-null empty payload in that case, so testing `data === null` would be
    // right but testing `deals.length` would not.
    isInitialLoad: lastUpdatedAt === null,
  };
}
