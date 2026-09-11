/**
 * =============================================================================
 * `src/fixtures/engine.ts` — the Fixture_Engine's public surface
 * =============================================================================
 *
 * Two functions. `stateOf` places one fixture deal on the clock; `snapshotAt`
 * places all of them and hands back `EscrowDeal[]`, which is the whole surface
 * the docket and the mock route handlers consume.
 *
 * `nowMs` IS A PARAMETER, NOT A `Date.now()` CALL IN THE BODY
 * ----------------------------------------------------------
 * Both functions default it and neither reads the clock any other way, so a
 * caller can pass any instant and assert the result. That is what makes the
 * engine testable at all: Property 12 asserts the same instant yields the same
 * snapshot, and Property 13 walks a whole cycle and checks the progression. A
 * `Date.now()` buried in a body would make both properties untestable without a
 * fake timer, and a fake timer would be testing the timer.
 *
 * Every mock route handler calls `snapshotAt(Date.now())` and nothing else. No
 * component recomputes fixture state, so there is no client-side answer for the
 * server's answer to disagree with.
 *
 * WHAT COMES OUT PASSES `isEscrowDeal`
 * ------------------------------------
 * Every deal this module returns satisfies `lib/guards.ts`'s `isEscrowDeal`,
 * which Property 14 asserts at every point in the cycle. The two conditions worth
 * naming, because they are the two a careless edit breaks:
 *
 *   `deliverableHash` and `verdictReasoningHash` are NULLABLE, not optional, so
 *   the keys must be PRESENT with a `null` value. An absent key fails the guard,
 *   and it should: for a real payload it would mean the backend stopped sending
 *   the field. `timelines.ts` spells `null` on the deals that never submit.
 *
 *   `judgeRequestedAt` is OPTIONAL, so the key is omitted rather than set to
 *   `undefined` when no judge call is in flight. `stateOf` returns a shape
 *   without the member instead of one holding `undefined` — the guard accepts
 *   both, but `undefined` is not a JSON value and a key that serialises away is
 *   a difference between what this module returns and what a route returns.
 */

import type { EscrowDeal, EscrowState, IsoTimestamp } from '@/types';

import { cyclePosition, isoInstantAt } from './clock';
import { FIXTURE_DEALS, type FixtureDeal, type Step } from './timelines';

/**
 * How long a judge call has notionally been in flight when the timeline says one
 * is.
 *
 * The docket shows "requested N seconds ago" against a deliberating deal, so the
 * timestamp has to be in the past — `nowMs` itself would render as zero seconds
 * on every poll, which reads as a stuck clock. Two seconds is under the poll
 * interval, so the figure is always small and always moving.
 */
export const JUDGE_REQUEST_LEAD_MS = 2_000;

/** What the clock owns: the state, and the timestamp that derives `Deliberating`. */
export interface TimedState {
  /** The on-chain state. Never `Deliberating`. */
  state: EscrowState;

  /** Present only while the timeline says a judge call is in flight. */
  judgeRequestedAt?: IsoTimestamp;
}

/**
 * The step a deal is on at `nowMs`.
 *
 * The reduce walks the steps in order and keeps the last one whose `atMs` has
 * been reached, seeding with the first step so a position before any boundary
 * still resolves. `timelines.ts` asserts at import that the steps ascend and
 * that the first sits at zero, which is what makes the seed correct rather than
 * merely defensive.
 */
const stepAt = (deal: FixtureDeal, positionMs: number): Step =>
  deal.steps.reduce((current, step) => (step.atMs <= positionMs ? step : current), deal.steps[0]);

/**
 * Where one deal is on the clock.
 *
 * The position is the shared cycle position shifted by the deal's own offset,
 * folded back into the cycle. `cyclePosition` is applied a second time rather
 * than a bare `% CYCLE_MS` so the fold is Euclidean for any offset — the same
 * reason it is Euclidean the first time, and it costs one remainder.
 */
export function stateOf(deal: FixtureDeal, nowMs: number = Date.now()): TimedState {
  const step = stepAt(deal, cyclePosition(cyclePosition(nowMs) + deal.offsetMs));

  // The conditional return is what keeps the key ABSENT rather than `undefined`
  // when no judge call is in flight. See the header note.
  return step.judgeRequested
    ? { state: step.state, judgeRequestedAt: isoInstantAt(nowMs - JUDGE_REQUEST_LEAD_MS) }
    : { state: step.state };
}

/**
 * Every fixture deal as of `nowMs`.
 *
 * A pure function of its argument: same instant in, same deals out, on any
 * process and any serverless instance. Fresh objects each call, spread from the
 * frozen bases in `timelines.ts`, so a caller adding a field for a response body
 * cannot write back into the shared fixture.
 */
export function snapshotAt(nowMs: number = Date.now()): EscrowDeal[] {
  return FIXTURE_DEALS.map((deal) => ({ ...deal.base, ...stateOf(deal, nowMs) }));
}
