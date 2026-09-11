/**
 * =============================================================================
 * `src/types.ts` — the backend contract for Arbitra_Frontend
 * =============================================================================
 *
 * This module is the written contract between this interface and the backend.
 * It is a type-only module: no imports, no runtime values, no functions with
 * bodies. Everything here is a shape or a comment about a shape.
 *
 * WHO THIS IS FOR
 * ---------------
 * The backend developer. Read it top to bottom and you will know every field
 * this interface reads, every route it calls, which routes exist today, which
 * routes are mocked here and still need building, and which numbers this
 * interface computes for itself because no route returns them.
 *
 * If the backend and this file disagree, this file is the contract. The network
 * client shape-guards every response, so a field rename lands as a named
 * `malformed` error in the interface rather than a crash three components deep.
 *
 * HOW TO READ IT
 * --------------
 *   §1  Primitives and machine identities
 *   §2  Escrow state, and the one display state that is not on-chain
 *   §3  The deal
 *   §4  The auditable verdict, and the hash preimage
 *   §5  Reputation
 *   §6  MCP activity
 *   §7  Results and errors
 *   §8  Derived metrics — what this interface computes, and what would move it
 *   §9  Routes that ship today
 *   §10 Routes this interface mocks and still needs
 *
 * TWO CONVENTIONS USED THROUGHOUT
 * -------------------------------
 * `@shipped`  — a route or field the backend serves today. Callable now.
 * `@derived`  — a value this interface computes or a fixture supplies. Each
 *               `@derived` block names the source data the backend would have
 *               to return for the value to become protocol data.
 *
 * WHAT THE TRUST MODEL MEANS FOR THIS FILE
 * ----------------------------------------
 * The escrow contract is the custody boundary that needs no trust. The language
 * model, the persistence layer behind these routes, and the oracle key are
 * trusted infrastructure. Hashes make that boundary inspectable: comparing them
 * proves a stored record matches its own hash. It does not prove what the model
 * received, and it does not prove the evaluation was honest. Field comments in
 * §4 stay inside that line, and so should any copy derived from them.
 */

/* ===========================================================================
 * §1  Primitives and machine identities
 * ======================================================================== */

/**
 * A 32-byte keccak256 digest, `0x`-prefixed, 64 hex characters.
 *
 * Branded as a template literal rather than aliased to `string` so a plain
 * string cannot be passed where a hash is expected without an explicit guard.
 * The brand is intentionally loose — it constrains the prefix, not the length,
 * because TypeScript cannot express "exactly 64 hex characters" without a
 * 64-deep recursive type that wrecks compile times. Length is checked at
 * runtime by the guards in `lib/guards.ts`.
 *
 * Comparison is case-insensitive: a digest from an RPC node may arrive
 * checksummed while `keccak256` emits lowercase. They are the same commitment.
 */
export type Hex32 = `0x${string}`;

/**
 * A 20-byte EVM address, `0x`-prefixed, 40 hex characters.
 *
 * Same brand-not-validate caveat as `Hex32`.
 */
export type Address = `0x${string}`;

/**
 * An agent identifier as it appears in the protocol.
 *
 * Two forms are both live and both must round-trip. MCP tool calls in the demo
 * terminal name agents as plain strings; the contract's `buyer` and `seller`
 * fields are addresses. `GET /api/reputation/:agent` accepts either form, so
 * this type is deliberately the union and not `Address`.
 *
 * Display rule that follows from this, per Requirement 7.5: hex forms are
 * truncated on screen with the full value available on copy; plain identifier
 * forms are rendered whole, because truncating a short slug loses information
 * and gains nothing.
 */
export type AgentId = string;

/**
 * An ISO 8601 instant, always UTC, always with milliseconds — the exact shape
 * `Date.prototype.toISOString()` emits.
 *
 * The fixed shape matters for hashing. `toISOString()` is idempotent: feeding
 * its own output back through it reproduces the string exactly, so the deadline
 * inside a verdict preimage lands on one canonical form no matter whether the
 * contract's Unix-seconds integer or the backend's string was the input.
 */
export type IsoTimestamp = string;

/**
 * A USDC amount as a 6-decimal base-unit integer, carried as a decimal string.
 *
 * This is a string in the API and a `bigint` in arithmetic. It is NEVER a
 * JavaScript number. 2^53 is reachable in 6-decimal base units, and a rounded
 * settlement total on a surface whose entire purpose is auditability is
 * indefensible — an off-by-one in the last digit of a total is exactly the kind
 * of defect this interface exists to make impossible to hide.
 *
 * So: JSON carries `"1500000"`, meaning 1.50 USDC. `lib/derive.ts` sums with
 * `BigInt(amount)`. Formatting for display divides by 10^6 as a decimal string,
 * never via floating point.
 */
export type UsdcAmount = string;

/**
 * A transaction hash. Distinct from `Hex32` only in intent — it is a chain
 * reference for the settlement link, not a commitment to compare.
 */
export type TxHash = `0x${string}`;

/* ===========================================================================
 * §2  Escrow state, and the one display state that is not on-chain
 * ======================================================================== */

/**
 * The escrow lifecycle exactly as the contract enumerates it. Six members, no
 * more. If the contract's enum grows, this union grows with it and every
 * exhaustive switch in the interface becomes a compile error until it is
 * handled — which is the point of declaring it as a union rather than a string.
 *
 * Transitions the contract permits:
 *   Created         → Funded            buyer funds the escrow
 *   Funded          → Submitted         seller submits a deliverable
 *   Funded          → ExpiredRefund     deadline passes with no deliverable
 *   Submitted       → ResolvedSuccess   oracle resolves, approved
 *   Submitted       → ResolvedRefund    oracle resolves, rejected
 *   Submitted       → ExpiredRefund     oracle misses its grace period
 *
 * The last three are terminal.
 */
