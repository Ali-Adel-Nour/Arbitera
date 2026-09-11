/**
 * =============================================================================
 * `src/lib/guards.ts` — the runtime boundary around `types.ts`
 * =============================================================================
 *
 * `src/types.ts` is a contract written in a type system that stops existing at
 * runtime. Every byte this interface reads arrives as `unknown` from a network
 * it does not control, and a `JudgmentResponse` annotation on a `fetch` result
 * is a promise nobody checked. This module is where the promise gets checked.
 *
 * WHAT IT BUYS
 * ------------
 * A backend that renames `verdictHash` to `verdict_hash` has two possible
 * futures. Without these guards, the rename reaches a component, a hash
 * comparison runs against `undefined`, and a reviewer sees either a tamper
 * alarm on an untouched record or a stack trace three components deep — both of
 * which point at the wrong layer. With them, `services/api.ts` returns
 * `{ kind: 'malformed', expected: 'AuditableVerdict' }` and the error panel says
 * the backend and `types.ts` have drifted, which is the truth and names the file
 * to go and read. (Requirements 3.3, 3.4, 3.5.)
 *
 * WHICH GUARD EACH ROUTE USES
 * ---------------------------
 *   GET  /health                    isHealthResponse
 *   POST /api/judge                 isAuditableVerdict      (request: isJudgeRequest)
 *   POST /api/judge-and-settle      isJudgeAndSettleResponse (request: isJudgeRequest)
 *   GET  /api/reputation/:agent     isReputationSummary
 *   GET  /api/judgments/:dealId     isJudgmentResponse
 *   GET  /api/verify/:dealId        isVerifyPreimageResponse
 *   GET  /api/deals                 isDealsResponse
 *   GET  /api/deals/:dealId         isEscrowDeal
 *   GET  /api/agents                isAgentsResponse
 *   GET  /api/mcp-activity          isMcpActivityResponse
 *
 * FIVE DECISIONS, EACH OF WHICH IS LOAD-BEARING
 * ---------------------------------------------
 *
 * EVERY REQUIRED FIELD IS CHECKED, NOT A DISCRIMINANT OR TWO. A guard that
 * sniffs one key would pass a payload missing nine others, which is the crash
 * this module exists to prevent — the rename would simply land one field later.
 * `objectGuard` takes a check per member of `Required<T>`, so the compiler
 * refuses a field table that has drifted from the type: add a field to
 * `types.ts` without a check here and this file stops compiling. That is the
 * real guarantee. Property 15 asserts the runtime half of it.
 *
 * ABSENT AND NULL ARE DIFFERENT FACTS, AND STAY DIFFERENT. `types.ts` spells
 * some fields `T | null` and others `field?: T`, and the difference carries
 * meaning: `verdictReasoningHash` is nullable because the contract holds nothing
 * there until settlement, so its key is always present and its value is
 * sometimes `null`. `judgeRequestedAt` is optional because the backend may not
 * implement it at all. So `nullable` accepts `null` and REJECTS absence, and
 * `optional` accepts absence and rejects a present value of the wrong type.
 * Collapsing them would let a deal with no `deliverableHash` key at all read as
 * an unsubmitted deal, hiding a genuine contract drift.
 *
 * UNKNOWN EXTRA KEYS PASS. A backend adding a field is not breaking this
 * interface, and failing on unrecognised members would make every additive
 * server change an outage on a surface whose whole job is to stay readable.
 * These guards check that what is promised is present and well-shaped; they do
 * not assert that nothing else is.
 *
 * SHAPE IS CHECKED, INTERNAL CONSISTENCY IS NOT. `score` is required to be a
 * number, not to be 100 when `approved` is true. `types.ts` is explicit about
 * why: a record holding `approved: true, score: 0` must reach the verify panel
 * and surface as a stored-versus-recomputed disagreement, because that is the
 * finding. A guard that rejected it would hide the exact defect the panel was
 * built to display, and would report it as a transport problem.
 *
 * NON-EMPTINESS IS CHECKED ONLY WHERE IT IS STRUCTURAL. An identifier used as an
 * object key or a request path segment cannot be empty, and `types.ts` states
 * that `acceptanceCriteria` must be a non-empty array of non-empty strings
 * because the judge route rejects anything else with a 400. Free text is left
 * alone: an empty `reasoning` or `rawResponse` is data about a model's answer,
 * and blocking a whole screen over it would replace a legible record with an
 * error a reader cannot act on.
 *
 * THE MODULE IS PURE
 * ------------------
 * No React, no fetch, no `process.env`, no clock. Not even an `ethers` import —
 * hex is a regular expression here, not an address parse, so this file has no
 * dependencies at all beyond the type-only import of the contract it enforces.
 * Two calls with the same argument give the same answer.
 */

