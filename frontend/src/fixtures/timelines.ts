/**
 * =============================================================================
 * `src/fixtures/timelines.ts` — the fixture deals and the steps they walk
 * =============================================================================
 *
 * Four deals, each a static `base` plus a list of steps keyed to a position in
 * the fixture cycle. `fixtures/engine.ts` turns a `(deal, nowMs)` pair into an
 * `EscrowDeal`; this module holds everything about those deals that does not
 * change as the clock moves.
 *
 * WHAT THE FOUR DEALS ARE FOR
 * ---------------------------
 *   DEAL_ALPHA    the deal the demo watches, and the only one a presenter
 *                 narrates: Funded → Submitted → Deliberating → ResolvedSuccess
 *   DEAL_BRAVO    the refund path, and a second `Deliberating` occupant at a
 *                 different phase: Created → Funded → Submitted → Deliberating
 *                 → ResolvedRefund
 *   DEAL_CHARLIE  the expiry path: Created → Funded → ExpiredRefund, with no
 *                 deliverable ever submitted
 *   DEAL_DELTA    a long-lived `Created` deal, so the docket's first group is
 *                 occupied for most of the cycle rather than for one step
 *
 * Between them every one of the docket's seven groups — the six on-chain states
 * plus the derived `Deliberating` — is occupied at some point in the cycle, so
 * no group is permanently empty (Requirement 4.3). No group is occupied at every
 * point, which is intended: the empty states are part of the screen and a
 * reviewer should see them.
 *
 * EVERY OFFSET IS DISTINCT
 * ------------------------
 * `offsetMs` phase-shifts a deal's timeline against the shared clock. Four
 * distinct offsets means the deals are not synchronised: they do not all change
 * state on the same poll, so the docket reads as a feed of independent escrows
 * rather than a slideshow advancing in lockstep. The assertions at the foot of
 * this file check the distinctness rather than leaving it to a reader counting
 * literals.
 *
 * WHERE THE ON-CHAIN HASHES COME FROM
 * -----------------------------------
 * For the two deals that get judged, the three on-chain commitments are the
 * hashes `fixtures/records.ts` computed over the record's own text. That is what
 * makes the verify panel's three-way comparison come out `all-match` on an
 * untampered record: the browser recomputes from the record, the backend's stored
 * value came from the same computation, and the chain-side column below is
 * populated from it too. Requirement 4.5's match is a consequence of how these
 * fixtures are built rather than something maintained by hand.
 *
 * The two deals that are never judged keep labelled stand-in commitments for
 * `criteriaHash`, since no record exists to hash, and `null` for the two fields
 * the chain genuinely holds nothing in.
 *
 * The shared identifiers — both agents in both forms, and the two judged deals'
 * `dealId` and `deadline` — live in `fixtures/identities.ts`, because a record
 * commits to them and a record cannot import this module without a cycle. That
 * module's header sets out why. `AGENT_B_ADDRESS` and `AGENT_C_ADDRESS` are
 * re-exported from here, so this file stays the import site every other module
 * already uses.
 *
 * NO HAND-WRITTEN HASHES AND NO HAND-WRITTEN ADDRESSES
 * ----------------------------------------------------
 * Every 32-byte commitment and every 20-byte address reaching this file is
 * DERIVED from a label by `lib/canonicalize.ts`'s own hasher. Three reasons, in
 * order of how much they cost when ignored:
 *
 *   A typed-in hash cannot be checked by reading it. A wrong one produces a
 *   verify-panel mismatch indistinguishable from the tampering the panel exists
 *   to detect, which is the one failure this surface must never fake.
 *
 *   A typed-in address is a 40-character literal, and `scripts/check-copy.mjs`'s
 *   `hardcoded-escrow` rule greps exactly that shape. `src/fixtures/` is the one
 *   exempt path, so literals here would pass — but deriving them means the file
 *   does not lean on the exemption at all, and the rule keeps its teeth without
 *   anyone having to remember which directory is special.
 *
 *   A derived value is deterministic across processes, so two serverless
 *   instances serving the same deal agree on its identifier byte for byte.
 *
 * The derived addresses are LOWERCASE with a readable prefix, never mixed-case.
 * A mixed-case address is read as EIP-55 checksummed, and `ethers.getAddress`
 * throws on one whose checksum does not verify — so a hand-cased `0xB0b…`
 * fixture would crash any later screen that normalises an address before
 * display. Lowercase is unambiguously un-checksummed and is accepted everywhere.
 */

import { parseUnits } from 'ethers';

import { USDC_DECIMALS } from '@/lib/chain';
import type {
  Address,
  EscrowDeal,
  EscrowState,
  IsoTimestamp,
  TxHash,
  UsdcAmount,
} from '@/types';

