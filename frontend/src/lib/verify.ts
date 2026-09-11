/**
 * =============================================================================
 * `src/lib/verify.ts` — the three-way comparison
 * =============================================================================
 *
 * This is the module the submission's central claim is made of. A visitor opens
 * a record and three independent things are put next to each other:
 *
 *   1. what the record's own bytes hash to, computed in THEIR browser by
 *      `lib/canonicalize.ts`
 *   2. what the backend stored alongside the record when it wrote it
 *   3. what the escrow contract committed at settlement, which the oracle
 *      cannot go back and edit
 *
 * When those three agree, the record is tamper-evident. When they do not, the
 * useful answer is not "something is wrong" — it is WHICH ONE is the odd one
 * out, because that names the layer to go and look at. That is what this module
 * computes and nothing more.
 *
 * FOUR DESIGN DECISIONS, EACH OF WHICH IS LOAD-BEARING
 * ----------------------------------------------------
 *
 * THREE SOURCES, NEVER FOLDED INTO TWO. (Requirement 8.4) The on-chain value
 * keeps its own member in every result, and is never merged into the stored
 * column. Folding them would collapse the interesting case: recomputed and
 * on-chain agreeing against a differing stored record is exactly the finding
 * that says the backend's row is the suspect, and it is unreachable from a
 * two-column comparison.
 *
 * THE ODD SOURCE OUT, NOT AN ARBITRARY PAIR. (Requirement 8.6) With three
 * values there are five ways they can relate, and four of them have a single
 * source that disagrees with the other two. `DISAGREEING_PAIR` names that
 * source. Reporting "stored and on-chain differ" would be true of three of the
 * five partitions and diagnostic in none of them.
 *
 * CASE IS NORMALISED, DISPLAY IS NOT. A digest arriving from an RPC node may be
 * upper case where `keccak256` emits lower case. They are the same commitment,
 * so comparing them byte-for-byte would raise a tamper alarm on an untouched
 * record — and a false alarm on an audit surface costs the credibility of every
 * true one. Comparison lowercases; each result carries the values exactly as
 * they were handed in, so the panel shows the reader the raw data.
 *
 * THE BACKEND'S OWN FLAG IS AN INPUT, NEVER A SOURCE. (Requirement 8.7)
 * `backendVerifiedFlag` is assigned last in `verifyRecord` and is read by no
 * code path that produces `conclusion`. It is in the return type only so the
 * panel can display it in its own labelled cell. The whole value of recomputing
 * in the browser evaporates if the answer is taken from the party being
 * checked, so the independence is structural here rather than a matter of
 * reviewer attention.
 *
 * WHAT AGREEMENT PROVES, AND WHAT IT DOES NOT
 * -------------------------------------------
 * Agreement shows a stored record matches its own hash and the commitment the
 * contract holds. It says nothing about what the model was shown, and nothing
 * about whether the evaluation was sound. Hence `'tamper-evident'` rather than
 * any stronger word, and hence the scope sentence that travels with it in
 * `content/copy.ts`.
 *
 * Like the canonicalizer, this module is pure: no React, no fetch, no clock, no
 * environment. It is a function from three hashes to a verdict about three
 * hashes, which is what makes it testable in a bare Node process.
 */

import {
  computeDeliverableHash,
  computeRubricHash,
  computeVerdictHash,
} from '@/lib/canonicalize';
import { VERIFY_COMPARISON } from '@/content/copy';

import type { EscrowDeal, Hex32, VerifyPreimageResponse } from '@/types';

/* ===========================================================================
 * §1  The result of comparing one row's three values
 * ======================================================================== */

/**
 * One row of the hash strip, compared.
 *
 * Six members: the five equality partitions of three values, plus the case
 * where the chain has not committed anything yet.
 *
 *   all-match           all three equal, ignoring case
 *   stored-differs      recomputed == on-chain,  stored is the odd one
 *   onchain-differs     recomputed == stored,    on-chain is the odd one
 *   recomputed-differs  stored == on-chain,      this browser is the odd one
 *   all-differ          no two of the three are equal
 *   onchain-absent      the deal has not been settled, so there is no third
 *                       value to compare against
 *
 * `all-match` carries a single `value` rather than three copies of it, because
 * three names for one value invites a display that reads as three independent
 * confirmations when it is one. The other five keep every source they were
 * given, separately, so the panel can show what each layer actually said.
 *
 * `onchain-absent` is not a sixth partition of the equality relation — it is the
 * absence of one of its operands, and it is a normal, common state rather than
 * an error. A deal that is `Created`, `Funded`, or `Submitted` has no committed
 * verdict hash. `storedMatches` records the one comparison that IS available in
 * that state, so a conclusion is still reachable from real evidence instead of
 * the row being reported as unknowable.
 */