import type {
  AgentListEntry,
  AgentsResponse,
  AuditableVerdict,
  DealsResponse,
  EscrowDeal,
  EscrowState,
  HealthResponse,
  HiringDecision,
  JudgeAndSettleResponse,
  JudgeRequest,
  JudgmentHistoryEntry,
  JudgmentRef,
  JudgmentResponse,
  McpActivityEntry,
  McpActivityResponse,
  McpDataSource,
  ReputationSummary,
  SettlementResult,
  TaskCategoryStats,
  VerdictOutcome,
  VerifyPreimageResponse,
} from '@/types';

/* ===========================================================================
 * §1  The guard type, and the label that lands in `expected`
 * ======================================================================== */

/**
 * A narrowing predicate that also carries the name of the shape it checks.
 *
 * THE LABEL IS A DATA MEMBER, NOT `Function.prototype.name`, AND THAT IS A
 * DELIBERATE DEVIATION FROM `design.md`. The design's client sketch writes
 * `expected: guard.name`, which reads correctly in a bare Node test run and
 * degrades to nonsense in the deployment that matters: the production client
 * bundle is minified, top-level names in a module are mangled, and the error
 * panel would tell a reviewer that the response "did not match the shape r".
 *
 * `expected` exists to name a shape a human can look up in `types.ts`. A value
 * that survives minification is the only version of that which works, so the
 * label is written out as a string and `expectedShape` reads it.
 */
export type Guard<T> = ((value: unknown) => value is T) & { readonly shape: string };

/**
 * The shape name to put in a `malformed` error's `expected` field.
 *
 * Deliberately a function rather than a bare property read at the call site, so
 * the client has one place to reach for and the label's provenance is greppable
 * from the error copy back to here.
 */
export function expectedShape(guard: { readonly shape: string }): string {
  return guard.shape;
}

/** Pairs a predicate with its label. The only place `shape` is assigned. */
const shaped = <T>(shape: string, check: (value: unknown) => boolean): Guard<T> => {
  const guard = (value: unknown): value is T => check(value);
  return Object.assign(guard, { shape });
};

/* ===========================================================================
 * §2  Structural helpers
 * ======================================================================== */

/**
 * A plain JSON object.
 *
 * Arrays are excluded explicitly. `typeof [] === 'object'` and `[] !== null`, so
 * without the `Array.isArray` clause every object guard below would accept an
 * array of the wrong thing and then fail on the first field read. `null` is
 * excluded for the same reason: a body of `null` is valid JSON.
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): boolean => typeof value === 'string';

const isBoolean = (value: unknown): boolean => typeof value === 'boolean';

/**
 * A real number. `NaN` and both infinities are rejected.
 *
 * They arrive from a division by zero on the far side and they poison every
 * comparison they reach silently — `NaN >= 0` is false, so a downstream clamp
 * lets them straight through. Rejecting them here is the only place it is cheap.
 */
const isFiniteNumber = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value);