export type EscrowState =
  | 'Created'
  | 'Funded'
  | 'Submitted'
  | 'ResolvedSuccess'
  | 'ResolvedRefund'
  | 'ExpiredRefund';

/**
 * `Deliberating` — a display state this interface derives. NOT an on-chain
 * state, and deliberately declared outside `EscrowState` so it can never be
 * assigned to a field the contract populates.
 *
 * It means: the on-chain state is `Submitted`, a judge call has been requested,
 * and no judgment has landed yet. The contract has no notion of this; nothing
 * about it is enforced or committed anywhere.
 *
 * Keeping it out of `EscrowState` is a structural guard, not a stylistic one.
 * Merging the two unions would let a fixture, a mock route, or a careless
 * `as` cast put an off-chain value in `EscrowDeal.state`, and the docket would
 * then present a frontend inference as a chain fact. The docket labels the
 * group in visible copy for the same reason.
 */
export type DerivedDisplayState = 'Deliberating';

/**
 * The seven groups the docket renders: the six on-chain states plus the one
 * derived state. `lib/deriveState.ts` maps a deal onto exactly one of these.
 */
export type DisplayState = EscrowState | DerivedDisplayState;

/* ===========================================================================
 * §3  The deal
 * ======================================================================== */

/**
 * One escrow, as the interface reads it.
 *
 * Ten of these fields mirror contract storage. `judgeRequestedAt` does not, and
 * is called out below because it is the one thing the backend must add for the
 * docket's `Deliberating` group to be reachable at all.
 */
export interface EscrowDeal {
  /**
   * 32 bytes of non-zero hex. The contract rejects anything else with
   * `InvalidDealId`, so a settlement-capable request carrying a slug rather
   * than a bytes32 identifier fails at the contract, not at the backend.
   */
  dealId: Hex32;

  /** The funding party. Must be non-zero, or the contract reverts. */
  buyer: Address;

  /** The party paid on approval. Must be non-zero. */
  seller: Address;

  /** ERC-20 token address. USDC on Sepolia for the demo. */
  token: Address;

  /**
   * Escrow amount in 6-decimal USDC base units, as a string. See `UsdcAmount`
   * for why a string, and why never a JavaScript number.
   */
  amount: UsdcAmount;

  /**
   * On-chain commitment to the acceptance criteria. This is the chain-side
   * counterpart of the verdict record's `rubricHash`; the verify panel puts
   * them in the same row and labels that mapping rather than making the reader
   * infer it from two different field names.
   */
  criteriaHash: Hex32;

  /**
   * Submission deadline. The contract stores Unix seconds as a `uint256`; this
   * field accepts either that integer or an ISO string, because the backend's
   * own records carry both forms. Both normalise to one ISO string before
   * hashing — see §4's note on `deadline`.
   */
  deadline: IsoTimestamp | number;

  /** On-chain state. Never `Deliberating` — see §2. */
  state: EscrowState;

  /**
   * On-chain commitment to the seller's deliverable. `null` until the seller
   * submits.
   */
  deliverableHash: Hex32 | null;

  /**
   * On-chain commitment to the judge's verdict, written by the oracle at
   * resolution. `null` until then.
   *
   * This is the value the verify panel's third column reads, and the reason
   * the comparison is three-way rather than two-way: the oracle cannot edit it
   * after the fact, so when the browser's recomputation and this value agree
   * against a differing stored record, the stored record is the suspect.
   */
  verdictReasoningHash: Hex32 | null;

  /**
   * REQUIRED FROM THE BACKEND for `Deliberating` to exist.
   *
   * ISO timestamp of the moment a judge evaluation was requested for this
   * deal. The contract has no field for this and never will — "a request is in
   * flight" is not a fact the chain can hold.
   *
   * `lib/deriveState.ts` reads it like this: state must be `Submitted`, this
   * field must be present, and no judgment may have landed yet. Any of those
   * failing yields `Submitted`.
   *
   * Absent this field the interface degrades honestly rather than guessing: the
   * `Deliberating` group renders its empty state and every submitted deal sits
   * under `Submitted`. Nothing breaks, and nothing is claimed that the data
   * does not support. Supply it and the group populates.
   *
   * THE FIELD MEANS "IN FLIGHT NOW", NOT "WAS REQUESTED ONCE". This distinction
   * is load-bearing. The docket does not fetch a judgment per row — that would
   * be one request per deal per poll — so it cannot check condition 3 itself and
   * relies on this field being cleared once a verdict returns. A backend that
   * keeps it set as a permanent audit record of when the request was made would
   * leave every judged-but-unsettled deal reading as `Deliberating`, which is a
   * claim that a model is still thinking about a verdict it already produced.
   *
   * If the field cannot carry that reading, do not work around it in the client:
   * add judgment presence to the deals payload instead, and `useEscrows` will
   * read it.
   */
  judgeRequestedAt?: IsoTimestamp;

  /**
   * Settlement transaction hash, present once the oracle has resolved the deal.
   *
   * Optional because it is absent for every non-terminal deal and because no
   * shipped route returns it yet. `lib/settlementLink.ts` renders it as an
   * explorer link when the escrow address is configured, and as a copyable
   * monospace value with one not-yet-deployed note when it is not. There is no
   * dead-link branch.
   */
  resolvedTransactionHash?: TxHash;
}

/**
 * The minimum a judgment lookup has to return for `deriveDisplayState` to know
 * a judgment landed. The interface only needs existence and identity here; the
 * full record is §4.
 */
export interface JudgmentRef {
  dealId: Hex32;
  verdictHash: Hex32;
  timestamp: IsoTimestamp;
}

/* ===========================================================================
 * §4  The auditable verdict, and the hash preimage
 * ======================================================================== */

/** The judge's binary outcome, spelled as the protocol spells it. */
export type VerdictOutcome = 'PASS' | 'FAIL';

