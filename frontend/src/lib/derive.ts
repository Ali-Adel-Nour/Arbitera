/**
 * =============================================================================
 * `src/lib/derive.ts` — the five figures this interface computes for itself
 * =============================================================================
 *
 * Every value produced here is a Derived_Metric: computed by the interface from
 * data the backend does return, never read from a shipped route. Each one has a
 * `@derived` block in `src/types.ts` (§8) naming what the backend would have to
 * ship for the figure to become protocol data, and each renders under the
 * `rule/derived` token with visible copy saying so. A reviewer should never have
 * to guess which numbers came off the chain; none of these did.
 *
 * WHAT IS IN HERE
 * ---------------
 *   §1  Recency-weighted reliability   exp(-ageDays / 30) weights
 *   §2  Trust score                    volume confidence against a ZERO prior
 *   §3  Badge tiers                    five contiguous bands plus a floor
 *   §4  Settled totals                 bigint, terminal resolutions only
 *   §5  Dispute rate by category       rate with its numerator and denominator
 *
 * THE MODULE IS PURE
 * ------------------
 * No React, no fetch, no `process.env`. `nowMs` is a parameter with a
 * `Date.now()` default rather than a call inside the loop, so a test can pin the
 * clock and the drill-down route can reproduce a figure at the instant it was
 * displayed. Two calls with the same arguments give the same answer.
 *
 * NOTHING HERE IS DENOMINATED IN DISPLAY UNITS
 * --------------------------------------------
 * Amounts stay in USDC base units end to end: strings in, `bigint` in the sum,
 * `bigint` out. `USDC_DECIMALS` is imported from `@/lib/chain` — the one module
 * that is allowed to state the scale — and is used here only to say what the
 * base unit is when rejecting an amount that is not one. Scaling for display is
 * `lib/format.ts`'s concern and happens once, at the edge.
 */

import { USDC_DECIMALS } from '@/lib/chain';

import type {
  BadgeTier,
  DisputeRateByCategory,
  DrillableRate,
  EscrowDeal,
  EscrowState,
  JudgmentHistoryEntry,
  ReputationSummary,
  UsdcAmount,
} from '@/types';

/* ===========================================================================
 * §1  Recency-weighted reliability
 * ======================================================================== */

/** Milliseconds in a day. Named because `86_400_000` inline reads as noise. */
const MS_PER_DAY = 86_400_000;

/**
 * The characteristic decay of the recency weight, in days.
 *
 * `exp(-ageDays / 30)` weighs a judgment 1.0 today, 0.72 at ten days, 0.37 at
 * thirty, and 0.037 at ninety. Thirty days is chosen because agent behaviour and
 * model versions turn over on roughly that timescale: a six-month-old success is
 * not current evidence about an agent, and presenting it as though it were is
 * the failure mode this weighting exists to prevent.
 *
 * Exported because a figure whose parameters are not published cannot be
 * checked, and the drill-down route reproduces the arithmetic from this
 * constant rather than restating the number in prose.
 */
export const RELIABILITY_HALFLIFE_DAYS = 30;

/**
 * The age of one judgment in days, floored at zero.
 *
 * Two edge cases, both deliberate:
 *
 *   A timestamp in the FUTURE clamps to age zero rather than producing a weight
 *   above 1. Clock skew between the oracle and this browser is ordinary, and a
 *   weight of 1.4 would let a skewed row outvote an honest one.
 *
 *   An UNPARSEABLE timestamp is treated as age zero, which means weight 1 — the
 *   judgment stays in the denominator at full weight instead of being dropped.
 *   Dropping it was the alternative and it is worse: a malformed date on a
 *   failed judgment would quietly remove that failure from an agent's record and
 *   raise its score. An unknown age must not be able to improve a reputation.
 */
function ageDaysOf(entry: JudgmentHistoryEntry, nowMs: number): number {
  const resolvedMs = Date.parse(entry.timestamp);
  if (Number.isNaN(resolvedMs)) return 0;
  return Math.max(0, (nowMs - resolvedMs) / MS_PER_DAY);
}