/** A tally. Counts are whole and cannot be negative. */
const isCount = (value: unknown): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/**
 * A fraction in [0, 1].
 *
 * Every rate in `types.ts` is a fraction, never a percentage: `successRate` is
 * `successes / totalJudged`, and `returnedReliability` is the figure a buyer
 * agent acted on. A backend that switched one of them to 0–100 would render as
 * `8500%` on a trust surface, so the range is checked rather than clamped — a
 * rescale is a contract change and belongs in a named `malformed` error.
 */
const isRate = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

/** A non-empty string. Used for identifiers, never for free text. See §1's note. */
const isNonEmptyString = (value: unknown): boolean =>
  typeof value === 'string' && value.length > 0;

/** An array whose every element passes `check`. Empty arrays pass. */
const arrayOf =
  (check: (value: unknown) => boolean) =>
  (value: unknown): boolean =>
    Array.isArray(value) && value.every(check);

/** A non-empty array whose every element passes `check`. */
const nonEmptyArrayOf =
  (check: (value: unknown) => boolean) =>
  (value: unknown): boolean =>
    Array.isArray(value) && value.length > 0 && value.every(check);

/** A string-keyed map whose every value passes `check`. An empty map passes. */
const recordOf =
  (check: (value: unknown) => boolean) =>
  (value: unknown): boolean =>
    isRecord(value) && Object.values(value).every(check);

/**
 * A field that may be absent. Present-and-wrong still fails.
 *
 * An absent key reads as `undefined`, which is the same value an explicit
 * `undefined` member has, and the two are indistinguishable after `JSON.parse`
 * anyway — JSON has no `undefined`. So accepting `undefined` here is exactly
 * "the key was not sent".
 */
const optional =
  (check: (value: unknown) => boolean) =>
  (value: unknown): boolean =>
    value === undefined || check(value);

/**
 * A field that must be present and may be `null`.
 *
 * The complement of `optional`, and the distinction is the point: `undefined`
 * is NOT accepted, so a missing key fails. `null` here means the chain holds
 * nothing yet; an absent key means the backend no longer sends the field, which
 * is drift and must be reported as such.
 */
const nullable =
  (check: (value: unknown) => boolean) =>
  (value: unknown): boolean =>
    value === null || check(value);

/**
 * One check per member of `T`, with `Required<T>` doing the enforcement.
 *
 * `Required<T>` strips the `?` off every optional member, so the mapped type
 * demands an entry for `judgeRequestedAt` and `taskCategory` too — wrapped in
 * `optional`, but present. The effect is that a field added to a shape in
 * `types.ts` breaks compilation here until it is checked, which is what keeps
 * these guards from silently going shallow as the contract grows.
 */
type FieldChecks<T> = { readonly [K in keyof Required<T>]: (value: unknown) => boolean };

/**
 * Builds an object guard from a complete field table.
 *
 * Iterates the CHECKS rather than the value's own keys, so an extra member on
 * the payload is ignored and a missing member is caught by its check receiving
 * `undefined`. Short-circuits on the first failure: a guard's answer is a
 * boolean, and collecting every defect would be a validator, which is a
 * different job with a different error type.
 */
const objectGuard = <T>(shape: string, fields: FieldChecks<T>): Guard<T> =>
  shaped<T>(shape, (value) => {
    if (!isRecord(value)) return false;
    for (const key of Object.keys(fields)) {
      const check = (fields as Record<string, (value: unknown) => boolean>)[key];
      if (!check(value[key])) return false;
    }
    return true;
  });

/**
 * Builds a guard for a closed string union from a table keyed by that union.
 *
 * `Record<T, true>` is what makes the table exhaustive in both directions: a
 * missing member is a compile error, and an extra key is rejected by the
 * `satisfies` at each call site. So a seventh escrow state added to `types.ts`
 * cannot reach the docket unchecked.
 */
const unionGuard = <T extends string>(shape: string, members: Record<T, true>): Guard<T> =>
  shaped<T>(shape, (value) => typeof value === 'string' && Object.hasOwn(members, value));