/**
 * The full evidence record for one judged deal. This is what
 * `GET /api/judgments/:dealId` returns and what the verdict record screen
 * presents as exhibits.
 *
 * Every field here is off-chain. The chain holds three hashes; this is the
 * material those hashes commit to. Presenting the two side by side is the whole
 * argument of the verdict record screen, and it is why the interface says
 * "tamper-evident" rather than "verified" when they agree: agreement shows the
 * stored record matches its hash. It says nothing about what the model was
 * shown, and nothing about whether the evaluation was sound.
 */
export interface AuditableVerdict {
  /** The deal this record judges. */
  dealId: Hex32;

  /**
   * Buyer and seller as recorded at judge time. Optional because the shipped
   * judge route accepts requests without them, and the record then omits them.
   * Their presence or absence changes the verdict hash, since canonicalization
   * drops `undefined` members rather than emitting nulls.
   */
  buyer?: AgentId;
  seller?: AgentId;

  /**
   * Free-form category string, e.g. `data-analysis`. Optional. Reputation
   * buckets an absent category as `uncategorized`; the verdict hash omits the
   * member entirely. Those two behaviours are different on purpose and must not
   * be unified — substituting `"uncategorized"` into the preimage would change
   * the hash of every historical record that lacked a category.
   */
  taskCategory?: string;

  /**
   * The deadline as the judge recorded it, already normalised to ISO. The judge
   * prompt also states the deadline as evaluation context.
   */
  deadline: IsoTimestamp;

  /**
   * The buyer's acceptance criteria, in order. Order is part of the agreement
   * and is preserved by canonicalization — arrays are never sorted, only
   * objects' keys are. Must be non-empty: `POST /api/judge` rejects an empty
   * array with a 400.
   */
  acceptanceCriteria: string[];

  /** The seller's submitted work, verbatim. */
  deliverable: string;

  /** The judge's decision. `score` and `verdict` are both functions of this. */
  approved: boolean;

  /**
   * 100 when `approved`, 0 otherwise.
   *
   * Stored, but recomputed from `approved` when building the preimage rather
   * than read. If a record ever held `approved: true, score: 0`, reading both
   * would produce a hash matching nothing and the mismatch would look like
   * tampering; deriving both makes the preimage internally consistent by
   * construction, and the stored inconsistency surfaces as a stored-versus-
   * recomputed disagreement — which is precisely what the verify panel is for.
   */
  score: number;

  /**
   * `'PASS'` when `approved`, `'FAIL'` otherwise. Same derive-don't-read rule
   * as `score`.
   */
  verdict: VerdictOutcome;

  /** The judge's stated justification. Committed on-chain as a hash. */
  reasoning: string;

  /**
   * Model identity, e.g. `gpt-4o-mini`. Inside the hash, so a record cannot be
   * silently reattributed to a different model after the fact.
   */
  modelId: string;

  /** Model version. Also inside the hash, for the same reason. */
  modelVersion: string;

  /**
   * The exact prompt sent to the model. An evidence exhibit on the verdict
   * record screen, shown in full and never summarised.
   *
   * It is inside the hash, which means the stored prompt cannot be edited
   * without breaking the commitment. It does not follow that this string is
   * what the model actually received — nothing outside the backend can attest
   * to that, and the interface says so where it presents this field.
   */
  evaluationPrompt: string;

  /** The model's unedited response. The second evidence exhibit. */
  rawResponse: string;

  /** Backend's stored keccak256 over `acceptanceCriteria`. */
  rubricHash: Hex32;

  /** Backend's stored keccak256 over `deliverable`. */
  deliverableHash: Hex32;

  /** Backend's stored keccak256 over the 17-field preimage below. */
  verdictHash: Hex32;

  /**
   * When the evaluation was recorded.
   *
   * DELIBERATELY OUTSIDE THE HASH. See `VerdictPreimage` — this field is the
   * one member of this record that the preimage omits, and that omission is
   * what makes the hash reproducible: rehash the same inputs tomorrow and you
   * get the same digest. Include it and every recomputation fails.
   *
   * The verdict record screen displays it as recorded metadata and states in
   * visible copy that it is excluded from the hashed payload, so a reader
   * comparing the exhibit list against the preimage list is not left wondering.
   */
  timestamp: IsoTimestamp;
}

/**
 * THE VERDICT PREIMAGE — exactly seventeen fields, and `timestamp` is not one.
 *
 * This is the object that gets canonicalized and hashed to produce
 * `verdictHash`. Both sides must build it identically or the interface reports
 * a mismatch on a record nobody touched, which is worse than useless: a false
 * tamper alarm on an audit surface destroys the credibility of a true one.
 *
 * Count the members below. There are seventeen:
 *
 *    1  acceptanceCriteria      10  modelVersion
 *    2  approved                11  rawResponse
 *    3  buyer                   12  reasoning
 *    4  deadline                13  rubricHash
 *    5  dealId                  14  score
 *    6  deliverable             15  seller
 *    7  deliverableHash         16  taskCategory
 *    8  evaluationPrompt        17  verdict
 *    9  modelId
 *
 *      ✗  timestamp  — EXCLUDED. Not a member of this type at all, so the
 *                      exclusion is enforced by the compiler rather than
 *                      by a reviewer noticing its absence from a list.
 *
 * Four members are not verbatim copies of the record, and the difference is
 * where two implementations drift:
 *
 *   `rubricHash`       recomputed from `acceptanceCriteria`, not copied
 *   `deliverableHash`  recomputed from `deliverable`, not copied
 *   `score`            derived from `approved` (100 / 0)
 *   `verdict`          derived from `approved` (PASS / FAIL)
 *   `deadline`         normalised: a number is read as Unix seconds and
 *                      converted, a string is parsed; both end as ISO
 *
 * Canonicalization rules, which are the other half of the contract:
 * object keys ascending by UTF-16 code unit (plain lexicographic — not
 * locale-aware, and it must not become locale-aware), no whitespace, members
 * whose value is `undefined` omitted entirely, arrays left in their given
 * order, strings escaped by `JSON.stringify` rules, non-finite numbers an
 * error rather than a silent `null`. Then keccak256 over the UTF-8 bytes.
 *
 * Declared as a type alias rather than an `interface` for one structural
 * reason: TypeScript grants an implicit index signature to object type aliases
 * and not to interfaces, so only this form is assignable to the canonicalizer's
 * `Canonicalizable` parameter. As an interface, `computeVerdictHash` would need
 * an `as unknown as` cast to hash its own preimage — a cast in the one module
 * whose whole value is that it can be read and checked line by line.
 */
