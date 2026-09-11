/**
 * =============================================================================
 * `src/lib/canonicalize.ts` — the client-owned port of the protocol hashing
 * =============================================================================
 *
 * This is the module the whole verification claim rests on. The Verify panel
 * asserts that a visitor recomputes a record's hashes in their own browser and
 * does not have to take the backend's word for anything. That claim is only
 * worth stating if this file reproduces `backend/src/ai-judge/verdict.ts` byte
 * for byte, because a single differing byte turns every intact record into a
 * false mismatch — and a false tamper alarm on an audit surface destroys the
 * credibility of a true one.
 *
 * So the module is deliberately boring:
 *
 *   - No React, no fetch, no `process.env`, no `Date.now()`, no I/O.
 *   - `ethers` is the only import.
 *   - Named intermediate values, an explicit field list, no cleverness.
 *
 * It is therefore unit-testable in a bare Node process, which is why the test
 * floor for this workspace can be `node:test` with no DOM.
 *
 * It is a PORT, not a shared library. Requirement 5.1 says this interface owns
 * its own copy rather than importing from the backend workspace, because an
 * import would mean the browser and the backend run the same code and agreement
 * would prove nothing about the record. Two independent implementations that
 * agree is the evidence; one implementation called twice is not.
 *
 * WHAT AGREEMENT PROVES, AND WHAT IT DOES NOT
 * -------------------------------------------
 * Recomputing these hashes shows that a stored record matches its own hash and
 * the commitment the contract holds. It says nothing about what the model was
 * actually shown, and nothing about whether the evaluation was sound. Copy
 * derived from this module has to stay inside that line.
 */

import { keccak256, toUtf8Bytes } from 'ethers';

import type {
  AuditableVerdict,
  Hex32,
  VerdictHashField,
  VerdictPreimage,
} from '@/types';

/* ===========================================================================
 * §1  What can be canonicalized
 * ======================================================================== */

/**
 * The value space the canonicalizer accepts.
 *
 * Deliberately narrower than the backend's `unknown`. A `bigint`, a `Date`, a
 * function, or a `Map` reaching the canonicalizer would serialize to something
 * neither implementation intended, and the resulting mismatch would be read as
 * tampering. Here those are compile errors instead.
 *
 * `undefined` appears only as a member value, never as a member of this union:
 * an object member whose value is `undefined` is omitted from the output, so
 * `undefined` is a signal about the member rather than a value to serialize.
 */
export type Canonicalizable =
  | string
  | number
  | boolean
  | null
  | Canonicalizable[]
  | { [key: string]: Canonicalizable | undefined };

/* ===========================================================================
 * §2  Canonical form
 * ======================================================================== */

/**
 * The deterministic string form of a value: object keys ascending, no
 * whitespace anywhere, members whose value is `undefined` omitted entirely.
 * (Requirement 5.2)
 *
 * Every decision below is a place two implementations can silently disagree,
 * so each one is recorded rather than left to be inferred from the code.
 *
 * 1. KEY ORDER — `Object.keys(...).sort()`, the default comparator, which
 *    compares UTF-16 code units. NOT `localeCompare`, which is locale-aware
 *    and orders non-ASCII keys differently depending on the runtime's ICU data.
 *
 *    This is a real, deliberate divergence from the backend and it should not
 *    be discovered later by someone reading a diff. `verdict.ts` sorts with
 *    `left.localeCompare(right)`. The two comparators agree on the key set that
 *    actually occurs, and that agreement is checkable rather than asserted:
 *    sorting the seventeen names in `VERDICT_HASH_FIELDS` by code unit and by
 *    collation yields the same sequence, and the preimage is the ONLY object
 *    this module ever canonicalizes — `acceptanceCriteria` is an array of
 *    strings and `deliverable` is a string, so no other key set reaches the
 *    comparator. The default comparator is chosen because a hash function must
 *    be portable, and `localeCompare` is the one string comparison in
 *    JavaScript whose result can depend on the environment it runs in; a
 *    browser with a trimmed ICU build is exactly the environment this code has
 *    to survive.
 *
 *    The consequence, stated plainly so it is not a surprise. The two orders
 *    are NOT generally equal, and the counterexamples are closer to hand than
 *    "non-ASCII" suggests — the keys here are camelCase, not lowercase, so
 *    case is already in play:
 *
 *      `'a' < 'A'`                      code unit: false   collation: true
 *      `'taskCategory' < 'taskcategory'` code unit: true    collation: false
 *      `'zebra' < 'Éclair'`              code unit: true    collation: false
 *
 *    So adding a key that differs from an existing one only by case, or that
 *    reaches outside ASCII, makes this module and the backend disagree — and
 *    the disagreement presents as a tamper mismatch on a record nobody touched.
 *    Such a change means editing both sides in one commit, with a fixture
 *    pinning the agreed order.
 *
 * 2. STRINGS — escaped by `JSON.stringify`, whose rules are fixed by the
 *    language: `\uXXXX` for control characters, `"` and `\` escaped, `/` and
 *    non-ASCII left alone. Hand-rolling the quoting is the single most likely
 *    source of a cross-implementation mismatch, so it is not hand-rolled on
 *    either side.
 *
 * 3. ARRAY ORDER — preserved. Sorting would be wrong: `acceptanceCriteria` is
 *    an ordered list and its order is part of the agreement between buyer and
 *    seller.
 *
 * 4. `undefined` INSIDE AN ARRAY — becomes `null`. Arrays have no members to
 *    omit, and dropping an element would change the length, which is a
 *    semantic change rather than a formatting one.
 *
 * 5. NON-FINITE NUMBERS — throw. A silent `NaN` to `null` coercion would let
 *    two materially different records hash identically, which is the one
 *    failure mode a commitment scheme cannot tolerate.
 */