/* ===========================================================================
 * §3  Primitives and machine identities
 * ======================================================================== */

/** 32 bytes, `0x`-prefixed, 64 hex digits, either letter case. */
const HEX32_PATTERN = /^0x[0-9a-fA-F]{64}$/;

/** 20 bytes, `0x`-prefixed, 40 hex digits, either letter case. */
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

/**
 * A base-unit integer: digits only.
 *
 * STRICTER THAN `BigInt`, ON PURPOSE, IN BOTH DIRECTIONS. `BigInt` accepts
 * `' 12 '`, and reads `'0x10'` as sixteen — so a hex string in an amount field
 * would settle as a silently different number. It throws on `'1.5'` and `'1e6'`,
 * and `lib/derive.ts`'s `baseUnits` turns that throw into a `TypeError` from
 * inside a reduce, mid-render, on a settlement total. This guard is the boundary
 * that is supposed to make that unreachable, so it accepts only the one form the
 * contract means: a run of decimal digits, no sign, no point, no exponent, no
 * surrounding space.
 *
 * A negative amount is rejected rather than left to arithmetic. `BigInt('-1')`
 * succeeds, and a negative escrow amount would subtract from a settled total —
 * a wrong figure that no exception announces.
 */
const BASE_UNITS_PATTERN = /^\d+$/;

/**
 * An ISO 8601 instant with an explicit zone designator.
 *
 * `types.ts` specifies the exact shape `toISOString()` emits, and the fractional
 * part and offset form are loosened here to that standard's ordinary variants —
 * a backend serialising with three, six, or no fractional digits is not drift
 * worth blocking a screen over, and `normalizeDeadline` folds all of them onto
 * one canonical string before anything is hashed.
 *
 * WHAT IS NOT LOOSENED IS THE ZONE. A bare local datetime is rejected, because
 * an instant with no zone is ambiguous by up to a day and `deadline` is inside
 * the verdict preimage: the same wall-clock string read in two places would hash
 * to two different digests and report tampering on a record nobody touched.
 */
const ISO_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

/** The largest instant a `Date` can hold, in milliseconds either side of the epoch. */
const MAX_TIME_MS = 8.64e15;

/** A keccak256 digest, or any other 32-byte commitment. */
export const isHex32 = shaped<`0x${string}`>(
  'Hex32',
  (value) => typeof value === 'string' && HEX32_PATTERN.test(value),
);

/**
 * A 32-byte commitment that is not the zero digest.
 *
 * Used for `dealId` alone. `types.ts` records that the contract rejects an
 * identifier that is not 32 bytes of NON-ZERO hex, so a deal keyed by the zero
 * digest can never settle; catching it at the boundary names the shape instead
 * of letting a settlement attempt come back as an opaque revert much later.
 *
 * The other three commitments are left alone — a hash that happens to be zero is
 * absurd but is not a shape error, and the comparison in `lib/verify.ts` is the
 * right place for a value that does not match its own content.
 */
export const isNonZeroHex32 = shaped<`0x${string}`>('Hex32', (value) => {
  if (typeof value !== 'string' || !HEX32_PATTERN.test(value)) return false;
  return !/^0x0{64}$/.test(value);
});

/** A 20-byte EVM address. */
export const isAddress = shaped<`0x${string}`>(
  'Address',
  (value) => typeof value === 'string' && ADDRESS_PATTERN.test(value),
);

/**
 * A transaction hash.
 *
 * The same 32 bytes as `isHex32` and a separate export for the same reason
 * `types.ts` declares `TxHash` separately: it is a chain reference for the
 * settlement link, not a commitment to compare, and a field that swapped one
 * for the other should read as a contract change at the call site.
 */
export const isTxHash = shaped<`0x${string}`>(
  'TxHash',
  (value) => typeof value === 'string' && HEX32_PATTERN.test(value),
);