export type VerdictPreimage = {
  acceptanceCriteria: string[];
  approved: boolean;
  /** Omitted from the canonical string when absent, not emitted as null. */
  buyer?: AgentId;
  /** Always the normalised ISO form. */
  deadline: IsoTimestamp;
  dealId: Hex32;
  deliverable: string;
  /** Recomputed here, not copied from the record. */
  deliverableHash: Hex32;
  evaluationPrompt: string;
  modelId: string;
  modelVersion: string;
  rawResponse: string;
  reasoning: string;
  /** Recomputed here, not copied from the record. */
  rubricHash: Hex32;
  /** Derived from `approved`. */
  score: number;
  /** Omitted from the canonical string when absent. */
  seller?: AgentId;
  /** Omitted from the canonical string when absent. */
  taskCategory?: string;
  /** Derived from `approved`. */
  verdict: VerdictOutcome;
};

/**
 * The seventeen field names, at the type level. A test asserts that the key set
 * of the canonical string equals this union, so the preimage builder and this
 * declaration cannot drift apart without the suite failing.
 *
 * `'timestamp' extends VerdictHashField` is `false`, and that is checkable.
 */
export type VerdictHashField = keyof VerdictPreimage;

/**
 * What `GET /api/verify/:dealId` should return: the full record, plus the
 * backend's own assessment of it.
 *
 * The interface reaches its own conclusion by recomputing from the fields of
 * this record in the browser. `verified` is displayed in its own labelled cell
 * as an input and reads to no code path that produces the conclusion — the
 * whole value of client-side recomputation evaporates if the answer is taken
 * from the party being checked.
 */
export interface VerifyPreimageResponse extends AuditableVerdict {
  /** Backend's own assessment. Displayed, never trusted. */
  verified?: boolean;
}

/* ===========================================================================
 * §5  Reputation
 * ======================================================================== */

/**
 * Per-category tally. Mirrors the shipped shape from `backend/src/reputation.ts`
 * exactly — `total`, `successes`, `successRate`, nothing else.
 */
export interface TaskCategoryStats {
  total: number;
  successes: number;
  /** `successes / total`. Zero when `total` is zero. */
  successRate: number;
}

/**
 * One resolution in an agent's history, as the shipped route returns it: a
 * projection of `AuditableVerdict` down to six fields.
 */
export interface JudgmentHistoryEntry {
  dealId: string;

  /** The judge's decision. */
  approved: boolean;

  /** 100 or 0. */
  score: number;

  /** Empty string when the stored record had no hash. */
  verdictHash: string;

  /**
   * The record's update time, ISO.
   *
   * This is what recency weighting currently keys on, and it is an approximation
   * worth naming. The figure wants the moment the ORACLE RESOLVED the deal;
   * this field is the moment the row was last written. They usually coincide
   * and can diverge. See the `recencyWeightedReliability` block below for the
   * field that would fix it.
   */
  timestamp: IsoTimestamp;

  /** Absent on uncategorised records. Bucketed as `uncategorized` in tallies. */
  taskCategory?: string;
}

/**
 * `GET /api/reputation/:agent`, verbatim from `backend/src/reputation.ts`.
 *
 * The trust explorer states in visible copy that this is the same endpoint the
 * MCP server queries before an agent decides whether to hire — the point being
 * that the reputation a reviewer reads and the reputation an agent acts on are
 * one record, not two views of it.
 */
export interface ReputationSummary {
  /** Echoed back in whichever form was requested. Not normalised. */
  agent: AgentId;

  /** Count of judged deals. Zero is a valid, common answer. */
  totalJudged: number;

  successes: number;
  failures: number;

  /** `successes / totalJudged`, or 0 when there are none. */
  successRate: number;

  /** `failures / totalJudged`, or 0 when there are none. */
  failureRate: number;

  /**
   * @derived frontend
   *
   * Recomputed by `lib/derive.ts` from `history` with weight `exp(-ageDays/30)`
   * per judgment: the sum of weighted successes over the sum of weights. A
   * judgment weighs 1.0 today, 0.72 at ten days, 0.37 at thirty, 0.037 at
   * ninety. Thirty days is chosen because agent behaviour and model versions
   * turn over on roughly that timescale, and a six-month-old success should not
   * be presented as current evidence.
   *
   * The shipped route DOES return this field, and the interface still
   * recomputes it, because the interface must be able to show the arithmetic
   * behind any number a reviewer clicks. Both values are available; the drill-
   * down reproduces the recomputed one.
   *
   * TO MOVE THIS SERVER-SIDE AUTHORITATIVELY the backend must supply, per
   * judgment: `approved`, and `resolvedAt` as an ISO 8601 instant recording
   * ORACLE RESOLUTION TIME rather than judge time or row-update time. Today
   * `history[].timestamp` is the row's update time, which is close but not the
   * same quantity — an agent's reliability decays from when its work was
   * settled, not from when a database row was last touched.
   */
  recencyWeightedReliability: number;