import { CYCLE_MS, STEP_MS } from './clock';
import {
  AGENT_B_ADDRESS,
  AGENT_C_ADDRESS,
  commitment,
  fixtureAddress,
  JUDGED_DEALS,
} from './identities';
import { RECORD_COMMITMENTS } from './records';

/**
 * Both agents' addresses, re-exported so this module stays the one import site
 * for a docket row's parties. Derived in `fixtures/identities.ts`, which the
 * verdict records read from as well — one derivation per agent, so a row and the
 * record it links to can never name two different addresses for the same agent.
 */
export { AGENT_B_ADDRESS, AGENT_C_ADDRESS };

/* ===========================================================================
 * §1  The timeline shapes
 * ======================================================================== */

/**
 * One entry in a deal's timeline: from `atMs` until the next step, the deal is
 * in this state.
 *
 * `judgeRequested` is the only reason this is a shape rather than a pair. It
 * marks the step that means "a judge call is in flight", and `stateOf` turns it
 * into the `judgeRequestedAt` timestamp that makes `Deliberating` DERIVABLE.
 * It must appear on that step alone: `deriveDisplayState` returns `Submitted`
 * without the timestamp, and the docket must never guess that a model is
 * running. A flag on every submitted step would put a frontend inference in
 * front of a reviewer as though it were a fact about the deal.
 */
export interface Step {
  /** Position within the cycle, in milliseconds. A multiple of `STEP_MS`. */
  atMs: number;

  /** The ON-CHAIN state. Never `Deliberating` — that is not an escrow state. */
  state: EscrowState;

  /** Present only on the step that means a judge evaluation was requested. */
  judgeRequested?: boolean;
}

/**
 * A fixture deal: the fields that never move, the phase offset, and the steps.
 *
 * `base` omits exactly the two fields the clock owns. `state` is computed for
 * every deal on every call, and `judgeRequestedAt` is present only while the
 * timeline says a judge call is in flight — so neither can be typed into a
 * fixture and go stale, and neither can be assigned a value the clock would
 * contradict on the next poll.
 */
export interface FixtureDeal {
  base: Omit<EscrowDeal, 'state' | 'judgeRequestedAt'>;

  /** Phase offset, so the deals do not all change state on the same poll. */
  offsetMs: number;

  /** Ascending by `atMs`. The first entry MUST be `atMs: 0`. */
  steps: Step[];
}

/* ===========================================================================
 * §2  Amounts, and the one address this module still derives
 * ======================================================================== */

/**
 * A USDC amount, in base units, from a decimal string.
 *
 * `USDC_DECIMALS` is imported rather than retyped as `6`, and the conversion
 * goes through `parseUnits` rather than a multiplication, so the result is
 * always the digits-only base-unit string `isUsdcAmount` demands and never
 * picks up an exponent or a floating-point tail.
 *
 * Note `lib/chain.ts` also exports `ARC_TESTNET.nativeCurrency.decimals`, which
 * is 18 and exists only for the wallet's add-chain payload. It must never reach
 * this helper: an escrow amount scaled by 10^12 would ask a buyer to approve a
 * trillion times the figure on screen.
 */
const usdc = (decimalAmount: string): UsdcAmount =>
  parseUnits(decimalAmount, USDC_DECIMALS).toString();

/**
 * The escrowed token in every fixture deal.
 *
 * Deliberately not a real token address from any live network. A recognisable
 * mainnet address in a fixture invites a reader to believe these deals settled
 * somewhere, which is the opposite of what this data is for. The live
 * deployment reads its token from `NEXT_PUBLIC_USDC_ADDRESS`.
 */
export const FIXTURE_TOKEN_ADDRESS: Address = fixtureAddress('05dc', 'fixture-usdc');

/* ===========================================================================
 * §3  The deals
 *
 * On the four static fields a reader will want to interrogate:
 *
 * `deadline` IS A FIXED INSTANT, NOT AN OFFSET FROM NOW. It has to be: the
 * verdict records carry the same deadline inside the seventeen-field preimage,
 * and their hashes are sealed at module load. A deadline that moved with the
 * clock would change the preimage between the moment a hash was computed and the
 * moment the browser recomputed it, and the verify panel would report tampering
 * on a record nobody touched. The two judged deals therefore take their deadline
 * from `identities.ts`, the same binding the record hashes, rather than from a
 * literal that could drift from it by one character. The dates are set far enough
 * out to stay in the future through any plausible review, except on DEAL_CHARLIE,
 * where a PAST deadline is what makes `ExpiredRefund` coherent.
 *
 * `deliverableHash` AND `verdictReasoningHash` DO NOT BLINK. They are static per
 * deal rather than gated on the current state, which means DEAL_ALPHA carries
 * its commitments while it is still `Funded`. That is a real inconsistency and
 * it is the lesser of two: the alternative nulls them out for three quarters of
 * the cycle, so a reviewer opening the verify panel at the wrong moment sees the
 * on-chain column absent and the three-way match unreachable. The deals that
 * genuinely never submit carry `null` for both, so the nullable branch is still
 * exercised, and the looping cycle is disclosed in the docket's footer.
 *
 * `resolvedTransactionHash` is present on the two deals that reach a resolved
 * state and omitted on the two that do not, on the same reasoning.
 * ======================================================================== */