/**
 * An agent identifier, in either live form.
 *
 * Non-empty and nothing more. `types.ts` is explicit that both a plain slug and
 * an address resolve, so narrowing this to `isAddress` would reject the form the
 * MCP terminal actually uses. Emptiness is checked because the value becomes a
 * request path segment and a reputation lookup on `''` is a 400 the interface
 * can see coming.
 */
export const isAgentId = shaped<string>('AgentId', isNonEmptyString);

/** An ISO 8601 instant with a zone. See `ISO_INSTANT_PATTERN`. */
export const isIsoTimestamp = shaped<string>(
  'IsoTimestamp',
  (value) =>
    typeof value === 'string' &&
    ISO_INSTANT_PATTERN.test(value) &&
    !Number.isNaN(Date.parse(value)),
);

/** A USDC amount as a base-unit integer string. See `BASE_UNITS_PATTERN`. */
export const isUsdcAmount = shaped<string>(
  'UsdcAmount',
  (value) => typeof value === 'string' && BASE_UNITS_PATTERN.test(value),
);

/**
 * A deadline as Unix SECONDS, in the range a `Date` can represent.
 *
 * The bound is not pedantry. `normalizeDeadline` multiplies by 1000 and throws a
 * `TypeError` when the product is not a real instant, and it is called while
 * building a verdict preimage — so an out-of-range number reaching it takes down
 * the hash recomputation rather than producing a hash mismatch. The range check
 * belongs at the boundary, where it turns into a named shape error.
 */
const isUnixSeconds = (value: unknown): boolean =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  Math.abs(value * 1000) <= MAX_TIME_MS;

/**
 * A deadline in either form the contract and the backend use between them: the
 * chain's Unix-seconds integer, or an ISO string.
 */
export const isDeadline = shaped<string | number>(
  'IsoTimestamp | number',
  (value) => isIsoTimestamp(value) || isUnixSeconds(value),
);

/* ===========================================================================
 * §4  Closed string unions
 * ======================================================================== */

/**
 * The six on-chain states. `Deliberating` is NOT among them and must never be,
 * which is the structural guarantee `types.ts` §2 spends a paragraph on: this
 * guard is what stops a mock route or a hand-written fixture putting a
 * frontend inference into `EscrowDeal.state`, where the docket would present it
 * as a chain fact.
 *
 * State changes the contract permits, for orientation:
 *   Created → Funded → Submitted → ResolvedSuccess or ResolvedRefund
 *   Funded or Submitted → ExpiredRefund
 */
export const isEscrowState = unionGuard<EscrowState>('EscrowState', {
  Created: true,
  Funded: true,
  Submitted: true,
  ResolvedSuccess: true,
  ResolvedRefund: true,
  ExpiredRefund: true,
} satisfies Record<EscrowState, true>);

/** `PASS` or `FAIL`, spelled as the protocol spells it. */
export const isVerdictOutcome = unionGuard<VerdictOutcome>('VerdictOutcome', {
  PASS: true,
  FAIL: true,
} satisfies Record<VerdictOutcome, true>);

/** Where an MCP answer came from. Neither value is an error. */
export const isMcpDataSource = unionGuard<McpDataSource>('McpDataSource', {
  graph: true,
  backend: true,
} satisfies Record<McpDataSource, true>);

/** What the querying agent did with the figure it got back. */
export const isHiringDecision = unionGuard<HiringDecision>('HiringDecision', {
  hired: true,
  declined: true,
  'queried-only': true,
} satisfies Record<HiringDecision, true>);

/* ===========================================================================
 * §5  The deal
 * ======================================================================== */

/**
 * `EscrowDeal` — ten contract-mirroring fields and two the chain cannot hold.
 * (Requirement 3.3)
 *
 * Note which fields are `nullable` and which are `optional`, and why they differ.
 * `deliverableHash` and `verdictReasoningHash` are nullable: the key is always
 * sent and the value is `null` until the seller submits and the oracle resolves
 * respectively, so an ABSENT key is drift rather than an unsettled deal.
 * `judgeRequestedAt` and `resolvedTransactionHash` are optional: no shipped
 * route returns either, and the docket degrades to six groups without the first
 * rather than reporting every deal as malformed.
 */