  /** Keyed by category name; absent categories collapse to `uncategorized`. */
  byTaskCategory: Record<string, TaskCategoryStats>;

  /** Newest-last, as the shipped route returns it. */
  history: JudgmentHistoryEntry[];
}

/* ===========================================================================
 * §6  MCP activity
 * ======================================================================== */

/**
 * Where an MCP answer came from.
 *
 * `backend` means the query fell back from The Graph to the backend index. The
 * answer is the same; the path to it was different. The activity feed says that
 * in visible copy, because a reader who reads `backend` as an error is being
 * misled by the interface's own labelling. Nothing here asserts that a subgraph
 * deployment is currently serving these queries.
 */
export type McpDataSource = 'graph' | 'backend';

/**
 * What a buyer agent did with the reliability figure it got back.
 *
 * `hired` and `declined` are the interesting pair: the demo's argument is that
 * a reputation query made a buyer agent walk away, and that is only legible if
 * the decision is recorded next to the number that produced it. `queried-only`
 * covers a lookup with no hiring decision attached.
 */
export type HiringDecision = 'hired' | 'declined' | 'queried-only';

/**
 * One line in the MCP activity feed. Renders as a single compact row: time, the
 * querying agent, the queried agent, the reliability figure, the decision, and
 * the source label as a chip at the right.
 *
 * Nothing in this entry is on-chain data. Prompts, rubrics, raw model
 * responses, reasoning, and verdict hashes come from the off-chain judge
 * record, and the feed states that above the well.
 */
export interface McpActivityEntry {
  /** Stable id for list keys. Any opaque string. */
  id: string;

  /** When the query happened. */
  timestamp: IsoTimestamp;

  /** The agent that asked — usually a buyer about to spend money. */
  queryingAgent: AgentId;

  /** The agent asked about — usually a candidate seller. */
  queriedAgent: AgentId;

  /**
   * The reliability figure returned, in [0, 1]. This is the number the decision
   * was made on, so it is recorded as returned rather than recomputed here; a
   * recomputed figure would be today's answer to yesterday's question.
   */
  returnedReliability: number;

  /** What the querying agent did next. */
  decision: HiringDecision;

  /** `graph` or `backend`. See `McpDataSource`. */
  source: McpDataSource;
}

/* ===========================================================================
 * §7  Results and errors
 * ======================================================================== */

/**
 * Every network call returns one of these. The client does not throw.
 *
 * Throwing typed errors was the alternative and it loses the discriminant: at a
 * `catch` site the value is `unknown`, so every hook would re-narrow what the
 * client already knew. With a result type, `errorCopy(error)` is total over
 * `ApiError` and a new error kind without copy is a compile error rather than
 * an empty error panel in front of a reviewer.
 */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/**
 * The ten contract errors, exactly as the escrow contract declares them.
 * Surfaced when the backend relays a revert reason from a settlement attempt.
 * Each maps to its own message naming the actor and the condition — an error
 * that only says `InvalidState` tells a reader nothing they did not know.
 */
export type ContractErrorName =
  /** Only the registered oracle may resolve. */
  | 'Unauthorized'
  /** Zero or malformed address among buyer, seller, token. */
  | 'InvalidAddress'
  /** Escrow amount must exceed zero. */
  | 'InvalidAmount'
  /** Deadline outside the contract's accepted range. */
  | 'InvalidDuration'
  /** Deal identifier is not 32 bytes of non-zero hex. */
  | 'InvalidDealId'
  /** Identifier already used. Identifiers are not reusable. */
  | 'DealAlreadyExists'
  /** Action unavailable from the deal's current state. */
  | 'InvalidState'
  /** Deadline has passed; the seller can no longer submit. */
  | 'DeadlinePassed'
  /** Deadline has not passed; no buyer refund yet. */
  | 'DeadlineNotPassed'
  /** Oracle's grace period is still open; no buyer refund yet. */
  | 'OracleGracePeriodNotPassed';

/** Which record a 404 was about, so the copy can name it. */
export type MissingResource = 'deal' | 'judgment' | 'preimage' | 'agent';

/**
 * Every way a request can fail, as a closed discriminated union.
 *
 * Closed is the operative word: `errorCopy` returns a non-optional
 * `{ cause, recovery }` for every member, so adding a kind without writing its
 * copy does not compile. That is how Requirement 16.3 is enforced structurally
 * instead of by review.
 */
export type ApiError =
  /**
   * `fetch` threw. The configured origin did not answer at all. The interface
   * names `NEXT_PUBLIC_API_BASE` as the setting to check, and notes that
   * unsetting it reads fixture data from this deployment.
   */
  | { kind: 'network'; base: string }

  /**
   * 400. `message` is the backend's own `error` text, shown verbatim rather
   * than paraphrased — the backend knows what it rejected.
   *
   * `field` names the input at fault when the backend supplies it, so the
   * sandbox can accent the offending exhibit instead of a generic banner. Two
   * real validations produce this: `acceptanceCriteria` must be non-empty, and
   * `deadline` must be strictly in the future.
   */
  | { kind: 'bad-request'; status: 400; message: string; field?: string }

  /**
   * 401 from a settlement-capable route: the server has no settlement
   * authorization, so the judge may have run but nothing settled.
   *
   * `envVar` carries the name of the server-only variable to set, so the error
   * panel can name it without hardcoding it in a component.
   *
   * Typed as `string` rather than as a string literal on purpose. The copy gate
   * permits that variable's name to appear in exactly one module under `src/`,
   * and that module is `lib/serverEnv.ts` — the one place that actually reads
   * it. Spending the budget on a literal type here would leave the real reader
   * unable to name what it reads. `design.md` shows the literal; this is the
   * deviation and this is why.
   */
  | { kind: 'unauthorized'; status: 401; envVar: string }

  /**
   * 404. `resource` selects the sentence and `id` fills it, so the reader is
   * told which lookup failed rather than that "something" was not found.
   */
  | { kind: 'not-found'; status: 404; resource: MissingResource; id: string }

  /** 500. The backend failed internally. The interface cannot see its logs. */
  | { kind: 'server'; status: 500; message: string }

  /**
   * 502. The backend reached its upstream — model provider or RPC node — and
   * got an error back. Upstream of the interface AND upstream of the backend,
   * which the recovery copy says plainly so nobody debugs the browser.
   */
  | { kind: 'upstream'; status: 502; message: string }

  /**
   * 503. Up but not ready. The shipped judge-and-settle route answers this way
   * when settlement is unconfigured. Polling continues.
   */
  | { kind: 'unavailable'; status: 503; retryAfterMs?: number }

  /**
   * A named contract revert relayed from a settlement attempt. `detail` carries
   * the current and required states for `InvalidState` when the backend has
   * them; the message falls back to its first clause when it does not.
   */
  | { kind: 'contract'; name: ContractErrorName; detail?: string }

  /**
   * The response arrived and parsed but failed its shape guard. `expected` is
   * the guard's name, so the error names the shape that was wanted.
   *
   * The recovery copy for this one is the reason this file exists: the backend
   * and `types.ts` have drifted, and `types.ts` is the contract.
   */
  | { kind: 'malformed'; expected: string };