/**
 * RECENCY-WEIGHTED RELIABILITY — weighted successes over total weight, in [0, 1].
 *
 * The weight of each judgment is `exp(-ageDays / 30)` (Requirement 6.4). Every
 * judgment contributes to the denominator; only approved ones contribute to the
 * numerator, so the result is a weighted mean of a 0/1 variable and is therefore
 * bounded by [0, 1] by construction rather than by a clamp.
 *
 * Empty history returns 0. Not 0.5, not `null`: an agent with no record has
 * demonstrated nothing, and the trust score below is built on that reading.
 *
 * ON THE TIMESTAMP FIELD, which is an approximation worth naming: this reads
 * `history[].timestamp`, the moment the row was last written. The quantity the
 * figure actually wants is the moment the ORACLE RESOLVED the deal. They usually
 * coincide and they can diverge — reliability should decay from when work was
 * settled, not from when a database row was last touched. `ReputationSummary`'s
 * `@derived` block names the `resolvedAt` field the backend would need to supply
 * to close that gap; this function changes one line when it arrives.
 */
export function recencyWeightedReliability(
  history: JudgmentHistoryEntry[],
  nowMs: number = Date.now(),
): number {
  if (history.length === 0) return 0;

  let weightedSuccesses = 0;
  let totalWeight = 0;

  for (const entry of history) {
    const weight = Math.exp(-ageDaysOf(entry, nowMs) / RELIABILITY_HALFLIFE_DAYS);
    totalWeight += weight;
    if (entry.approved) weightedSuccesses += weight;
  }

  // Reachable only if every weight underflowed to zero — a history of judgments
  // thousands of days old. Zero is the honest answer there: nothing in the
  // record is current enough to weigh, and dividing would give NaN.
  return totalWeight === 0 ? 0 : weightedSuccesses / totalWeight;
}

/* ===========================================================================
 * §2  Trust score
 * ======================================================================== */

/**
 * The volume-confidence constant in `n / (n + k)`.
 *
 * `k = 3` puts the ceiling for a perfect record at 25 after one judgment, 63
 * after five, 77 after ten, and 90 after twenty-seven. That is chosen so a demo
 * agent can plausibly approach the top band while five-for-five still reads as
 * obviously provisional, which is the honest reading of five data points.
 *
 * Exported for the same reason as the decay constant: an unpublished parameter
 * makes the score uncheckable, and an uncheckable score has no place here.
 */
export const VOLUME_CONFIDENCE_K = 3;

/**
 * TRUST SCORE — an integer in [0, 100].
 *
 * `round(100 * (n / (n + 3)) * recencyWeightedReliability)`, where `n` is
 * `totalJudged`.
 *
 * MULTIPLICATIVE AGAINST A ZERO PRIOR. NOT SHRINKAGE TOWARD 0.5.
 * ---------------------------------------------------------------
 * Read this before "fixing" the formula. The conventional Bayesian move here is
 * to shrink a small sample toward the midpoint — `(successes + k/2) / (n + k)`
 * or similar — and it is the wrong move for this figure. Shrinking toward 0.5
 * would score an agent with one failure and no successes near 50: it would
 * FLATTER an unproven agent by lending it the benefit of the doubt.
 *
 * This score's entire job is to be the number a buyer agent consults before
 * spending money. In that setting an absent record must read as absent, not as
 * average, because the cost of overstating an unknown agent falls on the buyer.
 * So the volume factor multiplies a reliability that starts at zero, and trust
 * is earned upward from there rather than discounted downward from a free
 * midpoint.
 *
 * The change would be one character wide and would silently invert the incentive
 * the whole trust explorer is built to express, which is why the reasoning lives
 * next to the arithmetic rather than in a document.
 *
 * The bound that follows: with reliability at most 1, the score is capped at
 * `100n / (n + 3)`. Reliability alone cannot lift a low-volume agent — only
 * resolutions can.
 */
export function trustScore(summary: ReputationSummary, nowMs: number = Date.now()): number {
  const reliability = recencyWeightedReliability(summary.history, nowMs); // [0, 1]
  const n = summary.totalJudged;
  const confidence = n / (n + VOLUME_CONFIDENCE_K); // [0, 1)

  return Math.round(100 * confidence * reliability);
}

