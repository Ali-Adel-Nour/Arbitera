/**
 * =============================================================================
 * `src/lib/group.ts` — deals into the seven docket groups
 * =============================================================================
 *
 * ALL SEVEN GROUPS ARE ALWAYS RETURNED, whether or not they hold anything. That
 * is the whole reason this is a function rather than a `reduce` at the call site:
 * a `reduce` produces the groups that happen to be populated, and a docket that
 * renders only the populated groups tells a reader nothing about the lifecycle.
 * With all seven present, an empty `Deliberating` group is itself information —
 * no deal is currently under judgment — and `EmptyState` says what would fill it.
 *
 * The alternative, hiding empty groups, also makes the docket JUMP as the fixture
 * cycle advances: groups appear and disappear, so every row on screen moves and a
 * reader loses their place mid-read. A fixed seven-group frame means only the rows
 * inside a group change.
 *
 * ORDER IS THE LIFECYCLE, NOT THE ALPHABET. `DISPLAY_STATE_ORDER` puts
 * `Deliberating` between `Submitted` and the resolutions, because that is where it
 * falls in time. Reading top to bottom is then reading the protocol forwards.
 *
 * WITHIN A GROUP, LARGEST AMOUNT FIRST. Sorted by `bigint` rather than by
 * `Number`, since 6-decimal base units reach past 2^53 and a comparator that
 * rounds would order two large deals arbitrarily. Amount rather than deadline
 * because the deals a reviewer cares about first are the ones with the most money
 * in escrow, and unlike a deadline it is a stable key that does not reorder rows
 * as the clock advances.
 */

import { deriveDisplayState } from '@/lib/deriveState';
import { DISPLAY_STATE_ORDER } from '@/lib/stateDisplay';
import type { DisplayState, EscrowDeal, JudgmentRef } from '@/types';

/** One group: its state, and the deals in it. Possibly none. */
export interface DocketGroup {
  state: DisplayState;
  deals: EscrowDeal[];
}

/**
 * A deal paired with the display state derived for it, so the state is computed
 * once per deal rather than recomputed by every consumer.
 */
export interface StatedDeal {
  deal: EscrowDeal;
  state: DisplayState;
}

/**
 * Compare two base-unit amounts, descending, without floating point.
 *
 * A malformed amount sorts last rather than throwing. The shape guards at the
 * network boundary make that unreachable in practice; the fallback is here so one
 * bad row cannot take down the whole docket during a sort.
 */
function byAmountDescending(a: EscrowDeal, b: EscrowDeal): number {
  let left: bigint;
  let right: bigint;
  try {
    left = BigInt(a.amount);
  } catch {
    return 1;
  }
  try {
    right = BigInt(b.amount);
  } catch {
    return -1;
  }

  if (left === right) return 0;
  return left > right ? -1 : 1;
}

/**
 * Pair every deal with its display state.
 *
 * `judgmentFor` answers "has a judgment landed for this deal?" and is what
 * carries condition 3 of the derivation. A caller that has not loaded judgments
 * passes a function returning `null`, and every submitted deal then sits under
 * `Submitted` — the honest degradation described in `deriveState.ts`.
 */
export function stateDeals(
  deals: EscrowDeal[],
  judgmentFor: (dealId: string) => JudgmentRef | null,
): StatedDeal[] {
  return deals.map((deal) => ({
    deal,
    state: deriveDisplayState(deal, judgmentFor(deal.dealId)),
  }));
}

/**
 * The seven groups, in lifecycle order, each sorted by amount descending.
 *
 * Built by walking `DISPLAY_STATE_ORDER` and filtering, rather than by bucketing
 * the deals and then reading the buckets out. Walking the order is what guarantees
 * all seven exist and that they come back in the declared sequence — bucketing
 * would produce whatever the input happened to contain, which is the failure this
 * module exists to prevent.
 */
export function groupDeals(stated: StatedDeal[]): DocketGroup[] {
  return DISPLAY_STATE_ORDER.map((state) => ({
    state,
    deals: stated
      .filter((entry) => entry.state === state)
      .map((entry) => entry.deal)
      .sort(byAmountDescending),
  }));
}