/**
 * The error body the shipped backend actually emits. Not all failures carry
 * both fields, hence both optional; `field` is a hint the interface uses when
 * present and does not require.
 */
export interface BackendErrorBody {
  success?: false;
  error?: string;
  field?: string;
}

/* ===========================================================================
 * §8  Derived metrics
 *
 * Five figures in this interface are not protocol data. Each carries a
 * `@derived` block naming what the backend would have to ship for it to become
 * protocol data, each renders with the `rule/derived` token, and each says so
 * in visible copy. A reviewer should never have to guess which numbers came
 * from the chain.
 * ======================================================================== */

/** The five reputation badge tiers. Contiguous bands covering 0 through 100. */
export type BadgeTier =
  | 'Unproven'
  | 'Provisional'
  | 'Established'
  | 'Trusted'
  | 'Exemplary';

/**
 * A derived figure packaged with the evidence behind it.
 *
 * Numerator and denominator travel with the rate so the interface can render
 * `2 of 7` rather than `28.6%` alone, and so the drill-down route can reproduce
 * the arithmetic. A percentage with no denominator is an assertion; a
 * percentage with one is evidence, and this whole surface is about that
 * difference.
 */
export interface DrillableRate {
  rate: number;
  numerator: number;
  denominator: number;
}

/**
 * @derived frontend
 *
 * TRUST SCORE. Computed by `lib/derive.ts` as
 * `round(100 * (n / (n + 3)) * recencyWeightedReliability)`, where `n` is
 * `totalJudged`. No shipped route returns it.
 *
 * The volume factor blends against a zero prior rather than shrinking toward
 * 0.5, and the difference matters. Shrinking toward the midpoint would score an
 * agent with one failure and no successes near 50 — it would flatter an
 * unproven agent by lending it the benefit of the doubt. This score's entire
 * job is to be what a buyer agent consults before spending money, so an absent
 * record must read as absent, not as average. Trust is earned from zero.
 *
 * The `k = 3` constant caps a perfect record at `100n / (n + 3)`: 25 at one
 * judgment, 63 at five, 77 at ten, 90 at twenty-seven. Five-for-five is
 * therefore visibly provisional, which is the honest reading of five data
 * points.
 *
 * TO MOVE THIS SERVER-SIDE the backend must supply, per agent: `totalJudged`,
 * and the same per-judgment `approved` plus resolution-time pair that
 * `recencyWeightedReliability` needs. It must also expose the constant, because
 * a score whose parameters are not published cannot be checked, and an
 * uncheckable score has no place on this surface.
 */
export type TrustScore = number;

/**
 * @derived frontend
 *
 * BADGE TIER. Computed by `lib/derive.ts` from `TrustScore` over five
 * contiguous bands — 0–24 Unproven, 25–49 Provisional, 50–74 Established,
 * 75–89 Trusted, 90–100 Exemplary — with a floor: fewer than three judgments
 * is `Unproven` regardless of score. No shipped route returns it.
 *
 * The floor guards the same concern as the volume factor from a different side.
 * With `k = 3`, two perfect judgments already score 40, which would read as
 * Provisional and overstate two data points.
 *
 * The bands are contiguous and gapless, so every integer score maps to exactly
 * one tier and the mapping is total.
 *
 * TO MOVE THIS SERVER-SIDE the backend must supply the trust score plus
 * `totalJudged`, and must publish the band boundaries and the floor. Tiers are
 * the figure most likely to be read as protocol-issued, so they are the ones
 * that most need their arithmetic published.
 */
export type DerivedBadgeTier = BadgeTier;

/**
 * @derived frontend
 *
 * TOTAL USDC SETTLED. Computed by `lib/derive.ts` by summing `amount` as
 * `bigint` over deals in `ResolvedSuccess` or `ResolvedRefund`. No shipped
 * route returns it.
 *
 * `ExpiredRefund` is excluded because no resolution occurred — an expiry
 * returns funds without anyone judging anything, and folding it into a
 * settlement total would inflate the figure with non-events. The docket shows
 * those amounts separately as returned on expiry.
 *
 * The sum is `bigint` throughout. See `UsdcAmount`.
 *
 * TO MOVE THIS SERVER-SIDE the backend must supply, per agent: the settled
 * base-unit total as a decimal string, the count of deals behind it, and the
 * same terminal-state filter applied here. A total the interface cannot
 * decompose into its deals is not drillable, and every figure on the trust
 * explorer is drillable.
 */
export type SettledTotal = { amount: UsdcAmount; dealCount: number };