export const isEscrowDeal = objectGuard<EscrowDeal>('EscrowDeal', {
  dealId: isNonZeroHex32,
  buyer: isAddress,
  seller: isAddress,
  token: isAddress,
  amount: isUsdcAmount,
  criteriaHash: isHex32,
  deadline: isDeadline,
  state: isEscrowState,
  deliverableHash: nullable(isHex32),
  verdictReasoningHash: nullable(isHex32),
  judgeRequestedAt: optional(isIsoTimestamp),
  resolvedTransactionHash: optional(isTxHash),
});

/**
 * `JudgmentRef` — the three fields `deriveDisplayState` needs to know a judgment
 * landed. Existence and identity, nothing more.
 */
export const isJudgmentRef = objectGuard<JudgmentRef>('JudgmentRef', {
  dealId: isNonZeroHex32,
  verdictHash: isHex32,
  timestamp: isIsoTimestamp,
});

/* ===========================================================================
 * §6  The auditable verdict
 * ======================================================================== */

/**
 * The sixteen members of `AuditableVerdict`, as one table, so the three shapes
 * that extend it share exactly these checks rather than restating them.
 *
 * Restating was the alternative and it is how a guard goes shallow: three copies
 * of a sixteen-field table drift, and the copy that drifts is the one nobody
 * reads. Spread from here, the verify and judgment responses differ only in the
 * one member they actually add.
 *
 * `buyer`, `seller`, and `taskCategory` are optional because the shipped judge
 * route accepts requests without them. Their presence changes the verdict hash —
 * canonicalization drops an absent member rather than emitting a null — so
 * `optional` is the honest check and a substituted default would be a bug with a
 * hash mismatch as its symptom.
 */
const AUDITABLE_VERDICT_FIELDS: FieldChecks<AuditableVerdict> = {
  dealId: isNonZeroHex32,
  buyer: optional(isAgentId),
  seller: optional(isAgentId),
  taskCategory: optional(isString),
  deadline: isIsoTimestamp,
  acceptanceCriteria: nonEmptyArrayOf(isNonEmptyString),
  deliverable: isString,
  approved: isBoolean,
  score: isFiniteNumber,
  verdict: isVerdictOutcome,
  reasoning: isString,
  modelId: isString,
  modelVersion: isString,
  evaluationPrompt: isString,
  rawResponse: isString,
  rubricHash: isHex32,
  deliverableHash: isHex32,
  verdictHash: isHex32,
  timestamp: isIsoTimestamp,
};

/**
 * `AuditableVerdict` — the full evidence record. (Requirement 3.5)
 *
 * `deadline` is the already-normalised ISO form here, unlike `EscrowDeal`'s,
 * which still accepts the chain's integer. `score` and `verdict` are checked for
 * shape and not for agreement with `approved`; see §1 on why that inconsistency
 * has to be allowed through to the verify panel.
 */
export const isAuditableVerdict = objectGuard<AuditableVerdict>(
  'AuditableVerdict',
  AUDITABLE_VERDICT_FIELDS,
);

/**
 * `VerifyPreimageResponse` — the record plus the backend's own assessment,
 * which is optional and, per Requirement 8.7, displayed rather than trusted.
 * `lib/verify.ts` reads it into a labelled cell and no code path that produces a
 * conclusion touches it.
 */
export const isVerifyPreimageResponse = objectGuard<VerifyPreimageResponse>(
  'VerifyPreimageResponse',
  { ...AUDITABLE_VERDICT_FIELDS, verified: optional(isBoolean) },
);

/**
 * `JudgmentResponse` — the record plus a REQUIRED `verified` flag, which is the
 * one difference from the verify response above and the reason both exist. The
 * shipped judgments route always sends it.
 */