/**
 * The deal the demo watches: `Funded` → `Submitted` → `Deliberating` →
 * `ResolvedSuccess`, in that order, once per cycle.
 *
 * `offsetMs: 0`, so its timeline is the cycle itself: whatever
 * `cyclePosition(Date.now())` reads is this deal's own position. That makes it
 * the deal to reason about when checking the engine by hand, and the one whose
 * progression Requirement 4.3 asks for.
 *
 * Buyer `agent-b`, seller `agent-c`: the successful deal is the one the reliable
 * seller delivered, which is what the reputation fixtures then say about
 * `agent-c`.
 */
export const DEAL_ALPHA: FixtureDeal = {
  base: {
    dealId: JUDGED_DEALS.alpha.dealId,
    buyer: AGENT_B_ADDRESS,
    seller: AGENT_C_ADDRESS,
    token: FIXTURE_TOKEN_ADDRESS,
    amount: usdc('250'),
    deadline: JUDGED_DEALS.alpha.deadline,
    // The three commitments the chain holds, computed by `fixtures/records.ts`
    // over this deal's approved record. Spread rather than assigned field by
    // field: the keys are spelled as the contract spells them on both sides, so
    // a transposition cannot be introduced by a mistyped assignment.
    ...RECORD_COMMITMENTS.alpha,
    resolvedTransactionHash: commitment('deal-alpha:settlement') as TxHash,
  },
  offsetMs: 0,
  steps: [
    { atMs: 0, state: 'Funded' },
    { atMs: 12_000, state: 'Submitted' },
    // The one step that means a judge call is in flight. Renders as
    // `Deliberating` because `stateOf` emits `judgeRequestedAt` here and
    // nowhere else.
    { atMs: 18_000, state: 'Submitted', judgeRequested: true },
    { atMs: 30_000, state: 'ResolvedSuccess' },
  ],
};

/**
 * The refund path, and the second `Deliberating` occupant.
 *
 * Seller `agent-b`, whose work is the work that gets rejected — which is the
 * record the trust explorer then reports at one success in four. The 18-second
 * offset puts this deal's deliberation window in the first half of the cycle,
 * while DEAL_ALPHA's is in the second, so the derived group is occupied across
 * a wide stretch rather than at one instant.
 */
export const DEAL_BRAVO: FixtureDeal = {
  base: {
    dealId: JUDGED_DEALS.bravo.dealId,
    buyer: AGENT_C_ADDRESS,
    seller: AGENT_B_ADDRESS,
    token: FIXTURE_TOKEN_ADDRESS,
    amount: usdc('120'),
    deadline: JUDGED_DEALS.bravo.deadline,
    // As on DEAL_ALPHA: the chain's own copy of the record's three hashes. The
    // tampered variant of this deal's record corrupts its STORED verdict hash and
    // leaves these alone, which is what makes the panel report `stored-differs`
    // rather than accusing the chain.
    ...RECORD_COMMITMENTS.bravo,
    resolvedTransactionHash: commitment('deal-bravo:settlement') as TxHash,
  },
  offsetMs: 18_000,
  steps: [
    { atMs: 0, state: 'Created' },
    { atMs: 6_000, state: 'Funded' },
    { atMs: 18_000, state: 'Submitted' },
    { atMs: 24_000, state: 'Submitted', judgeRequested: true },
    { atMs: 36_000, state: 'ResolvedRefund' },
  ],
};

/**
 * The expiry path: funded, then nothing.
 *
 * No deliverable is ever submitted, so `deliverableHash` and
 * `verdictReasoningHash` are both `null` for the whole cycle — the honest values
 * for a deal the chain holds no commitments for, and the reason this deal is
 * what exercises the nullable branch of `isEscrowDeal` and of every screen that
 * reads those fields.
 *
 * Its `deadline` is in the PAST, which is what an expired escrow looks like:
 * the deadline passed with no submission, so the buyer's refund became
 * available. The long `Funded` stretch before the expiry step is the deadline
 * running down.
 */