/**
 * @derived frontend
 *
 * DISPUTE RATE BY TASK CATEGORY. Computed by `lib/derive.ts` from
 * `ReputationSummary.history`, keyed by category, as failures over total, with
 * both counts carried alongside. Uncategorised judgments bucket as
 * `uncategorized`. No shipped route returns it — `byTaskCategory` ships
 * SUCCESS rates, and the dispute view is the complement plus its denominators.
 *
 * TO MOVE THIS SERVER-SIDE the backend must extend `byTaskCategory` with
 * `failures` per category and the deal identifiers behind each bucket, so the
 * drill-down can list the resolutions rather than restate the percentage.
 */
export type DisputeRateByCategory = Record<string, DrillableRate>;

/**
 * @derived fixture
 *
 * THE AGENT LIST. Fixture-backed. No shipped route enumerates agents.
 *
 * This is the sharpest gap in the contract, so it is worth stating flatly:
 * `GET /api/reputation/:agent` requires an identifier you already have. There
 * is no way to discover an identifier you do not have. The trust explorer's
 * list therefore cannot exist against the shipped backend at all — not
 * degraded, not partial — and is served from fixtures.
 *
 * TO MOVE THIS SERVER-SIDE the backend must add `GET /api/agents` returning,
 * per agent: every identifier form it answers to (the plain slug and the
 * address, since both are live and both must resolve), plus `totalJudged` so
 * the list can sort and filter without a request per row. Filtering also
 * matches against task category names, so those belong in the row too.
 *
 * Once that route exists this interface computes the score and tier per row
 * from the reputation record and nothing else changes.
 */
export interface AgentListEntry {
  /** Plain form, e.g. a short slug. Rendered untruncated. */
  agent: AgentId;

  /** Address form of the same agent, when it has one. Rendered truncated. */
  address?: Address;

  /** Count of judged deals. The only non-derived figure in the row. */
  totalJudged: number;

  /** Category names, for the search filter. */
  taskCategories: string[];
}

/** One agent row as the trust explorer renders it: protocol data plus derived. */
export interface AgentRowView extends AgentListEntry {
  /** @derived frontend — see `TrustScore`. */
  trustScore: TrustScore;
  /** @derived frontend — see `DerivedBadgeTier`. */
  badgeTier: DerivedBadgeTier;
}

/* ===========================================================================
 * §9  Routes that ship today
 *
 * Callable against a running backend right now. The client targets these path
 * shapes exactly, and URL-encodes every identifier at the single point where it
 * enters a path — so a plain slug, an address, and anything containing a slash
 * all round-trip.
 * ======================================================================== */

/**
 * @shipped  GET /health
 *
 * Request:  no body, no parameters.
 * Response: 200 with this shape.
 */
export interface HealthResponse {
  status: 'ok';
  service: string;
}

/**
 * @shipped  POST /api/judge
 *
 * Request:  this body as JSON.
 * Response: 200 `AuditableVerdict`
 *           400 `BackendErrorBody` — validation failed
 *           502 `BackendErrorBody` — the model provider errored
 *
 * TWO VALIDATIONS THE INTERFACE MUST RESPECT, because they are enforced and
 * will reject a request that ignores them:
 *
 *   1. `deadline` must be STRICTLY IN THE FUTURE at the moment the request is
 *      received. Not equal to now, not in the past. A preset with a baked-in
 *      timestamp works until it does not; the sandbox computes the deadline per
 *      submission for this reason.
 *
 *   2. `acceptanceCriteria` must be a non-empty array of non-empty strings.
 *      `[]` is a 400, and so is `[""]`.
 *
 * `dealId` need only be a non-empty string HERE — this route judges without
 * settling, so nothing reaches the contract. Settlement is stricter; see
 * `JudgeAndSettleRequest`.
 */
export interface JudgeRequest {
  /** Non-empty. Bytes32 hex only required for the settling route. */
  dealId: string;

  /** Non-empty array of non-empty strings. Order is preserved and hashed. */
  acceptanceCriteria: string[];

  /** Non-empty. */
  deliverable: string;

  /**
   * Unix seconds as a number, or any `Date.parse`-able string. Must resolve to
   * an instant strictly after now.
   */
  deadline: IsoTimestamp | number;

  buyer?: AgentId;
  seller?: AgentId;
  taskCategory?: string;
}

/** @shipped  POST /api/judge → 200. The full evidence record. */
export type JudgeResponse = AuditableVerdict;

/**
 * @shipped  GET /api/reputation/:agent
 *
 * Request:  `:agent` URL-encoded. Either identifier form resolves.
 * Response: 200 `ReputationSummary`
 *           400 `{ error }` — identifier missing or not decodable
 *           500 `{ error }` — reputation could not be read
 *
 * Note there is no 404 here. An unknown agent returns a zero-filled summary,
 * not a not-found, so the empty state is driven by `totalJudged === 0` rather
 * than by a status code. The trust explorer's empty state names the action that
 * would produce a first record.
 */
export type ReputationResponse = ReputationSummary;

/**
 * @shipped  GET /api/judgments/:dealId
 *
 * Request:  `:dealId` URL-encoded.
 * Response: 200 the stored record plus the backend's own `verified` flag
 *           400 `{ error }` — identifier missing or not decodable
 *           404 `{ error }` — no judgment on record for this identifier
 *           500 `{ error }`
 */
export interface JudgmentResponse extends AuditableVerdict {
  /**
   * The backend's own hash check. Displayed in its own labelled cell as an
   * input; never read when the interface forms its conclusion.
   */
  verified: boolean;
}