export const isJudgmentResponse = objectGuard<JudgmentResponse>('JudgmentResponse', {
  ...AUDITABLE_VERDICT_FIELDS,
  verified: isBoolean,
});

/* ===========================================================================
 * §7  Reputation
 * ======================================================================== */

/** `TaskCategoryStats` — a per-category tally. Three fields, no more. */
export const isTaskCategoryStats = objectGuard<TaskCategoryStats>('TaskCategoryStats', {
  total: isCount,
  successes: isCount,
  successRate: isRate,
});

/**
 * `JudgmentHistoryEntry` — one resolution, as the shipped route projects it.
 *
 * `dealId` is `isNonEmptyString` and not `isHex32`: `types.ts` types this field
 * as a plain `string` here, and the shipped route returns whatever identifier the
 * judge was called with — a slug for a deal that was judged without settling.
 * Requiring a bytes32 would reject an agent's entire history over a demo record.
 *
 * `verdictHash` is `isString` and MAY BE EMPTY, because `types.ts` says so
 * plainly: an empty string is what a stored record with no hash returns. The
 * trust explorer renders the row without a hash link rather than losing the
 * judgment, which is the honest degrade.
 */
export const isJudgmentHistoryEntry = objectGuard<JudgmentHistoryEntry>(
  'JudgmentHistoryEntry',
  {
    dealId: isNonEmptyString,
    approved: isBoolean,
    score: isFiniteNumber,
    verdictHash: isString,
    timestamp: isIsoTimestamp,
    taskCategory: optional(isString),
  },
);

/**
 * `ReputationSummary` — the shipped reputation record. (Requirement 3.4)
 *
 * `history` is guarded element by element, so a single malformed entry fails the
 * whole summary. That is the right severity here: every derived figure on the
 * trust explorer is computed FROM `history`, so a bad entry would not show up as
 * one bad row — it would shift a trust score, a badge tier, and a dispute rate
 * by an amount nothing on screen could account for.
 *
 * An empty `history` with `totalJudged: 0` is well-formed and common. The zero
 * state is driven by that count rather than by a status code, because the shipped
 * route answers an unknown agent with a zero-filled summary and never a 404.
 */
export const isReputationSummary = objectGuard<ReputationSummary>('ReputationSummary', {
  agent: isAgentId,
  totalJudged: isCount,
  successes: isCount,
  failures: isCount,
  successRate: isRate,
  failureRate: isRate,
  recencyWeightedReliability: isRate,
  byTaskCategory: recordOf(isTaskCategoryStats),
  history: arrayOf(isJudgmentHistoryEntry),
});

/* ===========================================================================
 * §8  MCP activity
 * ======================================================================== */

/**
 * `McpActivityEntry` — one line of the reputation-query log.
 *
 * `returnedReliability` is the figure the querying agent actually acted on, so
 * it is bounded to [0, 1] like every other rate: the feed puts it next to the
 * hiring decision it produced, and a figure outside that range would make the
 * decision unreadable rather than merely odd.
 */
export const isMcpActivityEntry = objectGuard<McpActivityEntry>('McpActivityEntry', {
  id: isNonEmptyString,
  timestamp: isIsoTimestamp,
  queryingAgent: isAgentId,
  queriedAgent: isAgentId,
  returnedReliability: isRate,
  decision: isHiringDecision,
  source: isMcpDataSource,
});

/* ===========================================================================
 * §9  The agent list
 * ======================================================================== */

/**
 * `AgentListEntry` — one row of the fixture-backed agent list.
 *
 * `address` is optional because not every agent has one, and `taskCategories`
 * may be empty because an agent with no judgments has no categories yet. Both
 * are states the trust explorer renders, so neither is a shape error.
 */
