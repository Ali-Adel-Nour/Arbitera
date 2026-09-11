/**
 * =============================================================================
 * `src/lib/deriveState.ts` — the ONE place this interface infers a state
 * =============================================================================
 *
 * Every deal on the docket sits in exactly one of seven groups. Six of them are
 * read straight off `deal.state`, which the contract wrote. The seventh,
 * `Deliberating`, does not exist on chain and is produced here.
 *
 * WHY THIS IS ITS OWN MODULE. It is nine lines of logic, and it could live in the
 * docket component. It does not, because it is the single point in the whole
 * interface where a screen shows something the protocol did not say. Concentrating
 * that in a named module with this comment on top means the inference is auditable:
 * a reviewer asking "what does this interface make up?" has one file to read.
 *
 * THE THREE CONDITIONS, and each one is a guard against a different lie:
 *
 *   1. `state === 'Submitted'`      — the chain agrees work was delivered. Without
 *                                     this, a funded deal with a stray request
 *                                     timestamp would render as under judgment
 *                                     before anything was submitted.
 *   2. `judgeRequestedAt` present   — a request actually went out. Absent this
 *                                     field the interface degrades to `Submitted`
 *                                     and the group renders empty, which is
 *                                     honest; guessing "submitted implies
 *                                     deliberating" would assert an in-flight
 *                                     request that may never have been made.
 *   3. no judgment landed           — the deliberation has not concluded. A judged
 *                                     deal awaiting oracle settlement is still
 *                                     `Submitted` on chain, and calling it
 *                                     `Deliberating` would claim the model is
 *                                     still thinking about a verdict it already
 *                                     returned.
 *
 * ANY CONDITION FAILING YIELDS THE ON-CHAIN STATE UNCHANGED. There is no other
 * fallback and no other derived value: this function can only ever move a deal
 * from `Submitted` to `Deliberating`, never anywhere else. That property is what
 * makes the docket's other six groups pure reflections of contract storage.
 */

import type { DisplayState, EscrowDeal, JudgmentRef } from '@/types';

/**
 * The display state for one deal.
 *
 * `judgment` is the judgment for THIS deal, or `null` when none has landed.
 * Required rather than optional: an optional parameter would let a call site
 * forget it and silently get condition 3 wrong in the permissive direction —
 * every judged-but-unsettled deal would show as deliberating. Making it explicit
 * forces each caller to say what it knows.
 */
export function deriveDisplayState(
  deal: EscrowDeal,
  judgment: JudgmentRef | null,
): DisplayState {
  const deliberating =
    deal.state === 'Submitted' && deal.judgeRequestedAt !== undefined && judgment === null;

  return deliberating ? 'Deliberating' : deal.state;
}

/**
 * Is this display state the derived one?
 *
 * A named predicate rather than an inline `=== 'Deliberating'` at each site, so
 * the docket's "this group is not on-chain" notice and the lifecycle rail's
 * derived marker are driven by one definition. If a second derived state is ever
 * added, this is the function that grows and the call sites do not.
 */
export function isDerivedState(state: DisplayState): boolean {
  return state === 'Deliberating';
}