export type TripleComparison =
  | { kind: 'all-match'; value: Hex32 }
  | { kind: 'stored-differs'; recomputed: Hex32; stored: Hex32; onChain: Hex32 }
  | { kind: 'onchain-differs'; recomputed: Hex32; stored: Hex32; onChain: Hex32 }
  | { kind: 'recomputed-differs'; recomputed: Hex32; stored: Hex32; onChain: Hex32 }
  | { kind: 'all-differ'; recomputed: Hex32; stored: Hex32; onChain: Hex32 }
  | { kind: 'onchain-absent'; recomputed: Hex32; stored: Hex32; storedMatches: boolean };

/** The four kinds that name a disagreement, i.e. everything with a suspect. */
export type DisagreeingKind = Exclude<TripleComparison['kind'], 'all-match' | 'onchain-absent'>;

/**
 * Hash equality, case-folded.
 *
 * Declared before its use rather than after, so the module reads in dependency
 * order and there is no question about initialisation.
 *
 * Case folding is the ONLY normalisation applied. Nothing is trimmed, padded,
 * or re-prefixed: a value that differs from another by anything other than
 * letter case is a genuine difference and this module's job is to say so. A
 * `0x`-less or short digest reaching here is a malformed payload, caught by the
 * shape guards on the way in, not something to paper over at comparison time.
 */
const eq = (a: Hex32, b: Hex32): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * Compare one row's three values. (Requirements 8.3, 8.4, 8.6)
 *
 * `onChain` is nullable because two of the three on-chain hashes are: the
 * contract holds no `deliverableHash` until the seller submits and no
 * `verdictReasoningHash` until the oracle resolves.
 *
 * THE CASE ANALYSIS IS EXHAUSTIVE, and it is worth reading it as a proof rather
 * than as a chain of guesses. Let `rs`, `ro`, `so` be the three pairwise
 * equalities. Equality is transitive, so the eight combinations of three
 * booleans collapse to five reachable ones — any two being true forces the
 * third — and each branch below claims exactly one of them:
 *
 *   rs  ro  so   partition            branch
 *   T   T   T    all three equal      `all-match`
 *   F   T   F    stored is odd        `stored-differs`      (recomputed == on-chain)
 *   T   F   F    on-chain is odd      `onchain-differs`     (recomputed == stored)
 *   F   F   T    recomputed is odd    `recomputed-differs`  (stored == on-chain)
 *   F   F   F    all distinct         `all-differ`
 *
 * The three rows with exactly two `T`s are unreachable, which is why the first
 * branch tests `rs && ro` and not all three. The final `return` is therefore a
 * genuine fifth case and not a fallback: reaching it means all three pairwise
 * comparisons came back false.
 */
export function compareTriple(
  recomputed: Hex32,
  stored: Hex32,
  onChain: Hex32 | null,
): TripleComparison {
  // Not yet committed on-chain. Two sources, one comparison, an honest answer.
  if (onChain === null) {
    return { kind: 'onchain-absent', recomputed, stored, storedMatches: eq(recomputed, stored) };
  }

  const rs = eq(recomputed, stored);
  const ro = eq(recomputed, onChain);
  const so = eq(stored, onChain);

  if (rs && ro) return { kind: 'all-match', value: recomputed };
  if (ro && !rs) return { kind: 'stored-differs', recomputed, stored, onChain };
  if (rs && !ro) return { kind: 'onchain-differs', recomputed, stored, onChain };
  if (so && !rs) return { kind: 'recomputed-differs', recomputed, stored, onChain };
  return { kind: 'all-differ', recomputed, stored, onChain };
}

/**
 * One sentence per disagreement, naming the source that stands apart.
 * (Requirement 8.6)
 *
 * The sentences live in `content/copy.ts` with the rest of the user-facing text;
 * this table is the typed mapping onto them. The `Record<DisagreeingKind, …>`
 * annotation is what makes the pairing total: adding a member to
 * `TripleComparison` without writing its sentence stops compiling, so a new
 * kind cannot reach the panel with nothing to say about it.
 *
 * Note which way round the naming goes, because it is the diagnostically useful
 * direction and the obvious alternative is not. `stored-differs` does not say
 * "the stored and recomputed values differ" — it says the browser's
 * recomputation and the contract's immutable commitment agree WITH EACH OTHER
 * and the backend's row does not, which points at one layer.
 */