/**
 * The highest score `n` judgments can reach, at perfect reliability: the value
 * of `trustScore` when reliability is 1.
 *
 * This is the arithmetic behind the volume-cap sentence on an agent's detail
 * view, so it is computed from the same constant the score uses rather than
 * quoted from the design's table. `n = 0` gives 0.
 */
export function scoreCeiling(totalJudged: number): number {
  return Math.round((100 * totalJudged) / (totalJudged + VOLUME_CONFIDENCE_K));
}

/* ===========================================================================
 * §3  Badge tiers
 * ======================================================================== */

/**
 * The five bands, contiguous and gapless over 0–100.
 *
 * Contiguity is the property that matters: every integer score maps to exactly
 * one tier, with no gap that would leave a score untiered and no overlap that
 * would make the mapping depend on iteration order. The bands are stated as
 * inclusive `min`/`max` pairs so that property is readable off the table
 * directly — 24 then 25, 49 then 50, 74 then 75, 89 then 90 — rather than
 * having to be inferred from a chain of comparisons.
 */
export const BADGE_TIERS = [
  { tier: 'Unproven', min: 0, max: 24 },
  { tier: 'Provisional', min: 25, max: 49 },
  { tier: 'Established', min: 50, max: 74 },
  { tier: 'Trusted', min: 75, max: 89 },
  { tier: 'Exemplary', min: 90, max: 100 },
] as const satisfies readonly { tier: BadgeTier; min: number; max: number }[];

/**
 * The base tier, read off the table rather than written out a second time, so
 * the floor below and the first band cannot drift apart.
 */
export const BASE_BADGE_TIER: BadgeTier = BADGE_TIERS[0].tier;

/** Judgments required before any tier above the base is reachable. */
export const TIER_FLOOR_JUDGMENTS = 3;

/**
 * BADGE TIER — a total function. Every `(score, totalJudged)` pair has an answer.
 *
 * THE FLOOR: fewer than three judgments is the base tier whatever the score
 * says. This guards the same concern as the volume factor from the other side.
 * With `k = 3`, two perfect judgments already score 40, which would present as
 * Provisional and overstate two data points. The volume factor makes a small
 * sample score low; the floor makes it read low, and the tier is what a reader
 * actually reads.
 *
 * The input is normalised — rounded, then clamped into 0–100 — before it is
 * banded. `score` is a `number` and nothing in the type system stops a caller
 * passing 100.4 or -1, so normalising is what makes the band lookup total and
 * lets it return a tier without a non-null assertion papering over a miss.
 */
export function badgeTier(score: number, totalJudged: number): BadgeTier {
  if (totalJudged < TIER_FLOOR_JUDGMENTS) return BASE_BADGE_TIER;

  const normalised = Math.min(100, Math.max(0, Math.round(score)));
  const band = BADGE_TIERS.find((t) => normalised >= t.min && normalised <= t.max);

  // Unreachable while the bands cover 0–100: `normalised` is an integer in that
  // range. Kept as a fallback rather than a `!` so a future edit that opens a
  // gap in the table degrades to the base tier instead of throwing inside a
  // render, and Property 25 catches the gap.
  return band ? band.tier : BASE_BADGE_TIER;
}

/* ===========================================================================
 * §4  Settled totals
 * ======================================================================== */

/**
 * The two states that mean a resolution happened.
 *
 * `ExpiredRefund` is NOT one of them, and the omission is the point. An expiry
 * returns funds because a deadline or a grace period passed, with nobody judging
 * anything; folding those amounts into a settlement total would inflate the
 * figure with non-events. The docket reports them separately as returned on
 * expiry, which is the honest place for them.
 */
export const SETTLED_STATES = ['ResolvedSuccess', 'ResolvedRefund'] as const satisfies readonly EscrowState[];

/**
 * Did this deal reach a resolution?
 *
 * Exported so the drill-down that lists the deals behind a total applies the
 * same filter as the total itself. A total and its own evidence disagreeing
 * because the filter was written twice is exactly the kind of defect this
 * surface exists to make impossible.
 */
export function isSettledState(state: EscrowState): boolean {
  return (SETTLED_STATES as readonly EscrowState[]).includes(state);
}