/**
 * @shipped  POST /api/judge-and-settle
 *
 * MUST BE PROXIED SERVER-SIDE. This route requires an internal-key header, and
 * that key must never reach a browser. The interface calls its own route
 * handler at `app/api/judge-and-settle`, which reads the key from a server-only
 * variable and forwards the request. No component ever holds it, and the key is
 * absent from every `NEXT_PUBLIC_`-prefixed variable and every client bundle.
 *
 * Request:  `JudgeRequest`, plus the internal-key header, added by the proxy.
 * Response: 200 `JudgeAndSettleResponse`
 *           400 `BackendErrorBody` — same two validations as `POST /api/judge`
 *           401 `BackendErrorBody` — key missing or wrong
 *           502 `BackendErrorBody` — judging or settling failed
 *           503 `BackendErrorBody` — settlement is not configured on the server
 *
 * ONE ADDITIONAL REQUIREMENT beyond `POST /api/judge`: `dealId` must be 32
 * bytes of non-zero hex, because this route reaches the contract and the
 * contract rejects anything else with `InvalidDealId`. A slug that judges
 * successfully will fail to settle.
 */
export type JudgeAndSettleRequest = JudgeRequest;

/** @shipped  POST /api/judge-and-settle → 200. */
export interface JudgeAndSettleResponse {
  verdict: AuditableVerdict;
  settlement: SettlementResult;
}

/** The oracle's settlement receipt, as the shipped route returns it. */
export interface SettlementResult {
  /** Feeds the settlement link. */
  transactionHash: TxHash;

  /**
   * The hash the oracle actually committed on-chain. Lands in the deal's
   * `verdictReasoningHash` and becomes the verify panel's third column.
   */
  reasoningHash: Hex32;
}

/* ===========================================================================
 * §10  Routes this interface mocks and still needs
 *
 * Each is implemented as a Next.js route handler serving fixtures, so the
 * interface is whole before the backend is. Each conforms to the shapes below,
 * so when the real route lands the switch is one entry in the endpoint table
 * and no component changes.
 *
 * Listed in the order they unblock the most.
 * ======================================================================== */

/**
 * @needed  GET /api/verify/:dealId
 *
 * The one an auditor reaches for. The project README already instructs auditors
 * to call this path, which makes its current behaviour the most load-bearing
 * gap in the contract.
 *
 * WHAT SHIPS TODAY: the path is routed, but aliased to the judgment handler. It
 * returns the stored `AuditableVerdict` plus `verified` — the backend's own
 * answer to the question being asked. What the verify panel needs is the
 * canonical PREIMAGE: the source fields, so the browser can hash them itself
 * and reach its own conclusion. Those overlap heavily, which is why the alias
 * mostly works and why the difference is easy to miss.
 *
 * WHAT IS ACTUALLY NEEDED: the same record, with a guarantee attached — that
 * every field feeding the seventeen-field preimage is present and byte-exact as
 * stored, not re-serialised, not trimmed, not re-cased. `acceptanceCriteria` in
 * its original order. `evaluationPrompt` and `rawResponse` unmodified. Any
 * normalisation applied on the way out breaks the recomputation and reports a
 * mismatch on an untouched record.
 *
 * Request:  `:dealId` URL-encoded.
 * Response: 200 `VerifyPreimageResponse`
 *           404 — no preimage on record. The panel keeps previously fetched
 *                 hashes on screen and states that this one is unavailable.
 */
export type VerifyResponse = VerifyPreimageResponse;

/**
 * @needed  GET /api/deals
 *
 * The docket's data source, polled every 2 to 3 seconds. Without it there is no
 * live feed, which is the screen the demo's split-screen argument rests on.
 *
 * Request:  no parameters. Optional `state` filter would be welcome, not
 *           required — the list is small and grouping is client-side.
 * Response: 200 `DealsResponse`
 *
 * Every deal SHOULD carry `judgeRequestedAt` when a judge call is in flight.
 * Without it the `Deliberating` group is unreachable and the docket shows six
 * groups instead of seven. See `EscrowDeal.judgeRequestedAt`.
 */
export interface DealsResponse {
  deals: EscrowDeal[];

  /**
   * Server time when the list was assembled, ISO. The docket shows a
   * last-updated figure and must not read the client clock for it — a skewed
   * laptop would make the feed look stale or impossibly fresh.
   */
  asOf: IsoTimestamp;
}

/**
 * @needed  GET /api/deals/:dealId
 *
 * One deal, for the verdict record screen's on-chain column. The judgment route
 * supplies the off-chain record; this supplies the three on-chain hashes the
 * record is compared against, so without it the verify panel's third column has
 * no source and the comparison degrades to two-way.
 *
 * Request:  `:dealId` URL-encoded.
 * Response: 200 `EscrowDeal`
 *           404 — no deal recorded under this identifier
 */
export type DealResponse = EscrowDeal;

/**
 * @needed  GET /api/mcp-activity
 *
 * The reputation-query log, polled every 2 to 3 seconds, newest first.
 *
 * Request:  no parameters. Optional `limit` would be welcome.
 * Response: 200 `McpActivityResponse`
 *
 * The MCP server already has every field of `McpActivityEntry` at the moment it
 * answers a reputation call, including the `source` label it sets when it falls
 * back from The Graph. What is missing is somewhere to write them and a route
 * to read them back.
 */
export interface McpActivityResponse {
  entries: McpActivityEntry[];
  asOf: IsoTimestamp;
}

/**
 * @needed  GET /api/agents
 *
 * The agent list. See the `@derived fixture` block on `AgentListEntry` in §8
 * for why nothing shipped can substitute: reputation lookup takes an identifier
 * as input, so it cannot be the source of identifiers.
 *
 * Request:  no parameters. Filtering is client-side over the full list — it is
 *           small, the search input should feel instant, and a round trip per
 *           keystroke would be worse in every way.
 * Response: 200 `AgentsResponse`
 */
export interface AgentsResponse {
  agents: AgentListEntry[];
  asOf: IsoTimestamp;
}