export const isAgentListEntry = objectGuard<AgentListEntry>('AgentListEntry', {
  agent: isAgentId,
  address: optional(isAddress),
  totalJudged: isCount,
  taskCategories: arrayOf(isString),
});

/* ===========================================================================
 * §10  Settlement and health
 * ======================================================================== */

/** `SettlementResult` — the oracle's receipt: a chain reference and a commitment. */
export const isSettlementResult = objectGuard<SettlementResult>('SettlementResult', {
  transactionHash: isTxHash,
  reasoningHash: isHex32,
});

/** `JudgeAndSettleResponse` — the record and the receipt, both required. */
export const isJudgeAndSettleResponse = objectGuard<JudgeAndSettleResponse>(
  'JudgeAndSettleResponse',
  { verdict: isAuditableVerdict, settlement: isSettlementResult },
);

/** `HealthResponse` — `status` is the literal `'ok'`, so nothing else passes. */
export const isHealthResponse = objectGuard<HealthResponse>('HealthResponse', {
  status: (value) => value === 'ok',
  service: isNonEmptyString,
});

/* ===========================================================================
 * §11  Collection responses
 *
 * Each carries `asOf`, the SERVER's assembly time. The docket's last-updated
 * figure reads it rather than the client clock, because a skewed laptop would
 * otherwise make a live feed look stale or impossibly fresh — so `asOf` is a
 * required field and its absence is drift, not a cosmetic gap.
 * ======================================================================== */

/** `DealsResponse` — the docket's source. An empty list is well-formed. */
export const isDealsResponse = objectGuard<DealsResponse>('DealsResponse', {
  deals: arrayOf(isEscrowDeal),
  asOf: isIsoTimestamp,
});

/** `McpActivityResponse` — the activity feed's source, newest first. */
export const isMcpActivityResponse = objectGuard<McpActivityResponse>('McpActivityResponse', {
  entries: arrayOf(isMcpActivityEntry),
  asOf: isIsoTimestamp,
});

/** `AgentsResponse` — the agent list. Filtering is client-side over the whole list. */
export const isAgentsResponse = objectGuard<AgentsResponse>('AgentsResponse', {
  agents: arrayOf(isAgentListEntry),
  asOf: isIsoTimestamp,
});

/* ===========================================================================
 * §12  The one request shape
 *
 * Guards elsewhere in this file check what arrives from the network. This one
 * checks what arrives at the Mock_API's own route handlers, which is a request
 * body from a browser and just as unknown. It is here rather than in the handler
 * because the two judge routes share it and because `types.ts` documents the
 * request shape as part of the same contract.
 * ======================================================================== */

/**
 * `JudgeRequest` — the judge route's body, with the two validations `types.ts`
 * records as enforced.
 *
 * `acceptanceCriteria` must be a non-empty array of non-empty strings: `[]` and
 * `['']` are both 400s at the shipped route, so accepting them here would send a
 * request that cannot succeed.
 *
 * `deliverable` is non-empty HERE and merely a string in `AuditableVerdict`, and
 * the asymmetry is deliberate. A request is validated before it is accepted, so
 * rejecting an empty deliverable is a service to the sender. A stored record is
 * read long afterwards, and rejecting it for the same reason would hide a record
 * rather than surface it.
 *
 * `dealId` is only required to be non-empty, matching the route: this endpoint
 * judges without settling, so nothing reaches the contract's bytes32 rule. The
 * settling route is stricter, and a slug that judges will fail to settle — which
 * is stated at `JudgeAndSettleRequest` in `types.ts` and is a validation for the
 * form that builds the request, not for this shape.
 */
export const isJudgeRequest = objectGuard<JudgeRequest>('JudgeRequest', {
  dealId: isNonEmptyString,
  acceptanceCriteria: nonEmptyArrayOf(isNonEmptyString),
  deliverable: isNonEmptyString,
  deadline: isDeadline,
  buyer: optional(isAgentId),
  seller: optional(isAgentId),
  taskCategory: optional(isString),
});