export const DEAL_CHARLIE: FixtureDeal = {
  base: {
    dealId: commitment('deal-charlie'),
    buyer: AGENT_C_ADDRESS,
    seller: AGENT_B_ADDRESS,
    token: FIXTURE_TOKEN_ADDRESS,
    amount: usdc('75.5'),
    criteriaHash: commitment('deal-charlie:criteria'),
    deadline: '2026-08-20T09:00:00.000Z' satisfies IsoTimestamp,
    deliverableHash: null,
    verdictReasoningHash: null,
  },
  offsetMs: 30_000,
  steps: [
    { atMs: 0, state: 'Created' },
    { atMs: 6_000, state: 'Funded' },
    { atMs: 36_000, state: 'ExpiredRefund' },
  ],
};

/**
 * A long-lived `Created` deal: agreed, not yet funded.
 *
 * Its only job is occupancy. Both other early-stage deals leave `Created` within
 * a step of entering it, so without this deal the docket's first group would be
 * empty for most of the cycle and a reviewer would reasonably read the group
 * header as dead weight. Here it is occupied for 42 of every 48 seconds, with a
 * funding step at the end so the group is not merely static either.
 */
export const DEAL_DELTA: FixtureDeal = {
  base: {
    dealId: commitment('deal-delta'),
    buyer: AGENT_B_ADDRESS,
    seller: AGENT_C_ADDRESS,
    token: FIXTURE_TOKEN_ADDRESS,
    amount: usdc('40'),
    criteriaHash: commitment('deal-delta:criteria'),
    deadline: '2027-05-02T08:30:00.000Z' satisfies IsoTimestamp,
    deliverableHash: null,
    verdictReasoningHash: null,
  },
  offsetMs: 6_000,
  steps: [
    { atMs: 0, state: 'Created' },
    { atMs: 42_000, state: 'Funded' },
  ],
};

/**
 * Every fixture deal, in the order the docket receives them.
 *
 * Order is stable across calls and is not sorted by state: grouping is the
 * docket's job, and a list that reordered itself as deals advanced would make
 * React keys the only thing keeping rows from swapping under a reader's cursor.
 */
export const FIXTURE_DEALS: FixtureDeal[] = [
  DEAL_ALPHA,
  DEAL_BRAVO,
  DEAL_CHARLIE,
  DEAL_DELTA,
];

/* ===========================================================================
 * §4  Module-load assertions
 *
 * `stateOf` finds the current step with a reduce that assumes three things:
 * the steps ascend, the first one sits at zero, and none of them lands past the
 * end of the cycle. All three are satisfied above by inspection, and inspection
 * is exactly what stops holding after the third edit — a step added out of order
 * would not throw, it would silently make one state unreachable, which is the
 * kind of defect that surfaces as "the demo skipped deliberation that time".
 *
 * So they are checked once, at import, in the same spirit as `lib/chain.ts`'s
 * literal-agreement check: a loud failure at the first import rather than a
 * quiet wrong answer later. The minimum-gap check is the one that keeps
 * Requirement 4.4 true, since it is the gap that decides whether two polls
 * 3 seconds apart can straddle a boundary.
 * ======================================================================== */

for (const deal of FIXTURE_DEALS) {
  const label = deal.base.dealId;

  if (deal.steps.length === 0 || deal.steps[0].atMs !== 0) {
    throw new Error(`fixtures/timelines.ts: ${label} must declare a step at atMs 0`);
  }

  if (deal.offsetMs < 0 || deal.offsetMs >= CYCLE_MS) {
    throw new Error(`fixtures/timelines.ts: ${label} offsetMs ${deal.offsetMs} is outside the cycle`);
  }

  deal.steps.forEach((step, index) => {
    if (step.atMs % STEP_MS !== 0 || step.atMs >= CYCLE_MS) {
      throw new Error(`fixtures/timelines.ts: ${label} step at ${step.atMs}ms is not a step boundary`);
    }

    const previous = deal.steps[index - 1];
    if (previous && step.atMs - previous.atMs < STEP_MS) {
      throw new Error(
        `fixtures/timelines.ts: ${label} steps at ${previous.atMs}ms and ${step.atMs}ms are closer than STEP_MS`,
      );
    }
  });

  // Frozen so a route handler cannot mutate the shared fixture on its way out.
  // `snapshotAt` spreads `base` into a fresh object, so nothing legitimate
  // writes through this reference.
  Object.freeze(deal.base);
  Object.freeze(deal.steps);
}

if (new Set(FIXTURE_DEALS.map((deal) => deal.offsetMs)).size !== FIXTURE_DEALS.length) {
  throw new Error('fixtures/timelines.ts: every fixture deal needs a distinct offsetMs');
}

if (new Set(FIXTURE_DEALS.map((deal) => deal.base.dealId)).size !== FIXTURE_DEALS.length) {
  throw new Error('fixtures/timelines.ts: every fixture deal needs a distinct dealId');
}