export function canonicalize(value: Canonicalizable | undefined): string {
  // Only reachable at the root: a member whose value is `undefined` is dropped
  // before recursion, and an array element is coalesced to `null` first.
  if (value === undefined) return 'null';
  if (value === null) return 'null';

  if (typeof value === 'string') return JSON.stringify(value);

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('canonicalize: non-finite number');
    }
    return JSON.stringify(value);
  }

  if (typeof value === 'boolean') return value ? 'true' : 'false';

  if (Array.isArray(value)) {
    const elements = value.map((element) => canonicalize(element ?? null));
    return `[${elements.join(',')}]`;
  }

  const keys = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort();
  const members = keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`);
  return `{${members.join(',')}}`;
}

/**
 * A Canonical_Hash: keccak256 over the UTF-8 bytes of the canonical string.
 * (Requirement 5.3)
 *
 * `toUtf8Bytes` is the encoding step and it is not incidental. Encoding the
 * canonical string as anything but UTF-8 changes the digest for every value
 * containing a character outside ASCII, and rubrics and deliverables are
 * free-form human text.
 */
export function hashCanonicalValue(value: Canonicalizable | undefined): Hex32 {
  return keccak256(toUtf8Bytes(canonicalize(value))) as Hex32;
}

/* ===========================================================================
 * §3  Deadline normalisation
 * ======================================================================== */

/**
 * One deadline, one string. (Requirement 5.7)
 *
 * The contract stores a Unix-seconds `uint256`; the backend's judge record may
 * carry either that integer or an ISO string. Both have to land on the same
 * string or the verdict hash diverges between layers for a deal nobody
 * touched.
 *
 * A number is read as Unix SECONDS, hence the multiply. Passing milliseconds
 * here produces a date tens of thousands of years out, which is wrong loudly
 * rather than quietly — the value is visible on screen.
 *
 * `toISOString()` is the chosen form because it is the one JavaScript date
 * serialisation with a fixed shape, `YYYY-MM-DDTHH:mm:ss.sssZ`: always UTC,
 * always milliseconds. That fixed shape makes it idempotent, so feeding its
 * own output back in reproduces the string exactly and a record can be
 * normalised twice without changing its hash.
 *
 * @throws {TypeError} when the value does not parse to a real instant.
 */
export function normalizeDeadline(deadline: number | string): string {
  const date = typeof deadline === 'number' ? new Date(deadline * 1000) : new Date(deadline);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`normalizeDeadline: unparseable ${deadline}`);
  }

  return date.toISOString();
}

/* ===========================================================================
 * §4  The two single-field hashes
 * ======================================================================== */

/**
 * `rubricHash` reads exactly one field: `acceptanceCriteria`. (Requirement 5.4)
 *
 * The parameter is a `Pick` rather than the whole record so the type states the
 * single-field claim. Nothing else about the deal can leak into this digest,
 * which is what lets the on-chain `criteriaHash` be compared against it.
 */
export const computeRubricHash = (
  record: Pick<AuditableVerdict, 'acceptanceCriteria'>,
): Hex32 => hashCanonicalValue(record.acceptanceCriteria);

/**
 * `deliverableHash` reads exactly one field: `deliverable`. (Requirement 5.4)
 *
 * Same `Pick` discipline, same reason: this is the value the contract's own
 * `deliverableHash` is compared against.
 */
export const computeDeliverableHash = (
  record: Pick<AuditableVerdict, 'deliverable'>,
): Hex32 => hashCanonicalValue(record.deliverable);

/* ===========================================================================
 * §5  The verdict preimage — exactly seventeen fields
 * ======================================================================== */

/**
 * The seventeen field names, as a tuple.
 *
 * This exists as the ASSERTION TARGET, not as the thing the preimage is built
 * from. A test parses the canonical string of a preimage and compares its key
 * set against this tuple, so the literal in `buildVerdictPreimage` and this
 * declaration cannot drift apart without the suite failing.
 *
 * `timestamp` is NOT one of them. (Requirement 5.6)
 */
export const VERDICT_HASH_FIELDS = [
  'acceptanceCriteria',
  'approved',
  'buyer',
  'deadline',
  'dealId',
  'deliverable',
  'deliverableHash',
  'evaluationPrompt',
  'modelId',
  'modelVersion',
  'rawResponse',
  'reasoning',
  'rubricHash',
  'score',
  'seller',
  'taskCategory',
  'verdict',
] as const;

/** The tuple's member type, for the agreement proof below. */
type TupleField = (typeof VERDICT_HASH_FIELDS)[number];

/**
 * Compile-time proof that the tuple and `VerdictPreimage` name the same
 * seventeen fields, and that `timestamp` is not among them.
 *
 * The runtime test asserts the same thing about the canonical string, which is
 * the stronger check because it sees what was actually serialised. This pair of
 * types catches the drift earlier, at the moment someone edits one list and not
 * the other, which is when it is cheapest to fix.
 */
type FieldsAgree = [Exclude<VerdictHashField, TupleField>, Exclude<TupleField, VerdictHashField>] extends [never, never]
  ? true
  : never;
type TimestampIsExcluded = 'timestamp' extends TupleField ? never : true;

const VERDICT_HASH_FIELDS_ARE_EXACT: FieldsAgree = true;
const TIMESTAMP_IS_NOT_HASHED: TimestampIsExcluded = true;
void VERDICT_HASH_FIELDS_ARE_EXACT;
void TIMESTAMP_IS_NOT_HASHED;

/**
 * Build the object that gets canonicalized into `verdictHash`.
 * (Requirement 5.5)
 *
 * WHY AN EXPLICIT LITERAL AND NOT A LOOP OVER `VERDICT_HASH_FIELDS`
 * -----------------------------------------------------------------
 * A loop would be shorter, and it would be wrong the moment a field's
 * derivation stops being a verbatim copy — which is already true of five of
 * them. The literal makes the whole contract visible on one screen: which
 * fields are copied, which are recomputed, which are derived, which is
 * normalised, and that `timestamp` is absent. An auditor can read down the list
 * and check it against the specification, which is the entire point of this
 * file existing.
 *
 * The five fields that are not verbatim copies:
 *
 *   `rubricHash`       RECOMPUTED from `acceptanceCriteria`, never copied
 *   `deliverableHash`  RECOMPUTED from `deliverable`, never copied
 *   `score`            DERIVED from `approved`  (100 / 0)
 *   `verdict`          DERIVED from `approved`  (PASS / FAIL)
 *   `deadline`         NORMALISED to the fixed ISO form
 *
 * WHY `score` AND `verdict` ARE DERIVED RATHER THAN READ (Requirement 5.8)
 * -----------------------------------------------------------------------
 * The record stores both. If it ever stored `approved: true` with `score: 0`,
 * reading both would produce a preimage that is internally contradictory and a
 * hash matching nothing at all — the panel would report a mismatch and a reader
 * would have no way to tell an inconsistent record from a tampered one.
 * Deriving both makes the preimage internally consistent by construction, so a
 * stored inconsistency surfaces as a stored-versus-recomputed disagreement on
 * one row. That is precisely the signal the Verify panel exists to give.
 *
 * The backend's `calculateVerdictHash` reads `score` and `verdict` off the
 * record instead. The two agree on every record the backend has ever written,
 * because `buildVerdict` derives both from `approved` before storing them, so
 * a stored record's `score` is already `approved ? 100 : 0`. The divergence is
 * only reachable through a record the backend did not produce, and on such a
 * record this side is the one behaving correctly.
 *
 * `buyer`, `seller`, and `taskCategory` are optional and are passed through as
 * possibly-`undefined` on purpose: canonicalization OMITS an undefined member
 * rather than emitting `null`, so an absent category changes the hash by
 * dropping a key. Substituting a placeholder such as `uncategorized` — which
 * is what reputation tallies do — would change the hash of every historical
 * record that lacked a category. The two behaviours are different on purpose
 * and must not be unified.
 */
export function buildVerdictPreimage(record: AuditableVerdict): VerdictPreimage {
  return {
    acceptanceCriteria: record.acceptanceCriteria,
    approved: record.approved,
    buyer: record.buyer,
    deadline: normalizeDeadline(record.deadline),
    dealId: record.dealId,
    deliverable: record.deliverable,
    deliverableHash: computeDeliverableHash(record),
    evaluationPrompt: record.evaluationPrompt,
    modelId: record.modelId,
    modelVersion: record.modelVersion,
    rawResponse: record.rawResponse,
    reasoning: record.reasoning,
    rubricHash: computeRubricHash(record),
    score: record.approved ? 100 : 0,
    seller: record.seller,
    taskCategory: record.taskCategory,
    verdict: record.approved ? 'PASS' : 'FAIL',
  };
}

/**
 * The Verdict_Hash: keccak256 over the canonical form of the seventeen-field
 * preimage. (Requirements 5.5, 5.6)
 *
 * Invariant worth stating because the Verify panel depends on it: this is a
 * pure function of the record's hashed fields. Two calls a day apart return the
 * same digest, because `timestamp` is not read and nothing here consults a
 * clock.
 */
export const computeVerdictHash = (record: AuditableVerdict): Hex32 =>
  hashCanonicalValue(buildVerdictPreimage(record));