/**
 * A USDC amount string as base units.
 *
 * `BigInt()` already rejects a malformed amount, so the only choice here is
 * between an opaque `SyntaxError` surfacing from inside a reduce and a message
 * that names the field and the expected shape. It throws rather than skipping
 * the deal: a total on an audit surface that silently omitted an amount it could
 * not read would be wrong without saying so, which is the one outcome worse than
 * failing loudly. Shape guards at the network boundary are what keep this
 * unreachable in practice.
 */
function baseUnits(amount: UsdcAmount): bigint {
  try {
    return BigInt(amount);
  } catch {
    throw new TypeError(
      `derive: amount ${JSON.stringify(amount)} is not an integer number of USDC base units (10^-${USDC_DECIMALS} USDC)`,
    );
  }
}

/**
 * TOTAL USDC SETTLED — a `bigint` in base units.
 *
 * Filtered to deals that actually resolved, summed as `bigint`, returned as
 * `bigint`. NEVER a JavaScript number, at any step: 2^53 is reachable in
 * 6-decimal base units, and a rounded settlement total on a surface whose whole
 * purpose is auditability would be indefensible. An off-by-one in the last digit
 * of a total is the kind of defect this interface exists to make impossible to
 * hide, so the arithmetic never leaves exact integers.
 *
 * `0n` for an empty list, which is the same answer as a list with no resolved
 * deals, and correct in both cases.
 */
export function totalUsdcSettled(deals: EscrowDeal[]): bigint {
  return deals
    .filter((deal) => isSettledState(deal.state))
    .reduce((sum, deal) => sum + baseUnits(deal.amount), 0n);
}

/**
 * The deals a settled total was computed from, in input order.
 *
 * The total's denominator, in effect: `types.ts` promises the backend that a
 * settled total ships with the count of deals behind it, because a total the
 * interface cannot decompose into its deals is not drillable and every figure
 * on the trust explorer is drillable.
 */
export function settledDeals(deals: EscrowDeal[]): EscrowDeal[] {
  return deals.filter((deal) => isSettledState(deal.state));
}

/* ===========================================================================
 * §5  Dispute rate by task category
 * ======================================================================== */

/**
 * The bucket for judgments that carried no category.
 *
 * Matches how the shipped reputation route buckets them. Note that this is a
 * DATA KEY and not a display label, and it is emphatically not the same
 * behaviour as the verdict preimage's: canonicalization omits an absent
 * `taskCategory` member entirely rather than substituting a string, because
 * substituting one would change the hash of every historical record that lacked
 * a category. Tallies bucket; hashes omit. The two must not be unified.
 */
export const UNCATEGORIZED = 'uncategorized';

/**
 * DISPUTE RATE BY TASK CATEGORY — failures over total, per category, with both
 * counts carried alongside the rate.
 *
 * The counts travel with the rate so the interface can render `2 of 7` rather
 * than `28.6%` alone, and so the drill-down route can reproduce the arithmetic
 * from the same two integers the rate was computed from. A percentage with no
 * denominator is an assertion; a percentage with its denominator is evidence,
 * and that difference is the whole argument of this screen.
 *
 * The field names are `numerator` and `denominator` — `DrillableRate`, shared
 * with every other drillable figure — rather than `failures` and `total`. One
 * shape means `DrillableMetric` renders any rate without knowing which metric
 * produced it. Here the numerator is failures and the denominator is that
 * category's judgment count.
 *
 * This is the complement of the shipped `byTaskCategory` success rates, not a
 * restatement of them: it is computed from `history` so the identifiers behind
 * each bucket stay reachable, which a rate alone would not allow.
 */
export function disputeRateByCategory(history: JudgmentHistoryEntry[]): DisputeRateByCategory {
  const tallies = new Map<string, { numerator: number; denominator: number }>();

  for (const entry of history) {
    const category = entry.taskCategory ?? UNCATEGORIZED;
    const tally = tallies.get(category) ?? { numerator: 0, denominator: 0 };
    tally.denominator += 1;
    if (!entry.approved) tally.numerator += 1;
    tallies.set(category, tally);
  }

  const byCategory: Record<string, DrillableRate> = {};
  for (const [category, { numerator, denominator }] of tallies) {
    // `denominator` is at least 1 for any key that exists, since a key is only
    // created by an entry, so the division is safe without a guard.
    byCategory[category] = { rate: numerator / denominator, numerator, denominator };
  }

  return byCategory;
}