export const DISAGREEING_PAIR: Record<DisagreeingKind, string> = VERIFY_COMPARISON.disagreeing;

/* ===========================================================================
 * §2  The whole record, and the conclusion
 * ======================================================================== */

/** The two things a comparison can conclude. There is no third, and no "unknown". */
export type VerificationConclusion = 'tamper-evident' | 'mismatch';

/**
 * The result of verifying one record: three compared rows, one conclusion, and
 * the backend's own flag carried alongside as displayed input.
 */
export interface VerificationOutcome {
  /** `acceptanceCriteria` — against the deal's `criteriaHash` on-chain. */
  rubric: TripleComparison;

  /** `deliverable` — against the deal's `deliverableHash` on-chain. */
  deliverable: TripleComparison;

  /** The seventeen-field preimage — against the deal's `verdictReasoningHash`. */
  verdict: TripleComparison;

  /** Reached from the three rows above, and from nothing else. */
  conclusion: VerificationConclusion;

  /**
   * The backend's own assessment of the record it stored.
   *
   * Displayed as an input in its own labelled cell. NOT read when computing
   * `conclusion` — see the note on independence below and Requirement 8.7.
   * `null` when the response omitted it, which is a different fact from `false`
   * and is kept distinct for that reason.
   */
  backendVerifiedFlag: boolean | null;
}

/**
 * Verify one record against one deal. (Requirements 8.3, 8.4, 8.6, 8.7)
 *
 * THE THREE ROWS, AND WHY THE FIELD NAMES DO NOT LINE UP
 * -----------------------------------------------------
 * The contract and the judge record name the same commitments differently, and
 * mapping them is this function's first job:
 *
 *   rubric       `computeRubricHash(record)`      ↔ stored `rubricHash`
 *                                                 ↔ on-chain `criteriaHash`
 *   deliverable  `computeDeliverableHash(record)` ↔ stored `deliverableHash`
 *                                                 ↔ on-chain `deliverableHash`
 *   verdict      `computeVerdictHash(record)`     ↔ stored `verdictHash`
 *                                                 ↔ on-chain `verdictReasoningHash`
 *
 * `criteriaHash` and `verdictReasoningHash` are the chain-side names for the
 * record's `rubricHash` and `verdictHash`. The panel states that mapping in the
 * row header rather than leaving a reader to infer that two differently named
 * fields are the same commitment.
 *
 * All three recomputations come from `lib/canonicalize.ts` — the committed port,
 * imported rather than reimplemented. A second implementation of the hashing
 * inside this module would mean the thing under test and the test share no
 * ground with the record's actual producer.
 *
 * THE CONCLUSION
 * --------------
 * `tamper-evident` requires every row to be settled agreement: `all-match`, or
 * `onchain-absent` with the two available sources agreeing. The second clause
 * is what keeps an unsettled deal from being reported as a mismatch — a deal
 * with no committed verdict hash yet has not failed anything, and calling that a
 * mismatch would put a red row in front of a reviewer for the ordinary act of
 * looking at a deal mid-flight. (Requirement 8.6 read the other way: a mismatch
 * is reported when values that exist disagree, not when one does not exist.)
 *
 * `backendVerifiedFlag` is the last thing assigned, and `allMatch` above it is
 * computed from `[rubric, deliverable, verdict]` alone. There is no reachable
 * path from the flag to `conclusion` — reorder the statements and the flag is
 * still read after the conclusion is already fixed. The conclusion is therefore
 * identical for a flag of `true`, `false`, or absent, which is what Property 11
 * asserts over generated records.
 */
export function verifyRecord(
  preimage: VerifyPreimageResponse,
  deal: EscrowDeal,
): VerificationOutcome {
  const rubric = compareTriple(
    computeRubricHash(preimage),
    preimage.rubricHash,
    deal.criteriaHash,
  );
  const deliverable = compareTriple(
    computeDeliverableHash(preimage),
    preimage.deliverableHash,
    deal.deliverableHash,
  );
  const verdict = compareTriple(
    computeVerdictHash(preimage),
    preimage.verdictHash,
    deal.verdictReasoningHash,
  );

  const allMatch = [rubric, deliverable, verdict].every(
    (comparison) =>
      comparison.kind === 'all-match' ||
      (comparison.kind === 'onchain-absent' && comparison.storedMatches),
  );

  return {
    rubric,
    deliverable,
    verdict,
    conclusion: allMatch ? 'tamper-evident' : 'mismatch',
    // Assigned last, read by nothing above. See Requirement 8.7.
    backendVerifiedFlag: preimage.verified ?? null,
  };
}
